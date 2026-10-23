// Ziya Studio: kostenloser Nachbau dessen, was Higgsfield ausmacht. Higgsfield trainiert kaum eigene Videomodelle.
// Es ist eine Schicht über fremden Modellen (Seedance, Kling, Wan, Veo ...): Kamera-Presets, Prompt-Veredelung,
// Mehr-Shot-Planung, Modell-Auswahl und Nachbearbeitung. Genau diese Schicht steckt hier drin, aber mit
// kostenlosen Modellen (Wan 2.2 / LTX auf Hugging Face, optional CogVideoX-Flash). Reine Funktionen (ohne Netz testbar).

// Kamera-Presets: kamera = genau EIN Kamerabefehl (widersprüchliche Befehle zerreißen den Clip), umgebung = was sich
// in der Szene bewegt, licht = Lichtstimmung, tempo = Geschwindigkeit; zoom = Rückfall-Kamerafahrt ohne KI-Clip,
// look = Farblook in der Nachbearbeitung, ton = Klangfarbe der Tonspur.
export const PRESETS = {
  'crash-zoom': { name: 'Crash Zoom', kamera: 'fast aggressive crash zoom in towards the subject', umgebung: 'debris and dust fly past the lens', licht: 'hard rim light, high contrast', tempo: 'sudden, explosive speed', zoom: 'rein-schnell', look: 'kontrast', ton: 'action' },
  'dolly-in': { name: 'Dolly In', kamera: 'slow smooth dolly push in on the subject', umgebung: 'gentle atmospheric haze drifts', licht: 'soft golden key light, volumetric rays', tempo: 'slow and steady', zoom: 'rein', look: 'film', ton: 'episch' },
  'dolly-out': { name: 'Dolly Out', kamera: 'slow smooth dolly pull back revealing the wide scene', umgebung: 'the environment opens up around the subject', licht: 'soft natural light, wide dynamic range', tempo: 'slow and steady', zoom: 'raus', look: 'film', ton: 'episch' },
  orbit: { name: '360 Orbit', kamera: 'camera orbits around the subject in a smooth arc', umgebung: 'background shifts with strong parallax', licht: 'dramatic side light, glowing highlights', tempo: 'smooth constant speed', zoom: 'schwenk', look: 'film', ton: 'episch' },
  fpv: { name: 'FPV Drohne', kamera: 'fpv drone flies fast forward through the scene, banking into a turn', umgebung: 'landscape rushes past below', licht: 'bright daylight, crisp shadows', tempo: 'fast and dynamic', zoom: 'rein-schnell', look: 'kontrast', ton: 'action' },
  'crane-up': { name: 'Kran hoch', kamera: 'crane shot rising up high and tilting down', umgebung: 'the full scale of the scene is revealed', licht: 'epic backlight, light rays through the air', tempo: 'slow majestic rise', zoom: 'hoch', look: 'episch', ton: 'episch' },
  'bullet-time': { name: 'Bullet Time', kamera: 'frozen moment, camera slowly circles the subject', umgebung: 'particles and droplets hang still in the air', licht: 'crisp high contrast light', tempo: 'extreme slow motion', zoom: 'schwenk', look: 'kontrast', ton: 'action' },
  handheld: { name: 'Handkamera', kamera: 'handheld camera with subtle natural shake', umgebung: 'real-world movement, wind and small details', licht: 'natural available light', tempo: 'real-time, documentary feel', zoom: 'rein', look: 'natur', ton: 'natur' },
  zeitlupe: { name: 'Zeitlupe', kamera: 'gentle slow drifting camera', umgebung: 'floating particles, flowing elements', licht: 'dreamy soft glow, lens bloom', tempo: 'super slow motion', zoom: 'rein', look: 'episch', ton: 'episch' },
  // Anime-Kampf: Kinofilm-Anime-Look mit Sakuga-Kamera, Element-Effekten, Impact-Frames und Wackler an jedem Schnitt.
  // Eigene Figuren - geschützte Anime-Figuren werden nicht nachgebaut.
  'anime-kampf': {
    name: 'Anime-Kampf', kamera: 'dynamic sakuga camera, fast whip pan following the attack', umgebung: 'glowing elemental slashes, shockwaves, sparks and debris burst outward',
    licht: 'intense glowing effects, dramatic anime lighting, strong rim light', tempo: 'explosive fast action with a split-second impact pause', zoom: 'rein-schnell', look: 'anime', ton: 'action', impact: true,
    stil: 'anime key visual, high-budget anime film, cel shading, vibrant saturated colors, detailed painted background, dynamic composition, glowing particle effects',
    einstellungen: ['dynamic low angle action shot', 'extreme close-up of determined glowing eyes', 'wide shot of two fighters clashing mid-air', 'close-up of blades clashing with sparks', 'aerial shot of a shockwave crater'],
  },
  grusel: { name: 'Grusel', kamera: 'slow creeping push in', umgebung: 'fog rolls in, light flickers, shadows move', licht: 'cold moonlight, deep shadows', tempo: 'slow and ominous', zoom: 'rein', look: 'grusel', ton: 'grusel' },
};
export const PRESET_STANDARD = 'dolly-in';

