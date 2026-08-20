// Reorder-Agent - echter Einkaufs-Agent: erkennt Artikel, die vor Eintreffen
// einer Nachbestellung ausverkauft wären, und schickt eine ECHTE
// Nachbestell-Anfrage per E-Mail an den Lieferanten (SUPPLIER_EMAIL, cc an
// den Gründer). Unterscheidet sich von Lager-Wächter (#20, nur Warnung) und
// Fulfillment & Supplier Hub (#55, rankt Lieferanten/Verzug, bestellt nichts
// nach). Neu, kein n8n-Workflow · Zeitplan: täglich.
//
// Wie bei den Meta-Ads-Automationen standardmäßig NUR EMPFEHLUNG: die echte
// Bestell-Mail geht erst raus, wenn AUTO_BESTELLUNG_SENDEN explizit auf "ja"
// steht UND SUPPLIER_EMAIL gesetzt ist. Reversibel/harmlos im Zweifel - im
// schlimmsten Fall eine unerwartete Anfrage, die der Lieferant nachfragt oder
// der (immer per cc informierte) Gründer selbst storniert - kein automatischer
// Zahlungsfluss.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config, isTestMode } from './lib/config.mjs';
import { getProducts, getOrdersSince } from './lib/shopify.mjs';
import { sendEmail } from './lib/email.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '63-reorder-agent';
const ZAHLUNGEN_STATE_KEY = 'lieferanten-zahlungen';
const VERKAUFSTEMPO_TAGE = 30;
const MAX_ZAHLUNGEN = 100;
const MAX_VERFOLGUNG = 60;
const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMAND_DIR = join(__dirname, '..', 'command');

// Shopify hat keine historischen Lagerbestände über eine einfache Abfrage -
// deshalb baut der TÄGLICHE Lauf selbst eine kleine Zeitreihe auf: für jede
// offene Nachbestellung wird bei jedem Lauf der aktuelle Bestand mitnotiert
// (Tiefstand seit Anfrage). Erst wenn Lieferzeit+Puffer vorbei sind, steht
// fest, ob es zwischenzeitlich einen echten Engpass (Bestand <= 0) gab oder
// nicht - reine Beobachtung des tatsächlichen Verlaufs, kein Rätselraten.
function werteVerfolgungAus(state, produkte, lieferzeit, puffer) {
  state.verfolgung = state.verfolgung || {};
  const bestandJe = {};
  for (const p of produkte) {
    for (const v of p.variants || []) {
      const b = parseInt(v.inventory_quantity);
      if (!isNaN(b)) bestandJe[v.id] = b;
    }
  }

  const jetzt = Date.now();
  const evaluationsFensterMs = (lieferzeit + puffer) * 86400000;
  let ausgewertetAnzahl = 0;

  for (const [variantId, eintrag] of Object.entries(state.verfolgung)) {
    if (eintrag.ausgewertet) continue;
    const aktuellerBestand = bestandJe[variantId];
    if (aktuellerBestand !== undefined) {
      eintrag.tiefstandSeitAnfrage = Math.min(eintrag.tiefstandSeitAnfrage, aktuellerBestand);
      eintrag.bestandAktuell = aktuellerBestand;
    }
    if (jetzt - new Date(eintrag.angefragtAm).getTime() < evaluationsFensterMs) continue;

    eintrag.ausgewertet = true;
    eintrag.ausgewertetAm = new Date(jetzt).toISOString();
    if (aktuellerBestand === undefined) {
      eintrag.wirkung = 'produkt_nicht_mehr_gefunden'; // z.B. eingestellt/gelöscht - ehrlich statt geraten
    } else {
      eintrag.wirkung = eintrag.tiefstandSeitAnfrage <= 0 ? 'engpass_trotzdem' : 'kein_engpass';
    }
    ausgewertetAnzahl++;
  }
  if (ausgewertetAnzahl) console.log(`[63-reorder-agent] ${ausgewertetAnzahl} vergangene Nachbestellung(en) ausgewertet.`);
}

// Selbstbremse: feste Zahlen-Schwelle im Code (kein KI-Ermessen) - lief die
// eigene Erfolgsbilanz zuletzt schlecht (trotz Nachbestellung häufig Engpass),
// fällt der Agent DIESEN Lauf auf reine Empfehlung zurück, egal was
// AUTO_BESTELLUNG_SENDEN sagt.
const SELBSTBREMSE_MIN_STICHPROBE = 3;
const SELBSTBREMSE_ERFOLGSQUOTE_MINDESTENS = 0.4;
function berechneSelbstbremse(ausgewertetAnzahl, positivAnzahl) {
  if (ausgewertetAnzahl < SELBSTBREMSE_MIN_STICHPROBE) return false;
  return positivAnzahl / ausgewertetAnzahl < SELBSTBREMSE_ERFOLGSQUOTE_MINDESTENS;
}

