// Direkt-Poster (#99) - kostenlose Alternative zu Metricool: postet die frisch gebauten
// Videos (out/manifest.json) direkt ueber die offiziellen Gratis-APIs von YouTube, TikTok,
// Instagram, Facebook, Threads, LinkedIn, Pinterest, Dailymotion, Bluesky, Telegram,
// Mastodon, Discord und Reddit. Jede Plattform laeuft nur, wenn
// ihre Secrets gesetzt sind. Jeder Post bekommt einen KI-Hinweis (EU AI Act Art. 50).
//   node automations/99-direkt-poster.mjs <Release-Basis-URL>
import { readFileSync, existsSync, mkdirSync, rmSync, createWriteStream } from 'node:fs';
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

async function main() {
  const basis = (process.argv[2] || '').replace(/\/$/, '');
  if (!basis || !existsSync(MANIFEST)) return console.log('[99-direkt-poster] Keine Basis-URL oder kein Manifest - nichts zu posten.');
  const aktiv = ALLE.filter((p) => p.bereit() && (!NUR.length || NUR.includes(p.name.toLowerCase())));
  console.log(`[99-direkt-poster] Aktiv: ${aktiv.map((p) => p.name).join(', ') || 'keine (Secrets fehlen)'}`);
  if (!aktiv.length) return;
  const videos = JSON.parse(readFileSync(MANIFEST, 'utf8')).filter((m) => SPRACHEN.includes(m.sprache || 'de'));
  mkdirSync(TMP, { recursive: true });
  const bilanz = {};
  for (const m of videos) {
    const url = `${basis}/${encodeURIComponent(m.datei)}`;
    const datei = join(TMP, m.datei);
    try {
      await laden(url, datei);
    } catch (err) {
      console.log(`[99-direkt-poster] ✗ ${m.datei}: ${err.message}`);
      continue;
    }
    const v = { ...m, url, vorschauUrl: m.vorschau ? `${basis}/${encodeURIComponent(m.vorschau)}` : '', link: FEED_SEITE, datei, dateiname: m.datei, sprache: m.sprache || 'de', text: `${m.titel}\n\n${m.caption || ''}\n\n${KI_HINWEIS}`.trim() };
    for (const p of aktiv) {
      if (!p.passt(v)) continue;
      try {
        const ergebnis = await p.posten(v);
        bilanz[p.name] = (bilanz[p.name] || 0) + 1;
        console.log(`[99-direkt-poster] ✓ ${p.name}: "${m.titel}" → ${ergebnis}`);
      } catch (err) {
        console.log(`[99-direkt-poster] ✗ ${p.name}: "${m.titel}" → ${String(err.message).slice(0, 250)}`);
      }
    }
    rmSync(datei, { force: true });
  }
  console.log(`[99-direkt-poster] Fertig: ${Object.entries(bilanz).map(([k, n]) => `${k} ${n}`).join(', ') || 'nichts gepostet'}`);
}

main().catch((err) => {
  console.error('[99-direkt-poster] Fehler:', err.message);
  process.exit(1);
});
