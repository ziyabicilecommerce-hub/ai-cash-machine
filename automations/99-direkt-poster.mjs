// Direkt-Poster (#99) - kostenlose Alternative zu Metricool: postet die frisch gebauten
// Videos (out/manifest.json) direkt ueber die offiziellen Gratis-APIs von YouTube, TikTok,
// Instagram, Facebook, Threads, LinkedIn, Pinterest, Dailymotion, Bluesky, Telegram,
// Mastodon, Discord und Reddit. Jede Plattform laeuft nur, wenn
// ihre Secrets gesetzt sind. Jeder Post bekommt einen KI-Hinweis (EU AI Act Art. 50).
//   node automations/99-direkt-poster.mjs --aus-feed 1   -> 1 noch nicht gepostetes Video aus dem Feed
//   node automations/99-direkt-poster.mjs <Release-Basis-URL>  -> alle frischen Videos eines Laufs
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PLATTFORMEN } from './lib/plattformen.mjs';
import { threads, linkedin, discord, reddit, pinterest, dailymotion } from './lib/plattformen2.mjs';

const ALLE = [...PLATTFORMEN, threads, linkedin, pinterest, dailymotion, discord, reddit];

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

const GEPOSTET = 'video-feed/gepostet.json';
const nurErlaubt = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && x.hostname === 'github.com' ? x.href : ''; } catch { return ''; } };

// Welche Videos? Modus 1: frische aus out/manifest.json (Basis-URL). Modus 2 (--aus-feed N):
// die N neuesten, noch nie geposteten deutschen/sprachfreien Videos aus dem Video-Feed -
// so bleibt es bei wenigen, sicheren Posts pro Tag, egal wie viele Videos gebaut werden.
function auswahl() {
  const [a1, a2] = process.argv.slice(2);
  if (a1 === '--aus-feed') {
    const n = Math.min(Math.max(parseInt(a2, 10) || 1, 1), 10);
    const feed = existsSync('video-feed/videos.json') ? JSON.parse(readFileSync('video-feed/videos.json', 'utf8')).videos || [] : [];
    const schon = new Set(existsSync(GEPOSTET) ? JSON.parse(readFileSync(GEPOSTET, 'utf8')) : []);
    const offen = feed.filter((v) => nurErlaubt(v.url) && !schon.has(v.datei) && SPRACHEN.includes(v.sprache || 'de'));
    // Bevorzugt Hochformat-Kurzvideos (passen auf die meisten Plattformen), dann der Rest.
    offen.sort((x, y) => (y.format === 'hoch' && y.dauer <= 90) - (x.format === 'hoch' && x.dauer <= 90));
    return { videos: offen.slice(0, n).map((v) => ({ m: v, url: v.url, vorschauUrl: nurErlaubt(v.vorschauUrl) })), merken: true };
  }
  const basis = (a1 || '').replace(/\/$/, '');
  if (!basis || !existsSync(MANIFEST)) return { videos: [] };
  return { videos: JSON.parse(readFileSync(MANIFEST, 'utf8')).filter((m) => SPRACHEN.includes(m.sprache || 'de')).map((m) => ({ m, url: `${basis}/${encodeURIComponent(m.datei)}`, vorschauUrl: m.vorschau ? `${basis}/${encodeURIComponent(m.vorschau)}` : '' })) };
}

async function main() {
  const { videos, merken } = auswahl();
  if (!videos.length) return console.log('[99-direkt-poster] Nichts zu posten.');
  const aktiv = ALLE.filter((p) => p.bereit() && (!NUR.length || NUR.includes(p.name.toLowerCase())));
  console.log(`[99-direkt-poster] Aktiv: ${aktiv.map((p) => p.name).join(', ') || 'keine (Secrets fehlen)'} · ${videos.length} Video(s)`);
  if (!aktiv.length) return;
  mkdirSync(TMP, { recursive: true });
  const bilanz = {};
  const erledigt = [];
  for (const { m, url, vorschauUrl } of videos) {
    const datei = join(TMP, m.datei);
    try {
      await laden(url, datei);
    } catch (err) {
      console.log(`[99-direkt-poster] ✗ ${m.datei}: ${err.message}`);
      continue;
    }
    const v = { ...m, url, vorschauUrl, link: FEED_SEITE, datei, dateiname: m.datei, sprache: m.sprache || 'de', text: `${m.titel}\n\n${m.caption || ''}\n\n${KI_HINWEIS}`.trim() };
    let irgendwo = false;
    for (const p of aktiv) {
      if (!p.passt(v)) continue;
      try {
        const ergebnis = await p.posten(v);
        bilanz[p.name] = (bilanz[p.name] || 0) + 1;
        irgendwo = true;
        console.log(`[99-direkt-poster] ✓ ${p.name}: "${m.titel}" → ${ergebnis}`);
      } catch (err) {
        console.log(`[99-direkt-poster] ✗ ${p.name}: "${m.titel}" → ${String(err.message).slice(0, 250)}`);
      }
    }
    if (irgendwo) erledigt.push(m.datei);
    rmSync(datei, { force: true });
  }
  if (merken && erledigt.length) {
    const alt = existsSync(GEPOSTET) ? JSON.parse(readFileSync(GEPOSTET, 'utf8')) : [];
    writeFileSync(GEPOSTET, JSON.stringify([...erledigt, ...alt].slice(0, 5000), null, 1) + '\n');
  }
  console.log(`[99-direkt-poster] Fertig: ${Object.entries(bilanz).map(([k, n]) => `${k} ${n}`).join(', ') || 'nichts gepostet'}`);
}

main().catch((err) => {
  console.error('[99-direkt-poster] Fehler:', err.message);
  process.exit(1);
});
