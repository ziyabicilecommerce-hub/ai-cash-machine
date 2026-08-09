// Lead-Magnet-Maschine - wöchentlich rotierende Lead-Gen-Ideen (Quiz, Checkliste, Rabatt, ...)
// Original: n8n Workflow "35_Lead_Magnet_Maschine" · Zeitplan: montags 08:00
import { config } from './lib/config.mjs';
import { askClaude } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '35-lead-magnet-maschine';
const FOKI = ['Quiz/Test', 'Checkliste/Cheatsheet', 'Rabatt-für-Anmeldung', 'Mini-Guide/PDF', 'Gewinnspiel', 'Warteliste/Early-Access'];

async function main() {
  const state = loadState(STATE_KEY);
  state.woche = (state.woche || 0) + 1;
  saveState(STATE_KEY, state);

  const fokus = FOKI[(state.woche - 1) % FOKI.length];

  const prompt = `Du bist E-Mail-Listen-/Lead-Gen-Experte für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}, Zielgruppe: ${config.ZIELGRUPPE}).${NL}${NL}Fokus dieser Woche: ${fokus}${NL}${NL}Gib mir auf Deutsch konkrete Lead-Magnet-Ideen, um mehr E-Mail-Adressen zu sammeln (E-Mail-Liste = eigener, werbekostenfreier Umsatzkanal):${NL}1. DIE 3 besten ${fokus}-Ideen für genau diese Nische (je: Titel, was der Kunde bekommt, warum er seine Mail dafür hergibt)${NL}2. Für die stärkste Idee: fertiger Text fürs Popup/Formular (Headline + Sub + Button)${NL}3. Eine 3-teilige Willkommens-Mail-Sequenz in Stichpunkten (Mail 1 sofort, Mail 2 nach 2 Tagen, Mail 3 nach 5 Tagen)${NL}4. Wo/wie das Ganze technisch einbinden (Shopify-Popup-App oder Formular), praxisnah${NL}${NL}Antworte als sauberes HTML (h2/h3, Listen), ohne html/body-Gerüst, kein Markdown-Codeblock.`;

  const html = await askClaude(prompt, { maxTokens: 3000 });

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `Lead-Magnet-Ideen (${fokus}) - ${config.SHOP_NAME}`,
    html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">${html}</div>`,
  });

  console.log(`[35-lead-magnet-maschine] Fokus "${fokus}" versendet`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[35-lead-magnet-maschine] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[35-lead-magnet-maschine] Fehler:', err);
  process.exit(1);
});
