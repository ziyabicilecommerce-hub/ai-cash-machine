// Multi-Plattform-Poster - tägliches Posting-Paket für 7 Plattformen (TikTok, IG, FB, Pinterest, YT, X)
// Original: n8n Workflow "18_Multi_Plattform_Poster" · Zeitplan: täglich 16:00
//
// ECHTES Auto-Posting gibt es hier nur für Facebook (Text) und Instagram
// (Bild+Caption) - beide über die Meta Graph API, die stabil und ohne
// App-Review für bereits verifizierte Business-Konten nutzbar ist. TikTok,
// Pinterest, YouTube, X bleiben bewusst reine Text-Entwürfe zum Copy-Paste:
// TikToks Content-Posting-API verlangt zusätzlich ein von TikTok geprüftes
// Developer-App (Wochen-Prozess, kein Self-Service) UND ein fertiges
// Video-Asset - diese Codebase hat keine Video-Erstellung, nur Text/Bild.
// Ein "automatischer" TikTok-Post wäre also nur Fassade, kein echtes Feature.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { getOrdersSince, getProducts } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '18-multi-plattform-poster';
const MAX_HISTORIE = 60;
const __dirname = dirname(fileURLToPath(import.meta.url));
const POSTER_DIR = join(__dirname, '..', 'social-poster');

const THEMEN = [
  'Ergebnis/Transformation zeigen',
  'Häufigster Fehler der Zielgruppe',
  'Produkt im Alltag (POV-Style)',
  'Frage/Debatte starten (Engagement)',
  'Mini-Tutorial mit dem Produkt',
  'Kundenstimme/Review nacherzählen',
  'Zahlen/Fakten, die überraschen',
];

// Liefert immer ein Status-Objekt zurück (auch wenn deaktiviert/fehlgeschlagen)
// - die Social-Poster-App zeigt daraus an, was WIRKLICH live ging statt nur
// Entwurf war.
async function postFacebook(text) {
  if (config.AUTO_POST_FACEBOOK !== 'ja' || !config.FB_PAGE_ID || !config.FB_PAGE_TOKEN || !text) {
    return { aktiv: false, gepostet: false };
  }
  const res = await fetch(`https://graph.facebook.com/v21.0/${config.FB_PAGE_ID}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, access_token: config.FB_PAGE_TOKEN }),
  });
  if (!res.ok) {
    const fehlertext = await res.text();
    console.error('[18-multi-plattform-poster] Facebook-Post-Fehler:', fehlertext);
    return { aktiv: true, gepostet: false, fehler: fehlertext.slice(0, 300) };
  }
  const data = await res.json();
  return { aktiv: true, gepostet: true, postId: data.id, url: `https://www.facebook.com/${data.id}` };
}

// Instagrams Graph API verlangt zwingend ein Bild/Video (reine Text-Posts
// gibt es dort nicht, anders als bei Facebook oben) - nutzt deshalb das
// echte Produktfoto aus Shopify statt ein KI-Bild zu erzeugen: kostenlos,
// garantiert vorhanden (solange das Produkt eins hat) und näher am
// tatsächlichen Produkt als eine generische Illustration.
async function postInstagram(imageUrl, caption) {
  if (config.AUTO_POST_INSTAGRAM !== 'ja' || !config.INSTAGRAM_BUSINESS_ACCOUNT_ID || !config.META_ACCESS_TOKEN || !imageUrl || !caption) {
    return { aktiv: false, gepostet: false };
  }

  const containerRes = await fetch(`https://graph.facebook.com/v21.0/${config.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption, access_token: config.META_ACCESS_TOKEN }),
  });
  if (!containerRes.ok) {
    const fehlertext = await containerRes.text();
    console.error('[18-multi-plattform-poster] Instagram-Container-Fehler:', fehlertext);
    return { aktiv: true, gepostet: false, fehler: fehlertext.slice(0, 300) };
  }
  const container = await containerRes.json();

  const publishRes = await fetch(`https://graph.facebook.com/v21.0/${config.INSTAGRAM_BUSINESS_ACCOUNT_ID}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container.id, access_token: config.META_ACCESS_TOKEN }),
  });
  if (!publishRes.ok) {
    const fehlertext = await publishRes.text();
    console.error('[18-multi-plattform-poster] Instagram-Publish-Fehler:', fehlertext);
    return { aktiv: true, gepostet: false, fehler: fehlertext.slice(0, 300) };
  }
  const data = await publishRes.json();
  return { aktiv: true, gepostet: true, postId: data.id };
}

// Sucht ein Produktfoto für den heutigen Instagram-Post - bevorzugt eines
// der Bestseller-Produkte, sonst irgendein aktives Produkt mit Bild.
async function findeProduktBild(bestsellerTitel) {
  let produkte;
  try {
    produkte = await getProducts({ status: 'active', limit: '50' });
  } catch (err) {
    console.error('[18-multi-plattform-poster] Produktsuche für Instagram-Bild fehlgeschlagen:', err.message || err);
    return null;
  }
  const mitBild = produkte.filter((p) => p.images && p.images[0] && p.images[0].src);
  const bestseller = mitBild.find((p) => bestsellerTitel.includes(p.title));
  const treffer = bestseller || mitBild[0];
  return treffer ? { url: treffer.images[0].src, titel: treffer.title } : null;
}

