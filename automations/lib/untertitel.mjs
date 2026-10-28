// Große virale Untertitel (TikTok-Story-Stil): dicke, mittige Großbuchstaben, ein Schlüsselwort gelb.
// Baut aus der edge-tts-SRT eine ASS-Datei mit voller Kontrolle über Schrift, Farbe und Position.
// Rein funktional, ohne Netz - testbar.

// SRT -> Cues [{ start, ende, text }] (Zeiten in Sekunden).
export function srtCues(srt) {
  const cues = [];
  const bloecke = String(srt || '').replace(/\r/g, '').trim().split(/\n\n+/);
  for (const b of bloecke) {
    const zeilen = b.split('\n');
    const zeit = zeilen.find((z) => z.includes('-->'));
    if (!zeit) continue;
    const [a, e] = zeit.split('-->').map((x) => sekunden(x.trim()));
    const text = zeilen.slice(zeilen.indexOf(zeit) + 1).join(' ').replace(/\s+/g, ' ').trim();
    if (text && e > a) cues.push({ start: a, ende: e, text });
  }
  return cues;
}

const sekunden = (t) => {
  const m = t.match(/(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/);
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
};

const assZeit = (s) => {
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sek = (s % 60);
  return `${h}:${String(m).padStart(2, '0')}:${sek.toFixed(2).padStart(5, '0')}`;
};

// Schlüsselwort = längstes Wort (nur Buchstaben), das gelb wird. Keine Stoppwörter.
const STOPP = new Set(['und', 'oder', 'aber', 'denn', 'dass', 'weil', 'dann', 'doch', 'noch', 'nur', 'auch', 'sich', 'eine', 'einen', 'einem', 'eines', 'der', 'die', 'das', 'den', 'dem', 'des', 'ist', 'sind', 'war', 'wird', 'hat', 'haben', 'mit', 'von', 'für', 'auf', 'aus', 'bei', 'ins', 'ein', 'the', 'and', 'you', 'your', 'are', 'was', 'his', 'her']);
export function schluessel(worte) {
  let best = '';
  for (const w of worte) {
    const rein = w.replace(/[^\p{L}]/gu, '');
    if (rein.length >= 4 && !STOPP.has(rein.toLowerCase()) && rein.length > best.replace(/[^\p{L}]/gu, '').length) best = w;
  }
  return best;
}

const GELB = '&H0022FFFF&'; // ASS &HAABBGGRR -> kräftiges Gelb
const WEISS = '&H00FFFFFF&';
const esc = (t) => t.replace(/[{}\\]/g, '').replace(/\n/g, ' ');

// Eine Dialog-Zeile: ganzer Text groß in Weiß, das Schlüsselwort gelb.
export function dialogZeile(cue) {
  const worte = esc(cue.text).toUpperCase().split(/\s+/).filter(Boolean);
  const key = schluessel(worte);
  const text = worte.map((w) => (w === key && key ? `{\\c${GELB}}${w}{\\c${WEISS}}` : w)).join(' ');
  return `Dialogue: 0,${assZeit(cue.start)},${assZeit(cue.ende)},Gross,,0,0,0,,${text}`;
}

// Komplette ASS-Datei. breite/hoehe = Videoformat; die Schrift skaliert damit.
export function assGross(srt, { breite = 1080, hoehe = 1920 } = {}) {
  const cues = srtCues(srt);
  const fontsize = Math.round(hoehe / 20);     // ~96 bei 1920
  const outline = Math.round(hoehe / 320);     // dicker schwarzer Rand
  const marginV = Math.round(hoehe * 0.3);     // etwas über der Mitte
  const kopf = `[Script Info]
ScriptType: v4.00+
PlayResX: ${breite}
PlayResY: ${hoehe}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Gross,DejaVu Sans,${fontsize},${WEISS},${WEISS},&H00000000,&H64000000,1,0,0,0,100,100,0,0,1,${outline},2,2,90,90,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;
  return [kopf, ...cues.map(dialogZeile)].join('\n') + '\n';
}
