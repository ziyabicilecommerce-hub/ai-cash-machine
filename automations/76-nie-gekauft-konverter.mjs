// Nie-Gekauft-Konverter - findet Newsletter-Abonnenten, die zwar schon seit
// NIEGEKAUFT_TAGE_ALS_ABONNENT Tagen dabei sind, aber noch NIE bestellt
// haben (total_spent = 0), und schickt einen speziellen Erstkauf-Anreiz.
// Neu, kein n8n-Workflow · Zeitplan: wöchentlich.
//
// Unterscheidet sich klar von #05 Winback-Maschine (zielt auf Kunden, die
// FRÜHER schon gekauft haben) und #13 Willkommens-Booster (zielt auf ganz
// frische Erstkäufer direkt nach der ersten Bestellung) - dieser Agent ist
// der einzige, der die Top-of-Funnel-Lücke schließt: Leute, die Interesse
// gezeigt (Newsletter) aber noch NIE wirklich gekauft haben.
import { config, isTestMode } from './lib/config.mjs';
import { getCustomers } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '76-nie-gekauft-konverter';
const MAX_HISTORIE = 5000;

async function main() {
  const tageAlsAbonnent = parseInt(config.NIEGEKAUFT_TAGE_ALS_ABONNENT || '14', 10);
  const maxProLauf = parseInt(config.NIEGEKAUFT_MAX_PRO_LAUF || '50', 10);
  const rabattCode = config.NIEGEKAUFT_RABATT_CODE || 'WILLKOMMEN15';

  const kunden = await getCustomers({ limit: '250' });
  const grenzdatum = new Date();
  grenzdatum.setDate(grenzdatum.getDate() - tageAlsAbonnent);

  const state = loadState(STATE_KEY);
  state.angeschrieben = state.angeschrieben || [];
  const bereitsAngeschrieben = new Set(state.angeschrieben);

  const kandidaten = kunden.filter((k) => {
    if (!k.email || bereitsAngeschrieben.has(k.id)) return false;
    const istAbonnent = k.email_marketing_consent ? k.email_marketing_consent.state === 'subscribed' : k.accepts_marketing === true;
    if (!istAbonnent) return false;
    const nieGekauft = parseFloat(k.total_spent || '0') === 0 && parseInt(k.orders_count || '0', 10) === 0;
    if (!nieGekauft) return false;
    return new Date(k.created_at) <= grenzdatum;
  }).slice(0, maxProLauf);

  if (!kandidaten.length) {
    console.log('[76-nie-gekauft-konverter] Keine Abonnenten ohne jemals eine Bestellung.');
    return;
  }

  let angeschrieben = 0;
  for (const k of kandidaten) {
    try {
      const prompt = `Du bist E-Mail-Marketing-Profi für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}).${NL}Dieser Kontakt ist seit über ${tageAlsAbonnent} Tagen Newsletter-Abonnent, hat aber noch NIE bestellt.${NL}Vorname: ${k.first_name || 'unbekannt (neutral anreden)'}${NL}${NL}Schreibe eine kurze, einladende "Worauf wartest du noch?"-Mail auf Deutsch (Du-Form), max 100 Wörter: freundlich neugierig machen (nicht vorwurfsvoll!), EIN konkreter Erstkauf-Anreiz mit Rabattcode ${rabattCode} (15%), EIN klarer CTA-Button zum Shop.${NL}Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}`;

      const antwort = await askClaude(prompt, { maxTokens: 1500 });
      const daten = parseJsonFromText(antwort, { betreff: 'Worauf wartest du noch?', html: antwort });

      const empfaenger = isTestMode() ? config.OWNER_EMAIL : k.email;
      await sendEmail({ to: empfaenger, subject: daten.betreff, html: daten.html });

      // Erst NACH erfolgreichem Versand als angeschrieben markieren und
      // sofort speichern - schlägt ein späterer Kontakt im selben Lauf
      // fehl, geht dieser Erfolg nicht verloren.
      state.angeschrieben.push(k.id);
      if (state.angeschrieben.length > MAX_HISTORIE) state.angeschrieben = state.angeschrieben.slice(-MAX_HISTORIE);
      saveState(STATE_KEY, state);
      angeschrieben++;
    } catch (err) {
      console.error(`[76-nie-gekauft-konverter] Kontakt ${k.id} fehlgeschlagen, wird beim nächsten Lauf erneut versucht:`, err.message || err);
    }
  }

  console.log(`[76-nie-gekauft-konverter] ${angeschrieben}/${kandidaten.length} Nie-Käufer angeschrieben.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[76-nie-gekauft-konverter] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[76-nie-gekauft-konverter] Fehler:', err);
  process.exit(1);
});
