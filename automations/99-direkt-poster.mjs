// Direkt-Poster (#99) - kostenlose Alternative zu Metricool: postet die frisch gebauten
// Videos (out/manifest.json) direkt ueber die offiziellen Gratis-APIs von YouTube, TikTok,
// Instagram, Facebook, Threads, LinkedIn, Pinterest, Dailymotion, Bluesky, Telegram,
// Mastodon, Discord und Reddit. Jede Plattform laeuft nur, wenn
// ihre Secrets gesetzt sind. Jeder Post bekommt einen KI-Hinweis (EU AI Act Art. 50).
//   node automations/99-direkt-poster.mjs --aus-feed 1   -> 1 noch nicht gepostetes Video aus dem Feed
//   node automations/99-direkt-poster.mjs <Release-Basis-URL>  -> alle frischen Videos eines Laufs
import { videoPruefen } from './lib/werbeCheck.mjs';
import { berlinStunde, jetztPosten, kuerzlichGepostet } from './lib/postZeiten.mjs';
import { postsLaden } from './lib/leistung.mjs';
import { mitUtm, textMitUtm } from './lib/utm.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PLATTFORMEN } from './lib/plattformen.mjs';
import { threads, linkedin, discord, reddit, pinterest, dailymotion } from './lib/plattformen2.mjs';
import { x, tumblr } from './lib/plattformen3.mjs';
import { statusSchreiben } from './lib/kanalStatus.mjs';
import { verbinderLaden } from './lib/verbinder.mjs';
import { postMerken } from './lib/leistung.mjs';
import { varianteFuer } from './lib/anfaenge.mjs';

// 15 Plattformen, alle direkt ueber die offiziellen APIs (kein Fremddienst).
const ALLE = [...PLATTFORMEN, threads, linkedin, pinterest, dailymotion, discord, reddit, x, tumblr];

const env = (k, d = '') => (process.env[k] || d).trim();
const MANIFEST = join('out', 'manifest.json');
const TMP = join('out', 'direkt-poster');
const REPO = env('GITHUB_REPOSITORY', 'ziyabicilecommerce-hub/ai-cash-machine');
const FEED_SEITE = `https://${REPO.split('/')[0]}.github.io/${REPO.split('/')[1]}/video-feed/`;
const KI_HINWEIS = env('KI_HINWEIS', 'KI-generiert: Bild, Stimme und Text wurden mit KI erstellt. #KI');
// Nur Deutsch und sprachfreie Inhalte - die 50 Welt-Sprachen gehoeren auf eigene Kanaele.
const SPRACHEN = env('DIREKT_POSTER_SPRACHEN', 'de,int').split(',').map((s) => s.trim());
const NUR = env('DIREKT_POSTER_PLATTFORMEN').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);

async function laden(url, ziel) {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(ziel));
}

// Kanal: leer = Shop-Konten; 'fakten' = Community-Konten (#100). So landen Fakten-Videos nie auf den Shop-Konten.
const KANAL = env('DIREKT_POSTER_KANAL').toLowerCase();
const GEPOSTET = 'video-feed/gepostet.json';
const ZAEHLER = 'video-feed/post-zaehler.json';

// 5 Posts pro Tag und Kanal (= Tagesproduktion der Video-Fabrik). YouTube erlaubt per API-Kontingent
// max. ~6 Uploads/Tag; Reddit bleibt bei 1, weil Subreddits Mehrfach-Posts als Spam sperren.
// Ueberschreibbar per Variable, z. B. LIMIT_TIKTOK=3.
const LIMITS = { youtube: 5, tiktok: 5, instagram: 5, facebook: 5, threads: 5, linkedin: 5, pinterest: 5, dailymotion: 5, bluesky: 5, telegram: 5, mastodon: 5, discord: 5, reddit: 1, x: 5, tumblr: 5 };
const limit = (p) => { const n = parseInt(env(`LIMIT_${p.name.toUpperCase()}`), 10); return Number.isNaN(n) ? LIMITS[p.name.toLowerCase()] ?? 4 : n; };
const heuteBerlin = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
function zaehlerLaden() {
  try {
    const z = JSON.parse(readFileSync(ZAEHLER, 'utf8'));
    if (z.datum === heuteBerlin()) return z;
  } catch { /* neu anfangen */ }
  return { datum: heuteBerlin(), zaehler: {} };
}
const nurErlaubt = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'github.com' ? x.href : ''; } catch { return ''; } };

