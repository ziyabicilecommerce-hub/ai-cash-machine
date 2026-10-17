// Ziya Studio: kostenloser Nachbau dessen, was Higgsfield ausmacht. Higgsfield trainiert kaum eigene Videomodelle.
// Es ist eine Schicht über fremden Modellen (Seedance, Kling, Wan, Veo ...): Kamera-Presets, Prompt-Veredelung,
// Mehr-Shot-Planung, Modell-Auswahl und Nachbearbeitung. Genau diese Schicht steckt hier drin, aber mit
// kostenlosen Modellen (Wan 2.2 / LTX auf Hugging Face, optional CogVideoX-Flash). Reine Funktionen (ohne Netz testbar).

// Kamera-Presets: kamera = Prompt für das Videomodell, zoom = Rückfall-Kamerafahrt, falls kein KI-Clip kommt,
// look = Farblook in der Nachbearbeitung.
export const PRESETS = {
  'crash-zoom': { name: 'Crash Zoom', kamera: 'fast aggressive crash zoom in towards the subject, sudden dramatic push', zoom: 'rein-schnell', look: 'kontrast' },
  'dolly-in': { name: 'Dolly In', kamera: 'slow smooth dolly push in, steady cinematic camera', zoom: 'rein', look: 'film' },
  'dolly-out': { name: 'Dolly Out', kamera: 'slow smooth dolly pull back revealing the wide scene', zoom: 'raus', look: 'film' },
  orbit: { name: '360 Orbit', kamera: 'camera orbits around the subject in a smooth arc, parallax', zoom: 'schwenk', look: 'film' },
  fpv: { name: 'FPV Drohne', kamera: 'fpv drone shot flying fast forward through the scene, dynamic banking', zoom: 'rein-schnell', look: 'kontrast' },
  'crane-up': { name: 'Kran hoch', kamera: 'crane shot rising up and tilting down, epic reveal', zoom: 'hoch', look: 'episch' },
  'bullet-time': { name: 'Bullet Time', kamera: 'frozen moment, camera slowly circles, extreme slow motion particles', zoom: 'schwenk', look: 'kontrast' },
  handheld: { name: 'Handkamera', kamera: 'handheld camera, subtle natural shake, documentary feel', zoom: 'rein', look: 'natur' },
  zeitlupe: { name: 'Zeitlupe', kamera: 'super slow motion, gentle drifting camera, floating particles', zoom: 'rein', look: 'episch' },
  grusel: { name: 'Grusel', kamera: 'slow creeping push in, flickering light, ominous atmosphere, fog', zoom: 'rein', look: 'grusel' },
};
export const PRESET_STANDARD = 'dolly-in';

// Mehr-Shot-Planung: aus einer Idee wird eine kleine Szene mit Totale, Nah und Effekt-Shot (wie Higgsfields Storyboards).
const EINSTELLUNGEN = ['wide establishing shot', 'medium close-up, shallow depth of field', 'dramatic hero shot, low angle', 'extreme close-up detail', 'wide aerial view'];
const FOLGE = { 'crash-zoom': ['dolly-in', 'crash-zoom', 'orbit'], grusel: ['grusel', 'handheld', 'crash-zoom'], fpv: ['fpv', 'orbit', 'crane-up'] };
const QUALITAET = 'cinematic lighting, volumetric light, 35mm film look, ultra detailed, sharp focus';

