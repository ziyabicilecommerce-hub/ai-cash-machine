// Kunden-Feedback-Sammler - fragt Kunden nach X Tagen persönlich nach Zufriedenheit & Sortimentswünschen
// Original: n8n Workflow "40_Kunden_Feedback_Sammler" · Zeitplan: täglich 16:30
import { config, isTestMode } from './lib/config.mjs';
import { getOrders } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '40-kunden-feedback-sammler';

async function main() {
  const tage = parseInt(config.FRAGE_TAGE || '21');
  const von = new Date();
  von.setDate(von.getDate() - (tage + 2));
  von.setHours(0, 0, 0, 0);
  const bis = new Date();
  bis.setDate(bis.getDate() - tage);
  bis.setHours(23, 59, 59, 999);

  const orders = (
    await getOrders({
      created_at_min: encodeURIComponent(von.toISOString()),
      created_at_max: encodeURIComponent(bis.toISOString()),
    })
  ).filter((o) => !o.cancelled_at && o.email);

  const state = loadState(STATE_KEY);
  state.befragt = state.befragt || [];
  let verarbeitet = 0;

  for (const o of orders) {
    const kid = (o.customer && o.customer.id) || o.email;
    if (state.befragt.includes(kid)) continue;
    state.befragt.push(kid);
    verarbeitet++;

    const vorname = (o.customer && o.customer.first_name) || '';
    const artikel = (o.line_items || []).map((li) => li.title).slice(0, 2).join(', ');

    const prompt = `Du schreibst im Namen des Gründers vom Onlineshop "${config.SHOP_NAME}".${NL}Dieser Kunde hat vor ${tage} Tagen gekauft (${artikel || 'diverses'}) und das Produkt inzwischen genutzt.${NL}${NL}Schreibe eine kurze, ehrliche Feedback-Mail auf Deutsch (Du-Form), max 100 Wörter:${NL}- Vorname: ${vorname || 'unbekannt (neutral anreden)'}${NL}- Klingt wie eine echte persönliche Frage vom Gründer, NICHT wie eine Umfrage-Maschine${NL}- Frage GENAU 2 Dinge: (1) Wie zufrieden warst du? (2) Was sollen wir als nächstes ins Sortiment nehmen / was fehlt dir noch?${NL}- Bitte einfach auf diese Mail zu antworten${NL}- Als Dankeschön fürs Antworten: ${config.FEEDBACK_ANREIZ}${NL}- Ganz schlichtes, persönliches HTML (fast wie eine normale Mail)${NL}Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}`;

    const antwort = await askClaude(prompt, { maxTokens: 1000 });
    const daten = parseJsonFromText(antwort, { betreff: 'Kurze Frage an dich', html: antwort });

    const empfaenger = isTestMode() ? config.OWNER_EMAIL : o.email;
    await sendEmail({ to: empfaenger, subject: daten.betreff, html: daten.html });
  }

  if (state.befragt.length > 8000) state.befragt = state.befragt.slice(-8000);
  saveState(STATE_KEY, state);

  console.log(`[40-kunden-feedback-sammler] ${verarbeitet} Feedback-Mail(s) versendet`);
}

main().catch((err) => {
  console.error('[40-kunden-feedback-sammler] Fehler:', err);
  process.exit(1);
});