function veroeffentliche(state, selbstgebremst) {
  if (!existsSync(COMMAND_DIR)) mkdirSync(COMMAND_DIR, { recursive: true });
  const alle = Object.values(state.verfolgung || {}).sort((a, b) => new Date(b.angefragtAm) - new Date(a.angefragtAm));
  const ausgewertet = alle.filter((e) => e.ausgewertet);
  const keinEngpass = ausgewertet.filter((e) => e.wirkung === 'kein_engpass');
  writeFileSync(join(COMMAND_DIR, 'reorder-agent.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    historie: alle.slice(0, MAX_VERFOLGUNG),
    erfolgsBilanz: { ausgewertet: ausgewertet.length, keinEngpass: keinEngpass.length, brauchtBlick: ausgewertet.length - keinEngpass.length },
    selbstgebremst,
  }, null, 2));
}

async function main() {
  const lieferzeit = parseFloat(config.REORDER_LIEFERZEIT_TAGE || '14');
  const puffer = parseFloat(config.REORDER_PUFFER_TAGE || '30');
  const autoSenden = config.AUTO_BESTELLUNG_SENDEN === 'ja';

  const vorNTagen = new Date();
  vorNTagen.setDate(vorNTagen.getDate() - VERKAUFSTEMPO_TAGE);
  const orders = (await getOrdersSince(vorNTagen)).filter((o) => !o.cancelled_at);
  const verkauf = {};
  for (const o of orders) {
    for (const li of o.line_items || []) {
      if (!li.variant_id) continue;
      verkauf[li.variant_id] = (verkauf[li.variant_id] || 0) + li.quantity;
    }
  }

  const produkte = await getProducts({ limit: '250', status: 'active' });
  const state = loadState(STATE_KEY);
  state.letzteAnfrage = state.letzteAnfrage || {};
  const jetzt = Date.now();

  // Einträge, die viel länger als jede realistische Lieferzeit zurückliegen,
  // sperren ohnehin nichts mehr (siehe Dedup-Check unten) - ohne Aufräumen
  // würde der State für längst restockte/eingestellte Produkte unbegrenzt
  // weiterwachsen.
  const AUFRAEUM_SCHWELLE_MS = 180 * 86400000;
  let aufgeraeumt = false;
  for (const [variantId, ts] of Object.entries(state.letzteAnfrage)) {
    if (jetzt - ts > AUFRAEUM_SCHWELLE_MS) {
      delete state.letzteAnfrage[variantId];
      aufgeraeumt = true;
    }
  }
  if (aufgeraeumt) saveState(STATE_KEY, state);

  werteVerfolgungAus(state, produkte, lieferzeit, puffer);
  saveState(STATE_KEY, state);

  const alleVerfolgtVorlauf = Object.values(state.verfolgung || {});
  const ausgewertetVorlauf = alleVerfolgtVorlauf.filter((e) => e.ausgewertet);
  const keinEngpassVorlauf = ausgewertetVorlauf.filter((e) => e.wirkung === 'kein_engpass');
  const selbstgebremst = berechneSelbstbremse(ausgewertetVorlauf.length, keinEngpassVorlauf.length);
  const autoSendenEffektiv = autoSenden && !selbstgebremst;

  const kandidaten = [];
  for (const p of produkte) {
    for (const v of p.variants || []) {
      const bestand = parseInt(v.inventory_quantity);
      if (isNaN(bestand)) continue;
      const proTag = (verkauf[v.id] || 0) / VERKAUFSTEMPO_TAGE;
      if (proTag <= 0) continue;

      const reichweite = bestand / proTag;
      if (reichweite > lieferzeit) continue;

      const letzteAnfrageTs = state.letzteAnfrage[v.id];
      if (letzteAnfrageTs && jetzt - letzteAnfrageTs < lieferzeit * 86400000) continue; // schon angefragt, wartet noch auf Lieferung

      const zielBestand = Math.ceil(proTag * (lieferzeit + puffer));
      const menge = Math.max(1, zielBestand - bestand);
      const name = p.title + (v.title && v.title !== 'Default Title' ? ` (${v.title})` : '');
      kandidaten.push({ variantId: v.id, name, sku: v.sku || '(keine SKU)', bestand, proTag, reichweite, menge });
    }
  }

  if (!kandidaten.length) {
    console.log('[63-reorder-agent] Nichts nachzubestellen.');
    veroeffentliche(state, selbstgebremst);
    return;
  }

  const zeilen = kandidaten.map(
    (k) => `- ${k.name} (SKU ${k.sku}) | Bestand: ${k.bestand} | reicht noch ~${k.reichweite.toFixed(1)} Tage (Lieferzeit: ${lieferzeit}) | Vorschlag: ${k.menge} Stück nachbestellen`,
  );
  const bremsHinweis = selbstgebremst
    ? `🛑 SELBSTBREMSE AKTIV: nur ${keinEngpassVorlauf.length}/${ausgewertetVorlauf.length} letzte Nachbestellungen liefen ohne Engpass (< ${Math.round(SELBSTBREMSE_ERFOLGSQUOTE_MINDESTENS * 100)}%) - heute NUR Empfehlung, auch wenn AUTO_BESTELLUNG_SENDEN an ist. Lieferzeit/Puffer-Einstellungen prüfen.`
    : autoSendenEffektiv && config.SUPPLIER_EMAIL ? 'AUTO_BESTELLUNG_SENDEN ist AN: Nachbestell-Mail geht jetzt an den Lieferanten raus!' : 'Nur Empfehlung - AUTO_BESTELLUNG_SENDEN=nein oder SUPPLIER_EMAIL fehlt, ich verschicke nichts.';
  const kopf = `📦 REORDER-AGENT - ${config.SHOP_NAME}${NL}--------------------${NL}${bremsHinweis}`;
  const text = `${kopf}${NL}${NL}${zeilen.join(NL)}`;
  await Promise.all([notifyTelegram(text), notifyWhatsapp(text)]);

  if (autoSendenEffektiv && config.SUPPLIER_EMAIL) {
    const html = `<p>Hallo,</p><p>bitte folgende Artikel für "${config.SHOP_NAME}" nachliefern:</p><ul>${kandidaten
      .map((k) => `<li>${k.name} - SKU ${k.sku} - <b>${k.menge} Stück</b></li>`)
      .join('')}</ul><p>Automatisch erstellte Nachbestell-Anfrage basierend auf aktuellem Verkaufstempo. Bitte Lieferzeit/Verfügbarkeit bestätigen.</p>`;
    const empfaenger = isTestMode() ? config.OWNER_EMAIL : config.SUPPLIER_EMAIL;
    await sendEmail({ to: empfaenger, subject: `Nachbestellung ${config.SHOP_NAME} - ${kandidaten.length} Artikel`, html });

    for (const k of kandidaten) {
      state.letzteAnfrage[k.variantId] = jetzt;
      state.verfolgung = state.verfolgung || {};
      state.verfolgung[k.variantId] = {
        variantId: k.variantId,
        name: k.name,
        sku: k.sku,
        angefragtAm: new Date(jetzt).toISOString(),
        mengeAngefragt: k.menge,
        bestandBeiAnfrage: k.bestand,
        tiefstandSeitAnfrage: k.bestand,
        bestandAktuell: k.bestand,
        ausgewertet: false,
      };
    }
    if (Object.keys(state.verfolgung || {}).length > MAX_VERFOLGUNG * 2) {
      // Nur die neuesten behalten, damit der State nicht unbegrenzt wächst
      const sortiert = Object.entries(state.verfolgung).sort((a, b) => new Date(b[1].angefragtAm) - new Date(a[1].angefragtAm));
      state.verfolgung = Object.fromEntries(sortiert.slice(0, MAX_VERFOLGUNG * 2));
    }
    saveState(STATE_KEY, state);

    // Shopify kennt keine Lieferanten-Rechnungen/Zahlungsziele - der einzige
    // echte, automatisch verfügbare Anker ist der Moment der Nachbestellung
    // selbst. Übliches B2B-Zahlungsziel (LIEFERANTEN_ZAHLUNGSZIEL_TAGE) wird
    // als Fälligkeitsdatum angenommen, damit der Zahlungs-Wächter (#82) eine
    // WhatsApp-Erinnerung schicken kann, statt dass es beim Gründer untergeht.
    const zahlungsziel = parseFloat(config.LIEFERANTEN_ZAHLUNGSZIEL_TAGE || '30');
    const zahlungenState = loadState(ZAHLUNGEN_STATE_KEY);
    zahlungenState.faellig = zahlungenState.faellig || [];
    zahlungenState.faellig.push({
      lieferant: config.SUPPLIER_EMAIL,
      artikel: kandidaten.map((k) => `${k.menge}x ${k.name}`),
      bestelltAm: new Date(jetzt).toISOString(),
      faelligAm: new Date(jetzt + zahlungsziel * 86400000).toISOString(),
      benachrichtigt: false,
    });
    if (zahlungenState.faellig.length > MAX_ZAHLUNGEN) {
      zahlungenState.faellig = zahlungenState.faellig.slice(-MAX_ZAHLUNGEN);
    }
    saveState(ZAHLUNGEN_STATE_KEY, zahlungenState);
  }

  veroeffentliche(state, selbstgebremst);
  console.log(`[63-reorder-agent] ${kandidaten.length} Artikel ${autoSendenEffektiv && config.SUPPLIER_EMAIL ? 'nachbestellt' : 'empfohlen'}${selbstgebremst ? ' (selbstgebremst)' : ''}.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[63-reorder-agent] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[63-reorder-agent] Fehler:', err);
  process.exit(1);
});
