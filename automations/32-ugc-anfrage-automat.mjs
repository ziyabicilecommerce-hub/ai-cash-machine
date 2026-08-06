// UGC-Anfrage-Automat - bittet treue Kunden um Foto/Video (UGC) für Social Media/Ads
// Original: n8n Workflow "32_UGC_Anfrage_Automat" · Zeitplan: täglich 15:00
import { config, isTestMode } from './lib/config.mjs';
import { getOrders } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '32-ugc-anfrage-automat';

async function main() {
  const minBest = parseInt(config.MIN_BESTELLUNGEN || '2');
  const von = new Date();
  von.setDate(von.getDate() - 12);
  von.setHours(0, 0, 0, 0);
  const bis = new Date();
  bis.setDate(bis.getDate() - 10);
  bis.setHours(23, 59, 59, 999);

  const orders = (
    await getOrders({
      created_at_min: encodeURIComponent(von.toISOString()),
      created_at_max: encodeURIComponent(bis.toISOString()),
    })
  ).filter((o) => !o.cancelled_at && o.email && o.customer);

  const state = loadState(STATE_KEY);
  state.gefragt = state.gefragt || [];
  let verarbeitet = 0;

  for (const o of orders) {
    const k = o.customer;
    if (parseInt(k.orders_count || 1) < minBest) continue;
    if (state.gefragt.includes(k.id)) continue;

    try {
      const artikel = (o.line_items || []).map((li) => li.title).slice(0, 2).join(', ');

      const prompt = `Du schreibst im Namen des Gründers vom Onlineshop "${config.SHOP_NAME}".${NL}Dieser Kunde ist ein echter Fan (${k.orders_count} Bestellungen). Letzter Kauf: ${artikel || 'diverses'}.${NL}${NL}Bitte ihn um ein kurzes Foto oder Video (UGC) mit dem Produkt, das der Shop für Social Media/Ads nutzen darf.${NL}Schreibe eine lockere, persönliche E-Mail auf Deutsch (Du-Form), max 120 Wörter:${NL}- Vorname: ${k.first_name || 'unbekannt (neutral anreden)'}${NL}- Ehrliches Kompliment (er kauft immer wieder), dann die Bitte um ein echtes Foto/Video im Alltag${NL}- Als Dankeschön: ${config.UGC_BELOHNUNG}${NL}- Super einfach machen: einfach auf diese Mail antworten und Datei anhängen${NL}- Locker, kein Corporate-Ton, schlichtes HTML${NL}Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}`;

      const antwort = await askClaude(prompt, { maxTokens: 1200 });
      const daten = parseJsonFromText(antwort, { betreff: 'Kleine Bitte an dich', html: antwort });

      const empfaenger = isTestMode() ? config.OWNER_EMAIL : o.email;
      await sendEmail({ to: empfaenger, subject: daten.betreff, html: daten.html });

      // Erst NACH erfolgreichem Versand als "gefragt" markieren und sofort
      // speichern - schlägt ein späterer Kunde im selben Lauf fehl, geht dieser
      // Erfolg nicht verloren (sonst würde der nächste Lauf denselben Kunden
      // nochmal anschreiben).
      state.gefragt.push(k.id);
      if (state.gefragt.length > 8000) state.gefragt = state.gefragt.slice(-8000);
      saveState(STATE_KEY, state);
      verarbeitet++;
    } catch (err) {
      console.error(`[32-ugc-anfrage-automat] Kunde ${k.id} fehlgeschlagen, wird beim nächsten Lauf erneut versucht:`, err.message || err);
    }
  }

  console.log(`[32-ugc-anfrage-automat] ${verarbeitet}/${orders.length} UGC-Anfrage(n) versendet`);
}

main().catch((err) => {
  console.error('[32-ugc-anfrage-automat] Fehler:', err);
  process.exit(1);
});
