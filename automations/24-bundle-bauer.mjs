// Bundle-Bauer - findet aus echten Kaufdaten heraus, welche Produkte oft zusammen gekauft werden
// Original: n8n Workflow "24_Bundle_Bauer" · Zeitplan: freitags 10:00
import { config } from './lib/config.mjs';
import { getOrdersSince } from './lib/shopify.mjs';
import { askKI } from './lib/ki.mjs';
import { sendEmail } from './lib/email.mjs';

const NL = '\n';

async function main() {
  const vor60Tagen = new Date();
  vor60Tagen.setDate(vor60Tagen.getDate() - 60);
  const orders = (await getOrdersSince(vor60Tagen)).filter((o) => !o.cancelled_at);

  const paare = {};
  for (const o of orders) {
    const titel = [];
    const seen = new Set();
    for (const li of o.line_items || []) {
      const t = li.title;
      if (t && !seen.has(t)) {
        seen.add(t);
        titel.push(t);
      }
    }
    for (let i = 0; i < titel.length; i++) {
      for (let j = i + 1; j < titel.length; j++) {
        const key = [titel[i], titel[j]].sort().join('  +  ');
        paare[key] = (paare[key] || 0) + 1;
      }
    }
  }

  const top = Object.entries(paare).filter((e) => e[1] >= 2).sort((a, b) => b[1] - a[1]).slice(0, 12);

  let prompt;
  if (top.length === 0) {
    prompt = `Du bist Merchandising-Stratege für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}). In den letzten 60 Tagen gab es noch zu wenig Daten für klare Kaufkombinationen. Schlage auf Deutsch als HTML 3 sinnvolle Produkt-Bundle-Ideen für diese Nische vor (logische Ergänzungen), je mit Bundle-Name, Nutzen und Rabatt-Idee. Ohne html/body-Gerüst, kein Markdown-Codeblock.`;
  } else {
    const liste = top.map((e) => `- ${e[0]}  (zusammen in ${e[1]} Bestellungen)`);
    prompt = `Du bist Merchandising-Stratege für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}).${NL}${NL}Diese Produkte werden oft ZUSAMMEN gekauft (echte Daten, letzte 60 Tage):${NL}${liste.join(NL)}${NL}${NL}Baue daraus konkrete Angebote auf Deutsch:${NL}1. DIE 3 stärksten Bundles: je Bundle-Name (verkaufsstark), welche Produkte, warum sie zusammenpassen, Bundle-Preis-Idee (z.B. 10-15% günstiger als einzeln)${NL}2. Für jedes Bundle: 1 knackiger Verkaufssatz fürs Produktbild/Banner${NL}3. EINE Idee für ein "Vervollständige dein Set"-Upsell auf der Produktseite${NL}4. Kurzer Hinweis, wie man Bundles in Shopify praktisch umsetzt (ohne teure App)${NL}${NL}Antworte als sauberes HTML (h2/h3, Listen), ohne html/body-Gerüst, kein Markdown-Codeblock.`;
  }

  const html = await askKI(prompt, { maxTokens: 3000 });

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `Bundle-Ideen aus echten Kaufdaten - ${config.SHOP_NAME}`,
    html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">${html}</div>`,
  });

  console.log(`[24-bundle-bauer] ${top.length} Kaufkombination(en) gefunden`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[24-bundle-bauer] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[24-bundle-bauer] Fehler:', err);
  process.exit(1);
});