// Welche Videos? Modus 1: frische aus out/manifest.json (Basis-URL). Modus 2 (--aus-feed N):
// die N neuesten, noch nie geposteten deutschen/sprachfreien Videos aus dem Video-Feed -
// so bleibt es bei wenigen, sicheren Posts pro Tag, egal wie viele Videos gebaut werden.
// Werbe-Check: Videos mit Heilversprechen, erfundener Knappheit o. ae. werden nie gepostet.
function werbeOk(v) {
  const e = videoPruefen(v);
  if (!e.ok) console.log(`[99-direkt-poster] Werbe-Check blockiert ${v.datei}: ${e.treffer.filter((t) => t.stufe === 'block').map((t) => `${t.grund} („${t.stelle}“)`).join('; ')}`);
  return e.ok;
}

function auswahl() {
  const [a1, a2] = process.argv.slice(2);
  if (a1 === '--aus-feed') {
    const n = Math.min(Math.max(parseInt(a2, 10) || 1, 1), 10);
    const feed = existsSync('video-feed/videos.json') ? JSON.parse(readFileSync('video-feed/videos.json', 'utf8')).videos || [] : [];
    const schon = new Set(existsSync(GEPOSTET) ? JSON.parse(readFileSync(GEPOSTET, 'utf8')) : []);
    const offen = feed.filter((v) => nurErlaubt(v.url) && !schon.has(v.datei) && SPRACHEN.includes(v.sprache || 'de') && (v.kanal || '') === KANAL && werbeOk(v));
    // Bevorzugt Hochformat-Kurzvideos (passen auf die meisten Plattformen), dann der Rest.
    offen.sort((x, y) => (y.format === 'hoch' && y.dauer <= 90) - (x.format === 'hoch' && x.dauer <= 90));
    return { videos: offen.slice(0, n).map((v) => ({ m: v, url: v.url, vorschauUrl: nurErlaubt(v.vorschauUrl) })), merken: true };
  }
  const basis = (a1 || '').replace(/\/$/, '');
  if (!basis || !existsSync(MANIFEST)) return { videos: [] };
  return { videos: JSON.parse(readFileSync(MANIFEST, 'utf8')).filter((m) => SPRACHEN.includes(m.sprache || 'de') && (m.kanal || '') === KANAL && werbeOk(m)).map((m) => ({ m, url: `${basis}/${encodeURIComponent(m.datei)}`, vorschauUrl: m.vorschau ? `${basis}/${encodeURIComponent(m.vorschau)}` : '' })) };
}

