// FAQ-Bauer - baut wöchentlich eine komplette, verkaufsfördernde FAQ-Sektion für den Shop
// Original: n8n Workflow "36_FAQ_Bauer" · Zeitplan: donnerstags 08:00
import { config } from './lib/config.mjs';
import { getProducts } from './lib/shopify.mjs';
import { askKI } from './lib/ki.mjs';
import { sendEmail } from './lib/email.mjs';

const NL = '\n';

async function main() {
  const produkte = (await getProducts({ limit: '50', fields: 'id,title,product_type,tags' }))
    .slice(0, 20)
    .map((p) => `- ${p.title}${p.product_type ? ` (${p.product_type})` : ''}`);

  const prompt = `Du bist Conversion-Texter für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}).${NL}${NL}Shop-Fakten:${NL}- Versandzeit: ${config.VERSANDZEIT}${NL}- Rückgaberecht: ${config.RETOURE_TAGE} Tage${NL}${NL}Produkt-Auszug:${NL}${produkte.join(NL)}${NL}${NL}Erstelle eine komplette, verkaufsfördernde FAQ-Sektion auf Deutsch (Du-Form) für diesen Shop:${NL}- 10-12 häufige Fragen, die Kunden dieser Nische VOR dem Kauf wirklich haben (Versand, Retoure, Größe/Passform, Material/Qualität, Anwendung, Zahlung, Garantie, Nachhaltigkeit...)${NL}- Jede Antwort kurz, ehrlich, Einwand-auflösend und vertrauensbildend (nutze die Shop-Fakten)${NL}- Formuliere so, dass Antworten Kaufhemmungen abbauen, nicht nur informieren${NL}${NL}Antworte als sauberes, copy-paste-fertiges HTML (jede Frage als <h3>, Antwort als <p>), das man direkt in eine Shopify-Seite einsetzen kann. Ohne html/body-Gerüst, kein Markdown-Codeblock.`;

  const html = await askKI(prompt, { maxTokens: 3500 });

  const hinweis =
    '<div style="background:#fff7ed;border:1px solid #f97316;padding:12px;border-radius:8px;font-family:sans-serif;font-size:13px;margin-bottom:20px;">FAQ-Bauer: fertige FAQ unten. In Shopify unter Seiten eine Seite "Häufige Fragen" anlegen, HTML einfügen, im Menü/Footer verlinken.</div>';

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `Fertige FAQ-Sektion - ${config.SHOP_NAME}`,
    html: `<div style="font-family:sans-serif;max-width:660px;margin:0 auto;">${hinweis}${html}</div>`,
  });

  console.log('[36-faq-bauer] FAQ-Sektion versendet');
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[36-faq-bauer] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[36-faq-bauer] Fehler:', err);
  process.exit(1);
});
