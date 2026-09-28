// Marathon-Fabrik (#97) - Schlaf-, Entspannungs- und Fokus-Videos bis 48 Stunden,
// komplett kostenlos: Pollinations-Bilder, Klang aus ffmpeg (klangwelten.mjs), keine
// Sprache (weltweit nutzbar), Titel in 8 Sprachen. Gerendert werden nur 3 einzigartige
// Segmente (je ~20 Min.); die Stunden entstehen durch verlustfreies Aneinanderhaengen.
// Aufgeteilt in Teile von hoechstens 8 Stunden (YouTube-Limit 12 Std., GitHub-Datei 2 GB).
//   MARATHON_TAG gesetzt -> jeder Teil wird sofort ins Release hochgeladen und lokal geloescht.
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { ladeBild, bildVorbereiten, vorschaubildBauen, zusammenfuegen, dauerSekunden } from './lib/videoFabrik.mjs';
import { KLANGWELTEN, bildPrompts, klangFilter, beschreibung } from './lib/klangwelten.mjs';

const ausfuehren = promisify(execFile);
const env = (k, d = '') => (process.env[k] || d).trim();
const zahl = (k, d, min, max) => Math.min(Math.max(parseFloat(env(k, String(d))) || d, min), max);

const OUT = 'out';
const ARBEIT = join(OUT, 'marathon');
const WELTEN = Object.keys(KLANGWELTEN);
const WELT = WELTEN.includes(env('MARATHON_WELT')) ? env('MARATHON_WELT') : WELTEN[Math.floor(Date.now() / 86400000) % WELTEN.length];
const STUNDEN = zahl('MARATHON_STUNDEN', 8, 0.02, 48);
// 8 Std. bei max. ~400 kbit/s Bild + 96 kbit/s Ton = ca. 1,8 GB - unter dem 2-GB-Limit.
const TEIL_H = zahl('MARATHON_TEIL_STUNDEN', 8, 0.01, 8);
const SEGMENTE = 3;
const SEGMENT_MIN = zahl('MARATHON_SEGMENT_MIN', 20, 0.5, 60);
const SEK_PRO_BILD = zahl('MARATHON_SEK_PRO_BILD', 60, 10, 180);
const TAG = env('MARATHON_TAG');
const FPS = 24;
const [B, H] = [1920, 1080];

// Wenige Auftraege gleichzeitig: Pollinations und die 4 Kerne des Runners nicht ueberlasten.
async function parallel(liste, anzahl, fn) {
  const ergebnisse = new Array(liste.length);
  let naechster = 0;
  await Promise.all(Array.from({ length: anzahl }, async () => {
    while (naechster < liste.length) {
      const i = naechster++;
      ergebnisse[i] = await fn(liste[i], i).catch((err) => { console.log(`[97-marathon] #${i + 1}: ${String(err.message).slice(0, 150)}`); return null; });
    }
  }));
  return ergebnisse;
}

// Sehr langsame Kamerafahrt, weiche Blenden - ruhig genug zum Einschlafen.
function kamera(i, frames) {
  const mitte = { x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' };
  switch (i % 4) {
    case 0: return { z: `1+0.06*on/${frames}`, ...mitte };
    case 1: return { z: `1.06-0.06*on/${frames}`, ...mitte };
    case 2: return { z: '1.06', x: `(iw-iw/zoom)*on/${frames}`, y: mitte.y };
    default: return { z: '1.06', x: `(iw-iw/zoom)*(1-on/${frames})`, y: mitte.y };
  }
}

async function clipRendern(bild, ziel, i) {
  const frames = Math.round(SEK_PRO_BILD * FPS);
  const k = kamera(i, frames);
  const vf = `scale=${B * 2}:${H * 2},zoompan=z='${k.z}':x='${k.x}':y='${k.y}':d=${frames}:s=${B}x${H}:fps=${FPS},fade=in:st=0:d=1.5,fade=out:st=${SEK_PRO_BILD - 1.5}:d=1.5`;
  await ausfuehren('ffmpeg', ['-loglevel', 'error', '-y', '-i', bild, '-vf', vf, '-frames:v', String(frames),
    '-c:v', 'libx264', '-preset', 'medium', '-tune', 'stillimage', '-crf', '24', '-maxrate', '400k', '-bufsize', '800k', '-g', String(FPS * 4),
    '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', ziel], { timeout: 1800000, maxBuffer: 16 * 1024 * 1024 });
  return ziel;
}

async function segmentBauen(bilder, s) {
  const clips = (await parallel(bilder, 2, (b, i) => clipRendern(b, join(ARBEIT, `seg${s}-c${i}.mp4`), s * 1000 + i))).filter(Boolean);
  if (!clips.length) throw new Error(`Segment ${s + 1}: keine Clips`);
  const stumm = join(ARBEIT, `seg${s}-stumm.mp4`);
  zusammenfuegen(clips, stumm, ARBEIT);
  const dauer = dauerSekunden(stumm);
  const ziel = join(ARBEIT, `seg${s}.mp4`);
  await ausfuehren('ffmpeg', ['-loglevel', 'error', '-y', '-i', stumm, '-filter_complex', klangFilter(WELT, Math.ceil(dauer), 11 + s * 17),
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '96k', '-ar', '44100', '-shortest', ziel], { timeout: 1800000, maxBuffer: 16 * 1024 * 1024 });
  for (const c of clips) rmSync(c, { force: true });
  console.log(`[97-marathon] Segment ${s + 1}: ${clips.length} Bilder, ${Math.round(dauer / 60)} Min.`);
  return { pfad: ziel, dauer: dauerSekunden(ziel) };
}

// Ein Teil: Segmente im Wechsel verlustfrei aneinanderhaengen, bis die Dauer erreicht ist.
async function teilBauen(segmente, dauer, ziel) {
  const liste = [];
  let summe = 0;
  for (let i = 0; summe < dauer; i++) {
    const seg = segmente[i % segmente.length];
    liste.push(`file '${resolve(seg.pfad).replace(/'/g, "'\\''")}'`);
    summe += seg.dauer;
  }
  const datei = join(ARBEIT, `${basename(ziel)}.liste.txt`);
  writeFileSync(datei, liste.join('\n'));
  await ausfuehren('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', datei, '-t', dauer.toFixed(1), '-c', 'copy', '-movflags', '+faststart', ziel], { timeout: 3600000, maxBuffer: 16 * 1024 * 1024 });
}

