// Leistungs-Sammler: holt einmal am Tag die echten Zahlen aller Posts der letzten 14 Tage
// (Aufrufe, Likes, Kommentare, Teilen) und rechnet den Lernstand neu. Die Video-Fabrik und das
// Werbe-Labor nutzen ihn am naechsten Morgen: mehr von dem, was echte Menschen anschauen.
import { postsLaden, HOLER, lernstandRechnen, lernstandSpeichern, POSTS } from './lib/leistung.mjs';
import { writeFileSync } from 'node:fs';

const TAG = 864e5;
const bereit = {
  YouTube: () => process.env.YOUTUBE_REFRESH_TOKEN,
  Bluesky: () => true,
  Mastodon: () => process.env.MASTODON_TOKEN && process.env.MASTODON_URL,
  Instagram: () => process.env.META_ACCESS_TOKEN,
  Facebook: () => process.env.FACEBOOK_PAGE_TOKEN || process.env.META_ACCESS_TOKEN,
};

export async function sammeln(posts, { jetzt = Date.now(), laden = fetch } = {}) {
  let geholt = 0;
  for (const p of posts) {
    const alter = jetzt - Date.parse(p.gepostet);
    // Erst nach 20 Stunden messen (vorher sagen die Zahlen wenig), nach 14 Tagen nicht mehr.
    if (!(alter > TAG * 0.83 && alter < TAG * 14) || !HOLER[p.plattform] || !bereit[p.plattform]?.()) continue;
    try {
      const z = await HOLER[p.plattform](p.id, laden);
      if (z) { p.zahlen = { ...z, gemessen: new Date(jetzt).toISOString() }; geholt++; }
    } catch (err) {
      console.log(`[leistung] ${p.plattform} ${p.id}: ${String(err.message).slice(0, 120)}`);
    }
  }
  return geholt;
}

async function main() {
  const posts = postsLaden();
  if (!posts.length) return console.log('[leistung] Noch keine Posts - sobald ein Kanal verbunden ist und gepostet wird, startet das Lernen.');
  const geholt = await sammeln(posts);
  writeFileSync(POSTS, JSON.stringify(posts, null, 1) + '\n');
  const stand = lernstandRechnen(posts);
  lernstandSpeichern(stand);
  const top = (feld) => Object.entries(stand[feld]).sort((a, b) => b[1].punkte - a[1].punkte).slice(0, 3).map(([k, e]) => `${k} (${e.punkte > 0 ? '+' : ''}${e.punkte}, n=${e.n})`).join(', ') || '–';
  console.log(`[leistung] ${geholt} Posts gemessen, ${stand.posts} mit Zahlen. Hook-Typen: ${top('hookTyp')} · Winkel: ${top('winkel')} · Formate: ${top('format')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((err) => { console.error('[leistung]', err.message); process.exit(1); });
