// Winback-Maschine - reaktiviert Kunden, die seit X Tagen nichts mehr bestellt haben.
// Original: n8n Workflow "05_Winback_Maschine" · Zeitplan: täglich 11:00
import { config, isTestMode } from './lib/config.mjs';
import { getOrders } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '05-winback-maschine';

async function main() {
  const tage = parseInt(config.WINBACK_TAGE || '60');
  const von = new Date();
  von.setDate(von.getDate() - (tage + 1));
  von.setHours(0, 0, 0, 0);
  const bis = new Date();
  bis.setDate(bis.getDate() - tage);
  bis.setHours(0, 0, 0, 0);

  const orders = (
    await getOrders({
      created_at_min: encodeURIComponent(von.toISOString()),
      created_at_max: encodeURIComponent(bis.toISOString()),
    })
  ).filter((o) => !o.cancelled_at && o.email && o.customer);

  const state = loadState(STATE_KEY);
  state.winback = state.winback || [];
  const gesehen = new Set();
  let verarbeitet = 0;

  for (const o of orders) {
    if (gesehen.has(o.email)) continue;
    gesehen.add(o.email);
    if (state.winback.includes(o.email)) continue;
    state.winback.push(o.email);
    verarbeitet++;

    const vorname = o.customer.first_name || '';
    const artikel = (o.line_items || []).map((li) => li.title).slice(0, 3).join(', ');

    const prompt = `Du bist E-Mail-Marketing-Profi für den Onlineshop "${config.SHOP_NAME}".${NL}Dieser Kunde hat vor ${tage} Tagen gekauft und seitdem nichts mehr bestellt. Schreibe eine Winback-Mail auf Deutsch (Du-Form), max 130 Wörter.${NL}Vorname: ${vorname || 'unbekannt (neutral anreden)'}${NL}Damals gekauft: ${artikel}${NL}Shop-Link: ${config.SHOP_URL}${NL}Rabattcode: ${config.WINBACK_RABATT_CODE} (${config.WINBACK_RABATT_PROZENT}%)${NL}${NL}Anforderungen: wir-vermissen-dich-Vibe ohne cringe, beziehe dich auf den damaligen Kauf, Rabattcode als Dankeschön, EIN Button zum Shop, leichte Dringlichkeit (Code 7 Tage gültig). Mobiltaugliches HTML mit Inline-CSS.${NL}Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}`;

    const antwort = await askClaude(prompt, { maxTokens: 2000 });
    const daten = parseJsonFromText(antwort, { betreff: 'Wir vermissen dich!', html: antwort });

    const empfaenger = isTestMode() ? config.OWNER_EMAIL : o.email;
    await sendEmail({ to: empfaenger, subject: daten.betreff, html: daten.html });
  }

  if (state.winback.length > 3000) state.winback = state.winback.slice(-3000);
  saveState(STATE_KEY, state);

  console.log(`[05-winback-maschine] ${verarbeitet} Kunde(n) angeschrieben`);
}

main().catch((err) => {
  console.error('[05-winback-maschine] Fehler:', err);
  process.exit(1);
});
