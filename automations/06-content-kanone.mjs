// Content-Kanone - tägliches Social-Media-Content-Paket (Hooks, Skript, Caption, Story-Idee)
// Original: n8n Workflow "06_Content_Kanone" · Zeitplan: täglich 07:30
import { config } from './lib/config.mjs';
import { getOrdersSince } from './lib/shopify.mjs';
import { askClaude } from './lib/claude.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const NL = '\n';

const WINKEL = [
  'Social Proof und Kundenergebnisse',
  'Problem-Agitation (Schmerzpunkt dramatisieren)',
  'Behind the Scenes / Founder-Story',
  'Vorher-Nachher und Transformation',
  'Mythen aufdecken / unpopuläre Meinung',
  'Produkt-Demo mit WOW-Moment',
  'Humor / Trend-Sound-Adaption',
];

async function main() {
  const vor14Tagen = new Date();
  vor14Tagen.setDate(vor14Tagen.getDate() - 14);

  const orders = (await getOrdersSince(vor14Tagen)).filter((o) => !o.cancelled_at);
  const produkte = {};
  for (const o of orders) {
    for (const li of o.line_items || []) {
      produkte[li.title] = (produkte[li.title] || 0) + li.quantity;
    }
  }
  const top = Object.entries(produkte).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
  const topText = top.length ? top.join(', ') : '(noch keine Verkäufe - nutze die Nische als Basis)';
  const winkel = WINKEL[new Date().getDay()];

  const prompt = `Du bist viraler Social-Media-Stratege für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}).${NL}Zielgruppe: ${config.ZIELGRUPPE}${NL}Bestseller aktuell: ${topText}${NL}Content-Winkel für heute: ${winkel}${NL}${NL}Erstelle das komplette Content-Paket für HEUTE auf Deutsch: (1) DREI TikTok/Reels-Hooks (erste 3 Sekunden, max 12 Wörter, scroll-stoppend). (2) EIN komplettes 20-30s Video-Skript zum besten Hook (Szene für Szene: was man sieht + was gesagt wird). (3) EINE Instagram-Caption (Hook-Zeile, 3-4 kurze Zeilen Story, CTA, 5 Hashtags). (4) EINE Story-Idee mit Interaktions-Element (Umfrage/Slider/Frage). Kein generisches Marketing-Blabla, schreib wie ein Mensch, nutze Muster viraler Videos. Emojis als Abschnittstrenner. Antworte nur mit dem Content-Paket als Klartext, kein Markdown-Codeblock.`;

  const content = await askClaude(prompt, { maxTokens: 3000 });

  const kopf = `CONTENT-KANONE · ${config.SHOP_NAME}${NL}Heutiger Winkel: ${winkel}${NL}========${NL}${NL}`;
  const voll = kopf + content;

  // Telegram begrenzt Nachrichten auf ~4096 Zeichen - in Stücke teilen
  for (let i = 0; i < voll.length; i += 3900) {
    await notifyTelegram(voll.slice(i, i + 3900));
  }

  console.log('[06-content-kanone] Content-Paket erstellt und versendet');
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[06-content-kanone] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[06-content-kanone] Fehler:', err);
  process.exit(1);
});
