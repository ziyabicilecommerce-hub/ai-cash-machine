import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Baut aus einem einzelnen Bild ein kurzes "Ken Burns"-Video (langsamer
// Zoom) fuer Reels/Shorts/TikTok - laeuft ueber das in GitHub Actions
// ubuntu-latest-Runnern BEREITS VORINSTALLIERTE ffmpeg, keine zusaetzliche
// Abhaengigkeit, kein externer Dienst, keine Kosten.
//
// Wichtig, ehrlich gesagt: das ist KEIN echtes generatives KI-Video (keine
// eigene Bewegung/Kamerafahrt aus einem Modell) - nur eine Bewegtbild-Version
// desselben Standbilds. Fuer echtes generatives Video braucht es einen
// kostenpflichtigen Dienst (Pollinations Unified API, Comfy Cloud etc.).
export async function bildZuKenBurnsVideo(imageUrl, { dauerSekunden = 6, breite = 1080, hoehe = 1920 } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'kenburns-'));
  const bildPfad = join(tmp, 'input.jpg');
  const videoPfad = join(tmp, 'output.mp4');

  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Bild-Download fuer Video-Konvertierung fehlgeschlagen: ${res.status}`);
  writeFileSync(bildPfad, Buffer.from(await res.arrayBuffer()));

  const fps = 30;
  const frames = dauerSekunden * fps;
  // zoompan: langsamer Zoom rein (1.0 -> 1.15) ueber die volle Dauer, danach
  // Skalierung/Crop auf Hochkant-Format (Reels/Shorts/TikTok-Standard).
  const filter = `scale=8000:-1,zoompan=z='min(zoom+0.0007,1.15)':d=${frames}:s=${breite}x${hoehe}:fps=${fps}`;

  execFileSync('ffmpeg', [
    '-y',
    '-loop', '1',
    '-i', bildPfad,
    '-vf', filter,
    '-t', String(dauerSekunden),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    videoPfad,
  ], { stdio: 'pipe' });

  return videoPfad;
}
