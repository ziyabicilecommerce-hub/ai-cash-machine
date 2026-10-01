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
import { kameraFilter, glitchFilter, wischFilter } from './effekte.mjs';

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

// Kulissen im Wechsel je Produkt (per Seed), damit nicht jeder Hintergrund gleich aussieht.
const SETS = [
  'white marble countertop, bright airy minimal',
  'raw concrete pedestal, moody dark studio, rim light',
  'soft linen fabric in warm sunlight',
  'pastel color backdrop with soft geometric shadows',
  'modern desk setup with green plants, blurred',
  'spa bathroom shelf, calm neutral tones',
  'outdoor wooden deck at golden hour, bokeh',
  'terrazzo surface, editorial magazine style',
  'gradient backdrop in deep blue and purple, neon glow',
  'cozy living room with warm lamp light, blurred',
];

// KI-Hintergrund pro Produkt mit festem Seed: jede Sprache bekommt denselben Look.
export async function hintergrundHolen(h, ziel, { breite, hoehe, laden }) {
  if (!h?.prompt) return false;
  const datei = cache(`hg-${hash(`${h.prompt}|${h.seed}|${breite}x${hoehe}`)}.jpg`);
  if (!existsSync(datei)) {
    const prompt = `${h.prompt}, ${SETS[Math.abs(Number(h.seed) || 0) % SETS.length]}, empty product photography set, soft studio light, shallow depth of field, premium commercial look, no people, no text, no logo`;
    if (!(await laden(prompt, datei, { breite, hoehe, seed: h.seed, enhance: true }))) return false;
  }
  copyFileSync(datei, ziel);
  return true;
}

// ---------- Wort-fuer-Wort-Untertitel ----------

