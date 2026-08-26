// Bewertungs-Antwort-Bot - Entwürfe für Antworten auf neue Judge.me-Bewertungen (zum Copy-Paste)
// Original: n8n Workflow "30_Bewertungs_Antwort_Bot" · Zeitplan: täglich 13:00
import { config } from './lib/config.mjs';
import { getReviews } from './lib/judgeme.mjs';
import { askKI } from './lib/ki.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '30-bewertungs-antwort-bot';

async function main() {
  const reviews = await getReviews({ perPage: 30, page: 1 });
  const state = loadState(STATE_KEY);
  state.beantwortet = state.beantwortet || [];

  const neu = [];
  for (const r of reviews) {
    if (state.beantwortet.includes(r.id)) continue;
    const name = r.reviewer?.name || r.reviewer?.email || 'Kunde';
    const produkt = r.product_title || r.product?.title || 'Produkt';
    neu.push({ id: r.id, rating: r.rating, name, produkt, body: (r.body || '').slice(0, 500) });
  }

  if (neu.length === 0) {
    console.log('[30-bewertungs-antwort-bot] Keine neuen Bewertungen');
    return;
  }

  try {
    const bloecke = neu.map((r, i) => `${i + 1}. [${r.rating}/5 Sterne] von ${r.name} zu "${r.produkt}":${NL}   "${r.body}"`);

    const prompt = `Du bist der Gründer/Kundenservice des Onlineshops "${config.SHOP_NAME}" und antwortest öffentlich auf Produktbewertungen.${NL}${NL}NEUE BEWERTUNGEN:${NL}${bloecke.join(`${NL}${NL}`)}${NL}${NL}Schreibe für JEDE Bewertung eine passende, öffentliche Antwort auf Deutsch (Du-Form):${NL}- Bei 4-5 Sternen: herzlich danken, persönlich auf einen Punkt eingehen, kein Verkaufsspam${NL}- Bei 1-3 Sternen: sich ehrlich entschuldigen, Verantwortung übernehmen, konkrete Lösung/Kontakt anbieten - deeskalierend, nie rechtfertigend${NL}- Jede Antwort max 60 Wörter, klingt menschlich, nicht nach Vorlage${NL}${NL}Antworte als sauberes HTML: pro Bewertung ein Block mit der Original-Info (Sterne, Name, Produkt) und darunter deine fertige Antwort zum Kopieren. Ohne html/body-Gerüst, kein Markdown-Codeblock.`;

    const html = await askKI(prompt, { maxTokens: 3000 });

    const hinweis =
      '<div style="background:#ecfdf5;border:1px solid #10b981;padding:12px;border-radius:8px;font-family:sans-serif;font-size:13px;margin-bottom:20px;">Bewertungs-Antwort-Bot: fertige Antwort-Entwürfe unten. In Judge.me beim jeweiligen Review auf Antworten/Reply klicken und einsetzen.</div>';

    await sendEmail({
      to: config.OWNER_EMAIL,
      subject: `Neue Bewertungs-Antworten - ${config.SHOP_NAME}`,
      html: `<div style="font-family:sans-serif;max-width:660px;margin:0 auto;">${hinweis}${html}</div>`,
    });

    // Erst NACH erfolgreichem Versand als "beantwortet" markieren und speichern -
    // schlägt der Versand fehl, sollen die Bewertungen beim nächsten Lauf erneut
    // aufgenommen werden (sonst blieben sie für immer unbeantwortet markiert, ohne
    // dass je ein Entwurf verschickt wurde).
    for (const r of neu) state.beantwortet.push(r.id);
    if (state.beantwortet.length > 8000) state.beantwortet = state.beantwortet.slice(-8000);
    saveState(STATE_KEY, state);

    console.log(`[30-bewertungs-antwort-bot] ${neu.length}/${neu.length} Antwort-Entwurf/e versendet`);
  } catch (err) {
    console.error('[30-bewertungs-antwort-bot] Versand fehlgeschlagen, wird beim nächsten Lauf erneut versucht:', err.message || err);
  }
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[30-bewertungs-antwort-bot] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[30-bewertungs-antwort-bot] Fehler:', err);
  process.exit(1);
});
