// Premium-Look fuer Produktvideos (#94, #96) - kostenlos, ohne Key, alles lokal:
// Wort-fuer-Wort-Untertitel (TikTok-Stil, .ass ueber libass), freigestelltes Produkt
// (rembg) vor einem KI-Hintergrund mit 2.5D-Parallaxe, Schatten, Farblook, Schaerfe,
// Filmkorn und Vignette. Faellt etwas aus (kein rembg, kein Hintergrund), gibt es
// automatisch die einfachere Variante - ein Video entsteht immer.
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ausfuehren = promisify(execFile);
const CACHE = resolve(process.env.PREMIUM_CACHE || 'out/premium-cache');
// isnet-general-use stellt Produkte deutlich sauberer frei als u2netp, ist aber groesser.
const REMBG_MODELL = process.env.PREMIUM_REMBG_MODELL || 'isnet-general-use';

export const premiumAn = () => !/^(0|nein|aus|false)$/i.test(String(process.env.VIDEO_PREMIUM || '').trim());
const hash = (x) => createHash('sha1').update(x).digest('hex').slice(0, 16);
const cache = (name) => { mkdirSync(CACHE, { recursive: true }); return join(CACHE, name); };
const pfadFuerFilter = (p) => resolve(p).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");

// Anteil sichtbarer Pixel im Alphakanal (0-1); -1, wenn es keinen gibt.
function deckung(png) {
  try {
    const out = execFileSync('ffmpeg', ['-v', 'error', '-i', png, '-vf', 'alphaextract,signalstats,metadata=print:file=-', '-f', 'null', '-'], { stdio: 'pipe', timeout: 60000 }).toString();
    const m = out.match(/signalstats\.YAVG=([\d.]+)/);
    return m ? Number(m[1]) / 255 : -1;
  } catch {
    return -1;
  }
}

// Schneidet den durchsichtigen Rand ab, damit das Produkt das Bild ausfuellt (plus etwas Luft).
function zuschneiden(png) {
  const log = spawnSync('ffmpeg', ['-v', 'info', '-i', png, '-vf', 'alphaextract,cropdetect=limit=0.06:round=2:reset=0:skip=0', '-f', 'null', '-'], { timeout: 60000 }).stderr?.toString() || '';
  const m = [...log.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].at(-1);
  if (!m) return;
  const [w, h, x, y] = m.slice(1).map(Number);
  // cropdetect schneidet weiche Kanten etwas zu knapp - daher erst auffuellen, dann grosszuegig schneiden.
  const rand = Math.round(Math.max(w, h) * 0.05) + 8;
  const tmp = `${png}.tmp.png`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', png, '-vf', `pad=iw+${rand * 2}:ih+${rand * 2}:${rand}:${rand}:color=black@0,crop=${w + rand * 2}:${h + rand * 2}:${x}:${y}`, '-frames:v', '1', tmp], { stdio: 'pipe', timeout: 60000 });
  renameSync(tmp, png);
}

// Stellt ein Produktfoto frei (PNG mit Transparenz). Ergebnis wird pro Foto gecacht, damit
// alle 50 Sprachversionen dasselbe Freisteller-Bild nutzen. false = hat nicht geklappt.
export async function freistellen(roh, ziel) {
  const id = hash(readFileSync(roh));
  const png = cache(`${id}.png`);
  const nein = cache(`${id}.nein`);
  if (existsSync(nein)) return false;
  if (!existsSync(png)) {
    try {
      await ausfuehren('rembg', ['i', '-m', REMBG_MODELL, roh, png], { timeout: 300000 });
    } catch {
      writeFileSync(nein, '');
      return false;
    }
    // Fast leer oder fast voll = Freistellen misslungen (z. B. Collage oder reines Muster).
    const d = deckung(png);
    if (d < 0.04 || d > 0.96) {
      writeFileSync(nein, String(d));
      return false;
    }
    try { zuschneiden(png); } catch { /* dann eben mit Rand */ }
  }
  copyFileSync(png, ziel);
  return true;
}

