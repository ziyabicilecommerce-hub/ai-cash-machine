// Multi-Plattform-Poster - tägliches Posting-Paket für 7 Plattformen (TikTok, IG, FB, Pinterest, YT, X)
// Original: n8n Workflow "18_Multi_Plattform_Poster" · Zeitplan: täglich 16:00
import { config } from './lib/config.mjs';
import { getOrdersSince } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const NL = '\n';

const THEMEN = [
  'Ergebnis/Transformation zeigen',
  'Häufigster Fehler der Zielgruppe',
  'Produkt im Alltag (POV-Style)',
  'Frage/Debatte starten (Engagement)',
  'Mini-Tutorial mit dem Produkt',
  'Kundenstimme/Review nacherzählen',
  'Zahlen/Fakten, die überraschen',
];

async function postFacebook(text) {
  if (config.AUTO_POST_FACEBOOK !== 'ja' || !config.FB_PAGE_ID || !config.FB_PAGE_TOKEN || !text) return;
  const res = await fetch(`https://graph.facebook.com/v21.0/${config.FB_PAGE_ID}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, access_token: config.FB_PAGE_TOKEN }),
  });
  if (!res.ok) console.error('[18-multi-plattform-poster] Facebook-Post-Fehler:', await res.text());
}

async function main() {
  const vor14Tagen = new Date();
  vor14Tagen.setDate(vor14Tagen.getDate() - 14);
  const orders = (await getOrdersSince(vor14Tagen)).filter((o) => !o.cancelled_at);
  const produkte = {};
  for (const o of orders) {
    for (const li of o.line_items || []) produkte[li.title] = (produkte[li.title] || 0) + li.quantity;
  }
  const top = Object.entries(produkte).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
  const topText = top.length ? top.join(', ') : '(noch keine Verkäufe - nutze die Nische)';
  const thema = THEMEN[new Date().getDay()];

  const prompt = `Du bist Multi-Plattform-Social-Media-Manager für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}, Zielgruppe: ${config.ZIELGRUPPE}, Shop: ${config.SHOP_URL}).${NL}Bestseller: ${topText}${NL}Kern-Thema heute: ${thema}${NL}${NL}Erstelle das komplette Posting-Paket für HEUTE - EIN Kern-Inhalt, für jede Plattform nativ übersetzt (nicht kopiert!), alles auf Deutsch:${NL}${NL}1. TIKTOK: Hook (max 10 Wörter) + 20-30s Skript (Szene für Szene) + 4 Hashtags + Sound-Idee${NL}2. INSTAGRAM REEL: Angepasster Hook + Caption mit CTA + 5 Hashtags${NL}3. INSTAGRAM STORY: 2-Slide-Idee mit Interaktions-Sticker (Umfrage/Slider)${NL}4. FACEBOOK: Längerer Post (60-100 Wörter, Story-Stil, 1 Emoji-Absatztrenner, Link zum Shop)${NL}5. PINTEREST: Pin-Titel (max 60 Zeichen) + Beschreibung (max 200 Zeichen, SEO-Keywords der Nische)${NL}6. YOUTUBE SHORT: Titel + 25s Skript (kann das TikTok-Skript adaptieren)${NL}7. X/TWITTER: 2 Tweets (einer frech/meinungsstark, einer mit Mehrwert)${NL}${NL}Antworte NUR mit validem JSON, ohne Markdown:${NL}{"facebook_post": "<nur der reine Facebook-Text>", "html": "<das GESAMTE Paket als sauberes HTML mit h2 pro Plattform, copy-paste-freundlich, ohne html/body-Gerüst>"}`;

  const antwort = await askClaude(prompt, { maxTokens: 4000 });
  const daten = parseJsonFromText(antwort, {
    facebook_post: '',
    html: `<pre style="white-space:pre-wrap;font-family:sans-serif;">${antwort}</pre>`,
  });

  const autoHinweis = config.AUTO_POST_FACEBOOK === 'ja' && config.FB_PAGE_ID ? `${NL}${NL}Facebook-Post geht automatisch raus!` : '';

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `Dein Posting-Paket für heute (${thema})`,
    html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">${daten.html}</div>`,
  });

  await notifyTelegram(
    `MULTI-PLATTFORM-POSTER - ${config.SHOP_NAME}${NL}${NL}Dein Posting-Paket für heute (${thema}) liegt im Postfach!${NL}7 Plattformen, copy-paste-fertig: TikTok, IG Reel + Story, Facebook, Pinterest, YouTube Short, X.${autoHinweis}`
  );

  await postFacebook(daten.facebook_post);

  console.log('[18-multi-plattform-poster] Posting-Paket versendet');
}

main().catch((err) => {
  console.error('[18-multi-plattform-poster] Fehler:', err);
  process.exit(1);
});
