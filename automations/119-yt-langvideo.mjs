// YouTube-Langvideo (#119): schneidet die englischen Shorts der letzten Woche zu "The Erased Files #N" zusammen
// (Querformat 1920x1080, unscharfer Hintergrund, Kapitelkarte vor jedem Fall, Intro und Abspann).
//   node automations/119-yt-langvideo.mjs <ordner>   -> <ordner>/lang.mp4 und <ordner>/lang.json
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { auswahl, infoZu, beitragLang } from './lib/ytLangvideo.mjs';

const ORDNER = resolve(process.argv[2] || 'out');
const REPO = process.env.GITHUB_REPOSITORY || 'ziyabicilecommerce-hub/ai-cash-machine';
const SCHRIFT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const W = 1920, H = 1080, INTRO = 4;
const ff = (a) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...a], { stdio: 'pipe', timeout: 900000 });
const dauer = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString()) || 0;
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '\u2019').replace(/%/g, '\\%');
const KODEC = ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-ar', '44100', '-ac', '2'];

function karte(ziel, sek, zeilen) {
  const t = zeilen.map(([text, gr, farbe, y]) => `drawtext=fontfile=${SCHRIFT}:text='${esc(text)}':fontsize=${gr}:fontcolor=${farbe}:x=(w-tw)/2:y=${y}:alpha='min(1,t*2)'`).join(',');
  ff(['-f', 'lavfi', '-i', `color=c=0x07070b:s=${W}x${H}:r=30:d=${sek}`, '-f', 'lavfi', '-i', `aevalsrc='0.04*sin(2*PI*55*t)+0.03*sin(2*PI*82*t)':s=44100:d=${sek}`,
    '-vf', `${t},noise=alls=10:allf=t,vignette=PI/4`, '-shortest', ...KODEC, ziel]);
}

async function main() {
  mkdirSync(ORDNER, { recursive: true });
  const kopf = process.env.GH_TOKEN ? { authorization: `Bearer ${process.env.GH_TOKEN}` } : {};
  const releases = [];
  for (let seite = 1; seite <= 3; seite++) {  // 8 Tage Releases aller Bots passen nicht immer auf eine Seite
    const l = await (await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${seite}`, { headers: kopf })).json();
    if (!Array.isArray(l) || !l.length) break;
    releases.push(...l);
  }
  const folge = releases.filter((r) => /^yt-lang-\d+$/.test(r.tag_name)).length + 1;
  const shorts = auswahl(releases);
  if (shorts.length < 4) { console.log(`[119] nur ${shorts.length} Shorts - zu wenig für ein Langvideo.`); process.exit(0); }
  const teile = [], dateien = [];
  karte(join(ORDNER, 'intro.mp4'), INTRO, [['THE ERASED FILES', 110, 'white', '(h/2)-120'], [`#${folge}`, 90, '0xE02030', '(h/2)+10'], ['The police erased these cases. We found them.', 40, '0xB0B4C0', '(h/2)+140']]);
  dateien.push(join(ORDNER, 'intro.mp4'));
  for (const [i, s] of shorts.entries()) {
    const roh = join(ORDNER, `roh${i}.mp4`);
    execFileSync('curl', ['-sSL', '--fail', '-o', roh, s.url], { timeout: 300000 });
    const info = infoZu(s.slug);
    const k = join(ORDNER, `k${i}.mp4`), v = join(ORDNER, `v${i}.mp4`);
    karte(k, 2, [[info.nr ? `FILE ${String(info.nr).padStart(3, '0')}` : `CASE ${i + 1}`, 90, '0xE02030', '(h/2)-90'], [info.titel, 64, 'white', '(h/2)+20']]);
    // Hochkant-Short in die Mitte, dahinter dasselbe Bild groß und unscharf
    ff(['-i', roh, '-filter_complex', `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=25:4,eq=brightness=-0.15[bg];[0:v]scale=-2:${H}[fg];[bg][fg]overlay=(W-w)/2:0,setsar=1[v]`,
      '-map', '[v]', '-map', '0:a?', ...KODEC, v]);
    teile.push({ ...info, dauer: 2 + dauer(v) });
    dateien.push(k, v);
    console.log(`[119] ${i + 1}/${shorts.length} ${info.titel}`);
  }
  karte(join(ORDNER, 'outro.mp4'), 5, [['THE NEXT FILE IS COMING', 80, 'white', '(h/2)-60'], ['Subscribe if you dare.', 52, '0xE02030', '(h/2)+50']]);
  dateien.push(join(ORDNER, 'outro.mp4'));
  writeFileSync(join(ORDNER, 'liste.txt'), dateien.map((d) => `file '${d}'`).join('\n'));
  ff(['-f', 'concat', '-safe', '0', '-i', join(ORDNER, 'liste.txt'), '-c', 'copy', '-movflags', '+faststart', join(ORDNER, 'lang.mp4')]);
  const b = beitragLang(folge, teile, INTRO);
  writeFileSync(join(ORDNER, 'lang.json'), JSON.stringify({ folge, ...b }, null, 1));
  console.log(`[119] fertig: ${b.titel} (${Math.round(dauer(join(ORDNER, 'lang.mp4')))} s)`);
}

main().catch((e) => { console.error(`[119] ${String(e.message).slice(0, 300)}`); process.exit(1); });
