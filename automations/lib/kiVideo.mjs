// Echte KI-Videoclips statt Standbild mit Kamerafahrt: jedes Szenenbild wird über kostenlose Hugging-Face-Spaces
// (Wan 2.2 / LTX-Video, Bild-zu-Video) zum bewegten Clip. Ohne Schlüssel, Tageskontingent pro IP - ist es
// aufgebraucht, fällt die Szene still auf die 3D-Kamerafahrt zurück. VIDEO_KI_CLIPS=aus schaltet ab.
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ausfuehren = promisify(execFile);
const zustand = { aus: /^(0|nein|aus|false)$/i.test(String(process.env.VIDEO_KI_CLIPS || '').trim()), erschoepft: new Set(), ok: 0, fehler: 0 };
export const kiClipStatus = () => ({ ok: zustand.ok, fehler: zustand.fehler, erschoepft: [...zustand.erschoepft] });

// Bewegungs-Prompt: Szene + ruhige Kamera, damit nichts zappelt.
export const bewegungsPrompt = (bild) => `${String(bild || '').replace(/,?\s*no (text|people)[^,]*/gi, '').slice(0, 300)}, smooth cinematic camera motion, natural movement, highly detailed`;

// Hook-Szene bekommt das bessere Modell (Wan), der Rest das schnellere (LTX); ist eins erschöpft, das andere.
export function modelleFuer(index, erschoepft = new Set()) {
  return (index === 0 ? ['wan', 'ltx'] : ['ltx', 'wan']).filter((m) => !erschoepft.has(m));
}

// Ein Clip aus einem Standbild -> Pfad (mp4, ~3 s) oder '' (dann Rückfall).
export async function kiClip(bild, prompt, ziel, { index = 0 } = {}) {
  if (zustand.aus || !bild || !existsSync(bild)) return '';
  for (const m of modelleFuer(index, zustand.erschoepft)) {
    try {
      await ausfuehren('python3', [resolve('scripts/ki_clip.py'), resolve(bild), bewegungsPrompt(prompt), resolve(ziel), m], { timeout: 240000 });
      if (existsSync(ziel)) { zustand.ok++; console.log(`[ki-video] ✓ Szene ${index + 1}: echter KI-Clip (${m})`); return ziel; }
    } catch (err) {
      zustand.fehler++;
      if (err.code === 3) { zustand.erschoepft.add(m); console.log(`[ki-video] Kontingent ${m} für heute aufgebraucht`); }
      else console.log(`[ki-video] ${m} fehlgeschlagen: ${String(err.stderr || err.message).slice(0, 160)}`);
    }
  }
  return '';
}

// ~3 s KI-Clip auf die Szenenlänge bringen: erst ruhig verlangsamen (max. 1,6x), dann vor- und rückwärts
// (Bumerang) - so gibt es beim Wiederholen keinen Sprung.
export function bumerang(quelle, ziel, dauer) {
  try {
    const laenge = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', quelle]).toString().trim()) || 3;
    const f = Math.min(Math.max(dauer / laenge, 1), 1.6).toFixed(3);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', quelle, '-an', '-filter_complex', `[0:v]setpts=${f}*PTS,fps=30,split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1[v]`, '-map', '[v]',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '17', '-pix_fmt', 'yuv420p', ziel], { stdio: 'pipe', timeout: 180000 });
    return existsSync(ziel) ? ziel : '';
  } catch { return ''; }
}
