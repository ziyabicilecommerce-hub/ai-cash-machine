// Klangwelten fuer die Marathon-Fabrik (#97): Schlaf-, Entspannungs- und Fokus-Videos.
// Der Klang wird komplett mit ffmpeg erzeugt (gefiltertes Rauschen, langsame Wellen,
// Klangflaechen) - kostenlos, ohne Key, ohne Lizenzfragen. Ohne Sprache, daher weltweit.

// Titel in 8 Sprachen, damit die Beschreibung international gefunden wird.
export const KLANGWELTEN = {
  regen: {
    bilder: ['rain drops on a window at night, cozy warm room light, bokeh city lights', 'rainy forest path with lush green moss and soft fog', 'cozy cabin porch in heavy rain, warm lantern light', 'rain over a quiet japanese street at night, neon reflections on wet asphalt', 'rain on a lake with mountains in mist', 'window seat with blanket and tea, rain outside, soft light'],
    titel: { de: 'Regengeräusche zum Einschlafen', en: 'Rain Sounds for Sleeping', es: 'Sonido de lluvia para dormir', fr: 'Bruit de pluie pour dormir', pt: 'Som de chuva para dormir', ja: '睡眠用の雨の音', ar: 'صوت المطر للنوم', hi: 'सोने के लिए बारिश की आवाज़' },
  },
  meer: {
    bilder: ['calm ocean waves on a sandy beach at sunset, golden light', 'turquoise sea waves on white sand, tropical island', 'moonlit ocean at night, gentle waves, stars', 'rocky coastline with soft waves, blue hour', 'aerial view of gentle waves on an empty beach', 'lighthouse by a calm sea at dusk'],
    titel: { de: 'Meeresrauschen zum Entspannen', en: 'Ocean Waves for Relaxation', es: 'Olas del mar para relajarse', fr: 'Vagues de l’océan pour se détendre', pt: 'Ondas do mar para relaxar', ja: 'リラックスのための波の音', ar: 'أمواج البحر للاسترخاء', hi: 'आराम के लिए समुद्र की लहरें' },
  },
  wald: {
    bilder: ['sunbeams through a misty green forest, peaceful', 'mossy stream in an ancient forest, soft light', 'autumn forest with golden leaves, calm', 'pine forest in fog at dawn', 'bamboo forest with soft wind and light rays', 'meadow at the edge of a forest, gentle breeze, flowers'],
    titel: { de: 'Wald und Wind zum Entspannen', en: 'Forest Wind Ambience', es: 'Viento en el bosque para relajarse', fr: 'Vent en forêt pour se détendre', pt: 'Vento na floresta para relaxar', ja: '森の風の環境音', ar: 'صوت الرياح في الغابة للاسترخاء', hi: 'जंगल की हवा की आवाज़' },
  },
  kamin: {
    bilder: ['cozy fireplace with crackling fire, warm living room, night', 'cabin interior with fireplace, snow outside the window', 'close up of glowing fireplace flames and embers', 'reading nook by a fireplace, blanket and books, warm light', 'rustic stone fireplace in a mountain lodge, winter evening', 'candles and fireplace, calm christmas evening'],
    titel: { de: 'Kaminfeuer zum Entspannen', en: 'Cozy Fireplace Ambience', es: 'Chimenea acogedora para relajarse', fr: 'Feu de cheminée relaxant', pt: 'Lareira aconchegante para relaxar', ja: '暖炉の焚き火の音', ar: 'صوت المدفأة للاسترخاء', hi: 'आरामदायक अंगीठी की आवाज़' },
  },
  weltraum: {
    bilder: ['colorful nebula in deep space, stars, cinematic', 'earth from orbit at night with city lights and aurora', 'distant galaxy with glowing stars, calm', 'planet with rings over a starry sky', 'milky way over a quiet desert at night', 'astronaut floating peacefully above earth, soft light'],
    titel: { de: 'Weltraum-Klänge zum Einschlafen', en: 'Deep Space Sleep Ambience', es: 'Sonidos del espacio para dormir', fr: 'Sons de l’espace pour dormir', pt: 'Sons do espaço para dormir', ja: '睡眠用の宇宙の環境音', ar: 'أصوات الفضاء للنوم', hi: 'सोने के लिए अंतरिक्ष की आवाज़ें' },
  },
  rauschen: {
    bilder: ['night sky full of stars over calm hills, peaceful', 'full moon over a quiet lake, soft blue light', 'soft clouds at night lit by the moon', 'sleeping village under a starry sky, winter', 'calm aurora borealis over snowy mountains', 'dreamy pastel night sky with gentle clouds'],
    titel: { de: 'Braunes Rauschen zum Schlafen', en: 'Brown Noise for Sleep', es: 'Ruido marrón para dormir', fr: 'Bruit brun pour dormir', pt: 'Ruído marrom para dormir', ja: '睡眠用ブラウンノイズ', ar: 'الضوضاء البنية للنوم', hi: 'सोने के लिए ब्राउन नॉइज़' },
  },
  fokus: {
    bilder: ['cozy study desk by a window at night, lamp, plants, anime style', 'library with warm light and rain outside, calm', 'minimal workspace with laptop and coffee, sunrise light', 'cafe corner with soft light, books and tea, rainy day', 'rooftop at dusk with city lights, calm atmosphere, anime style', 'japanese room with sliding doors open to a garden, soft light'],
    titel: { de: 'Fokus-Klänge zum Lernen und Arbeiten', en: 'Focus Ambience for Study and Work', es: 'Sonidos para concentrarse y estudiar', fr: 'Ambiance pour se concentrer et étudier', pt: 'Sons para foco e estudo', ja: '勉強と作業に集中する環境音', ar: 'أصوات للتركيز والدراسة', hi: 'पढ़ाई और काम के लिए फोकस साउंड' },
  },
};

