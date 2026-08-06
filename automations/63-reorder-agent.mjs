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
import { config, isTestMode } from './lib/config.mjs';
import { getProducts, getOrdersSince } from './lib/shopify.mjs';
import { sendEmail } from './lib/email.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '63-reorder-agent';
const VERKAUFSTEMPO_TAGE = 30;

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
    return;
  }

  const zeilen = kandidaten.map(
    (k) => `- ${k.name} (SKU ${k.sku}) | Bestand: ${k.bestand} | reicht noch ~${k.reichweite.toFixed(1)} Tage (Lieferzeit: ${lieferzeit}) | Vorschlag: ${k.menge} Stück nachbestellen`,
  );
  const kopf = `📦 REORDER-AGENT - ${config.SHOP_NAME}${NL}--------------------${NL}${autoSenden && config.SUPPLIER_EMAIL ? 'AUTO_BESTELLUNG_SENDEN ist AN: Nachbestell-Mail geht jetzt an den Lieferanten raus!' : 'Nur Empfehlung - AUTO_BESTELLUNG_SENDEN=nein oder SUPPLIER_EMAIL fehlt, ich verschicke nichts.'}`;
  const text = `${kopf}${NL}${NL}${zeilen.join(NL)}`;
  await Promise.all([notifyTelegram(text), notifyWhatsapp(text)]);

  if (autoSenden && config.SUPPLIER_EMAIL) {
    const html = `<p>Hallo,</p><p>bitte folgende Artikel für "${config.SHOP_NAME}" nachliefern:</p><ul>${kandidaten
      .map((k) => `<li>${k.name} - SKU ${k.sku} - <b>${k.menge} Stück</b></li>`)
      .join('')}</ul><p>Automatisch erstellte Nachbestell-Anfrage basierend auf aktuellem Verkaufstempo. Bitte Lieferzeit/Verfügbarkeit bestätigen.</p>`;
    const empfaenger = isTestMode() ? config.OWNER_EMAIL : config.SUPPLIER_EMAIL;
    await sendEmail({ to: empfaenger, subject: `Nachbestellung ${config.SHOP_NAME} - ${kandidaten.length} Artikel`, html });

    for (const k of kandidaten) state.letzteAnfrage[k.variantId] = jetzt;
    saveState(STATE_KEY, state);
  }

  console.log(`[63-reorder-agent] ${kandidaten.length} Artikel ${autoSenden && config.SUPPLIER_EMAIL ? 'nachbestellt' : 'empfohlen'}.`);
}

main().catch((err) => {
  console.error('[63-reorder-agent] Fehler:', err);
  process.exit(1);
});
