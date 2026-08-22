// Gift-Card-Kompensations-Agent - wenn eine Bestellung einen ECHTEN
// Service-Fehler hatte (sehr lange unbearbeitet ODER gescheiterte
// Zustellung laut Shopify-Sendungsverfolgung), erstellt der Agent einen
// ECHTEN Shopify-Gutschein als Wiedergutmachung und schickt ihn dem Kunden
// zu - bevor der Kunde sich überhaupt beschweren muss. Neu, kein
// n8n-Workflow · Zeitplan: täglich.
//
// Unterscheidet sich von #55 Fulfillment & Supplier Hub (meldet dieselben
// Probleme nur an DICH, tut nichts für den Kunden) - deutlich strengere
// Schwelle als Fulfillment Hub (GIFTCARD_VERZUG_STUNDEN, Default 96h statt
// 48h), damit nicht jede normale Verzögerung sofort Geld kostet - nur
// wirklich schlechte Fälle. Wie bei den anderen geld-bewegenden Agenten
// standardmäßig NUR EMPFEHLUNG, bis AUTO_GUTSCHEIN_SENDEN explizit auf "ja"
// steht.
//
// Echtes Rückkopplungs-Gedächtnis wie #61/#63/#64/#88/#42: prüft, ob der
// Kunde nach der Kompensation ÜBERHAUPT NOCH MAL bestellt hat (echtes
// Shopify-Signal, keine erfundene Zufriedenheits-Bewertung - nur die
// ehrliche Beobachtung "kam zurück" oder "blieb weg"). Fällt bei
// schlechter eigener Bilanz automatisch auf reine Empfehlung zurück
// (Selbstbremse), egal was AUTO_GUTSCHEIN_SENDEN sagt.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config, isTestMode } from './lib/config.mjs';
import { getOrders, createGiftCard } from './lib/shopify.mjs';
import { sendEmail } from './lib/email.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '67-giftcard-kompensations-agent';
const MAX_HISTORIE = 3000;
// Wie lange nach der Kompensation abgewartet wird, bevor geprüft wird, ob
// der Kunde zurückgekommen ist - kurz genug, um zeitnah ein Bild zu
// bekommen, lang genug für einen realistischen nächsten Kaufanlass.
const AUSWERTUNG_WARTETAGE = 30;
const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMAND_DIR = join(__dirname, '..', 'command');

function alterInStunden(datumStr) {
  return (Date.now() - new Date(datumStr).getTime()) / 3600000;
}

function tageSeit(datumStr) {
  return (Date.now() - new Date(datumStr).getTime()) / (1000 * 3600 * 24);
}

// Selbstbremse: feste Zahlen-Schwelle im Code (kein KI-Ermessen) - lief die
// eigene Erfolgsbilanz zuletzt schlecht (Kunden bleiben trotz Gutschein
// weg), fällt der Agent DIESEN Lauf auf reine Empfehlung zurück, egal was
// AUTO_GUTSCHEIN_SENDEN sagt.
const SELBSTBREMSE_MIN_STICHPROBE = 3;
const SELBSTBREMSE_ERFOLGSQUOTE_MINDESTENS = 0.4;
function berechneSelbstbremse(ausgewertetAnzahl, positivAnzahl) {
  if (ausgewertetAnzahl < SELBSTBREMSE_MIN_STICHPROBE) return false;
  return positivAnzahl / ausgewertetAnzahl < SELBSTBREMSE_ERFOLGSQUOTE_MINDESTENS;
}

