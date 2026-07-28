// Kunden-Jubiläum - Dankes-Mail an Kunden, die vor genau 1 Jahr Erstkontakt hatten
// Original: n8n Workflow "23_Kunden_Jubiläum" · Zeitplan: täglich 10:30
import { config, isTestMode } from './lib/config.mjs';
import { getCustomers } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '23-kunden-jubilaeum';

async function main() {
  const von = new Date();
  von.setDate(von.getDate() - 366);
  von.setHours(0, 0, 0, 0);
  const bis = new Date();
  bis.setDate(bis.getDate() - 365);
  bis.setHours(23, 59, 59, 999);

  const kunden = (
    await getCustomers({
      created_at_min: encodeURIComponent(von.toISOString()),
      created_at_max: encodeURIComponent(bis.toISOString()),
    })
  ).filter((k) => k.email);

  const state = loadState(STATE_KEY);
  state.gefeiert = state.gefeiert || [];
  let verarbeitet = 0;

  for (const k of kunden) {
    if (state.gefeiert.includes(k.id)) continue;
    state.gefeiert.push(k.id);
    verarbeitet++;

    const gesamt = parseFloat(k.total_spent || 0).toFixed(0);
    const bestellungen = parseInt(k.orders_count || 0);

    const prompt = `Du schreibst im Namen des Gründers vom Onlineshop "${config.SHOP_NAME}".${NL}Dieser Kunde ist heute genau 1 Jahr dabei (erster Kontakt vor einem Jahr). Bisher ${bestellungen} Bestellungen, ${gesamt} Gesamtumsatz.${NL}${NL}Schreibe eine warme, kurze Jubiläums-E-Mail auf Deutsch (Du-Form), max 110 Wörter:${NL}- Vorname: ${k.first_name || 'unbekannt (neutral anreden)'}${NL}- Feiere das 1-jährige "Shop-Jubiläum" persönlich und ehrlich, kein Marketing-Sprech${NL}- Kleines Dankeschön: Gutschein-Code ${config.JUBILAEUM_RABATT_CODE}${NL}- Schlichtes, persönliches HTML, wenig Styling${NL}Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}`;

    const antwort = await askClaude(prompt, { maxTokens: 1200 });
    const daten = parseJsonFromText(antwort, { betreff: 'Ein Jahr - danke dir!', html: antwort });

    const empfaenger = isTestMode() ? config.OWNER_EMAIL : k.email;
    await sendEmail({ to: empfaenger, subject: daten.betreff, html: daten.html });
  }

  if (state.gefeiert.length > 8000) state.gefeiert = state.gefeiert.slice(-8000);
  saveState(STATE_KEY, state);

  console.log(`[23-kunden-jubilaeum] ${verarbeitet} Jubiläum(s)-Mail(s) versendet`);
}

main().catch((err) => {
  console.error('[23-kunden-jubilaeum] Fehler:', err);
  process.exit(1);
});