export const presetVon = (id) => PRESETS[String(id || '').trim().toLowerCase()] ? String(id).trim().toLowerCase() : PRESET_STANDARD;
const sauber = (t, n) => String(t || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

export function shotsPlanen(idee, preset = PRESET_STANDARD, anzahl = 3) {
  const text = sauber(idee, 300);
  if (!text) throw new Error('Keine Idee angegeben');
  const p = presetVon(preset);
  const n = Math.min(Math.max(Number(anzahl) || 3, 1), 5);
  const reihe = n === 1 ? [p] : (FOLGE[p] || [p, 'orbit', 'crane-up']);
  return Array.from({ length: n }, (_, i) => {
    const id = reihe[i % reihe.length];
    const einstellung = EINSTELLUNGEN[i % EINSTELLUNGEN.length];
    return {
      nr: i + 1, preset: id,
      bild: `${text}, ${einstellung}, ${QUALITAET}, vertical composition`,
      bewegung: `${text}, ${einstellung}, ${PRESETS[id].kamera}, ${QUALITAET}, natural fluid motion`,
    };
  });
}

// Modell-Reihenfolge: das stärkste freie Modell zuerst, ist ein Kontingent leer, das nächste.
export function modellReihe(erschoepft = new Set(), { zhipu = false } = {}) {
  return ['wan', 'ltx', ...(zhipu ? ['zhipu'] : [])].filter((m) => !erschoepft.has(m));
}

const LOOKS = {
  film: 'eq=contrast=1.06:saturation=1.08,curves=preset=medium_contrast',
  kontrast: 'eq=contrast=1.15:saturation=1.18,curves=preset=strong_contrast',
  episch: "eq=contrast=1.08:saturation=1.12,colorbalance=rs=-0.04:bs=0.06:rh=0.05:bh=-0.04",
  natur: 'eq=contrast=1.04:saturation=1.12',
  grusel: 'eq=contrast=1.12:saturation=0.7:brightness=-0.03,colorbalance=bs=0.08:gs=0.03',
};

// Nachbearbeitung pro Shot: flüssige Zwischenbilder (30 fps, noch in kleiner Auflösung = schnell), hochskalieren
// (Lanczos), nachschärfen, Farblook, feines Filmkorn. roh=false: für die Kamerafahrt, die schon Größe und fps hat.
export function nachbearbeitung(preset, { breite = 1080, hoehe = 1920, fps = 30, roh = true } = {}) {
  const look = LOOKS[PRESETS[presetVon(preset)].look] || LOOKS.film;
  return [
    ...(roh ? [`minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`,
      `scale=${breite}:${hoehe}:force_original_aspect_ratio=increase:flags=lanczos`, `crop=${breite}:${hoehe}`] : []),
    'unsharp=5:5:0.6:5:5:0', look, 'noise=alls=4:allf=t', 'format=yuv420p',
  ].join(',');
}

// Rückfall ohne KI-Kontingent: das Standbild bekommt die Preset-Kamerafahrt (zoompan), damit trotzdem ein Video entsteht.
export function kamerafahrt(preset, { breite = 1080, hoehe = 1920, sekunden = 4, fps = 30 } = {}) {
  const f = Math.round(sekunden * fps);
  const z = {
    rein: `zoom='1+0.15*on/${f}'`, 'rein-schnell': `zoom='1+0.45*pow(on/${f},2)'`, raus: `zoom='1.2-0.2*on/${f}'`,
    schwenk: `zoom='1.15'`, hoch: `zoom='1.12'`,
  }[PRESETS[presetVon(preset)].zoom] || `zoom='1+0.15*on/${f}'`;
  const x = PRESETS[presetVon(preset)].zoom === 'schwenk' ? `x='(iw-iw/zoom)*on/${f}'` : "x='iw/2-(iw/zoom/2)'";
  const y = PRESETS[presetVon(preset)].zoom === 'hoch' ? `y='(ih-ih/zoom)*(1-on/${f})'` : "y='ih/2-(ih/zoom/2)'";
  return `scale=${breite * 2}:${hoehe * 2}:force_original_aspect_ratio=increase,crop=${breite * 2}:${hoehe * 2},zoompan=${z}:${x}:${y}:d=${f}:s=${breite}x${hoehe}:fps=${fps},format=yuv420p`;
}

// Weiche Überblendungen zwischen den Shots (xfade), Offsets aus den Shot-Längen.
export function ueberblendung(dauern, { blende = 0.4 } = {}) {
  if (dauern.length < 2) return { filter: '[0:v]null[v]', laenge: dauern[0] || 0 };
  const teile = [];
  let summe = dauern[0];
  let vorher = '[0:v]';
  for (let i = 1; i < dauern.length; i++) {
    const raus = i === dauern.length - 1 ? '[v]' : `[x${i}]`;
    teile.push(`${vorher}[${i}:v]xfade=transition=fade:duration=${blende}:offset=${(summe - blende).toFixed(3)}${raus}`);
    summe += dauern[i] - blende;
    vorher = raus;
  }
  return { filter: teile.join(';'), laenge: Number(summe.toFixed(3)) };
}