// Prüft AUSGEFÜHRTE Kompensationen: hat der Kunde seitdem ÜBERHAUPT eine
// neue Bestellung aufgegeben? Keine Behauptung, DASS der Gutschein das
// bewirkt hat (viele Gründe möglich) - nur die ehrliche Beobachtung, ob
// die Kundenbeziehung sichtbar weiterging oder nicht.
async function werteVergangeneEntscheidungenAus(state) {
  const faellig = (state.historie || []).filter(
    (e) => !e.ausgewertet && tageSeit(e.datum) >= AUSWERTUNG_WARTETAGE
  );
  if (!faellig.length) return;

  for (const e of faellig) {
    try {
      const seit = new Date(e.datum);
      const neuereOrders = await getOrders({
        email: e.email,
        created_at_min: encodeURIComponent(seit.toISOString()),
        status: 'any',
      });
      const neueBestellung = neuereOrders.find((o) => String(o.id) !== String(e.orderId) && !o.cancelled_at);

      e.ausgewertet = true;
      e.ausgewertetAm = new Date().toISOString();
      e.wirkung = neueBestellung ? 'kunde_kam_zurueck' : 'kunde_blieb_weg';
    } catch (err) {
      console.error(`[67-giftcard-kompensations-agent] Auswertung für Bestellung ${e.orderId} fehlgeschlagen:`, err.message || err);
    }
  }
  console.log(`[67-giftcard-kompensations-agent] ${faellig.length} vergangene Kompensation(en) ausgewertet.`);
}

function veroeffentliche(state, selbstgebremst) {
  if (!existsSync(COMMAND_DIR)) mkdirSync(COMMAND_DIR, { recursive: true });
  const historie = state.historie || [];
  const ausgewertet = historie.filter((e) => e.ausgewertet);
  const bestaetigt = ausgewertet.filter((e) => e.wirkung === 'kunde_kam_zurueck');
  writeFileSync(join(COMMAND_DIR, 'giftcard-agent.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    historie,
    erfolgsBilanz: { ausgewertet: ausgewertet.length, bestaetigt: bestaetigt.length, brauchtBlick: ausgewertet.length - bestaetigt.length },
    selbstgebremst,
  }, null, 2));
}

