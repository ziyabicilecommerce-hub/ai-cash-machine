// Warenkorb-Sequenz 3.0 - dreistufige Erinnerung an abgebrochene Warenkörbe (1h / 24h / 72h)
// Original: n8n Workflow "15_Warenkorb_Sequenz_3_0" · Zeitplan: stündlich
import { config, isTestMode } from './lib/config.mjs';
import { getCheckouts } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '15-warenkorb-sequenz';

function buildPrompt(c, stufe) {
  const artikel = (c.line_items || []).map((li) => `${li.quantity}x ${li.title}`).join(', ');
  const vorname = c.customer?.first_name || '';
  const basis = `Du bist E-Mail-Marketing-Profi für den Onlineshop "${config.SHOP_NAME}". Kunde: ${
    vorname || 'unbekannt (neutral anreden)'
  } | Warenkorb: ${artikel} | Wert: ${c.total_price} ${c.currency} | Checkout-Link: ${c.abandoned_checkout_url}${NL}${NL}`;

  let anweisung = '';
  if (stufe === 1) {
    anweisung =
      'STUFE 1 (1h nach Abbruch, sanfte Erinnerung, KEIN Rabatt): kurze hilfsbereite Erinnerung auf Deutsch (Du-Form), max 80 Wörter. Ton: dein Warenkorb wartet, gab es ein Problem? Antworte einfach auf diese Mail. Kein Verkaufsdruck, wirkt wie aufmerksamer Service. EIN Button zurück zum Checkout.';
  } else if (stufe === 2) {
    anweisung = `STUFE 2 (24h, jetzt der Anreiz): Rückhol-Mail auf Deutsch (Du-Form), max 110 Wörter. Rabattcode ${config.RABATT_CODE} (${config.RABATT_PROZENT}%) prominent als Dankeschön, 48h gültig. Beziehe dich charmant darauf, dass die Artikel noch reserviert sind. EIN Button zum Checkout.`;
  } else {
    anweisung = `STUFE 3 (72h, letzte Chance): finale Mail auf Deutsch (Du-Form), max 90 Wörter. Ehrliche letzte Erinnerung: Code ${config.RABATT_CODE} läuft heute ab. Echte Dringlichkeit ohne Drama, ein Hauch Humor erlaubt. EIN Button zum Checkout.`;
  }

  return `${basis}${anweisung}${NL}Mobiltaugliches HTML mit Inline-CSS. Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}`;
}

async function main() {
  const vor4Tagen = new Date();
  vor4Tagen.setDate(vor4Tagen.getDate() - 4);

  const checkouts = await getCheckouts({ created_at_min: encodeURIComponent(vor4Tagen.toISOString()) });
  const state = loadState(STATE_KEY);
  state.stufen = state.stufen || {};
  const jetzt = Date.now();
  let versendet = 0;

  for (const c of checkouts) {
    if (!c.email) continue;
    const alterH = (jetzt - new Date(c.created_at).getTime()) / 3600000;
    const eintrag = state.stufen[c.id] || { stufe: 0, ts: jetzt };

    let stufe = 0;
    if (alterH >= 72 && eintrag.stufe < 3) stufe = 3;
    else if (alterH >= 24 && eintrag.stufe < 2) stufe = 2;
    else if (alterH >= 1 && eintrag.stufe < 1) stufe = 1;
    if (stufe === 0 || alterH > 96) continue;

    const prompt = buildPrompt(c, stufe);
    const antwort = await askClaude(prompt, { maxTokens: 2000 });
    const daten = parseJsonFromText(antwort, { betreff: 'Dein Warenkorb wartet', html: antwort });

    const empfaenger = isTestMode() ? config.OWNER_EMAIL : c.email;
    const betreff = isTestMode() ? `[TEST Stufe ${stufe}] ${daten.betreff}` : daten.betreff;
    await sendEmail({ to: empfaenger, subject: betreff, html: daten.html });

    state.stufen[c.id] = { stufe, ts: jetzt };
    versendet++;
  }

  for (const id of Object.keys(state.stufen)) {
    if (jetzt - state.stufen[id].ts > 7 * 24 * 3600000) delete state.stufen[id];
  }
  saveState(STATE_KEY, state);

  console.log(`[15-warenkorb-sequenz] ${versendet} Erinnerung(en) versendet`);
}

main().catch((err) => {
  console.error('[15-warenkorb-sequenz] Fehler:', err);
  process.exit(1);
});
