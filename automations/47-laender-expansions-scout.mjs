// Länder-Expansions-Scout - analysiert monatlich Bestellungen nach Land und empfiehlt den nächsten Expansionsmarkt
// Original: n8n Workflow "47_Länder_Expansions_Scout" · Zeitplan: am 1. jeden Monats 09:00
import { config } from './lib/config.mjs';
import { getOrdersSince } from './lib/shopify.mjs';
import { askClaude } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';

const NL = '\n';

async function main() {
  const vor90Tagen = new Date();
  vor90Tagen.setDate(vor90Tagen.getDate() - 90);
  const orders = (await getOrdersSince(vor90Tagen)).filter((o) => !o.cancelled_at);

  const land = {};
  for (const o of orders) {
    const c = (o.shipping_address && o.shipping_address.country) || (o.billing_address && o.billing_address.country) || 'Unbekannt';
    if (!land[c]) land[c] = { umsatz: 0, anzahl: 0 };
    land[c].umsatz += parseFloat(o.total_price || 0);
    land[c].anzahl += 1;
  }

  const zeilen = Object.entries(land)
    .sort((a, b) => b[1].umsatz - a[1].umsatz)
    .map((e) => `- ${e[0]}: ${e[1].umsatz.toFixed(0)} Umsatz, ${e[1].anzahl} Bestellungen`);
  const daten = zeilen.length ? zeilen.join(NL) : '- keine Länderdaten';

  const prompt = `Du bist Expansions-Stratege für den Onlineshop "${config.SHOP_NAME}" (Heimatmarkt: ${config.HEIMATMARKT}).${NL}${NL}Bestellungen nach Land (letzte 90 Tage):${NL}${daten}${NL}${NL}Analysiere auf Deutsch:${NL}1. Gibt es Länder außerhalb des Heimatmarkts mit überraschend viel Nachfrage? (Chance!)${NL}2. Welches 1 Land würdest du als nächsten Expansionsmarkt empfehlen und warum?${NL}3. Konkrete erste Schritte für diesen Markt (Versand, Sprache/Übersetzung, Zahlungsarten, Währung, rechtliches Grob-Todo)${NL}4. Ein schneller Test, um die Nachfrage dort zu prüfen, bevor man groß investiert${NL}${NL}Antworte als sauberes HTML (h2/h3, Listen), ohne html/body-Gerüst, kein Markdown-Codeblock.`;

  const html = await askClaude(prompt, { maxTokens: 2500 });

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `Expansions-Scout (90 Tage) - ${config.SHOP_NAME}`,
    html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">${html}</div>`,
  });

  console.log('[47-laender-expansions-scout] Report versendet');
}

main().catch((err) => {
  console.error('[47-laender-expansions-scout] Fehler:', err);
  process.exit(1);
});