// Schreibt jeden Lauf in eine dauerhafte Historie (state/) UND als
// öffentliches manifest.json in social-poster/ - für die gleichnamige App,
// die zeigt, was tatsächlich live gepostet wurde statt nur Entwurf zu sein.
function schreibeSocialPosterEintrag(eintrag) {
  const state = loadState(STATE_KEY);
  state.pakete = state.pakete || [];
  state.pakete.unshift({ datum: new Date().toISOString(), ...eintrag });
  if (state.pakete.length > MAX_HISTORIE) state.pakete = state.pakete.slice(0, MAX_HISTORIE);
  saveState(STATE_KEY, state);

  if (!existsSync(POSTER_DIR)) mkdirSync(POSTER_DIR, { recursive: true });
  writeFileSync(
    join(POSTER_DIR, 'manifest.json'),
    JSON.stringify({ updatedAt: new Date().toISOString(), pakete: state.pakete }, null, 2)
  );
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

  const prompt = `Du bist Multi-Plattform-Social-Media-Manager für den Onlineshop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}, Zielgruppe: ${config.ZIELGRUPPE}, Shop: ${config.SHOP_URL}).${NL}Bestseller: ${topText}${NL}Kern-Thema heute: ${thema}${NL}${NL}Erstelle das komplette Posting-Paket für HEUTE - EIN Kern-Inhalt, für jede Plattform nativ übersetzt (nicht kopiert!), alles auf Deutsch:${NL}${NL}1. TIKTOK: Hook (max 10 Wörter) + 20-30s Skript (Szene für Szene) + 4 Hashtags + Sound-Idee${NL}2. INSTAGRAM REEL: Angepasster Hook + Caption mit CTA + 5 Hashtags${NL}3. INSTAGRAM STORY: 2-Slide-Idee mit Interaktions-Sticker (Umfrage/Slider)${NL}4. FACEBOOK: Längerer Post (60-100 Wörter, Story-Stil, 1 Emoji-Absatztrenner, Link zum Shop)${NL}5. PINTEREST: Pin-Titel (max 60 Zeichen) + Beschreibung (max 200 Zeichen, SEO-Keywords der Nische)${NL}6. YOUTUBE SHORT: Titel + 25s Skript (kann das TikTok-Skript adaptieren)${NL}7. X/TWITTER: 2 Tweets (einer frech/meinungsstark, einer mit Mehrwert)${NL}8. INSTAGRAM FEED-POST (für ein STATISCHES Produktfoto, kein Reel): eine eigenständige, direkt postbare Caption (100-150 Wörter inkl. 5-8 Hashtags am Ende, kein Platzhaltertext, keine eckigen Klammern) - muss für sich allein stehen, ohne Bild-Beschreibung.${NL}${NL}Antworte NUR mit validem JSON, ohne Markdown:${NL}{"facebook_post": "<nur der reine Facebook-Text>", "instagram_caption": "<nur die reine Instagram-Feed-Caption aus Punkt 8, sofort postbar>", "html": "<das GESAMTE Paket als sauberes HTML mit h2 pro Plattform, copy-paste-freundlich, ohne html/body-Gerüst>"}`;

  const antwort = await askClaude(prompt, { maxTokens: 4500 });
  const daten = parseJsonFromText(antwort, {
    facebook_post: '',
    instagram_caption: '',
    html: `<pre style="white-space:pre-wrap;font-family:sans-serif;">${antwort}</pre>`,
  });

  const produktBild = config.AUTO_POST_INSTAGRAM === 'ja' ? await findeProduktBild(topText) : null;

  const hinweise = [];
  if (config.AUTO_POST_FACEBOOK === 'ja' && config.FB_PAGE_ID) hinweise.push('Facebook-Post geht automatisch raus!');
  if (config.AUTO_POST_INSTAGRAM === 'ja' && produktBild) hinweise.push(`Instagram-Post (Foto: ${produktBild.titel}) geht automatisch raus!`);
  const autoHinweis = hinweise.length ? `${NL}${NL}${hinweise.join(' ')}` : '';

  await sendEmail({
    to: config.OWNER_EMAIL,
    subject: `Dein Posting-Paket für heute (${thema})`,
    html: `<div style="font-family:sans-serif;max-width:640px;margin:0 auto;">${daten.html}</div>`,
  });

  await notifyTelegram(
    `MULTI-PLATTFORM-POSTER - ${config.SHOP_NAME}${NL}${NL}Dein Posting-Paket für heute (${thema}) liegt im Postfach!${NL}7 Plattformen, copy-paste-fertig: TikTok, IG Reel + Story, Facebook, Pinterest, YouTube Short, X.${autoHinweis}`
  );

  const facebookErgebnis = await postFacebook(daten.facebook_post);
  const instagramErgebnis = produktBild
    ? await postInstagram(produktBild.url, daten.instagram_caption)
    : { aktiv: false, gepostet: false };

  schreibeSocialPosterEintrag({
    thema,
    topText,
    html: daten.html,
    facebook: facebookErgebnis,
    instagram: { ...instagramErgebnis, produktTitel: produktBild?.titel || null, bildUrl: produktBild?.url || null },
  });

  console.log('[18-multi-plattform-poster] Posting-Paket versendet');
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[18-multi-plattform-poster] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[18-multi-plattform-poster] Fehler:', err);
  process.exit(1);
});
