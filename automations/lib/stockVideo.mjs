// Echte Video-Clips statt Standbild (Fakten-Kanal): sucht zu jeder Szene einen passenden, frei nutzbaren
// Hochformat-Clip bei Pexels (kostenloser API-Schlüssel, Pexels-Lizenz: kostenlos, ohne Namensnennung).
// Ohne Schlüssel oder ohne Treffer bleibt es beim KI-Bild mit 3D-Kamerafahrt.
import { createWriteStream, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Stil-Wörter der Bild-Prompts helfen der Stock-Suche nicht - nur das Motiv bleibt.
const STIL = /\b(cinematic|photorealistic|dramatic|light(ing)?|no text|no people|no logos|no real people|close-up|detail|wide|epic|shot|macro|studio|abstract|illustration|concept|visualization|style|4k|8k|hd|soft|warm|glowing|on dark background|dark background|background)\b/gi;
export function suchbegriff(prompt) {
  return String(prompt || '').replace(STIL, ' ').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 5).join(' ');
}

// Bester Clip aus einer Pexels-Antwort: Hochformat, mind. 1280 hoch, mind. 4 s lang, nicht schon benutzt.
export function clipAuswaehlen(antwort, benutzt = new Set()) {
  for (const v of antwort?.videos || []) {
    if (benutzt.has(v.id) || (v.duration || 0) < 4) continue;
    const dateien = (v.video_files || [])
      .filter((f) => /^https:\/\//.test(f.link || '') && f.file_type === 'video/mp4' && f.height > f.width && f.height >= 1280)
      .sort((a, b) => Math.abs(a.height - 1920) - Math.abs(b.height - 1920));
    if (dateien[0]) return { id: v.id, link: dateien[0].link, dauer: v.duration };
  }
  return null;
}

export async function stockHolen(prompt, ziel, { schluessel = process.env.PEXELS_API_KEY, benutzt = new Set() } = {}) {
  const q = suchbegriff(prompt);
  if (!schluessel || !q) return '';
  try {
    const res = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&size=medium&per_page=8`, { headers: { authorization: schluessel } });
    if (!res.ok) throw new Error(`Pexels ${res.status}`);
    const clip = clipAuswaehlen(await res.json(), benutzt);
    if (!clip) return '';
    const dl = await fetch(clip.link);
    if (!dl.ok || !dl.body) throw new Error(`Download ${dl.status}`);
    await pipeline(Readable.fromWeb(dl.body), createWriteStream(ziel));
    if (!existsSync(ziel) || statSync(ziel).size < 50000) return '';
    benutzt.add(clip.id);
    return ziel;
  } catch (err) {
    console.log(`[stock-video] "${q}": ${String(err.message).slice(0, 120)}`);
    return '';
  }
}

// Clip auf Hochformat zuschneiden, auf die Szenenlänge bringen (zu kurz -> Schleife), ohne Ton.
export function clipAnpassen(quelle, ziel, dauer, { breite, hoehe }) {
  try {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-stream_loop', '-1', '-i', quelle, '-t', dauer.toFixed(2), '-an',
      '-vf', `scale=${breite}:${hoehe}:force_original_aspect_ratio=increase,crop=${breite}:${hoehe},fps=30,setsar=1`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', ziel], { stdio: 'pipe', timeout: 300000 });
    return existsSync(ziel) ? ziel : '';
  } catch (err) {
    console.log(`[stock-video] Zuschnitt fehlgeschlagen: ${String(err.stderr || err.message).slice(-160)}`);
    return '';
  }
}
