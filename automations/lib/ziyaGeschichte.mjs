// Ziya Studio, Geschichten-Modus: eine Idee wird zu einem kleinen Film mit eigenen Figuren - Szene für Szene
// ein anderer Ort/Moment (wie ein Kurzfilm), statt einer einzigen durchgehenden Einstellung.
// Nur eigene, frei erfundene Figuren - keine bekannten Film-, Serien- oder Anime-Figuren nachbauen.
import { PRESETS, presetVon, HINTERGRUND } from './ziyaStudio.mjs';

export const STILE = {
  kino: 'cinematic film still, photorealistic, rich color grading, 8k, ultra detailed, sharp focus',
  cartoon: '3D animated family movie style, expressive cartoon characters with big eyes, vibrant colors, soft global illumination, highly detailed render',
  anime: 'anime key visual, high-budget anime film, cel shading, vibrant saturated colors, detailed painted background',
};
export const stilVon = (s) => (STILE[String(s || '').trim().toLowerCase()] ? String(s).trim().toLowerCase() : 'kino');

const sauber = (t, n) => String(t || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export function geschichtePrompt(idee, n) {
  return `Write a short visual story as ${n} scenes for a vertical AI video, based on this idea: "${sauber(idee, 300)}".
Rules: invent ORIGINAL characters only (no existing movie, series, game or anime characters, no celebrities). One clear arc:
setup -> problem -> action/turning point -> ending. Every scene is a different moment or place, full of movement, and the
background is always alive (weather, crowds of creatures, particles, light). No text or logos in the images.
Answer ONLY with JSON:
{"figuren":"one English sentence describing the main characters' fixed look (species, clothes, colors) so they stay identical",
 "szenen":[{"bild":"English image prompt: what we see, composition, location","bewegung":"English: what moves and how the camera moves","satz":"one short German narrator sentence"}]}`;
}

// KI-Antwort -> Shots im Format von shotsPlanen (nr, preset, bild, bewegung) plus Erzählsatz.
export function geschichteZuShots(d, { idee, preset, n, stil = 'kino' }) {
  const p = presetVon(preset);
  const x = PRESETS[p];
  const look = STILE[stilVon(stil)];
  const figuren = sauber(d?.figuren, 300);
  const szenen = (Array.isArray(d?.szenen) ? d.szenen : []).filter((s) => sauber(s?.bild, 400)).slice(0, n);
  return szenen.map((s, i) => ({
    nr: i + 1, preset: p,
    bild: `${sauber(s.bild, 400)}${figuren ? `, ${figuren}` : ''}, dynamic detailed background with depth, ${look}, vertical 9:16 composition`,
    bewegung: `${sauber(s.bewegung, 300) || x.kamera}. ${sauber(idee, 120)}. The characters stay consistent. ${HINTERGRUND}. ${x.tempo}. Smooth, coherent motion.`,
    satz: sauber(s.satz, 200),
  }));
}

// Plant die Geschichte mit der Gratis-KI; scheitert sie oder liefert zu wenig, bleibt der normale Shot-Plan.
export async function geschichtePlanen(idee, { preset, n, stil, kiJson, ersatz }) {
  try {
    const shots = geschichteZuShots(await kiJson(geschichtePrompt(idee, n), { maxTokens: 3500 }), { idee, preset, n, stil });
    if (shots.length >= Math.min(3, n)) return shots;
  } catch (err) {
    console.log(`[ziya-studio] Geschichte nicht geplant (${String(err.message).slice(0, 120)}) - normaler Shot-Plan`);
  }
  return ersatz();
}
