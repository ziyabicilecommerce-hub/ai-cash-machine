// Anime-Edits (#104): kurze TikTok-Edits (~12 s) mit EIGENEN Anime-Figuren (Serie #95) - nie Szenen oder Figuren
// bestehender Animes und nie fremde Songs (Urheberrecht). Schnitt auf den eigenen Trap-Beat: ruhiges Intro,
// Bass-Drop, dann schnelle Schnitte mit Zoom-Punch, Shake und Flash; Text "POV: ..." und "Folge für Teil N".
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const TAKT = 0.857; // Trap-Beat (BEAT_PERIODE.trap)
const SCHRIFT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

// Schnittplan: 2 ruhige Intro-Einstellungen bis zum Drop, dann Schnitt auf jeden halben Takt, am Ende die Endkarte.
export function schnittPlan(gesamt = 12, takt = TAKT) {
  const plan = [{ dauer: takt * 1.5, drop: false }, { dauer: takt * 1.5, drop: false }];
  let t = takt * 3;
  while (t + takt / 2 <= gesamt - 1.2 + 1e-9) { plan.push({ dauer: takt / 2, drop: true }); t += takt / 2; }
  plan.push({ dauer: 1.2, drop: false, ende: true });
  return plan;
}
export const dropZeit = (plan) => plan.filter((s) => !s.drop && !s.ende).reduce((a, s) => a + s.dauer, 0);

const POSEN = [
  'standing on a snowy cliff at night, wind blowing hair and cloak, full moon behind',
  'extreme close-up of determined glowing eyes, dramatic rim light',
  'drawing a katana, blue lightning crackling around the blade',
  'running across temple rooftops at dusk, motion blur, speed lines',
  'back view looking at a burning red sky, embers floating',
  'confident smirk, close-up portrait, cherry blossoms falling',
  'mid-air jump with a glowing energy aura, side view',
  'kneeling in heavy rain, head down, then looking up with fire in the eyes',
  'battle stance in a bamboo forest, mist, sharp shadows',
  'silhouette against a giant glowing moon, fireflies',
];
const STIL_VORNE = 'masterpiece 2D anime illustration, anime screencap, cel shading, clean bold lineart, flat vibrant colors';
// Immer dezent: vollständig bekleidet, keine tiefen Kamerawinkel (ein erster Edit zeigte zu viel Bein).
const STIL_HINTEN = 'japanese anime art style, epic anime key visual, dramatic lighting, fully clothed, modest full outfit, wholesome, eye-level camera, not photorealistic, not a 3d render, no text, no watermark';

export function editPrompts(figur, n = 8, versatz = 0) {
  // Solo: die KI malte sonst Nebenfiguren dazu (einmal ein blonder Junge in Orange, der an eine bekannte Serie erinnerte).
  const wer = `solo, single original anime ninja hero character, only one person in the image, ${figur.aussehen}`;
  return Array.from({ length: n }, (_, i) => `${STIL_VORNE}, ${wer}, ${POSEN[(i + versatz) % POSEN.length]}, ${STIL_HINTEN}`);
}

const HOOKS = ['POV: {name} wird ernst', 'Wenn {name} keine Gnade mehr kennt', '{name} hat genug', 'Niemand hat {name} kommen sehen', 'Das Erwachen von {name}'];
export const hookText = (name, teil) => HOOKS[teil % HOOKS.length].replace('{name}', name.split(' ')[0]);

// Zeilenumbruch für große Texte: höchstens n Zeichen pro Zeile (der erste Edit schnitt den Hook links/rechts ab).
export function umbrechen(text, n = 16) {
  const zeilen = [];
  for (const wort of String(text).split(/\s+/).filter(Boolean)) {
    const letzte = zeilen.at(-1);
    if (letzte !== undefined && `${letzte} ${wort}`.length <= n) zeilen[zeilen.length - 1] = `${letzte} ${wort}`;
    else zeilen.push(wort);
  }
  return zeilen.join('\n');
}
const textDatei = (pfad, text) => { writeFileSync(pfad, text); return pfad.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'"); };

// Rendert den Edit aus fertigen Bildern (ohne Netz testbar). Gibt die Dauer zurück.
export function editRendern(bilder, plan, ziel, { ordner, hook = '', ende = '', konto = '', breite = 1080, hoehe = 1920 }) {
  const clips = [];
  for (const [i, seg] of plan.entries()) {
    const bild = bilder[i % bilder.length];
    const frames = Math.max(2, Math.round(seg.dauer * 30));
    const spiegeln = i >= bilder.length && i % 2 ? 'hflip,' : '';
    // Intro: langsamer Zoom; Drop: Zoom-Punch (schnell rein, dann langsam), Shake, weißer Flash.
    const zoom = seg.drop ? "if(lt(on,4),1.28-0.06*on,1.04+0.004*on)" : '1.0+0.0018*on';
    const zp = `scale=${breite * 2}:${hoehe * 2},zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${breite}x${hoehe}:fps=30`;
    const wackeln = seg.drop ? `,crop=${breite - 40}:${hoehe - 70}:x='20+16*sin(n*2.3)':y='35+18*cos(n*1.9)',scale=${breite}:${hoehe}` : '';
    const blitz = seg.drop ? ',fade=t=in:st=0:d=0.1:color=white' : seg.ende ? ',eq=brightness=-0.25' : '';
    const clip = join(ordner, `seg${i}.mp4`);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', bild, '-vf', `${spiegeln}${zp}${wackeln},eq=contrast=1.15:saturation=1.35${blitz},setsar=1,format=yuv420p`,
      '-frames:v', String(frames), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', clip], { stdio: 'pipe', timeout: 300000 });
    clips.push(clip);
  }
  const liste = join(ordner, 'liste.txt');
  // Absolute Pfade: der concat-Demuxer sucht relative Pfade relativ zur Listen-Datei (lief so im Runner schief).
  writeFileSync(liste, clips.map((c) => `file '${resolve(c).replace(/'/g, "'\\''")}'`).join('\n'));
  const dauer = plan.reduce((a, s) => a + s.dauer, 0);
  const groesse = Math.round(breite * 0.075);
  const texte = [
    hook && `drawtext=fontfile=${SCHRIFT}:textfile='${textDatei(join(ordner, 'hook.txt'), umbrechen(hook.toUpperCase(), 16))}':fontsize=${groesse}:fontcolor=white:borderw=6:bordercolor=black:line_spacing=12:x=(w-text_w)/2:y=h*0.14:enable='lt(t,${dropZeit(plan).toFixed(2)})'`,
    ende && `drawtext=fontfile=${SCHRIFT}:textfile='${textDatei(join(ordner, 'ende.txt'), umbrechen(ende.toUpperCase(), 16))}':fontsize=${groesse}:fontcolor=white:borderw=6:bordercolor=black:line_spacing=12:x=(w-text_w)/2:y=(h-text_h)/2:enable='gte(t,${(dauer - 1.2).toFixed(2)})'`,
    konto && `drawtext=fontfile=${SCHRIFT}:textfile='${textDatei(join(ordner, 'konto.txt'), konto.toUpperCase())}':fontsize=${Math.round(breite * 0.034)}:fontcolor=white@0.85:borderw=3:bordercolor=black@0.6:x=w*0.05:y=h*0.045`,
  ].filter(Boolean).join(',');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', liste, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
    '-vf', texte || 'null', '-t', dauer.toFixed(2), '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', '-movflags', '+faststart', ziel], { stdio: 'pipe', timeout: 600000 });
  return dauer;
}