const OHNE_LEERZEICHEN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
export const GROSS_OK = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{N}\p{P}\p{S}\p{Zs}\p{M}]*$/u;
const zuMs = (z) => { const [h, m, rest] = z.split(':'); const [s, ms] = rest.split(/[,.]/); return ((+h * 60 + +m) * 60 + +s) * 1000 + +ms; };
const assZeit = (ms) => {
  const cs = Math.max(0, Math.round(ms / 10));
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
export const assText = (t) => t.replace(/\\/g, '/').replace(/[{}]/g, '');

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
// untertitelStil: 'karaoke' (aktives Wort leuchtet in der Akzentfarbe) oder 'box' (TikTok-Stil:
// aktives Wort in einer farbigen Box).
export function assAusSrt(srt, ass, { breite, hoehe, sprache = 'de', thema = THEMEN[0], hook = '', hinweis = '', preis = '', shop = '', fortschritt = null, marke = '', rang = 0, untertitelStil = 'karaoke' }) {
  const groesse = Math.round(Math.min(breite, hoehe) * 0.078);
  const unten = Math.round(hoehe * (hoehe > breite ? 0.25 : 0.09));
  const rand = Math.round(breite * 0.06);
  const kopf = [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${breite}`, `PlayResY: ${hoehe}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Wort,DejaVu Sans,${groesse},&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,-1,0,0,0,100,100,1,0,1,${Math.round(groesse * 0.1)},${Math.round(groesse * 0.05)},2,${rand},${rand},${unten},1`,
    `Style: WortBox,DejaVu Sans,${groesse},${thema.text},${thema.text},${thema.box},${thema.box},-1,0,0,0,100,100,1,0,3,${Math.round(groesse * 0.16)},0,2,${rand},${rand},${unten},1`,
    `Style: Hook,DejaVu Sans,${Math.round(groesse * 1.12)},${thema.text},${thema.text},${thema.box},&H64000000,-1,0,0,0,100,100,0,0,3,${Math.round(groesse * 0.28)},0,8,${rand},${rand},${Math.round(hoehe * 0.1)},1`,
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
      // Sehr lange Woerter (z. B. "LATEX-WIDERSTANDSRING") passen sonst nicht in die Bildbreite: verkleinern.
      const f = Math.min(1, (breite > hoehe ? 26 : 13) / Math.max(...gruppe.map((w) => [...w].length)));
      const sk = (x) => Math.round(x * f);
      gruppe.forEach((_, k) => {
        const [von, bis] = zeiten[n + k];
        const pop = `\\fscx${sk(128)}\\fscy${sk(128)}\\t(0,110,\\fscx${sk(112)}\\fscy${sk(112)})`;
        const normal = `\\fscx${sk(100)}\\fscy${sk(100)}`;
        const vorne = `${k === 0 ? '{\\fad(70,0)}' : ''}${f < 1 ? `{${normal}}` : ''}`;
        if (untertitelStil === 'box') {
          // Zwei deckungsgleiche Ebenen: unten nur die Box des aktiven Worts, oben der Text ohne das aktive Wort.
          const boxZeile = gruppe.map((w, j) => (j === k ? `{\\alpha&H00&${pop}}${assText(w)}{\\alpha&HFF&${normal}}` : assText(w))).join(trenner);
          const textZeile = gruppe.map((w, j) => (j === k ? `{\\alpha&HFF&${pop}}${assText(w)}{\\alpha&H00&${normal}}` : assText(w))).join(trenner);
          zeilen.push(`Dialogue: 0,${assZeit(von)},${assZeit(bis)},WortBox,,0,0,0,,${vorne}{\\alpha&HFF&}${boxZeile}`);
          zeilen.push(`Dialogue: 1,${assZeit(von)},${assZeit(bis)},Wort,,0,0,0,,${vorne}${textZeile}`);
        } else {
          const inhalt = gruppe.map((w, j) => (j === k ? `{\\c${thema.wort}${pop}}${assText(w)}{\\r${f < 1 ? normal : ''}}` : assText(w))).join(trenner);
          zeilen.push(`Dialogue: 0,${assZeit(von)},${assZeit(bis)},Wort,,0,0,0,,${vorne}${inhalt}`);
        }
      });
      n += gruppe.length;
    }
  }
  const pop = '{\\fscx40\\fscy40\\t(0,180,\\fscx108\\fscy108)\\t(180,260,\\fscx100\\fscy100)}';
  if (hook) {
    const h = GROSS_OK.test(hook) ? hook.toLocaleUpperCase(sprache) : hook;
    // Hook steht ab Bild 1 (kein Einblenden), knallt von 150 % auf 92 % (Aufprall) -> 100 % und pumpt
    // bei 1,2 s noch einmal, damit das Auge oben bleibt.
    const slam = '{\\fscx150\\fscy150\\frz-4\\t(0,120,\\fscx92\\fscy92\\frz0)\\t(120,200,\\fscx100\\fscy100)\\t(1200,1300,\\fscx108\\fscy108)\\t(1300,1420,\\fscx100\\fscy100)}';
    zeilen.push(`Dialogue: 1,${assZeit(0)},${assZeit(3300)},Hook,,0,0,0,,{\\fad(0,300)}${slam}${assText(h)}`);
  }
  // Ehrliche Kennzeichnung (z. B. "KI-Beispiel" bei der Anwendungs-Szene): klein, oben rechts, die ganze Szene.
  if (hinweis) zeilen.push(`Dialogue: 2,${assZeit(0)},${assZeit(600000)},Shop,,0,0,0,,{\\an9\\pos(${Math.round(breite * 0.955)},${Math.round(hoehe * 0.03)})\\1a&H30&}${assText(hinweis)}`);
  // Rang-Badge fuer Countdown-Videos (Top 5): gross, schraeg, links oben.
  if (rang) zeilen.push(`Dialogue: 2,${assZeit(150)},${assZeit(600000)},Preis,,0,0,0,,{\\pos(${Math.round(breite * 0.22)},${Math.round(hoehe * 0.19)})\\fs${Math.round(Math.min(breite, hoehe) * 0.16)}\\frz8}${pop}#${rang}`);
  if (preis) zeilen.push(`Dialogue: 2,${assZeit(350)},${assZeit(600000)},Preis,,0,0,0,,{\\pos(${Math.round(breite * 0.7)},${Math.round(hoehe * 0.1)})}${pop}${assText(preis)}`);
  // Fortschrittsbalken oben (wie bei TikTok): waechst ueber das ganze Video, je Szene ein Stueck.
  if (fortschritt) {
    const hBalken = Math.max(8, Math.round(hoehe * 0.006));
    const [x1, x2] = [fortschritt.von, fortschritt.bis].map((a) => Math.round(breite * Math.min(1, Math.max(0, a))));
    const form = `m 0 0 l ${breite} 0 ${breite} ${hBalken} 0 ${hBalken}`;
    const bis = assZeit(fortschritt.dauerMs);
    zeilen.push(`Dialogue: 3,${assZeit(0)},${bis},Wort,,0,0,0,,{\\an7\\pos(0,0)\\bord0\\shad0\\1c&HFFFFFF&\\1a&HB0&\\p1}${form}`);
    zeilen.push(`Dialogue: 4,${assZeit(0)},${bis},Wort,,0,0,0,,{\\an7\\pos(0,0)\\bord0\\shad0\\1c${thema.wort}\\clip(0,0,${x1},${hBalken})\\t(0,${Math.round(fortschritt.dauerMs)},\\clip(0,0,${x2},${hBalken}))\\p1}${form}`);
  }
  // Marken-Wasserzeichen oben links (dezent, ganze Szene) - staerkt die Wiedererkennung.
  if (marke) zeilen.push(`Dialogue: 2,${assZeit(0)},${assZeit(600000)},Shop,,0,0,0,,{\\an7\\pos(${Math.round(breite * 0.045)},${Math.round(hoehe * 0.03)})\\1a&H50&\\3a&H80&\\fsp4}${assText(marke)}`);
  if (shop) zeilen.push(`Dialogue: 1,${assZeit(200)},${assZeit(600000)},Shop,,0,0,0,,{\\fad(300,0)}${assText(shop)}`);
  writeFileSync(ass, [...kopf, ...zeilen].join('\n') + '\n');
  return zeilen.length;
}

// ---------- 2.5D-Szene ----------

const gerade = (x) => Math.round(x / 2) * 2;
// Oberkante der Produkt-Ebene: Produkt (ohne Spiegelung) sitzt leicht ueber der Bildmitte.
export const PRODUKT_Y = '(H-((h-140)/1.45+140))/2-H*0.05';
const LOOK = 'eq=contrast=1.07:saturation=1.14:gamma=0.98,unsharp=5:5:0.55:5:5:0';
const ffmpegBild = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'pipe', timeout: 120000 });