// KI-Hintergrund pro Produkt mit festem Seed: jede Sprache bekommt denselben Look.
export async function hintergrundHolen(h, ziel, { breite, hoehe, laden }) {
  if (!h?.prompt) return false;
  const datei = cache(`hg-${hash(`${h.prompt}|${h.seed}|${breite}x${hoehe}`)}.jpg`);
  if (!existsSync(datei)) {
    const prompt = `${h.prompt}, empty product photography set, soft studio light, shallow depth of field, premium commercial look, no people, no text, no logo`;
    if (!(await laden(prompt, datei, { breite, hoehe, seed: h.seed }))) return false;
  }
  copyFileSync(datei, ziel);
  return true;
}

// ---------- Wort-fuer-Wort-Untertitel ----------

const OHNE_LEERZEICHEN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const GROSS_OK = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{N}\p{P}\p{S}\p{Zs}\p{M}]*$/u;
const zuMs = (z) => { const [h, m, rest] = z.split(':'); const [s, ms] = rest.split(/[,.]/); return ((+h * 60 + +m) * 60 + +s) * 1000 + +ms; };
const assZeit = (ms) => {
  const cs = Math.max(0, Math.round(ms / 10));
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
const assText = (t) => t.replace(/\\/g, '/').replace(/[{}]/g, '');

// Zerlegt einen Satz in Woerter; Sprachen ohne Leerzeichen (Chinesisch, Japanisch, Thai ...)
// ueber Intl.Segmenter.
function woerter(text, sprache) {
  if (!OHNE_LEERZEICHEN.test(text)) return { liste: text.split(/\s+/).filter(Boolean), trenner: ' ' };
  try {
    const seg = new Intl.Segmenter(sprache, { granularity: 'word' });
    const liste = [];
    for (const { segment, isWordLike } of seg.segment(text)) {
      if (isWordLike || !liste.length) liste.push(segment);
      else liste[liste.length - 1] += segment;
    }
    return { liste: liste.map((w) => w.trim()).filter(Boolean), trenner: '' };
  } catch {
    return { liste: [...text], trenner: '' };
  }
}

// Gruppen zu max. 3 Woertern (bzw. ca. 8 Zeichen ohne Leerzeichen) - gut lesbar auf dem Handy.
function gruppieren(liste, trenner) {
  const gruppen = [];
  let g = [];
  for (const w of liste) {
    const laenge = g.join(trenner).length + w.length;
    if (g.length && (trenner ? g.length >= 3 || laenge > 18 : laenge > 8)) { gruppen.push(g); g = []; }
    g.push(w);
  }
  if (g.length) gruppen.push(g);
  return gruppen;
}

// Farbstile im Wechsel je Produkt (ASS-Farben sind &HBBGGRR): Akzent fuer das aktive Wort,
// Hook-Box und Preisschild. Abwechslung wirkt weniger nach Massenware.
const THEMEN = [
  { wort: '&H00E5FF&', box: '&H0000D5FF', text: '&H00101010' },
  { wort: '&H00FFE14D&', box: '&H00E0B000', text: '&H00FFFFFF' },
  { wort: '&H00B469FF&', box: '&H009A3DFF', text: '&H00FFFFFF' },
  { wort: '&H0066FF8A&', box: '&H0040D060', text: '&H00101010' },
  { wort: '&H003D8AFF&', box: '&H002060F0', text: '&H00FFFFFF' },
];
export const themaFuer = (seed) => THEMEN[Math.abs(Number(seed) || 0) % THEMEN.length];

// Preis in Landesschreibweise, z. B. "29,95 €" / "€29.95".
export function preisText(preis, sprache, waehrung = 'EUR') {
  const n = Number(preis);
  if (!Number.isFinite(n) || n <= 0) return '';
  for (const loc of [sprache, 'en']) {
    try { return new Intl.NumberFormat(loc, { style: 'currency', currency: waehrung }).format(n); } catch { /* naechste */ }
  }
  return '';
}

// Baut aus der .srt von edge-tts eine .ass, in der das gerade gesprochene Wort aufleuchtet.
// Zeiten je Wort werden nach Zeichenlaenge verteilt. Optional: hook (grosse Schlagzeile oben,
// klappt anders als drawtext in allen Schriften), preis + shop (Endkarte der letzten Szene).
export function assAusSrt(srt, ass, { breite, hoehe, sprache = 'de', thema = THEMEN[0], hook = '', preis = '', shop = '' }) {
  const groesse = Math.round(Math.min(breite, hoehe) * 0.078);
  const unten = Math.round(hoehe * (hoehe > breite ? 0.25 : 0.09));
  const rand = Math.round(breite * 0.06);
  const kopf = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${breite}`, `PlayResY: ${hoehe}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Wort,DejaVu Sans,${groesse},&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,-1,0,0,0,100,100,1,0,1,${Math.round(groesse * 0.1)},${Math.round(groesse * 0.05)},2,${rand},${rand},${unten},1`,
    `Style: Hook,DejaVu Sans,${Math.round(groesse * 0.95)},${thema.text},${thema.text},${thema.box},&H64000000,-1,0,0,0,100,100,0,0,3,${Math.round(groesse * 0.28)},0,8,${rand},${rand},${Math.round(hoehe * 0.1)},1`,
    `Style: Preis,DejaVu Sans,${Math.round(groesse * 1.25)},${thema.text},${thema.text},${thema.box},&H64000000,-1,0,0,0,100,100,0,-7,3,${Math.round(groesse * 0.3)},0,5,0,0,0,1`,
    `Style: Shop,DejaVu Sans,${Math.round(groesse * 0.55)},&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,-1,0,0,0,100,100,2,0,1,${Math.round(groesse * 0.08)},0,2,${rand},${rand},${Math.round(hoehe * 0.05)},1`,
    '', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];
  const zeilen = [];
  const roh = readFileSync(srt, 'utf8').replace(/\r/g, '');
  for (const block of roh.split(/\n\n+/)) {
    const m = block.match(/(\d\d:\d\d:\d\d[,.]\d{3}) --> (\d\d:\d\d:\d\d[,.]\d{3})\n([\s\S]+)/);
    if (!m) continue;
    let text = m[3].replace(/\s+/g, ' ').trim();
    if (GROSS_OK.test(text)) text = text.toLocaleUpperCase(sprache);
    const { liste, trenner } = woerter(text, sprache);
    if (!liste.length) continue;
    const start = zuMs(m[1]);
    const ende = Math.max(zuMs(m[2]), start + 200);
    const gewicht = liste.map((w) => w.length + 2);
    const summe = gewicht.reduce((a, b) => a + b, 0);
    let t = start;
    const zeiten = gewicht.map((g) => { const von = t; t += ((ende - start) * g) / summe; return [von, t]; });
    let n = 0;
    for (const gruppe of gruppieren(liste, trenner)) {
      gruppe.forEach((_, k) => {
        const [von, bis] = zeiten[n + k];
        const inhalt = gruppe.map((w, j) => (j === k ? `{\\c${thema.wort}\\fscx112\\fscy112}${assText(w)}{\\r}` : assText(w))).join(trenner);
        zeilen.push(`Dialogue: 0,${assZeit(von)},${assZeit(bis)},Wort,,0,0,0,,${k === 0 ? '{\\fad(70,0)}' : ''}${inhalt}`);
      });
      n += gruppe.length;
    }
  }
  const pop = '{\\fscx40\\fscy40\\t(0,180,\\fscx108\\fscy108)\\t(180,260,\\fscx100\\fscy100)}';
  if (hook) {
    const h = GROSS_OK.test(hook) ? hook.toLocaleUpperCase(sprache) : hook;
    zeilen.push(`Dialogue: 1,${assZeit(0)},${assZeit(3300)},Hook,,0,0,0,,{\\fad(0,300)}${pop}${assText(h)}`);
  }
  if (preis) zeilen.push(`Dialogue: 2,${assZeit(350)},${assZeit(600000)},Preis,,0,0,0,,{\\pos(${Math.round(breite * 0.72)},${Math.round(hoehe * 0.2)})}${pop}${assText(preis)}`);
  if (shop) zeilen.push(`Dialogue: 1,${assZeit(200)},${assZeit(600000)},Shop,,0,0,0,,{\\fad(300,0)}${assText(shop)}`);
  writeFileSync(ass, [...kopf, ...zeilen].join('\n') + '\n');
  return zeilen.length;
}

// ---------- 2.5D-Szene ----------

const gerade = (x) => Math.round(x / 2) * 2;
const LOOK = 'eq=contrast=1.07:saturation=1.14:gamma=0.98,unsharp=5:5:0.55:5:5:0';
const ffmpegBild = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'pipe', timeout: 120000 });

// Bereitet die zwei Ebenen einmal vor (statt in jedem Frame neu zu rechnen):
// Hintergrund 16 % groesser fuer den Schwenk, mit Tiefenunschaerfe, Farblook und Vignette;
// Produkt auf Zielgroesse, geschaerft, mit weichem Schlagschatten (PNG mit Transparenz).
// Das Filmkorn liegt fest im Hintergrund - Korn pro Frame wuerde das Rendern ~60 % langsamer machen.
export function ebenenVorbereiten({ hg, vg, breite, hoehe, basis }) {
  const [bw, bh] = [gerade(breite * 1.16), gerade(hoehe * 1.16)];
  const bgP = `${basis}.bg.jpg`;
  ffmpegBild(['-i', hg, '-vf', `scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh}${vg ? ',gblur=sigma=4,eq=brightness=-0.05' : ''},${LOOK},vignette=PI/4.2,noise=alls=4:allf=u`, '-frames:v', '1', '-q:v', '2', bgP]);
  if (!vg) return { bgP, fgP: '' };
  const fgP = `${basis}.fg.png`;
  ffmpegBild(['-i', vg, '-filter_complex',
    `[0:v]format=rgba,scale=${Math.round(breite * 0.8)}:${Math.round(hoehe * 0.5)}:force_original_aspect_ratio=decrease,${LOOK},format=rgba,pad=iw+140:ih+140:70:70:color=black@0,split[f1][f2];` +
    '[f2]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.6,boxblur=luma_radius=26:luma_power=2:alpha_radius=26:alpha_power=2[sh];[sh][f1]overlay=x=-16:y=-34:format=rgb,format=rgba',
    '-frames:v', '1', fgP]);
  return { bgP, fgP };
}

// Standbild (Vorschaubild): Mitte des Hintergrunds plus Produkt.
export function premiumStandbild({ bgP, fgP, ziel, breite, hoehe }) {
  const graph = `[0:v]crop=${breite}:${hoehe}${fgP ? `[bg];[bg][1:v]overlay=x=(W-w)/2:y=(H-h)/2-H*0.05` : ''}`;
  ffmpegBild(['-i', bgP, ...(fgP ? ['-i', fgP] : []), '-filter_complex', graph, '-frames:v', '1', '-q:v', '2', ziel]);
}

// Eine Szene: Hintergrund schwenkt in die eine Richtung, Produkt schwebt leicht gegenlaeufig
// (Parallaxe), Blitz-Uebergang, Wort-Untertitel. extra = zusaetzliche Filter (Hook).
export async function premiumSzene({ bgP, fgP, mp3, ass, ziel, breite, hoehe, dauer, index, extra = [] }) {
  const D = dauer.toFixed(2);
  const r = index % 2 ? `(t/${D})` : `(1-t/${D})`;
  const bg = `[0:v]crop=${breite}:${hoehe}:x='(iw-ow)*${r}':y='(ih-oh)*(0.5+0.35*sin(t*0.45+${index}))'`;
  const graph = fgP
    ? `${bg}[bg];[bg][1:v]overlay=x=(W-w)/2-W*0.018*(${r}-0.5):y=(H-h)/2-H*0.05+H*0.012*sin(t*1.7+${index})`
    : bg;
  const ende = [
    index === 0 ? 'fade=in:st=0:d=0.25' : 'fade=in:st=0:d=0.14:color=white',
    `fade=out:st=${Math.max(dauer - 0.18, 0).toFixed(2)}:d=0.18`,
    ...extra,
    `ass='${pfadFuerFilter(ass)}'`,
  ].join(',');
  const eingaben = ['-loop', '1', '-framerate', '30', '-i', bgP, ...(fgP ? ['-loop', '1', '-framerate', '30', '-i', fgP] : [])];
  await ausfuehren('ffmpeg', [
    '-loglevel', 'error', '-y', ...eingaben, '-i', mp3,
    '-filter_complex', `${graph},${ende}[v]`,
    '-map', '[v]', '-map', `${fgP ? 2 : 1}:a`, '-t', D,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', '-af', 'apad',
    ziel,
  ], { timeout: 600000, maxBuffer: 16 * 1024 * 1024 });
}
