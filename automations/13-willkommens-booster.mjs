// Willkommens-Booster - Willkommens-Mail für Erstkäufer (kein Rabatt, nur Willkommen + Tipp)
// Original: n8n Workflow "13_Willkommens_Booster" · Zeitplan: täglich 09:30
import { config, isTestMode } from './lib/config.mjs';
import { getOrdersSince } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '13-willkommens-booster';

async function main() {
  const gestern = new Date();
  gestern.setDate(gestern.getDate() - 1);
  gestern.setHours(0, 0, 0, 0);

  const orders = (await getOrdersSince(gestern)).filter((o) => !o.cancelled_at && o.email && o.customer);
  const state = loadState(STATE_KEY);
  state.begruesst = state.begruesst || [];
  let verarbeitet = 0;

  for (const o of orders) {
    if (parseInt(o.customer.orders_count || 0) > 1) continue;
    if (state.begruesst.includes(o.id)) continue;

    try {
      const vorname = o.customer.first_name || '';
      const artikel = (o.line_items || []).map((li) => li.title).slice(0, 3).join(', ');

      const prompt = `Du schreibst im Namen des Gründers vom Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}).${NL}Der Kunde hat GESTERN zum ERSTEN Mal bestellt. Schreibe die Willkommens-Mail auf Deutsch (Du-Form), max 140 Wörter.${NL}Vorname: ${vorname || 'unbekannt (neutral anreden)'}${NL}Bestellt: ${artikel}${NL}Versandzeit: ${config.VERSANDZEIT}${NL}Instagram: ${config.INSTAGRAM_HANDLE} TikTok: ${config.TIKTOK_HANDLE}${NL}${NL}Aufbau: (1) herzliches Willkommen, er ist jetzt Teil der Community. (2) Was jetzt passiert: Paket kommt in ${config.VERSANDZEIT}. (3) Ein ehrlicher Profi-Tipp passend zum gekauften Artikel. (4) Einladung, auf Instagram und TikTok zu folgen. KEIN Rabattcode, KEIN Upselling. Klingt wie vom Gründer persönlich. Schlichtes mobiltaugliches HTML mit Inline-CSS.${NL}Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}`;

      const antwort = await askClaude(prompt, { maxTokens: 2000 });
      const daten = parseJsonFromText(antwort, { betreff: 'Willkommen in der Familie!', html: antwort });

      const empfaenger = isTestMode() ? config.OWNER_EMAIL : o.email;
      await sendEmail({ to: empfaenger, subject: daten.betreff, html: daten.html });

      // Erst NACH erfolgreichem Versand als "begrüßt" markieren und sofort
      // speichern - schlägt eine spätere Bestellung im selben Lauf fehl, geht
      // dieser Erfolg nicht verloren (sonst würde der nächste Lauf denselben
      // Kunden nochmal anschreiben).
      state.begruesst.push(o.id);
      if (state.begruesst.length > 2000) state.begruesst = state.begruesst.slice(-2000);
      saveState(STATE_KEY, state);
      verarbeitet++;
    } catch (err) {
      console.error(`[13-willkommens-booster] Bestellung ${o.id} fehlgeschlagen, wird beim nächsten Lauf erneut versucht:`, err.message || err);
    }
  }

  console.log(`[13-willkommens-booster] ${verarbeitet}/${orders.length} Erstkäufer begrüßt`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[13-willkommens-booster] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[13-willkommens-booster] Fehler:', err);
  process.exit(1);
});
