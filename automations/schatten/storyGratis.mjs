// Gratis-Story-Fabrik (26.11., Nutzer: "kostenlose Variante für immer"): produziert eine Folge im Story-Format
// ohne Higgsfield und ohne Kosten.
//  1. Figurenblätter: vorhandenes Bild (blattUrl) oder neu per Cloudflare FLUX.2 (Gratis-Kontingent pro Tag)
//  2. Szenenbilder: Cloudflare FLUX.2 [klein] MIT Figurenblatt als Referenz -> gleiche Figuren in jeder Szene
//     (ohne Cloudflare-Schlüssel: Pollinations ohne Referenz - Figuren dann weniger einheitlich)
//  3. Clips über das Quellen-Netz (lib/quellenNetz.mjs): Seedance -> Modal -> Zhipu/free.ai/Hugging Face -> Kamerafahrt
//  4. schnitt.json für higgsSchnitt.mjs (Stimme, Untertitel, Hook)
//   node automations/schatten/storyGratis.mjs <folge.json> <ordner>
//   node automations/schatten/storyGratis.mjs eintragen <folge.json> <neu.json> <release-basis-url>  (Fortschritt merken)
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { figurenIn, promptBauen } from './storyFabrik.mjs';

const BEWEGUNG = 'subtle natural movement, slow camera push-in';

// Was fehlt noch? (Bild = weder bild noch Prompt erledigt, Clip = Szene ohne clip)
export function offen(ep) {
  const sz = ep.szenen || [];
  return {
    blaetter: Object.entries(ep.figuren || {}).filter(([, f]) => !f.blattUrl && f.blattPrompt).map(([k]) => k),
    bilder: sz.map((s, i) => (!s.bild && s.bildPrompt ? i : -1)).filter((i) => i >= 0),
    clips: sz.map((s, i) => (!s.clip ? i : -1)).filter((i) => i >= 0),
  };
}

// Prompt ohne Referenz: Figuren ausführlich beschreiben statt "from the reference image"
export function promptOhneRef(prompt, figuren = {}) {
  let p = String(prompt);
  for (const [k, f] of Object.entries(figuren)) p = p.replaceAll(`{${k}}`, f.blattPrompt || f.beschreibung);
  return `${p}, Pixar-style 3D animated film still, vertical, cinematic lighting, highly detailed, no text`;
}

// Sprachfassung (27.11.): "basis" = Folge-Datei mit Bildern/Clips, hier nur Texte, Hook und Stimme in anderer Sprache
export function mitBasis(ep, quelle, lesen = (f) => JSON.parse(readFileSync(f, 'utf8'))) {
  if (!ep.basis) return ep;
  const b = lesen(join(dirname(resolve(quelle)), ep.basis));
  return { ...b, ...ep, figuren: b.figuren, szenen: b.szenen.map((s, i) => ({ ...s, text: ep.texte?.[i] || s.text })) };
}

// Neue Dateien (als Release hochgeladen) in die Folge-Datei eintragen -> der nächste Lauf macht nur noch den Rest
export function eintragen(ep, neu, basis) {
  const url = (f) => `${basis.replace(/\/$/, '')}/${f}`;
  const figuren = Object.fromEntries(Object.entries(ep.figuren || {}).map(([k, f]) => [k, neu.blaetter?.[k] ? { ...f, blattUrl: url(neu.blaetter[k]) } : f]));
  const szenen = (ep.szenen || []).map((s, i) => ({ ...s, ...(neu.bilder?.[i] ? { bild: url(neu.bilder[i]) } : {}), ...(neu.clips?.[i] ? { clip: url(neu.clips[i]) } : {}) }));
  return { ...ep, figuren, szenen };
}

async function holen(url, ziel) {
  if (!/^https:\/\//.test(url)) { copyFileSync(resolve(url), ziel); return ziel; }
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`Download ${r.status}`);
  writeFileSync(ziel, Buffer.from(await r.arrayBuffer()));
  return ziel;
}

