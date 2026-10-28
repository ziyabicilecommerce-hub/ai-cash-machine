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

// Erzähler-/Untertitel-Text aufräumen: mechanische KI-Fehler sicher wegräumen (keine Rechtschreibprüfung).
// Smart-Quotes/Sonderstriche vereinheitlichen, Markdown/Emojis/Hashtags raus, Satzzeichen glätten, Satzende sichern.
export function satzSaeubern(roh) {
  let t = String(roh || '')
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'").replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, '-')
    .replace(/#\S+/g, ' ')
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    .replace(/[*_`#>]+/g, ' ')
    .replace(/\s+-\s+-\s+/g, ' - ')
    .replace(/\s*\.\s*\.\s*\.\s*/g, '... ')
    .replace(/([.!?]){2,}/g, (m, z) => (z === '.' ? '...' : z))
    .replace(/\s*([,.;:!?])/g, '$1').replace(/([,.;:!?])(?=[A-Za-z0-9\u00C0-\u024F])/g, '$1 ')
    .replace(/\s+/g, ' ').trim();
  if (t && !/[.!?\u2026]$/.test(t)) t += '.';
  if (t) t = t.charAt(0).toUpperCase() + t.slice(1);
  return t;
}

export function geschichtePrompt(idee, n) {
  return `Write a short visual story as ${n} scenes for a vertical AI video, based on this idea: "${sauber(idee, 300)}".
Rules: invent ORIGINAL characters only (no existing movie, series, game or anime characters, no celebrities). One clear arc:
setup -> problem -> action/turning point -> ending. Every scene is a different moment or place, full of movement, and the
background is always alive (weather, crowds of creatures, particles, light). No text or logos in the images.
Answer ONLY with JSON:
{"figuren":"one English sentence describing the main characters' fixed look (species, clothes, colors) so they stay identical",
 "szenen":[{"bild":"English image prompt: what we see, composition, location","bewegung":"English: what moves and how the camera moves","satz":"one short German narrator sentence"}]}
Write every "satz" in simple, correct, everyday German - short sentences, only real German words, no invented, misspelled or English words.`;
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
    satz: satzSaeubern(sauber(s.satz, 200)),
  }));
}

// Plant die Geschichte mit der Gratis-KI (zwei Versuche - kleine Modelle liefern oft zu wenige Szenen). Fehlen danach
// noch Szenen, werden die vorhandenen als Nah-/Weit-Einstellung wiederholt; ganz ohne Plan bleibt der normale Shot-Plan.
export async function geschichtePlanen(idee, { preset, n, stil, kiJson, ersatz }) {
  let beste = [];
  let roh = null;
  for (let versuch = 0; versuch < 2 && beste.length < n; versuch++) {
    try {
      const prompt = geschichtePrompt(idee, n) + (versuch ? `\nIMPORTANT: the "szenen" array must contain EXACTLY ${n} items.` : '');
      const d = await kiJson(prompt, { maxTokens: 3500 });
      const shots = geschichteZuShots(d, { idee, preset, n, stil });
      if (shots.length > beste.length) { beste = shots; roh = d; }
    } catch (err) {
      console.log(`[ziya-studio] Geschichte nicht geplant (${String(err.message).slice(0, 120)})`);
    }
  }
  if (beste.length < Math.min(3, n)) return ersatz();
  // Regie-Bot: zweiter KI-Durchgang prüft den Plan und macht ihn krasser - nur übernehmen, wenn nichts verloren geht.
  try {
    const besser = geschichteZuShots(await kiJson(regiePrompt(roh), { maxTokens: 3500 }), { idee, preset, n, stil });
    if (besser.length >= beste.length && besser.every((s) => s.satz)) { beste = besser; console.log('[ziya-studio] Regie-Bot hat die Geschichte verbessert'); }
  } catch { /* Plan bleibt */ }
  return auffuellen(beste, n);
}

// Regie-Bot: wie ein Regisseur, der das Drehbuch überarbeitet - stärkerer Hook, logischer Ablauf, natürliches Deutsch.
export const regiePrompt = (plan) => `You are a demanding film director. Improve this storyboard for a viral vertical short video:
- scene 1 must be a shocking, eye-catching hook; raise tension every scene; end with a strong payoff
- keep the same number of scenes, the same original characters ("figuren") and the same JSON format
- "bild": vivid, concrete, cinematic image prompts in English (lighting, camera angle, action, no text in images)
- "bewegung": strong, dynamic camera and subject motion in English
- "satz": short, natural, gripping German narration (max 14 words); simple correct everyday German only - real German words, no invented, misspelled or English words
Answer ONLY with the improved JSON.
${JSON.stringify(plan).slice(0, 6000)}`;

const NACHSCHUB = ['extreme close-up, same moment', 'wide shot from behind, same moment', 'low angle shot, same moment'];
export function auffuellen(shots, n) {
  const basis = shots.length;
  const alle = [...shots];
  for (let i = 0; alle.length < n; i++) {
    const quelle = shots[i % basis];
    alle.push({ ...quelle, bild: `${quelle.bild}, ${NACHSCHUB[Math.floor(i / basis) % NACHSCHUB.length]}`, satz: '' });
  }
  return alle.map((s, i) => ({ ...s, nr: i + 1 }));
}
