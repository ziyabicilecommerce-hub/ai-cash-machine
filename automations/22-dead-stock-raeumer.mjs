// Dead-Stock-Räumer - findet Ladenhüter (kaum verkauft, viel Kapital gebunden) und liefert Räumungsplan
// Original: n8n Workflow "22_Dead_Stock_Räumer" · Zeitplan: mittwochs 09:00
import { config } from './lib/config.mjs';
import { getProducts, getOrdersSince } from './lib/shopify.mjs';
import { askKI } from './lib/ki.mjs';
import { sendEmail } from './lib/email.mjs';

const NL = '\n';

async function main() {
  const vor60Tagen = new Date();
  vor60Tagen.setDate(vor60Tagen.getDate() - 60);

  const orders = (await getOrdersSince(vor60Tagen)).filter((o) => !o.cancelled_at);
  const verkauf = {};
  for (const o of orders) {
    for (const li of o.line_items || []) {
      if (li.product_id) verkauf[li.product_id] = (verkauf[li.product_id] || 0) + li.quantity;
    }
  }

  const produkte = await getProducts({ limit: '250', fields: 'id,title,created_at,variants' });
  const jetzt = Date.now();
  const tote = [];

  for (const p of produkte) {
    const verkauft = verkauf[p.id] || 0;
    const alterTage = p.created_at ? (jetzt - new Date(p.created_at).getTime()) / 86400000 : 999;
    if (alterTage < 30) continue;

    let bestand = 0;
    let preis = 0;
    for (const v of p.variants || []) {
      const b = parseInt(v.inventory_quantity);
      if (!isNaN(b)) bestand += b;
      if (!preis) preis = parseFloat(v.price || 0);
    }
    if (verkauft <= 1 && bestand > 0) {
      tote.push({ titel: p.title, verkauft, bestand, preis, gebunden: bestand * preis });
    }
  }
  tote.sort((a, b) => b.gebunden - a.gebunden);
  const top = tote.slice(0, 15);

  let prompt;
  if (top.length === 0) {
    prompt = `Sage in einem kurzen, lockeren Satz auf Deutsch (Du-Form), dass der Shop "${config.SHOP_NAME}" aktuell keine nennenswerten Ladenhüter hat - das Sortiment dreht sich gut. Klartext, ohne Markdown.`;
  } else {
    const gesamtGebunden = top.reduce((s, t) => s + t.gebunden, 0);
    const liste = top.map(
      (t) => `- ${t.titel} | in 60 Tagen ${t.verkauft}x verkauft | Bestand: ${t.bestand} | Preis: ${t.preis.toFixed(2)} | gebundenes Kapital: ~${t.gebunden.toFixed(0)}`
    );
    prompt = `Du bist Merchandising-Stratege für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}).${NL}${NL}Diese Artikel sind Ladenhüter (max 1x verkauft in 60 Tagen, aber auf Lager). Insgesamt ~${gesamtGebunden.toFixed(0)} totes Kapital:${NL}${liste.join(NL)}${NL}${NL}Gib mir einen Räumungs-Plan auf Deutsch:${NL}1. Für die größten Kapitalbinder: konkrete Aktion (Rabatt-Höhe, Bundle mit Bestseller, Gratis-Zugabe, aus dem Sortiment nehmen)${NL}2. EINE Räumungs-Kampagnen-Idee ("Lager-Räumung"), die trotzdem zur Marke passt${NL}3. Welche 2-3 Artikel man ganz streichen sollte und warum${NL}4. Merksatz: wie man solche Fehlkäufe im Einkauf künftig vermeidet${NL}${NL}Antworte als sauberes HTML (h2/h3, Listen), ohne html/body-Gerüst, kein Markdown-Codeblock.`;
  }

  const html = await askKI(prompt, { maxTokens: 3000 });

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `Dead-Stock-Räumungsplan - ${config.SHOP_NAME}`,
    html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">${html}</div>`,
  });

  console.log(`[22-dead-stock-raeumer] ${top.length} Ladenhüter gefunden`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[22-dead-stock-raeumer] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[22-dead-stock-raeumer] Fehler:', err);
  process.exit(1);
});