async function bildErzeugen(prompt, refs, ziel, figuren, { cf, cfBild, ladeBild }) {
  if (cf) {
    try { return await cfBild(promptBauen(prompt, figuren).replace(/\{[A-Z]+\}/g, ''), refs, ziel); } catch (err) {
      console.log(`[story-gratis] Cloudflare: ${String(err.message).slice(0, 160)} - Ersatz ohne Referenz`);
    }
  }
  if (await ladeBild(promptOhneRef(prompt, figuren), ziel, { breite: 720, hoehe: 1280 })) return ziel;
  throw new Error('kein Bild bekommen');
}

async function main() {
  const [quelle, ordner0] = process.argv.slice(2);
  const ordner = resolve(ordner0 || 'out/story');
  mkdirSync(ordner, { recursive: true });
  const ep = mitBasis(JSON.parse(readFileSync(quelle, 'utf8')), quelle);
  const { cfBereit, cfBild } = await import('../lib/cfBild.mjs');
  const { ladeBild } = await import('../lib/videoFabrik.mjs');
  const cf = cfBereit();
  const { netzBericht, aktiv, quellenZaehlen } = await import('../lib/quellenNetz.mjs');
  console.log(`[story-gratis] ${ep.titel}\n${netzBericht()}`);
  const neu = { blaetter: {}, bilder: {}, clips: {} };
  const quelleJe = {};
  const werkzeug = { cf, cfBild, ladeBild };

  // 1. Figurenblätter
  const blatt = {};
  for (const [k, f] of Object.entries(ep.figuren || {})) {
    const datei = join(ordner, `blatt-${k}.jpg`);
    try {
      if (f.blattUrl) blatt[k] = await holen(f.blattUrl, datei);
      else if (f.blattPrompt) {
        blatt[k] = await bildErzeugen(`Character reference sheet, full body, front view, plain warm grey background: ${f.blattPrompt}`, [], datei, {}, werkzeug);
        neu.blaetter[k] = `blatt-${k}.jpg`;
      }
    } catch (err) { console.log(`[story-gratis] Figurenblatt ${k}: ${String(err.message).slice(0, 120)}`); }
  }

  // 2. Szenenbilder (fertige laden, fehlende erzeugen)
  const lokal = [];
  for (const [i, s] of (ep.szenen || []).entries()) {
    const datei = join(ordner, `s${i + 1}.jpg`);
    try {
      if (s.bild) lokal[i] = await holen(s.bild, datei);
      else if (s.bildPrompt) {
        const refs = [...new Set(figurenIn(s.bildPrompt, ep.figuren).map((k) => blatt[k]).filter(Boolean))];
        lokal[i] = await bildErzeugen(s.bildPrompt, refs, datei, ep.figuren, werkzeug);
        neu.bilder[i] = `s${i + 1}.jpg`;
        console.log(`[story-gratis] Szene ${i + 1}: Bild erzeugt (${cf ? `${refs.length} Figurenblatt-Vorlage${refs.length === 1 ? '' : 'n'}` : 'ohne Vorlage'})`);
      }
    } catch (err) { console.log(`[story-gratis] Szene ${i + 1}: kein Bild - ${String(err.message).slice(0, 120)}`); }
  }

  // 3a. Clips in Top-Qualität: Seedance über BytePlus ModelArk (Gratis-Kontingent, solange es reicht)
  const clipLokal = [];
  const { arkBereit, arkClip } = await import('../lib/arkVideo.mjs');
  if (arkBereit()) {
    for (const [i, s] of (ep.szenen || []).entries()) {
      if (s.clip || !lokal[i]) continue;
      const ziel = join(ordner, `s${i + 1}.mp4`);
      try {
        const { model } = await arkClip(lokal[i], s.clipPrompt || BEWEGUNG, ziel);
        clipLokal[i] = ziel;
        neu.clips[i] = `s${i + 1}.mp4`;
        quelleJe[i] = 'Seedance';
        console.log(`[story-gratis] Szene ${i + 1}: Seedance-Clip (${model})`);
      } catch (err) {
        console.log(`[story-gratis] Szene ${i + 1}: ${String(err.message).slice(0, 200)}`);
        if (err.leer) break;
      }
    }
  }
  // 3b. Modal (Wan 2.2 auf eigener Gratis-GPU, 30 $ im Monat): alle restlichen Szenen in einem Rutsch
  if (aktiv('modal')) {
    const { modalClips } = await import('../lib/modalTurbo.mjs');
    const shots = (ep.szenen || []).map((s, i) => (!s.clip && !clipLokal[i] && lokal[i] ? { nr: i + 1, bildB64: readFileSync(lokal[i]).toString('base64'), bewegung: s.clipPrompt || BEWEGUNG } : null)).filter(Boolean);
    if (shots.length) {
      const clips = await modalClips(shots, ordner, { sekunden: 3.5, qualitaet: 'kino', maxMinuten: Number(process.env.STORY_MODAL_MIN) || 60 });
      for (const [nr, p] of clips) {
        const ziel = join(ordner, `s${nr}.mp4`);
        copyFileSync(p, ziel);
        clipLokal[nr - 1] = ziel;
        neu.clips[nr - 1] = `s${nr}.mp4`;
        quelleJe[nr - 1] = 'Modal';
      }
    }
  }
  // 3c. Ohne Schlüssel: echte KI-Clips über Hugging-Face-Spaces (Wan/LTX, kleines Gratis-Kontingent pro Lauf) -
  //     die wichtigsten Szenen zuerst: Hook, Schluss (Cliffhanger), dann der Rest. Kein Kaggle (Nutzer-Wunsch 27.11.).
  const { kiClip, kiClipStatus } = await import('../lib/kiVideo.mjs');
  const n = (ep.szenen || []).length;
  const reihenfolge = [0, n - 1, n - 2, ...Array.from({ length: n }, (_, i) => i)].filter((i, k, a) => i >= 0 && a.indexOf(i) === k);
  const hfMax = Number(process.env.STORY_HF_MAX) || 6;
  let hf = 0;
  for (const i of reihenfolge) {
    const s = ep.szenen[i];
    if (hf >= hfMax || s.clip || clipLokal[i] || !lokal[i]) continue;
    if (kiClipStatus().erschoepft.includes('wan') && kiClipStatus().erschoepft.includes('ltx')) break;
    const ziel = join(ordner, `s${i + 1}.mp4`);
    if (await kiClip(lokal[i], s.clipPrompt || BEWEGUNG, ziel, { index: i === 0 ? 0 : 1 })) {
      clipLokal[i] = ziel;
      neu.clips[i] = `s${i + 1}.mp4`;
      quelleJe[i] = 'Hugging Face/Zhipu/free.ai';
      hf++;
    }
  }
  const ohneClip = (ep.szenen || []).filter((s, i) => !s.clip && !clipLokal[i] && lokal[i]).length;
  if (ohneClip) console.log(`[story-gratis] ${ohneClip} Szenen ohne Clip - im Schnitt mit Kamerafahrt durchs Bild`);

  // 4. Für den Schnitt: lokale Dateien bevorzugen
  const schnitt = { ...ep, szenen: (ep.szenen || []).map((s, i) => ({ text: s.text, bild: lokal[i] || '', clip: clipLokal[i] || s.clip || '' })) };
  writeFileSync(join(ordner, 'schnitt.json'), JSON.stringify(schnitt, null, 1));
  writeFileSync(join(ordner, 'neu.json'), JSON.stringify(neu, null, 1));
  const o = offen(ep);
  console.log(`[story-gratis] fertig: ${Object.keys(neu.bilder).length}/${o.bilder.length} neue Bilder, ${Object.keys(neu.clips).length}/${o.clips.length} Clips (Quellen: ${quellenZaehlen(quelleJe)})`);
}

if (process.argv[1]?.endsWith('storyGratis.mjs') && process.argv[2] === 'eintragen') {
  const [, , , folge, neuDatei, basis] = process.argv;
  writeFileSync(folge, JSON.stringify(eintragen(JSON.parse(readFileSync(folge, 'utf8')), JSON.parse(readFileSync(neuDatei, 'utf8')), basis), null, 1) + '\n');
  console.log(`[story-gratis] Fortschritt in ${folge} eingetragen`);
} else if (process.argv[1]?.endsWith('storyGratis.mjs')) main().catch((e) => { console.error(`[story-gratis] ${e.message}`); process.exit(1); });
