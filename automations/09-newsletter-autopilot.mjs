// Newsletter-Autopilot - schreibt wöchentlichen Newsletter-Entwurf (Betreff, HTML) zur Freigabe
// Original: n8n Workflow "09_Newsletter_Autopilot" · Zeitplan: donnerstags 09:00
import { config } from './lib/config.mjs';
import { getProducts, getOrdersSince } from './lib/shopify.mjs';
import { askKI, parseJsonFromText } from './lib/ki.mjs';
import { sendEmail } from './lib/email.mjs';

const NL = '\n';

async function main() {
  const produkte = (await getProducts({ limit: '50', fields: 'id,title,handle,product_type,tags,variants' }))
    .slice(0, 20)
    .map((p) => `- ${p.title} (${config.SHOP_URL}/products/${p.handle}, ab ${p.variants?.[0]?.price || '?'})`);

  const vor7Tagen = new Date();
  vor7Tagen.setDate(vor7Tagen.getDate() - 7);
  const orders = (await getOrdersSince(vor7Tagen)).filter((o) => !o.cancelled_at);
  const verkauft = {};
  for (const o of orders) {
    for (const li of o.line_items || []) verkauft[li.title] = (verkauft[li.title] || 0) + li.quantity;
  }
  const topWoche = Object.entries(verkauft)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map((e) => `- ${e[0]} (${e[1]}x diese Woche)`);

  const prompt = `Du bist Newsletter-Texter für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}).${NL}${NL}Produktkatalog (Auszug):${NL}${produkte.join(NL)}${NL}${NL}Bestseller dieser Woche:${NL}${topWoche.length ? topWoche.join(NL) : '(keine Verkäufe diese Woche)'}${NL}${NL}${
    config.NEWSLETTER_RABATT_CODE ? `Rabattcode für den Newsletter: ${config.NEWSLETTER_RABATT_CODE}${NL}${NL}` : ''
  }Schreibe den kompletten Wochen-Newsletter auf Deutsch (Du-Form):${NL}1. Betreffzeile (neugierig machend, max 45 Zeichen) + Preheader (max 80 Zeichen)${NL}2. Aufhänger: kurzer, persönlicher Einstieg mit echtem Mehrwert zur Nische (Tipp, Insight oder Mini-Story - KEIN reines Verkaufen)${NL}3. Produkt-Spotlight: 1-2 Produkte aus dem Katalog natürlich einbinden, mit Link${NL}4. Klarer CTA-Button (als <a> mit Inline-Button-Styling)${NL}${
    config.NEWSLETTER_RABATT_CODE ? `5. Rabattcode elegant einbauen${NL}` : ''
  }${NL}Verhältnis: 70% Mehrwert, 30% Verkauf. Mobiltaugliches HTML mit Inline-CSS.${NL}Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "preheader": "...", "html": "<komplettes Newsletter-HTML>"}`;

  const antwort = await askKI(prompt, { maxTokens: 4000 });
  const daten = parseJsonFromText(antwort, { betreff: 'Dein Wochen-Newsletter (Entwurf)', preheader: '', html: antwort });

  const hinweis = `<div style="background:#fef3c7;border:1px solid #f59e0b;padding:12px;border-radius:8px;font-family:sans-serif;font-size:13px;margin-bottom:20px;">Newsletter-Entwurf - Betreff: <b>${daten.betreff}</b> - Preheader: ${daten.preheader || '-'}<br>Gegenlesen, in dein E-Mail-Tool (Shopify Email / Klaviyo / Mailchimp) kopieren und an deine Liste senden. 2 Minuten Arbeit.</div>`;

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `Newsletter-Entwurf für diese Woche: ${daten.betreff}`,
    html: hinweis + daten.html,
  });

  console.log('[09-newsletter-autopilot] Newsletter-Entwurf versendet');
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[09-newsletter-autopilot] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[09-newsletter-autopilot] Fehler:', err);
  process.exit(1);
});
