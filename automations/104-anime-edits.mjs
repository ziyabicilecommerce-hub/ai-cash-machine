// Anime-Edits (#104) - täglich kurze TikTok-Edits mit den eigenen Figuren der Anime-Serie (#95), auf den eigenen
// Trap-Beat geschnitten. Kostenlos: Bilder von Pollinations, Beat synthetisch (ffmpeg), keine fremden Songs/Szenen.
//   node automations/104-anime-edits.mjs   -> Videos nach out/videos, Manifest nach out/manifest.json
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { ladeBild } from './lib/videoFabrik.mjs';
import { musikUnterlegen } from './lib/videoExtras.mjs';
import { schnittPlan, dropZeit, editPrompts, hookText, editRendern } from './lib/animeEdit.mjs';

const env = (k, d = '') => (process.env[k] || d).trim();
const OUT = 'out';
const VERLAUF = 'anime-edits/verlauf.json';
const ANZAHL = Math.min(Math.max(parseInt(env('ANIME_EDITS_ANZAHL', '1'), 10) || 1, 1), 4);
const KONTO = env('ANIME_EDIT_KONTO', '@futureflowxx');
const json = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };

async function main() {
  const figuren = (json('anime-serie/serie.json', {}).figuren || []).filter((f) => f.name && f.aussehen);
  if (!figuren.length) throw new Error('Keine Figuren in anime-serie/serie.json');
  const verlauf = json(VERLAUF, { teil: 0 });
  mkdirSync(join(OUT, 'videos'), { recursive: true });
  const manifest = [];
  for (let i = 0; i < ANZAHL; i++) {
    const teil = verlauf.teil + 1;
    const figur = figuren[teil % figuren.length];
    const ordner = join(OUT, `edit-${i}`);
    mkdirSync(ordner, { recursive: true });
    try {
      const prompts = editPrompts(figur, 8, teil);
      const bilder = [];
      for (const [n, p] of prompts.entries()) {
        const ziel = join(ordner, `b${n}.jpg`);
        if (await ladeBild(p, ziel, { breite: 1080, hoehe: 1920, seed: teil * 100 + n })) bilder.push(ziel);
      }
      if (bilder.length < 4) throw new Error(`nur ${bilder.length} Bilder`);
      const plan = schnittPlan(12);
      const name = figur.name.split(' ')[0];
      const basis = `${new Date().toISOString().slice(0, 10)}-anime-edit-${teil}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const video = join(OUT, 'videos', `${basis}.mp4`);
      const dauer = editRendern(bilder, plan, video, { ordner, hook: `${hookText(figur.name, teil)}`, ende: `Folge für Teil ${teil + 1}`, konto: KONTO });
      await musikUnterlegen(video, dauer, { stimmung: 'beat', stil: 'trap', boom: [dropZeit(plan)], lautstaerke: 0.9 });
      copyFileSync(bilder[0], join(OUT, 'videos', `${basis}.jpg`));
      manifest.push({
        datei: `${basis}.mp4`, vorschau: `${basis}.jpg`, sprache: 'de', kanal: 'anime', konto: KONTO, format: 'hoch', dauer: Math.round(dauer),
        titel: `${name} - Anime Edit #${teil}`,
        caption: `${hookText(figur.name, teil)} 🔥 Welche Figur ist dein Main? Schreib's in die Kommentare!\n\nEigene Figur aus „Kage no Shiro“ - Teil ${teil}. Folge ${KONTO} für Teil ${teil + 1}!\n\n#animeedit #anime #ninja #edit #animefan`,
        festeTags: ['#animeedit', '#anime'],
      });
      verlauf.teil = teil;
      console.log(`[104-anime-edits] ✓ ${basis}.mp4 (${figur.name}, ${dauer.toFixed(1)} s, ${bilder.length} Bilder)`);
    } catch (err) {
      console.log(`[104-anime-edits] ✗ ${figur.name}: ${String(err.stderr || '').slice(-400) || String(err.message).slice(0, 200)}`);
    }
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (!existsSync('anime-edits')) mkdirSync('anime-edits', { recursive: true });
  writeFileSync(VERLAUF, JSON.stringify(verlauf, null, 1) + '\n');
  if (!manifest.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
