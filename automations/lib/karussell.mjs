// Karussell-Fabrik: aus den Premium-Ebenen eines Produktvideos (Hintergrund + Freisteller)
// entstehen 4 Bild-Slides im Instagram-Format 4:5 - Hook, zwei Vorteile, Preis + Call-to-Action.
// Text laeuft ueber .ass (libass), damit alle 50 Sprachen sauber dargestellt werden. Kostenlos, ohne Key.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assText, GROSS_OK } from './premium.mjs';

const B = 1080;
const H = 1350;
const pfadFuerFilter = (p) => resolve(p).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
const gross = (t, sprache) => { try { return GROSS_OK.test(t) ? t.toLocaleUpperCase(sprache) : t; } catch { return t; } };
const zeile = (stil, text, tags = '') => `Dialogue: 0,0:00:00.00,0:00:05.00,${stil},,0,0,0,,${tags}${assText(text)}`;

function assSchreiben(datei, thema, events) {
  const g = 64;
  writeFileSync(datei, [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${B}`, `PlayResY: ${H}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Titel,DejaVu Sans,${Math.round(g * 1.15)},${thema.text},${thema.text},${thema.box},&H64000000,-1,0,0,0,100,100,0,0,3,${Math.round(g * 0.3)},0,8,70,70,70,1`,
    `Style: Text,DejaVu Sans,${g},&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,-1,0,0,0,100,100,1,0,1,6,3,2,80,80,120,1`,
    `Style: Preis,DejaVu Sans,${Math.round(g * 1.4)},${thema.text},${thema.text},${thema.box},&H64000000,-1,0,0,0,100,100,0,-7,3,${Math.round(g * 0.3)},0,5,0,0,0,1`,
    `Style: Klein,DejaVu Sans,${Math.round(g * 0.55)},&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,-1,0,0,0,100,100,2,0,1,4,0,2,70,70,50,1`,
    `Style: Zaehler,DejaVu Sans,${Math.round(g * 0.5)},&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,-1,0,0,0,100,100,1,0,1,4,0,9,50,50,50,1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
  ].join('\n') + '\n');
}

// ebenen: {bgP, fgP} aus ebenenVorbereiten (Hochformat); texte: {hook, vorteile: [..], cta, preis, shop}.
export function karussellBauen({ ebenen, texte, thema, sprache, ordner }) {
  const { hook, vorteile = [], cta = '', preis = '', shop = '' } = texte;
  const slides = [
    [zeile('Titel', gross(hook, sprache))],
    ...vorteile.slice(0, 2).map((v) => [zeile('Text', v)]),
    [...(preis ? [zeile('Preis', preis, `{\\pos(${Math.round(B * 0.7)},${Math.round(H * 0.13)})}`)] : []), zeile('Text', cta), ...(shop ? [zeile('Klein', shop)] : [])],
  ].filter((s) => s.length);
  const graph = (ass) => `[0:v]crop=${B}:${H}[bg];` +
    (ebenen.fgP ? `[1:v]scale=${Math.round(B * 0.82)}:${Math.round(H * 0.56)}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=x=(W-w)/2:y=(H-h)/2-H*0.02,` : '[bg]') +
    `ass='${pfadFuerFilter(ass)}'`;
  return slides.map((events, i) => {
    const ass = join(ordner, `k${i + 1}.ass`);
    const ziel = join(ordner, `k${i + 1}.jpg`);
    assSchreiben(ass, thema, [...events, zeile('Zaehler', `${i + 1}/${slides.length}`)]);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', ebenen.bgP, ...(ebenen.fgP ? ['-i', ebenen.fgP] : []), '-filter_complex', graph(ass), '-frames:v', '1', '-q:v', '2', ziel], { stdio: 'pipe', timeout: 120000 });
    return ziel;
  });
}
