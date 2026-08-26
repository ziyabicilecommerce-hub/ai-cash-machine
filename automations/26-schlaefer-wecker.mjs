// Schläfer-Wecker - reaktiviert Kunden, die vor ~90 Tagen zuletzt gekauft haben (starkes Angebot)
// Original: n8n Workflow "26_Schläfer_Wecker" · Zeitplan: täglich 11:30
import { config, isTestMode } from './lib/config.mjs';
import { getOrders } from './lib/shopify.mjs';
import { askKI, parseJsonFromText } from './lib/ki.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '26-schlaefer-wecker';

async function main() {
  const von = new Date();
  von.setDate(von.getDate() - 97);
  von.setHours(0, 0, 0, 0);
  const bis = new Date();
  bis.setDate(bis.getDate() - 90);
  bis.setHours(23, 59, 59, 999);

  const orders = (
    await getOrders({
      created_at_min: encodeURIComponent(von.toISOString()),
      created_at_max: encodeURIComponent(bis.toISOString()),
    })
  ).filter((o) => !o.cancelled_at && o.email);

  const state = loadState(STATE_KEY);
  state.geweckt = state.geweckt || [];
  let verarbeitet = 0;

  for (const o of orders) {
    const kid = o.customer?.id || o.email;
    if (state.geweckt.includes(kid)) continue;

    try {
      const vorname = o.customer?.first_name || '';
      const letzteArtikel = (o.line_items || []).map((li) => li.title).slice(0, 3).join(', ');

      const prompt = `Du schreibst im Namen des Gründers vom Onlineshop "${config.SHOP_NAME}".${NL}Dieser Kunde hat vor ~90 Tagen zuletzt gekauft (${letzteArtikel || 'diverses'}) und sich seitdem nicht mehr gemeldet. Er droht, ganz abzuwandern.${NL}${NL}Schreibe eine ehrliche "Wir vermissen dich"-Reaktivierungs-E-Mail auf Deutsch (Du-Form), max 130 Wörter:${NL}- Vorname: ${vorname || 'unbekannt (neutral anreden)'}${NL}- Warm, persönlich, kein Bettel-Ton - wie von einem echten Menschen${NL}- Klarer Grund zurückzukommen (was neu/besser ist) + starkes Angebot: Code ${config.SCHLAEFER_RABATT_CODE} (${config.RABATT_PROZENT}%)${NL}- Ein Satz, der Neugier weckt (was er verpasst hat)${NL}- Schlichtes, persönliches HTML${NL}Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}`;

      const antwort = await askKI(prompt, { maxTokens: 1300 });
      const daten = parseJsonFromText(antwort, { betreff: 'Wir vermissen dich', html: antwort });

      const empfaenger = isTestMode() ? config.OWNER_EMAIL : o.email;
      await sendEmail({ to: empfaenger, subject: daten.betreff, html: daten.html });

      // Erst NACH erfolgreichem Versand als "geweckt" markieren und sofort
      // speichern - schlägt ein späterer Kunde im selben Lauf fehl, geht dieser
      // Erfolg nicht verloren (sonst würde der nächste Lauf denselben Kunden
      // nochmal anschreiben).
      state.geweckt.push(kid);
      if (state.geweckt.length > 8000) state.geweckt = state.geweckt.slice(-8000);
      saveState(STATE_KEY, state);
      verarbeitet++;
    } catch (err) {
      console.error(`[26-schlaefer-wecker] Kunde ${kid} fehlgeschlagen, wird beim nächsten Lauf erneut versucht:`, err.message || err);
    }
  }

  console.log(`[26-schlaefer-wecker] ${verarbeitet}/${orders.length} Schläfer geweckt`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[26-schlaefer-wecker] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[26-schlaefer-wecker] Fehler:', err);
  process.exit(1);
});
