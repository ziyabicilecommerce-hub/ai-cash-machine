// Reichweite-Booster (#100) - kostenlose Suchmaschinen-Reichweite fuer alle Videos:
//   --seiten : pro Video eine eigene Seite (video-feed/v/<id>.html) mit VideoObject-Daten in
//              der Sprache des Videos, dazu video-feed/sitemap.xml (Video-Sitemap fuer Google).
//   --ping   : neue Seiten per IndexNow sofort an Bing, Yandex, Naver, Seznam & Co. melden.
// Kein Key noetig: der IndexNow-Schluessel ist absichtlich oeffentlich (video-feed/<key>.txt).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const env = (k, d = '') => (process.env[k] || d).trim();
const FEED = 'video-feed/videos.json';
const ORDNER = 'video-feed/v';
const NEU = join('out', 'reichweite-neu.json');
const INDEXNOW_KEY = '1132f65e17c814c3576e410b55cd9df2';
const REPO = env('GITHUB_REPOSITORY', 'ziyabicilecommerce-hub/ai-cash-machine');
const [BESITZER, NAME] = REPO.split('/');
const HOST = `${BESITZER}.github.io`;
const BASIS = `https://${HOST}/${NAME}/video-feed/`;

export const seitenId = (datei) => String(datei).replace(/\.mp4$/i, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 120) || 'video';
const html = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const erlaubt = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'github.com' ? x.href : ''; } catch { return ''; } };
const dauerIso = (s) => `PT${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}H` : ''}${Math.floor((s % 3600) / 60)}M${Math.round(s % 60)}S`;
const spracheHtml = (s) => (!s || s === 'int' ? 'en' : s === 'mx' ? 'es-MX' : s === 'pp' ? 'pt-PT' : s === 'eg' ? 'ar-EG' : s === 'tw' ? 'zh-TW' : s === 'no' ? 'nb' : s);

function seite(v, url) {
  const titel = v.titel || v.thema || 'Video';
  const beschreibung = String(v.caption || titel).replace(/\s+/g, ' ').trim();
  const bild = erlaubt(v.vorschauUrl);
  const daten = {
    '@context': 'https://schema.org', '@type': 'VideoObject', name: titel.slice(0, 100), description: beschreibung.slice(0, 2000) || titel,
    uploadDate: v.erstellt || new Date().toISOString(), contentUrl: v.url, inLanguage: spracheHtml(v.sprache), isFamilyFriendly: true,
    ...(bild ? { thumbnailUrl: [bild] } : {}), ...(v.dauer ? { duration: dauerIso(v.dauer) } : {}),
    creativeWorkStatus: 'Published', genre: v.thema === 'anime' ? 'Anime' : v.thema === 'marathon' ? 'Ambient' : 'Shopping',
  };
  const jsonLd = JSON.stringify(daten).replace(/</g, '\\u003c');
  return `<!DOCTYPE html>
