// Saison-Planer - kompletter Marketing-Kalender für den Folgemonat (Feiertage, Wochenplan, Promos)
// Original: n8n Workflow "19_Saison_Planer" · Zeitplan: am 25. jedes Monats, 09:00
import { config } from './lib/config.mjs';
import { getOrdersSince } from './lib/shopify.mjs';
import { askClaude } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';

const NL = '\n';
const MONATE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

async function main() {
  const vor30Tagen = new Date();
  vor30Tagen.setDate(vor30Tagen.getDate() - 30);
  const orders = (await getOrdersSince(vor30Tagen)).filter((o) => !o.cancelled_at);

  const produkte = {};
  let umsatz = 0;
  for (const o of orders) {
    umsatz += parseFloat(o.total_price || 0);
    for (const li of o.line_items || []) produkte[li.title] = (produkte[li.title] || 0) + li.quantity;
  }
  const top = Object.entries(produkte).sort((a, b) => b[1] - a[1]).slice(0, 5).map((e) => `${e[0]} (${e[1]}x)`).join(', ');

  const jetzt = new Date();
  const idx = (jetzt.getMonth() + 1) % 12;
  const folgemonat = MONATE[idx];
  const jahr = idx === 0 ? jetzt.getFullYear() + 1 : jetzt.getFullYear();

  const prompt = `Du bist Marketing-Stratege für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}, Zielgruppe: ${config.ZIELGRUPPE}, Markt: DACH).${NL}Letzte 30 Tage: ${orders.length} Bestellungen, ${umsatz.toFixed(0)} Umsatz. Top-Produkte: ${top || 'keine'}${NL}${NL}Erstelle den kompletten MARKETING-KALENDER für ${folgemonat} ${jahr} auf Deutsch: (1) SAISON-CHECK: Feiertage, Saison-Momente, Shopping-Events und Anlässe im ${folgemonat} im DACH-Raum die für diese Nische relevant sind. (2) WOCHENPLAN: für jede der 4 Wochen ein Marketing-Thema. (3) ZWEI PROMO-AKTIONEN mit Datum, Mechanik, Begründung, Rabattcode-Vorschlag. (4) CONTENT-HIGHLIGHTS: 5 konkrete Video-/Post-Ideen. (5) E-MAIL-PLAN: welche Mails in welcher Woche. (6) MONATSZIEL-VORSCHLAG mit kurzer Rechnung. Antworte als sauberes HTML (h2/h3, Listen, kein html/body-Gerüst, kein Markdown-Codeblock).`;

  const html = await askClaude(prompt, { maxTokens: 5000 });

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `Dein Marketing-Kalender für ${folgemonat} ${jahr} (${config.SHOP_NAME})`,
    html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">${html}</div>`,
  });

  console.log(`[19-saison-planer] Marketing-Kalender für ${folgemonat} ${jahr} versendet`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[19-saison-planer] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[19-saison-planer] Fehler:', err);
  process.exit(1);
});
