// Fehler-Radar (CLI): node automations/video-radar.mjs <ordner mit ziya-*.mp4, bericht.json, protokoll.txt> [issue-text.txt]
// Misst das fertige Video mit ffmpeg (Länge, Ton, Helligkeit, Titelbild) und gibt die Diagnose als Markdown aus.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { radarPruefen, radarText } from './lib/videoRadar.mjs';

const [ordner = 'video', issueDatei = ''] = process.argv.slice(2);
const lesen = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
const video = (readdirSync(ordner).filter((n) => /^ziya-.*\.mp4$/.test(n) && !/-en\.mp4$/.test(n)).sort().pop()) || '';
const roh = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', ...args, '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1'], { maxBuffer: 1e8, timeout: 300000 });
const messungen = {};
if (video) {
  const pfad = join(ordner, video);
  try {
    const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', pfad]).toString());
    messungen.dauer = Number(info.format?.duration) || 0;
    messungen.ton = (info.streams || []).some((s) => s.codec_type === 'audio');
  } catch { /* ohne Länge/Ton */ }
  try {
    // 2 Bilder pro Sekunde, 36x64 Graustufen - reicht für "ausgebrannt" oder "schwarz".
    const px = roh(['-i', pfad, '-vf', 'fps=2,scale=36:64']);
    const groesse = 36 * 64;
    let hell = 0, dunkel = 0, n = 0;
    for (let i = 0; i + groesse <= px.length; i += groesse, n++) {
      let s = 0;
      for (let j = i; j < i + groesse; j++) s += px[j];
      const m = s / groesse;
      if (m > 225) hell++;
      if (m < 15) dunkel++;
    }
    if (n) { messungen.hell = hell / n; messungen.dunkel = dunkel / n; }
  } catch { /* ohne Helligkeit */ }
}
if (existsSync(join(ordner, 'cover.jpg'))) {
  try { const px = roh(['-i', join(ordner, 'cover.jpg'), '-vf', 'scale=36:64']); messungen.cover = Math.round(px.reduce((a, b) => a + b, 0) / px.length); } catch { /* ohne Cover */ }
}
let bericht = null;
try { bericht = JSON.parse(lesen(join(ordner, 'bericht.json'))); } catch { /* ohne Bericht */ }
console.log(radarText(radarPruefen({ log: lesen(join(ordner, 'protokoll.txt')), bericht, messungen, issueText: issueDatei ? lesen(issueDatei) : '' })));