<html lang="${html(spracheHtml(v.sprache))}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${html(titel.slice(0, 90))}</title>
<meta name="description" content="${html(beschreibung.slice(0, 155))}">
<link rel="canonical" href="${html(url)}">
<meta property="og:type" content="video.other">
<meta property="og:title" content="${html(titel)}">
<meta property="og:description" content="${html(beschreibung.slice(0, 200))}">
<meta property="og:url" content="${html(url)}">
<meta property="og:video" content="${html(v.url)}">
<meta property="og:video:type" content="video/mp4">
${bild ? `<meta property="og:image" content="${html(bild)}">\n<meta name="twitter:card" content="player">\n<meta name="twitter:image" content="${html(bild)}">\n` : ''}<script type="application/ld+json">${jsonLd}</script>
<style>
  :root { --bg:#030512; --txt:#eef4f2; --mut:#a9b8b3; --gruen:#3ef2a0; }
  @media (prefers-color-scheme: light) { :root { --bg:#f5f8f7; --txt:#0f1a17; --mut:#4d5e58; --gruen:#0c8f5f; } }
  body { margin:0; background:var(--bg); color:var(--txt); font-family:system-ui,-apple-system,sans-serif; line-height:1.55; }
  main { max-width:760px; margin:0 auto; padding:20px 16px 40px; }
  video { width:100%; max-height:80vh; background:#000; border-radius:12px; }
  h1 { font-size:clamp(20px,4.5vw,28px); margin:14px 0 6px; overflow-wrap:anywhere; }
  p { color:var(--mut); white-space:pre-wrap; overflow-wrap:anywhere; }
  a { color:var(--gruen); }
  .ki { font-size:12px; color:var(--mut); margin-top:10px; }
</style>
</head>
<body>
<main>
  <video controls playsinline preload="metadata" src="${html(v.url)}"${bild ? ` poster="${html(bild)}"` : ''}></video>
  <h1>${html(titel)}</h1>
  <p>${html(v.caption || '')}</p>
  <p class="ki">KI-generiert (Bild, Stimme, Text) · AI-generated</p>
  <p><a href="../">← Alle Videos</a></p>
</main>
</body>
</html>
`;
}

function seitenBauen() {
  const feed = existsSync(FEED) ? JSON.parse(readFileSync(FEED, 'utf8')) : { videos: [] };
  mkdirSync(ORDNER, { recursive: true });
  const vorher = new Set(readdirSync(ORDNER));
  const neu = [];
  const eintraege = [];
  for (const v of feed.videos || []) {
    if (!erlaubt(v.url)) continue;
    const id = seitenId(v.datei);
    const url = `${BASIS}v/${id}.html`;
    writeFileSync(join(ORDNER, `${id}.html`), seite(v, url));
    if (!vorher.has(`${id}.html`)) neu.push(url);
    const bild = erlaubt(v.vorschauUrl);
    eintraege.push(`  <url>\n    <loc>${html(url)}</loc>${bild ? `
    <video:video>
      <video:thumbnail_loc>${html(bild)}</video:thumbnail_loc>
      <video:title>${html((v.titel || 'Video').slice(0, 100))}</video:title>
      <video:description>${html(String(v.caption || v.titel || '').replace(/\s+/g, ' ').slice(0, 2000))}</video:description>
      <video:content_loc>${html(v.url)}</video:content_loc>${v.dauer && v.dauer <= 28800 ? `\n      <video:duration>${Math.round(v.dauer)}</video:duration>` : ''}
      <video:publication_date>${html(v.erstellt || new Date().toISOString())}</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
    </video:video>` : ''}
  </url>`);
  }
  writeFileSync('video-feed/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
  <url>
    <loc>${BASIS}</loc>
  </url>
${eintraege.join('\n')}
</urlset>
`);
  writeFileSync(join('video-feed', `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY);
  mkdirSync('out', { recursive: true });
  writeFileSync(NEU, JSON.stringify(neu));
  console.log(`[100-reichweite] ${eintraege.length} Video-Seiten, ${neu.length} neu, Sitemap: ${BASIS}sitemap.xml`);
}

// IndexNow teilt neue URLs mit allen teilnehmenden Suchmaschinen (Bing, Yandex, Naver, Seznam, Yep ...).
async function pingen() {
  const neu = existsSync(NEU) ? JSON.parse(readFileSync(NEU, 'utf8')) : [];
  if (!neu.length) return console.log('[100-reichweite] Keine neuen Seiten zu melden.');
  const urlList = [...neu, `${BASIS}sitemap.xml`].slice(0, 10000);
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: `${BASIS}${INDEXNOW_KEY}.txt`, urlList }),
  });
  console.log(`[100-reichweite] IndexNow: ${res.status} fuer ${urlList.length} URLs${res.status === 200 || res.status === 202 ? ' ✓' : ` – ${(await res.text()).slice(0, 200)}`}`);
}

(process.argv[2] === '--ping' ? pingen() : Promise.resolve(seitenBauen())).catch((err) => {
  console.error('[100-reichweite] Fehler:', err.message);
  process.exit(process.argv[2] === '--ping' ? 0 : 1);
});