// Mehr-Shot-Planung als Bogen vom Einstieg bis zur Enthüllung (wie Higgsfields Storyboards):
// Totale -> Nah -> Helden-Shot -> Detail -> Luftbild. Je Einstellung passende Brennweite.
const EINSTELLUNGEN = [
  'wide establishing shot, 24mm lens', 'medium close-up, 50mm lens, shallow depth of field', 'dramatic hero shot from a low angle, 35mm lens',
  'extreme close-up detail, 85mm macro lens', 'wide aerial view, 16mm lens',
];
const FOLGE = { 'anime-kampf': ['anime-kampf'], 'crash-zoom': ['dolly-in', 'crash-zoom', 'orbit'], grusel: ['grusel', 'handheld', 'crash-zoom'], fpv: ['fpv', 'orbit', 'crane-up'] };
// Bild-Formel: Motiv + Umgebung + Einstellung/Objektiv + Licht + Stil + Qualität.
const STIL = 'cinematic film still, photorealistic, rich color grading, 8k, ultra detailed, sharp focus';
// Bis 60 s: so viele Shots passen bei ~3,4 s pro KI-Clip.
export const MAX_SHOTS = 18;
// "KI-Modus": auch der Hintergrund bewegt sich die ganze Zeit - kein stehendes Bild hinter dem Motiv.
export const HINTERGRUND = 'The background is alive with constant motion: drifting clouds, swirling particles, shifting light and moving reflections';

// Übergang und Blendenlänge je Preset (Anime: harter weißer Impact-Frame).
export const schnittArt = (preset, { krass = false } = {}) => (krass || PRESETS[presetVon(preset)].impact ? { uebergang: 'fadewhite', blende: 0.2 } : { uebergang: 'fade', blende: 0.4 });

// Krass-Modus: jede Szene volle Wucht - mehr Bewegung, schneller, dramatischer (hängt an den Bewegungs-Prompt an).
export const KRASS = 'Intense high-energy action, fast dynamic movement, dramatic speed ramps, epic scale, powerful visual impact, debris and particles fly through the frame';

