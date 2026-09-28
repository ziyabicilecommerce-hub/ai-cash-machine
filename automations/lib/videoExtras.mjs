// Kostenlose Extras fuer fertige Videos (#94, #95) - alles lokal mit ffmpeg, ohne Key:
// eigene Hintergrundmusik (synthetisch, daher ohne Lizenzfragen), Gesamt-Untertitel
// (.srt), YouTube-Kapitelmarken und ein 9:16-Teaser fuer Shorts/Reels/TikTok.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';

const ausfuehren = promisify(execFile);

// Grundtoene (Hz) je Stimmung: ruhige Dur-Flaeche fuer Natur/Wissen, Moll fuer Anime.
const STIMMUNGEN = {
  ruhig: [130.81, 164.81, 196.0, 261.63],
  anime: [110.0, 130.81, 164.81, 220.0],
};

// Langsame, schwebende Klangflaeche in Videolaenge, leise unter die Stimme gemischt.
export async function musikUnterlegen(video, dauer, { stimmung = 'ruhig', lautstaerke = 1.2 } = {}) {
  const toene = STIMMUNGEN[stimmung] || STIMMUNGEN.ruhig;
  const formel = toene
    .map((hz, i) => `${(0.05 - i * 0.008).toFixed(3)}*sin(2*PI*${hz}*t)*(0.55+0.45*sin(2*PI*${(0.03 + i * 0.013).toFixed(3)}*t+${i}))`)
    .join('+');
  const tmp = `${video}.musik.mp4`;
  const d = Math.ceil(dauer) + 1;
  await ausfuehren('ffmpeg', [
    '-loglevel', 'error', '-y', '-i', video,
    '-f', 'lavfi', '-i', `aevalsrc='${formel}':s=44100:d=${d}`,
    '-filter_complex', `[1:a]lowpass=f=1400,aecho=0.8:0.6:600|1100:0.25|0.15,afade=t=in:d=3,afade=t=out:st=${Math.max(d - 4, 0)}:d=4,volume=${lautstaerke},aformat=channel_layouts=stereo[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', tmp,
  ], { timeout: 3600000, maxBuffer: 16 * 1024 * 1024 });
  renameSync(tmp, video);
}

const zuMs = (z) => { const [h, m, rest] = z.split(':'); const [s, ms] = rest.split(','); return ((+h * 60 + +m) * 60 + +s) * 1000 + +ms; };
const zuZeit = (ms) => {
  const p = (n, l = 2) => String(Math.floor(n)).padStart(l, '0');
  return `${p(ms / 3600000)}:${p((ms / 60000) % 60)}:${p((ms / 1000) % 60)},${p(ms % 1000, 3)}`;
};

// Fuegt die Untertitel aller Szenen mit Zeitversatz zu einer .srt fuer das ganze Video zusammen.
export function untertitelZusammenfuegen(teile, ziel) {
  const bloecke = [];
  for (const { srt, start } of teile) {
    let text = '';
    try { text = readFileSync(srt, 'utf8'); } catch { continue; }
    for (const block of text.replace(/\r/g, '').split(/\n\n+/)) {
      const m = block.match(/(\d\d:\d\d:\d\d,\d{3}) --> (\d\d:\d\d:\d\d,\d{3})\n([\s\S]+)/);
      if (m) bloecke.push(`${bloecke.length + 1}\n${zuZeit(zuMs(m[1]) + start * 1000)} --> ${zuZeit(zuMs(m[2]) + start * 1000)}\n${m[3].trim()}`);
    }
  }
  writeFileSync(ziel, bloecke.join('\n\n') + '\n');
  return bloecke.length;
}

// YouTube-Kapitel: erste Marke bei 0:00, mindestens 3 Kapitel, jedes mindestens 10 Sekunden.
export function kapitelText(marken) {
  // Liegen zwei Marken zu dicht beieinander, gewinnt die spaetere (z. B. "Akt 1" statt "Intro").
  const gut = [];
  for (const m of marken) {
    if (gut.length && m.zeit - gut.at(-1).zeit < 10) gut[gut.length - 1] = { ...m, zeit: gut.at(-1).zeit };
    else gut.push(m);
  }
  if (gut.length < 3) return '';
  gut[0] = { ...gut[0], zeit: 0 };
  const fmt = (s) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const x = String(Math.floor(s % 60)).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${x}` : `${m}:${x}`; };
  return gut.map((m) => `${fmt(m.zeit)} ${m.titel}`).join('\n');
}

// 9:16-Teaser aus den ersten Sekunden: Querformat mittig, dahinter weichgezeichnet.
export async function teaserBauen(video, ziel, { sekunden = 55 } = {}) {
  await ausfuehren('ffmpeg', [
    '-loglevel', 'error', '-y', '-t', String(sekunden), '-i', video,
    '-filter_complex', '[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:5,eq=brightness=-0.08[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fade=t=out:st=' + Math.max(sekunden - 1, 0) + ':d=1[v]',
    '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-af', `afade=t=out:st=${Math.max(sekunden - 1, 0)}:d=1`, '-movflags', '+faststart', ziel,
  ], { timeout: 1200000, maxBuffer: 16 * 1024 * 1024 });
}
