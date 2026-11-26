// Schnitt für die Higgsfield-Serie (23.11., Nutzer: "ich brauche diese Qualität" -> "mach mit Higgsfield"):
// Bilder/Clips kommen fertig aus Higgsfield (gleiche Figuren per Referenzbild), hier nur Stimme, Untertitel, Hook
// und Zusammenschnitt. Szenen ohne URL werden übersprungen (z. B. solange das Higgsfield-Tageslimit greift).
//   node automations/schatten/higgsSchnitt.mjs <folge.json> <ordner>
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const B = 1080, H = 1920;
export const istVideo = (url) => /\.(mp4|webm|mov)(\?|$)/i.test(String(url));
// Quelle: https-Adresse (Higgsfield/Release) oder lokale Datei (Gratis-Story-Fabrik, 26.11.)
export const gueltigeSzenen = (folge) => (folge.szenen || []).filter((s) => String(s.text || '').trim() && /^(https:\/\/|\/|\.\/|out\/)/.test(String(s.clip || s.bild || '')));

async function laden(url, ziel) {
  if (!/^https:\/\//.test(url)) { copyFileSync(resolve(url), ziel); return; }
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`Download ${r.status}: ${url.slice(0, 80)}`);
  writeFileSync(ziel, Buffer.from(await r.arrayBuffer()));
}

async function main() {
  const [quelle, ordner0] = process.argv.slice(2);
  const ordner = resolve(ordner0 || 'out');
  mkdirSync(ordner, { recursive: true });
  const folge = JSON.parse(readFileSync(quelle, 'utf8'));
  const { sprechen, szeneRendern, zusammenfuegen, bildVorbereiten } = await import('../lib/videoFabrik.mjs');
  const szenen = gueltigeSzenen(folge);
  const teile = [];
  for (const [i, s] of szenen.entries()) {
    const url = s.clip || s.bild;
    const roh = join(ordner, `r${i}${istVideo(url) ? '.mp4' : '.img'}`);
    const bild = join(ordner, `s${i}.jpg`);
    const mp3 = join(ordner, `s${i}.mp3`), srt = join(ordner, `s${i}.srt`), clip = join(ordner, `s${i}.mp4`);
    try {
      await laden(url, roh);
      if (!istVideo(url)) bildVorbereiten(roh, bild, { breite: B, hoehe: H });
      await sprechen(s.text, mp3, srt, folge.stimme || 'de-DE-SeraphinaMultilingualNeural', { tempo: '+4%' });
      await szeneRendern({ bild, mp3, srt, ziel: clip, breite: B, hoehe: H, index: i, format: 'hoch', hook: i === 0 ? folge.hook || '' : '', video: istVideo(url) ? roh : '' });
      teile.push(clip);
      console.log(`[schnitt] Szene ${i + 1}: ${istVideo(url) ? 'Clip' : 'Bild'} ok`);
    } catch (err) {
      console.log(`[schnitt] Szene ${i + 1} übersprungen: ${String(err.message).slice(0, 160)}`);
    }
  }
  if (!teile.length) throw new Error('Keine Szene geschnitten.');
  const ziel = join(ordner, `${folge.slug || 'folge'}.mp4`);
  zusammenfuegen(teile, ziel, ordner);
  copyFileSync(ziel, join(ordner, 'folge.mp4'));
  console.log(`[schnitt] fertig: ${teile.length}/${(folge.szenen || []).length} Szenen -> ${ziel}`);
}

if (process.argv[1]?.endsWith('higgsSchnitt.mjs')) main().catch((e) => { console.error(`[schnitt] ${e.message}`); process.exit(1); });