export const presetVon = (id) => PRESETS[String(id || '').trim().toLowerCase()] ? String(id).trim().toLowerCase() : PRESET_STANDARD;
const sauber = (t, n) => String(t || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

// Bild-zu-Video-Prompt beschreibt die BEWEGUNG, nicht das Bild (das Startbild legt schon fest, was zu sehen ist):
// Kamera + Motivbewegung + Umgebung + Tempo + Licht. Stimmt der Text mit dem Bild überein, bleibt das Motiv stabil.
export function shotsPlanen(idee, preset = PRESET_STANDARD, anzahl = 3) {
  const text = sauber(idee, 300);
  if (!text) throw new Error('Keine Idee angegeben');
  const p = presetVon(preset);
  const n = Math.min(Math.max(Number(anzahl) || 3, 1), MAX_SHOTS);
  const reihe = n === 1 ? [p] : (FOLGE[p] || [p, 'orbit', 'crane-up']);
  return Array.from({ length: n }, (_, i) => {
    const id = reihe[i % reihe.length];
    const x = PRESETS[id];
    const liste = x.einstellungen || EINSTELLUNGEN;
    const einstellung = liste[i % liste.length];
    return {
      nr: i + 1, preset: id,
      bild: `${text}, ${einstellung}, ${x.licht}, dynamic detailed background with depth, ${x.stil || STIL}, vertical 9:16 composition`,
      bewegung: `${x.kamera}. ${text}, the subject moves naturally and stays consistent. ${x.umgebung}. ${HINTERGRUND}. ${x.tempo}. ${x.licht}. Cinematic, smooth, coherent motion.`,
    };
  });
}

// Modell-Reihenfolge: das stärkste freie Modell zuerst, ist ein Kontingent leer, das nächste.
// wan14 (5 s, Endbild), ltx23 (natives 704x1280) und real (realistisches Finetune) sind kleine Gratis-Spaces aus der
// Weltsuche (Okt. 2026), alle mit Testclip geprüft.
// turbo (LTX-2 Turbo, Okt. 2026 getestet: 22 s, 1024x1536, mit Ton) steht vorn; ltx25 = offizielles LTX-2.5 (ohne
// HF_TOKEN nur 2-s-Clips, sonst zu viel GPU-Zeit).
// seedance (BytePlus, Startkontingent gratis) kommt nur mit Schlüssel dazu und steht dann ganz vorn.
// anime: AnimeGen (gratis getestet) vor AniSora V3.2 und Kandinsky 6.0 Pro - die beiden brauchen mehr GPU-Zeit,
// als ZeroGPU ohne PRO-Konto erlaubt, und springen dann in 2 s zum nächsten Modell weiter.
export function modellReihe(erschoepft = new Set(), { zhipu = false, seedance = false, anime = false } = {}) {
  return [...(seedance ? ['seedance'] : []), ...(anime ? ['animegen', 'anisora', 'k6'] : []), 'turbo', 'wan14', 'ltx23', 'ltx25', 'wan', 'real', 'ltx', ...(zhipu ? ['zhipu'] : [])].filter((m) => !erschoepft.has(m));
}

// Space-Pool (ki-video/spaces.json, wöchentlich von scripts/space_pool.py gefüllt): weitere Gratis-Video-Spaces als
// Rückfall hinter den Stamm-Modellen - höchstens `max` Versuche pro Shot, Stamm-Spaces nicht doppelt.
const STAMM = /^(zerogpu-aoti\/wan2-2-fp8da-aoti-faster|Lightricks\/ltx-video-distilled|Upsampler\/wan-2-2-14b-image-to-video|Ash1004\/ltx23-i2v-fullres|hugging-apps\/ksyjawan-realistic-i2v|aidealab\/AnimeGen-I2V|Lightricks\/LTX-2\.5|alexnasa\/ltx-2-TURBO)$/;
// Spaces mit eigener GPU (nicht "zero") zählen nicht aufs geteilte ZeroGPU-Tageslimit - die kommen zuerst.
export function poolModelle(pool, erschoepft = new Set(), { anime = false, max = 12 } = {}) {
  const liste = (Array.isArray(pool?.spaces) ? pool.spaces : [])
    .filter((x) => x?.space && /^(wan|ltx25|animegen)$/.test(x.typ) && /^\/[\w-]+$/.test(x.endpoint || '') && !STAMM.test(x.space))
    .map((x) => ({ ...x, id: `pool:${x.space}:${x.typ}:${x.endpoint}` }))
    .filter((x) => !erschoepft.has(x.id));
  const eigeneGpu = (x) => !!x.gpu && !/zero/i.test(x.gpu);
  liste.sort((a, b) => eigeneGpu(b) - eigeneGpu(a));
  if (anime) liste.sort((a, b) => (b.typ === 'animegen') - (a.typ === 'animegen'));
  return liste.slice(0, max).map((x) => x.id);
}

const LOOKS = {
  film: 'eq=contrast=1.06:saturation=1.08,curves=preset=medium_contrast',
  kontrast: 'eq=contrast=1.15:saturation=1.18,curves=preset=strong_contrast',
  episch: "eq=contrast=1.08:saturation=1.12,colorbalance=rs=-0.04:bs=0.06:rh=0.05:bh=-0.04",
  natur: 'eq=contrast=1.04:saturation=1.12',
  grusel: 'eq=contrast=1.12:saturation=0.7:brightness=-0.03,colorbalance=bs=0.08:gs=0.03',
  // Anime: kräftige Farben, Leuchten (weichgezeichnete Kopie im Screen-Modus) und leichte Farbsäume wie im Kino-Anime.
  anime: 'eq=contrast=1.12:saturation=1.35,split[ak][ag];[ag]gblur=sigma=14[agb];[ak][agb]blend=all_mode=screen:all_opacity=0.32,rgbashift=rh=-2:bh=2',
};

// Impact-Wackler: die ersten 0,4 s nach jedem Schnitt bebt das Bild (Treffer-Gefühl), danach ruhig.
export const wackler = (breite = 1080, hoehe = 1920) =>
  `crop=w=iw-48:h=ih-48:x='24+if(lt(t,0.4),22*sin(t*95)*(1-t/0.4),0)':y='24+if(lt(t,0.4),22*cos(t*81)*(1-t/0.4),0)',scale=${breite}:${hoehe}`;

// Nachbearbeitung pro Shot: flüssige Zwischenbilder (30 fps, noch in kleiner Auflösung = schnell), hochskalieren
// (Lanczos), nachschärfen, Farblook, feines Filmkorn. roh=false: für die Kamerafahrt, die schon Größe und fps hat.
export function nachbearbeitung(preset, { breite = 1080, hoehe = 1920, fps = 30, roh = true, krass = false } = {}) {
  const look = LOOKS[PRESETS[presetVon(preset)].look] || LOOKS.film;
  return [
    ...(roh ? [`minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`,
      `scale=${breite}:${hoehe}:force_original_aspect_ratio=increase:flags=lanczos`, `crop=${breite}:${hoehe}`] : []),
    'unsharp=5:5:0.6:5:5:0', look, ...(krass || PRESETS[presetVon(preset)].impact ? [wackler(breite, hoehe)] : []), 'noise=alls=4:allf=t', 'format=yuv420p',
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
// Anime: uebergang 'fadewhite' mit kurzer Blende = weißer Impact-Frame an jedem Schnitt.
export function ueberblendung(dauern, { blende = 0.4, uebergang = 'fade' } = {}) {
  if (dauern.length < 2) return { filter: '[0:v]null[v]', laenge: dauern[0] || 0 };
  const teile = [];
  let summe = dauern[0];
  let vorher = '[0:v]';
  for (let i = 1; i < dauern.length; i++) {
    const raus = i === dauern.length - 1 ? '[v]' : `[x${i}]`;
    teile.push(`${vorher}[${i}:v]xfade=transition=${uebergang}:duration=${blende}:offset=${(summe - blende).toFixed(3)}${raus}`);
    summe += dauern[i] - blende;
    vorher = raus;
  }
  return { filter: teile.join(';'), laenge: Number(summe.toFixed(3)) };
}

// Tonspur ohne Musikrechte: selbst erzeugter Kino-Klang (tiefer Drone je Stimmung) + Whoosh an jedem Schnitt + Boom am Anfang.
// Ergebnis ist ein aevalsrc-Ausdruck (Mono) - stumme Videos laufen auf TikTok deutlich schlechter.
const DRONES = { episch: [55, 82.5, 110], action: [41.2, 61.7, 82.4], grusel: [46.2, 49, 69.3], natur: [65.4, 98, 130.8] };
export function tonFormel(dauern, preset, { blende = 0.4, krass = false } = {}) {
  const hz = DRONES[PRESETS[presetVon(preset)].ton] || DRONES.episch;
  const drone = hz.map((f, i) => `${(0.09 - i * 0.02).toFixed(2)}*sin(2*PI*${f}*t)*(0.6+0.4*sin(2*PI*${(0.07 + i * 0.05).toFixed(2)}*t))`).join('+');
  const schnitte = [];
  let t = 0;
  for (let i = 0; i < dauern.length - 1; i++) { t += dauern[i] - (i === 0 ? 0 : blende); schnitte.push(Number((t - blende).toFixed(2))); }
  const whoosh = schnitte.map((z) => `if(between(t,${Math.max(z - 0.5, 0).toFixed(2)},${(z + 0.4).toFixed(2)}),0.25*(random(0)*2-1)*sin(PI*(t-${Math.max(z - 0.5, 0).toFixed(2)})/0.9),0)`);
  const boom = '0.7*sin(2*PI*(38+60*exp(-8*t))*t)*exp(-2.5*t)';
  // Impact-Presets: an jedem Schnitt ein Bass-Treffer + metallisches Klingen (Schwertschlag).
  const treffer = krass || PRESETS[presetVon(preset)].impact ? schnitte.map((z) => {
    const a = (z + blende / 2).toFixed(2);
    return `if(gte(t,${a}),(0.6*sin(2*PI*(40+70*exp(-9*(t-${a})))*(t-${a}))+0.12*sin(2*PI*3150*(t-${a}))+0.08*sin(2*PI*4720*(t-${a})))*exp(-4*(t-${a})),0)`;
  }) : [];
  // Krass + Grusel: Herzschlag (Doppelschlag, 72 bpm), der zum Ende hin lauter wird.
  const lang = dauern.reduce((a, b) => a + b, 0) || 1;
  const herz = krass && PRESETS[presetVon(preset)].ton === 'grusel'
    ? [`(0.18+0.25*t/${lang.toFixed(2)})*(exp(-28*mod(t,0.83))+0.7*exp(-28*mod(t-0.22,0.83)))*sin(2*PI*52*t)`] : [];
  return [drone, boom, ...whoosh, ...treffer, ...herz].join('+');
}
