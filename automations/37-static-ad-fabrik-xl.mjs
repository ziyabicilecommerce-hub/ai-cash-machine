// Static-Ad-Fabrik XL - wöchentlich N komplette Static-Ad-Konzepte für den aktuellen Bestseller
// Original: n8n Workflow "37_Static_Ad_Fabrik_XL" · Zeitplan: dienstags 07:30
import { config } from './lib/config.mjs';
import { getOrdersSince } from './lib/shopify.mjs';
import { askKI } from './lib/ki.mjs';
import { sendEmail } from './lib/email.mjs';

const NL = '\n';

async function main() {
  const anzahl = parseInt(config.ANZAHL_ADS || '12');
  const vor30Tagen = new Date();
  vor30Tagen.setDate(vor30Tagen.getDate() - 30);
  const orders = (await getOrdersSince(vor30Tagen)).filter((o) => !o.cancelled_at);

  const produkte = {};
  const preise = {};
  for (const o of orders) {
    for (const li of o.line_items || []) {
      produkte[li.title] = (produkte[li.title] || 0) + li.quantity;
      if (!preise[li.title]) preise[li.title] = li.price;
    }
  }
  const top = Object.entries(produkte).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const held = top.length ? top[0][0] : '(dein Bestseller / Hauptprodukt)';
  const preis = preise[held] || '';
  const kontext = top.length ? top.map((e) => `${e[0]} (${e[1]}x)`).join(', ') : 'noch keine Verkaufsdaten - nutze die Nische';

  const prompt = `Du bist Performance-Creative-Director und produzierst am Fließband Static-Ads (Meta/TikTok) für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}, Zielgruppe: ${config.ZIELGRUPPE}).${NL}${NL}HELD-PRODUKT dieser Runde: ${held}${preis ? ` (Preis ~${preis})` : ''}${NL}Weitere Bestseller als Kontext: ${kontext}${NL}${NL}Erstelle ${anzahl} KOMPLETT unterschiedliche Static-Ad-Konzepte für dieses Produkt. Nutze bewusst verschiedene Angles, damit man sie alle testen kann: Problem/Lösung, Vorher-Nachher, Social-Proof/Testimonial, Feature-Spotlight, Rabatt/Dringlichkeit, UGC-Style ("gefilmt vom Handy"), Vergleich, Meme/nativ, Frage-Hook, Zahlen/Fakt, Geschenk-Idee, Einwand-Widerlegung.${NL}${NL}Für JEDES Konzept liefere:${NL}- Angle (welcher Winkel)${NL}- Headline (großer Text aufs Bild, max 8 Wörter, scroll-stoppend)${NL}- Unterzeile (1 kurzer Satz)${NL}- Bild-Idee (konkret beschreiben, was man sieht - Motiv, Setting, Stimmung, so dass ein Designer oder eine Bild-KI es umsetzen kann)${NL}- CTA-Button-Text${NL}- Format-Empfehlung (1:1 Feed oder 9:16 Story/Reel)${NL}${NL}Antworte als sauberes HTML: jede Ad als eigene "Karte" (<div> mit Rahmen, Nummer und den Feldern klar gelabelt), copy-paste-freundlich. Ohne html/body-Gerüst, kein Markdown-Codeblock.`;

  const html = await askKI(prompt, { maxTokens: 6000 });

  const hinweis = `<div style="background:#eff6ff;border:1px solid #3b82f6;padding:12px;border-radius:8px;font-family:sans-serif;font-size:13px;margin-bottom:20px;">Static-Ad-Fabrik: ${anzahl} fertige Ad-Konzepte für <b>${held}</b>. Bild-Ideen in Canva/eine Bild-KI (z.B. Ideogram) umsetzen, Headline drauf, in Meta/TikTok als Test hochladen. Angle-Testing = so findest du deinen Gewinner.</div>`;

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `Static-Ad-Fabrik: ${anzahl} neue Ad-Konzepte - ${config.SHOP_NAME}`,
    html: `<div style="font-family:sans-serif;max-width:680px;margin:0 auto;">${hinweis}${html}</div>`,
  });

  console.log(`[37-static-ad-fabrik-xl] ${anzahl} Ad-Konzepte für "${held}" versendet`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[37-static-ad-fabrik-xl] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[37-static-ad-fabrik-xl] Fehler:', err);
  process.exit(1);
});