const VARIANTEN = ['soft morning light', 'golden hour', 'blue hour', 'night', 'misty', 'after rain', 'winter', 'summer evening', 'wide angle', 'close up detail'];

// Liefert n abwechslungsreiche Bild-Prompts fuer eine Klangwelt.
export function bildPrompts(welt, n) {
  const basis = KLANGWELTEN[welt].bilder;
  return Array.from({ length: n }, (_, i) => `${basis[i % basis.length]}, ${VARIANTEN[(i * 7 + Math.floor(i / basis.length)) % VARIANTEN.length]}, ultra detailed, cinematic, calm, 4k wallpaper, no people, no text`);
}

// Klangflaeche aus langsamen Sinustoenen (wie in videoExtras, hier fuer Weltraum/Fokus).
const flaeche = (toene, d, pegel) => `aevalsrc='${toene.map((hz, i) => `${(0.05 - i * 0.008).toFixed(3)}*sin(2*PI*${hz}*t)*(0.55+0.45*sin(2*PI*${(0.03 + i * 0.013).toFixed(3)}*t+${i}))`).join('+')}':s=44100:d=${d},aformat=channel_layouts=stereo,volume=${pegel}`;
const rausch = (farbe, d, pegel, filter, seed) => `anoisesrc=d=${d}:c=${farbe}:r=44100:a=${pegel}:seed=${seed},aformat=channel_layouts=stereo${filter ? `,${filter}` : ''}`;

const GEWINN = { wald: 6, fokus: 12, weltraum: 2 };

// ffmpeg-filter_complex, das einen Klang von d Sekunden als [a] erzeugt.
export function klangFilter(welt, d, seed = 1) {
  // Angleichen auf rund -22 dB Durchschnitt, damit alle Welten gleich laut sind.
  const aus = `volume=${GEWINN[welt] || 0}dB,afade=t=in:d=3,afade=t=out:st=${Math.max(d - 3, 0)}:d=3,alimiter=limit=0.8[a]`;
  switch (welt) {
    case 'regen':
      return `${rausch('pink', d, 0.5, 'highpass=f=500,lowpass=f=9000', seed)}[r];${rausch('brown', d, 0.4, 'lowpass=f=250', seed + 1)}[b];[r][b]amix=inputs=2:normalize=0,${aus}`;
    case 'meer':
      return `${rausch('brown', d, 0.7, "lowpass=f=1100,volume='0.25+0.75*pow(sin(PI*t/9),2)':eval=frame", seed)}[w];${rausch('pink', d, 0.25, "highpass=f=1800,volume='0.1+0.9*pow(sin(PI*(t-1.2)/9),4)':eval=frame", seed + 1)}[g];[w][g]amix=inputs=2:normalize=0,${aus}`;
    case 'wald':
      return `${rausch('brown', d, 0.6, "bandpass=f=500:width_type=h:w=600,volume='0.35+0.65*pow(sin(PI*t/17),2)':eval=frame", seed)}[w];${rausch('pink', d, 0.08, 'highpass=f=3000', seed + 1)}[l];[w][l]amix=inputs=2:normalize=0,${aus}`;
    case 'kamin':
      return `${rausch('brown', d, 0.5, 'lowpass=f=450', seed)}[g];${rausch('velvet', d, 0.35, 'highpass=f=1200,lowpass=f=7000', seed + 1)}[k];[g][k]amix=inputs=2:normalize=0,${aus}`;
    case 'weltraum':
      return `${rausch('brown', d, 0.35, 'lowpass=f=160', seed)}[r];${flaeche([55, 82.41, 110, 164.81], d, 1.4)}[f];[r][f]amix=inputs=2:normalize=0,lowpass=f=2000,${aus}`;
    case 'fokus':
      return `${flaeche([130.81, 164.81, 196, 246.94], d, 1.3)}[f];${rausch('pink', d, 0.08, 'highpass=f=300,lowpass=f=6000', seed)}[r];[f][r]amix=inputs=2:normalize=0,aecho=0.8:0.6:600|1100:0.25|0.15,${aus}`;
    default:
      return `${rausch('brown', d, 0.6, 'lowpass=f=900', seed)},${aus}`;
  }
}

// Mehrsprachige Beschreibung fuer YouTube.
export function beschreibung(welt, stunden) {
  const t = KLANGWELTEN[welt].titel;
  const zeilen = Object.entries(t).map(([k, v]) => `${k.toUpperCase()}: ${v}`);
  return `${t.en} – ${stunden}h\n\n${zeilen.join('\n')}\n\nKostenlos erzeugte Klanglandschaft ohne Werbung, ohne Sprache. Free ambience, no talking, no ads.\n\n#sleep #relax #ambience #asmr #${welt} #${stunden}hours`;
}