function hochladen(datei) {
  if (!TAG) return false;
  execFileSync('gh', ['release', 'upload', TAG, datei, '--clobber'], { stdio: 'inherit', timeout: 3600000 });
  return true;
}

async function main() {
  mkdirSync(ARBEIT, { recursive: true });
  mkdirSync(join(OUT, 'videos'), { recursive: true });
  const start = Date.now();
  const proSegment = Math.max(1, Math.ceil((SEGMENT_MIN * 60) / SEK_PRO_BILD));
  const prompts = bildPrompts(WELT, SEGMENTE * proSegment);
  console.log(`[97-marathon] "${KLANGWELTEN[WELT].titel.de}" - ${STUNDEN} Std., ${prompts.length} Bilder`);

  const bilder = await parallel(prompts, 2, async (prompt, i) => {
    const roh = join(ARBEIT, `r${i}.img`);
    const jpg = join(ARBEIT, `b${i}.jpg`);
    if (!(await ladeBild(prompt, roh, { breite: B, hoehe: H }))) return null;
    bildVorbereiten(roh, jpg, { breite: B, hoehe: H, modus: 'vollbild' });
    return jpg;
  });
  const gute = bilder.filter(Boolean);
  if (gute.length < 3) throw new Error(`Nur ${gute.length} Bilder geladen`);
  console.log(`[97-marathon] ${gute.length}/${prompts.length} Bilder (${Math.round((Date.now() - start) / 60000)} Min.)`);

  const segmente = [];
  const jeSegment = Math.ceil(gute.length / SEGMENTE);
  for (let s = 0; s < SEGMENTE && s * jeSegment < gute.length; s++) segmente.push(await segmentBauen(gute.slice(s * jeSegment, (s + 1) * jeSegment), s));

  const stundenText = STUNDEN >= 1 ? `${+STUNDEN.toFixed(1)} Std.` : `${Math.round(STUNDEN * 60)} Min.`;
  const basis = `${new Date().toISOString().slice(0, 10)}-marathon-${WELT}-${String(+STUNDEN.toFixed(2)).replace('.', '-')}h`;
  const titel = `${KLANGWELTEN[WELT].titel.de} – ${stundenText}`;
  const vorschau = `${basis}.jpg`;
  try {
    vorschaubildBauen(gute[0], join(OUT, 'videos', vorschau), titel, { breite: B, hoehe: H });
  } catch {
    copyFileSync(gute[0], join(OUT, 'videos', vorschau));
  }
  hochladen(join(OUT, 'videos', vorschau));

  const gesamt = STUNDEN * 3600;
  const teile = Math.ceil(gesamt / (TEIL_H * 3600) - 1e-9);
  const manifest = [];
  for (let t = 0; t < teile; t++) {
    const dauer = Math.min(TEIL_H * 3600, gesamt - t * TEIL_H * 3600);
    const datei = `${basis}${teile > 1 ? `-teil-${t + 1}` : ''}.mp4`;
    const pfad = join(OUT, 'videos', datei);
    await teilBauen(segmente, dauer, pfad);
    const mb = Math.round(Number(execFileSync('stat', ['-c', '%s', pfad]).toString()) / 1e6);
    if (hochladen(pfad)) rmSync(pfad, { force: true });
    manifest.push({ datei, vorschau, sprache: 'int', titel: `${titel}${teile > 1 ? ` (Teil ${t + 1}/${teile})` : ''}`, caption: beschreibung(WELT, +STUNDEN.toFixed(1)), thema: 'marathon', format: 'quer', dauer: Math.round(dauer), szenen: gute.length });
    console.log(`[97-marathon] ✓ ${datei} (${Math.round(dauer / 60)} Min., ${mb} MB)`);
  }
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`[97-marathon] Fertig: ${teile} Teil(e) in ${Math.round((Date.now() - start) / 60000)} Min.`);
}

main().catch((err) => {
  console.error('[97-marathon] Fehler:', err.message);
  process.exit(1);
});