async function main() {
  const verzugStunden = parseFloat(config.GIFTCARD_VERZUG_STUNDEN || '96');
  const wert = config.GIFTCARD_KOMPENSATION_WERT || '10';
  const autoSenden = config.AUTO_GUTSCHEIN_SENDEN === 'ja';

  const state = loadState(STATE_KEY);
  state.entschaedigt = state.entschaedigt || [];
  state.historie = state.historie || [];
  await werteVergangeneEntscheidungenAus(state);
  saveState(STATE_KEY, state);

  const ausgewertetVorlauf = state.historie.filter((e) => e.ausgewertet);
  const bestaetigtVorlauf = ausgewertetVorlauf.filter((e) => e.wirkung === 'kunde_kam_zurueck');
  const selbstgebremst = berechneSelbstbremse(ausgewertetVorlauf.length, bestaetigtVorlauf.length);
  const autoSendenEffektiv = autoSenden && !selbstgebremst;

  const vor30Tagen = new Date();
  vor30Tagen.setDate(vor30Tagen.getDate() - 30);
  const orders = (await getOrders({ status: 'open', created_at_min: encodeURIComponent(vor30Tagen.toISOString()) }))
    .filter((o) => !o.cancelled_at && o.email);

  const bereitsEntschaedigt = new Set(state.entschaedigt);

  const faelle = [];
  for (const o of orders) {
    if (bereitsEntschaedigt.has(o.id)) continue;
    const alterH = alterInStunden(o.created_at);

    let grund = null;
    if (o.fulfillment_status !== 'fulfilled' && alterH >= verzugStunden) {
      grund = `seit ${(alterH / 24).toFixed(1)} Tagen unbearbeitet`;
    } else {
      const gescheitert = (o.fulfillments || []).find((f) => f.shipment_status === 'failure' || f.shipment_status === 'delivery_failed');
      if (gescheitert) grund = `Zustellung gescheitert (${gescheitert.shipment_status})`;
    }
    if (grund) faelle.push({ order: o, grund });
  }

  if (!faelle.length) {
    console.log('[67-giftcard-kompensations-agent] Keine neuen Fälle für eine Kompensation.');
    veroeffentliche(state, selbstgebremst);
    return;
  }

  const bremsHinweis = selbstgebremst
    ? `🛑 SELBSTBREMSE AKTIV: nur ${bestaetigtVorlauf.length}/${ausgewertetVorlauf.length} letzte Kunden kamen nach Kompensation zurück (< ${Math.round(SELBSTBREMSE_ERFOLGSQUOTE_MINDESTENS * 100)}%) - heute NUR Empfehlung, auch wenn AUTO_GUTSCHEIN_SENDEN an ist.`
    : autoSendenEffektiv ? `AUTO_GUTSCHEIN_SENDEN ist AN: ${wert} EUR Gutscheine werden jetzt verschickt!` : 'Nur Empfehlung - AUTO_GUTSCHEIN_SENDEN steht auf nein, ich verschicke nichts.';
  const zeilen = faelle.map((f) => `- #${f.order.order_number || f.order.id} · ${f.order.email} · ${f.grund}`);
  const kopf = `🎟️ GIFT-CARD-KOMPENSATIONS-AGENT - ${config.SHOP_NAME}${NL}--------------------${NL}${bremsHinweis}`;
  await notifyTelegram(`${kopf}${NL}${NL}${zeilen.join(NL)}`);

  let versendet = 0;
  for (const f of faelle) {
    if (!autoSendenEffektiv) continue;
    try {
      const giftCard = await createGiftCard({
        initialValue: wert,
        note: `Wiedergutmachung für Bestellung #${f.order.order_number || f.order.id}: ${f.grund}`,
        recipientEmail: isTestMode() ? config.OWNER_EMAIL : f.order.email,
      });

      const empfaenger = isTestMode() ? config.OWNER_EMAIL : f.order.email;
      const html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2>Entschuldige die Verzögerung 🙏</h2>
        <p>Bei deiner Bestellung #${f.order.order_number || f.order.id} ist bei uns etwas nicht rundgelaufen.</p>
        <p style="font-size:20px;font-weight:bold;background:#f0fdf4;border:2px dashed #10b981;padding:12px;text-align:center;border-radius:8px;">${giftCard.code || giftCard.last_characters}</p>
        <p>Als Entschuldigung schenken wir dir ${wert} EUR Guthaben für deinen nächsten Einkauf bei ${config.SHOP_NAME}.</p>
      </div>`;
      await sendEmail({ to: empfaenger, subject: `Entschuldigung + ${wert} EUR Gutschein von ${config.SHOP_NAME}`, html });

      // Erst NACH erfolgreicher Erstellung+Versand als entschädigt markieren
      // und sofort speichern - schlägt ein späterer Fall im selben Lauf
      // fehl, geht dieser Erfolg nicht verloren (sonst würde derselbe Kunde
      // beim nächsten Lauf nochmal einen Gutschein bekommen).
      state.entschaedigt.push(f.order.id);
      if (state.entschaedigt.length > MAX_HISTORIE) state.entschaedigt = state.entschaedigt.slice(-MAX_HISTORIE);
      state.historie.unshift({
        orderId: f.order.id,
        orderNummer: f.order.order_number || f.order.id,
        email: f.order.email,
        grund: f.grund,
        wert: parseFloat(wert),
        datum: new Date().toISOString(),
        ausgewertet: false,
      });
      if (state.historie.length > MAX_HISTORIE) state.historie = state.historie.slice(0, MAX_HISTORIE);
      saveState(STATE_KEY, state);
      versendet++;
    } catch (err) {
      console.error(`[67-giftcard-kompensations-agent] Fehler bei Bestellung ${f.order.id}:`, err.message || err);
    }
  }

  veroeffentliche(state, selbstgebremst);
  console.log(`[67-giftcard-kompensations-agent] ${faelle.length} Fall/Fälle erkannt, ${versendet} Gutschein(e) versendet${selbstgebremst ? ' (selbstgebremst)' : ''}.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[67-giftcard-kompensations-agent] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[67-giftcard-kompensations-agent] Fehler:', err);
  process.exit(1);
});
