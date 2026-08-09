// Ad-Fabrik - wöchentliches Werbe-Paket (Hooks, UGC-Skripte, Meta-Ad, Targeting, A/B-Test)
// Original: n8n Workflow "07_Ad_Fabrik" · Zeitplan: montags 09:00
import { config } from './lib/config.mjs';
import { getOrdersSince } from './lib/shopify.mjs';
import { askClaude } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';

const NL = '\n';

async function main() {
  const vor30Tagen = new Date();
  vor30Tagen.setDate(vor30Tagen.getDate() - 30);

  const orders = (await getOrdersSince(vor30Tagen)).filter((o) => !o.cancelled_at);
  const produkte = {};
  for (const o of orders) {
    for (const li of o.line_items || []) {
      if (!produkte[li.title]) produkte[li.title] = { menge: 0, umsatz: 0 };
      produkte[li.title].menge += li.quantity;
      produkte[li.title].umsatz += parseFloat(li.price || 0) * li.quantity;
    }
  }
  const top = Object.entries(produkte)
    .sort((a, b) => b[1].umsatz - a[1].umsatz)
    .slice(0, 3)
    .map((e, i) => `${i + 1}. ${e[0]} (${e[1].menge} verkauft, ${e[1].umsatz.toFixed(0)} Umsatz)`);
  const topText = top.length ? top.join(NL) : '(noch keine Verkäufe - erstelle Ads für die Nische allgemein)';

  const prompt = `Du bist Direct-Response-Werbetexter (Meta + TikTok Ads) für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}).${NL}Zielgruppe: ${config.ZIELGRUPPE}${NL}${NL}Top-Produkte der letzten 30 Tage:${NL}${topText}${NL}${NL}Erstelle für das UMSATZSTÄRKSTE Produkt das komplette Ad-Paket der Woche auf Deutsch: (1) FÜNF Werbe-Hooks (verschiedene Winkel). (2) ZWEI TikTok/Reels UGC-Skripte (je 25-35s, Szene für Szene, klingen wie echte Kunden). (3) EINE Meta-Ad: Primary Text (AIDA, max 120 Wörter) + 3 Headlines (max 40 Zeichen) + Beschreibung. (4) DREI Targeting-Ideen mit Kurzbegründung. (5) EIN A/B-Test-Vorschlag der Woche. Antworte als sauberes HTML (h2/h3, Listen, kein html/body-Gerüst, kein Markdown-Codeblock).`;

  const html = await askClaude(prompt, { maxTokens: 4000 });

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `Ad-Fabrik: Dein Werbe-Paket für diese Woche (${config.SHOP_NAME})`,
    html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">${html}</div>`,
  });

  console.log('[07-ad-fabrik] Wöchentliches Ad-Paket versendet');
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[07-ad-fabrik] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[07-ad-fabrik] Fehler:', err);
  process.exit(1);
});
