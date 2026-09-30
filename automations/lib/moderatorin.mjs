// KI-Moderatorin als Bild-im-Bild (#94): eine der 6 festen KI-Moderatorinnen spricht die Werbestimme
// lippensynchron (scripts/moderatorin.sh, Wav2Lip auf CPU) und sitzt als runder Kreis mit weissem Rand
// unten rechts im Video. Kostenlos, ohne Key. Nur aktiv, wenn der Workflow MODERATORIN=1 setzt.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ausfuehren = promisify(execFile);
export const moderatorinAn = () => process.env.MODERATORIN === '1';

export async function moderatorinEinfuegen(video, stimme, nr, { breite = 1080, hoehe = 1920 } = {}) {
  if (!stimme || !existsSync(stimme)) throw new Error('Keine Stimmspur fuer die Moderatorin');
  const mod = join(dirname(video), 'moderatorin.mp4');
  await ausfuehren('bash', ['scripts/moderatorin.sh', 'sprechen', stimme, mod, String(((nr - 1) % 6) + 1)], { timeout: 1800000, maxBuffer: 16 * 1024 * 1024 });
  const d = Math.round(Math.min(breite, hoehe) * 0.35);
  const r = d + 12;
  const x = breite - r - Math.round(breite * 0.04);
  const y = hoehe - r - Math.round(hoehe * 0.03);
  const tmp = `${video}.pip.mp4`;
  const graph =
    `[1:v]crop=iw:iw:0:ih*0.03,scale=${d}:${d},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='255*lte(hypot(X-${d / 2},Y-${d / 2}),${d / 2 - 2})'[m];` +
    `[2:v]format=rgba,geq=r=255:g=255:b=255:a='255*lte(hypot(X-${r / 2},Y-${r / 2}),${r / 2 - 1})'[ring];` +
    `[0:v][ring]overlay=x=${x}:y=${y}[b];[b][m]overlay=x=${x + 6}:y=${y + 6}:eof_action=pass,format=yuv420p[v]`;
  await ausfuehren('ffmpeg', [
    '-loglevel', 'error', '-y', '-i', video, '-i', mod, '-f', 'lavfi', '-i', `color=white:s=${r}x${r}:r=30`,
    '-filter_complex', graph, '-map', '[v]', '-map', '0:a', '-shortest',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high', '-c:a', 'copy', '-movflags', '+faststart', tmp,
  ], { timeout: 1800000, maxBuffer: 16 * 1024 * 1024 });
  renameSync(tmp, video);
}

// KI-Moderatorin als Bild-im-Bild in die deutschen Premium-Videos (wenn der Workflow sie eingerichtet hat).
export async function mitModeratorin(v, nr) {
  if (!moderatorinAn()) return;
  try { await moderatorinEinfuegen(v.pfad, v.stimme, nr); console.log(`[94-video-fabrik] Moderatorin ${((nr - 1) % 6) + 1} eingefuegt`); } catch (err) { console.log(`[94-video-fabrik] Moderatorin fehlgeschlagen: ${String(err.message).slice(0, 120)} ... ${String(err.stderr || '').slice(-900)}`); }
}