async function main() {
  await verbinderLaden();
  const { videos, merken } = auswahl();
  const z = zaehlerLaden();
  const ergebnisse = {};
  // Kanal-Status fuer die Zentrale (nur verbunden ja/nein, Zaehler, letzter Erfolg/Fehler - keine Geheimnisse).
  const status = () => statusSchreiben(ALLE.map((p) => ({ name: p.name, verbunden: p.bereit(), heute: z.zaehler[p.name] || 0, limit: limit(p), ...(ergebnisse[p.name] || {}) })));
  if (!videos.length) { status(); return console.log('[99-direkt-poster] Nichts zu posten.'); }
  const bereit = ALLE.filter((p) => p.bereit() && (!NUR.length || NUR.includes(p.name.toLowerCase())));
  // Beste Posting-Zeiten: nur in den starken Stunden der Plattform (oder zum Aufholen am Abend).
  const stunde = berlinStunde();
  const spaeter = bereit.filter((p) => (z.zaehler[p.name] || 0) < limit(p) && !jetztPosten(p.name, stunde, { heute: z.zaehler[p.name] || 0, limit: limit(p) }));
  const aktiv = bereit.filter((p) => (z.zaehler[p.name] || 0) < limit(p) && !spaeter.includes(p));
  if (spaeter.length) console.log(`[99-direkt-poster] ${stunde} Uhr: ${spaeter.map((p) => p.name).join(', ')} warten auf ihre beste Zeit`);
  const posts = postsLaden();
  const dieseRunde = {};
  const voll = bereit.filter((p) => !aktiv.includes(p));
  console.log(`[99-direkt-poster] Aktiv: ${aktiv.map((p) => `${p.name} ${z.zaehler[p.name] || 0}/${limit(p)}`).join(', ') || 'keine (Secrets fehlen oder Tageslimit erreicht)'}${voll.length ? ` · Tageslimit erreicht: ${voll.map((p) => p.name).join(', ')}` : ''} · ${videos.length} Video(s)`);
  if (!aktiv.length) { status(); return; }
  mkdirSync(TMP, { recursive: true });
  const bilanz = {};
  const erledigt = [];
  for (const { m, url, vorschauUrl } of videos) {
    // 3 Anfaenge: jeder Kanal bekommt (taeglich rotierend) eine andere Variante desselben Videos.
    const zuteilung = aktiv.map((p, k) => ({ p, w: varianteFuer(m, k) }));
    let irgendwo = false;
    for (const dateiname of [...new Set(zuteilung.map((x) => x.w.datei))]) {
      const datei = join(TMP, dateiname);
      try {
        await laden(url.replace(/[^/]+$/, encodeURIComponent(dateiname)), datei);
      } catch (err) {
        console.log(`[99-direkt-poster] ✗ ${dateiname}: ${err.message}`);
        continue;
      }
      for (const { p, w } of zuteilung.filter((x) => x.w.datei === dateiname)) {
        const mv = { ...m, datei: dateiname, hookTyp: w.hookTyp };
        // Verkaufs-Messung: Shop-Links mit UTM je Plattform (Shopify > Analysen > nach Quelle).
        const kampagne = m.gruppe || m.datei, quelle = p.name;
        const caption = textMitUtm(m.caption || '', quelle, kampagne);
        const v = { ...mv, caption, url, vorschauUrl, link: FEED_SEITE, shopLink: mitUtm(String(m.caption || '').match(/https:\/\/\S+\/products\/\S+/)?.[0] || '', quelle, kampagne), datei, dateiname, sprache: m.sprache || 'de', text: `${m.titel}\n\n${caption}\n\n${KI_HINWEIS}`.trim() };
        if (!p.passt(v) || (z.zaehler[p.name] || 0) >= limit(p) || dieseRunde[p.name]) continue;
        if (kuerzlichGepostet(posts, p.name, m.titel)) { console.log(`[99-direkt-poster] ${p.name}: "${m.titel}" lief dort schon in den letzten 24 h - übersprungen`); continue; }
        try {
          const ergebnis = await p.posten(v);
          bilanz[p.name] = (bilanz[p.name] || 0) + 1;
          z.zaehler[p.name] = (z.zaehler[p.name] || 0) + 1;
          irgendwo = true;
          console.log(`[99-direkt-poster] ✓ ${p.name}: "${m.titel}"${dateiname !== m.datei ? ` (Anfang: ${w.hookTyp})` : ''} → ${ergebnis}`);
          postMerken(mv, p.name, ergebnis); // fuer echte Zahlen spaeter (leistung-sammler.mjs)
          dieseRunde[p.name] = 1; // max. 1 Post je Kanal und Lauf - verteilt ueber die starken Stunden
          ergebnisse[p.name] = { ok: new Date().toISOString() };
        } catch (err) {
          console.log(`[99-direkt-poster] ✗ ${p.name}: "${m.titel}" → ${String(err.message).slice(0, 250)}`);
          ergebnisse[p.name] = { fehler: String(err.message).slice(0, 200), zeit: new Date().toISOString() };
        }
      }
      rmSync(datei, { force: true });
    }
    if (irgendwo) erledigt.push(m.datei);
  }
  if (Object.keys(bilanz).length) writeFileSync(ZAEHLER, JSON.stringify(z, null, 1) + '\n');
  if (merken && erledigt.length) {
    const alt = existsSync(GEPOSTET) ? JSON.parse(readFileSync(GEPOSTET, 'utf8')) : [];
    writeFileSync(GEPOSTET, JSON.stringify([...erledigt, ...alt].slice(0, 5000), null, 1) + '\n');
  }
  status();
  console.log(`[99-direkt-poster] Fertig: ${Object.entries(bilanz).map(([k, n]) => `${k} ${n}`).join(', ') || 'nichts gepostet'}`);
}

main().catch((err) => {
  console.error('[99-direkt-poster] Fehler:', err.message);
  process.exit(1);
});