// Bereitet die zwei Ebenen einmal vor (statt in jedem Frame neu zu rechnen):
// Hintergrund 16 % groesser fuer den Schwenk, mit Tiefenunschaerfe, Farblook und Vignette;
// Produkt auf Zielgroesse, geschaerft, mit weichem Schlagschatten (PNG mit Transparenz).
// Das Filmkorn liegt fest im Hintergrund - Korn pro Frame wuerde das Rendern ~60 % langsamer machen.
export function ebenenVorbereiten({ hg, vg, breite, hoehe, basis }) {
  const [bw, bh] = [gerade(breite * 1.16), gerade(hoehe * 1.16)];
  const bgP = `${basis}.bg.jpg`;
  // Mit Produkt: Spotlight hinter dem Produkt (weicher, heller Lichtkegel) - trennt es vom Hintergrund.
  const spot = `[s]geq=r=255:g=246:b=230:a='105*exp(-(pow(X-W/2,2)/pow(W*0.34,2)+pow(Y-H*0.4,2)/pow(H*0.24,2)))',scale=${bw}:${bh}:flags=bicubic[sp];[b][sp]overlay=format=rgb`;
  ffmpegBild(['-i', hg, ...(vg ? ['-f', 'lavfi', '-i', `color=black:s=${gerade(bw / 4)}x${gerade(bh / 4)},format=rgba`] : []), '-filter_complex',
    `[0:v]scale=${bw}:${bh}:force_original_aspect_ratio=increase:flags=lanczos,crop=${bw}:${bh}${vg ? ',gblur=sigma=4,eq=brightness=-0.05[b];[1:v]format=rgba[s];' + spot : ''},${LOOK},vignette=PI/4.2,noise=alls=4:allf=u`,
    '-frames:v', '1', '-q:v', '2', bgP]);
  if (!vg) return { bgP, fgP: '' };
  const fgP = `${basis}.fg.png`;
  // Farbanpassung: das Produkt nimmt leicht die Lichtfarbe des Hintergrunds an (wirkt echt fotografiert).
  let tint = '';
  try {
    const [r, g, b] = execFileSync('ffmpeg', ['-v', 'error', '-i', bgP, '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { timeout: 30000 });
    const m = (r + g + b) / 3 || 1;
    const f = (c) => Math.min(1.1, Math.max(0.85, 0.9 + 0.1 * (c / m))).toFixed(3);
    tint = `colorchannelmixer=rr=${f(r)}:gg=${f(g)}:bb=${f(b)},`;
  } catch { /* ohne Farbanpassung */ }
  // Studio-Look: weicher Schlagschatten, Kontaktschatten direkt unter dem Produkt und eine
  // leichte Spiegelung auf der Flaeche (wie bei Apple-Produktfotos). Die Leinwand ist 45 % hoeher
  // als das Produkt, damit die Spiegelung Platz hat (siehe PRODUKT_Y).
  const blur = (r) => `boxblur=luma_radius=${r}:luma_power=2:alpha_radius=${r}:alpha_power=2`;
  ffmpegBild(['-i', vg, '-filter_complex',
    `[0:v]format=rgba,scale=${Math.round(breite * 0.8)}:${Math.round(hoehe * 0.5)}:force_original_aspect_ratio=decrease:flags=lanczos,${tint}${LOOK},cas=0.5,format=rgba,split=6[p][pc][d0][s0][r0][h0];` +
    // Lichthalo: weiches, warmes Leuchten rund um die Produktkante (Rim-Light wie im Studio).
    `[h0]pad=iw+140:ih+140:70:70:color=black@0,lutrgb=r=255:g=244:b=225,colorchannelmixer=aa=0.38,${blur(30)}[h];` +
    `[pc]colorchannelmixer=aa=0,pad=iw+140:ih*1.45+140:70:70:color=black@0[c];` +
    `[d0]pad=iw+140:ih+140:70:70:color=black@0,colorchannelmixer=rr=0:gg=0:bb=0:aa=0.45,${blur(26)}[d];` +
    `[s0]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.85,scale=iw*1.1:ih*0.06,pad=iw+80:ih+80:40:40:color=black@0,${blur(16)}[k];` +
    `[r0]vflip,crop=iw:ih*0.4:0:0,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*0.3*pow(max(0,1-Y/H),1.6)',gblur=sigma=1.5[r];` +
    '[c][h]overlay=x=0:y=0:format=rgb[c0];[c0][d]overlay=x=16:y=34:format=rgb[c1];[c1][k]overlay=x=(W-w)/2:y=70+(H-140)/1.45-h/2-4:format=rgb[c2];' +
    '[c2][r]overlay=x=70:y=70+(H-140)/1.45+2:format=rgb[c3];[c3][p]overlay=x=70:y=70:format=rgb,format=rgba',
    '-frames:v', '1', fgP]);
  return { bgP, fgP };
}

// Glanz-Streifen (weiches, schraeges Licht), der bei jedem Szenenwechsel einmal durchs Bild zieht.
export function glanzBauen(ziel, hoehe) {
  if (!existsSync(ziel)) {
    ffmpegBild(['-f', 'lavfi', '-i', `color=white:s=720x${hoehe},format=rgba`, '-vf', `geq=r=255:g=255:b=255:a='120*exp(-pow((X-360+0.35*(Y-${hoehe / 2}))/80,2))'`, '-frames:v', '1', ziel]);
  }
  return ziel;
}

// Bokeh: weiche, warme Lichtpunkte, die langsam hinter dem Produkt nach oben schweben (Kino-Look).
export function bokehBauen(ziel, breite, hoehe) {
  if (!existsSync(ziel)) {
    const h = Math.round(hoehe * 1.5);
    const punkte = Array.from({ length: 14 }, () => [Math.random() * breite, Math.random() * h, 18 + Math.random() * 46, 40 + Math.random() * 55]);
    const a = punkte.map(([x, y, r, s]) => `${s.toFixed(0)}*exp(-(pow(X-${x.toFixed(0)},2)+pow(Y-${y.toFixed(0)},2))/${(r * r).toFixed(0)})`).join('+');
    ffmpegBild(['-f', 'lavfi', '-i', `color=white:s=${breite}x${h},format=rgba`, '-vf', `geq=r=255:g=236:b=205:a='min(255,${a})'`, '-frames:v', '1', ziel]);
  }
  return ziel;
}

// Standbild (Vorschaubild): Mitte des Hintergrunds plus Produkt.
export function premiumStandbild({ bgP, fgP, ziel, breite, hoehe }) {
  const graph = `[0:v]crop=${breite}:${hoehe}${fgP ? `[bg];[bg][1:v]overlay=x=(W-w)/2:y=${PRODUKT_Y}` : ''}`;
  ffmpegBild(['-i', bgP, ...(fgP ? ['-i', fgP] : []), '-filter_complex', graph, '-frames:v', '1', '-q:v', '2', ziel]);
}

// Eine Szene: Hintergrund schwenkt in die eine Richtung, Produkt schwebt leicht gegenlaeufig
// (Parallaxe), Blitz-Uebergang, Wort-Untertitel. extra = zusaetzliche Filter (Hook).
// effekt (effekte.mjs): {art: 'start'|'blitz'|'glitch'|'leck', leck: PNG, qr: PNG, wackeln} - Zoom-Punch,
// Uebergang und QR-Endkarte; ohne effekt bleibt es beim klassischen Blitz-Uebergang.
export async function premiumSzene({ bgP, fgP, glanz = '', bokeh = '', nah = false, mp3, ass, ziel, breite, hoehe, dauer, index, extra = [], effekt = null }) {
  const D = dauer.toFixed(2);
  const r = index % 2 ? `(t/${D})` : `(1-t/${D})`;
  // Eingaenge: 0 Hintergrund, dann (falls vorhanden) Produkt, Bokeh, Glanz, zuletzt die Stimme.
  const art = effekt?.art || (index === 0 ? 'start' : 'blitz');
  const leck = art === 'leck' ? effekt?.leck || '' : '';
  const qr = effekt?.qr || '';
  const strahlen = fgP ? effekt?.strahlen || '' : '';
  const bilder = [bgP, fgP, bokeh, glanz, leck, qr, strahlen].filter(Boolean);
  const nr = (x) => bilder.indexOf(x);
  let graph = `[0:v]crop=${breite}:${hoehe}:x='(iw-ow)*${r}':y='(ih-oh)*(0.5+0.35*sin(t*0.45+${index}))'`;
  if (bokeh) graph += `[b0];[b0][${nr(bokeh)}:v]overlay=x=0:y='-(h-H)*(0.2+0.6*t/${D})'`;
  // Lichtstrahlen hinter dem Produkt (Hook): drehen sich langsam und blenden am Szenenende aus.
  if (strahlen) graph += `[s0];[${nr(strahlen)}:v]format=rgba,rotate=a=t*0.45:c=none:ow=iw:oh=ih,fade=t=out:st=${Math.max(dauer - 0.6, 0.2).toFixed(2)}:d=0.5:alpha=1[st];[s0][st]overlay=x=(W-w)/2:y=H*0.4-h/2`;
  if (fgP) {
    // Nahaufnahme: Produkt 40 % groesser (Detail-Shot), sonst normale Position mit Schweben.
    const quelle = nah ? `[${nr(fgP)}:v]scale=iw*1.4:-1:flags=lanczos[fn];[v0][fn]` : `[v0][${nr(fgP)}:v]`;
    const y = nah ? `(H-h*0.69)/2-H*0.02` : PRODUKT_Y;
    // Drop: Produkt faellt von oben ins Bild und federt beim Aufprall kurz nach (Hook).
    // Startet schon halb im Bild, damit Bild 1 nicht leer ist.
    const drop = effekt?.drop ? '-H*0.32*pow(max(0,1-t/0.3),3)+H*0.03*sin(PI*min(1,max(0,(t-0.3)/0.22)))' : '';
    graph += `[v0];${quelle}overlay=x=(W-w)/2-W*0.018*(${r}-0.5):y='${y}+H*0.012*sin(t*1.7+${index})${drop}'`;
  }
  if (glanz) graph += `[g0];[g0][${nr(glanz)}:v]overlay=x='-w+(W+w)*(t-0.05)/0.7':y=0:enable='between(t,0.05,0.75)'`;
  // Light-Leak: warmes Licht blendet in 0,9 s aus.
  if (leck) graph += `[l0];[${nr(leck)}:v]format=rgba,fade=t=out:st=0.1:d=0.8:alpha=1[lk];[l0][lk]overlay=enable='lt(t,0.9)'`;
  if (effekt) graph += `,${kameraFilter({ breite, hoehe, wackeln: !!effekt.wackeln, wisch: art === 'wisch', beat: effekt.beat, stoss: effekt.stoss })}`;
  // QR-Endkarte oben links (nach dem Zoom, damit er ruhig steht und scannbar bleibt).
  if (qr) graph += `[q0];[${nr(qr)}:v]scale=${gerade(breite * 0.26)}:-2,format=rgba,fade=t=in:st=0.4:d=0.3:alpha=1[qr];[q0][qr]overlay=x=${Math.round(breite * 0.17)}-w/2:y=${Math.round(hoehe * 0.075)}`;
  const ende = [
    // Start ohne Schwarzblende: schon Bild 1 zeigt Produkt + Hook (Feed-Vorschau!), dazu ein kurzer Lichtblitz.
    ...(art === 'start' ? ["eq=brightness='0.3*max(0,1-t/0.22)':eval=frame"] : art === 'blitz' ? ['fade=in:st=0:d=0.14:color=white'] : art === 'glitch' ? glitchFilter() : art === 'wisch' ? wischFilter() : []),
    `fade=out:st=${Math.max(dauer - 0.18, 0).toFixed(2)}:d=0.18`,
    ...extra,
    `ass='${pfadFuerFilter(ass)}'`,
  ].join(',');
  await ausfuehren('ffmpeg', [
    '-loglevel', 'error', '-y', ...bilder.flatMap((b) => ['-loop', '1', '-framerate', '30', '-i', b]), '-i', mp3,
    '-filter_complex', `${graph},${ende}[v]`,
    '-map', '[v]', '-map', `${bilder.length}:a`, '-t', D,
    // aq-mode 3 verteilt Bits in dunkle Verlaeufe - weniger Farbstreifen (Banding) in Nacht-Hintergruenden.
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-profile:v', 'high', '-x264-params', 'aq-mode=3:aq-strength=0.9:deblock=-1,-1', '-pix_fmt', 'yuv420p', '-r', '30',
    // Stimme wie im Studio: Rumpeln weg, Praesenz rauf, Kompressor fuer gleichmaessige Lautstaerke.
    '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2', '-af', 'highpass=f=70,equalizer=f=220:t=q:w=1:g=-2,equalizer=f=3400:t=q:w=1.2:g=3,equalizer=f=9000:t=q:w=1:g=1.5,acompressor=threshold=0.08:ratio=3:attack=5:release=90:makeup=1.6,apad',
    ziel,
  ], { timeout: 600000, maxBuffer: 16 * 1024 * 1024 });
}
