// Video-Fabrik (#94): baut aus Skript + KI-Bildern + KI-Stimme ein fertiges
// Video mit Untertiteln - komplett ohne API-Key. Bilder: Pollinations.
// Stimme: edge-tts (kostenlose Microsoft-Stimmen). Schnitt: ffmpeg.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { bildURL } from './pollinationsMedia.mjs';

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

export function dauerSekunden(datei) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', datei]).toString().trim();
  return Number(out) || 0;
}

export async function ladeBild(prompt, ziel, { breite, hoehe }) {
  for (let versuch = 0; versuch < 4; versuch++) {
    try {
      const res = await fetch(bildURL(prompt, { width: breite, height: hoehe }), { signal: AbortSignal.timeout(120000) });
      const typ = res.headers.get('content-type') || '';
      if (res.ok && typ.startsWith('image/')) {
        writeFileSync(ziel, Buffer.from(await res.arrayBuffer()));
        return true;
      }
    } catch {
      /* naechster Versuch */
    }
    await warte(5000 * (versuch + 1));
  }
  return false;
}

export function sprechen(text, mp3, srt, stimme) {
  const txt = `${mp3}.txt`;
  writeFileSync(txt, text);
  execFileSync('edge-tts', ['--voice', stimme, '--file', txt, '--write-media', mp3, '--write-subtitles', srt], { stdio: 'pipe', timeout: 120000 });
}

function srtPfadFuerFilter(pfad) {
  return pfad.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

// Eine Szene: Bild mit langsamem Zoom, Stimme, eingebrannte Untertitel.
export function szeneRendern({ bild, mp3, srt, ziel, breite, hoehe, index, format }) {
  const dauer = dauerSekunden(mp3) + 0.35;
  const frames = Math.ceil(dauer * 30);
  const zoomRein = index % 2 === 0;
  const zoom = zoomRein ? `min(zoom+0.0009,1.18)` : `if(eq(on,0),1.18,max(zoom-0.0009,1.0))`;
  const schrift = format === 'quer' ? 16 : 12;
  const filter = [
    `scale=${Math.round(breite * 1.2)}:${Math.round(hoehe * 1.2)}:force_original_aspect_ratio=increase`,
    `crop=${Math.round(breite * 1.2)}:${Math.round(hoehe * 1.2)}`,
    `zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${breite}x${hoehe}:fps=30`,
    `fade=in:0:8`,
    `subtitles='${srtPfadFuerFilter(srt)}':force_style='FontName=DejaVu Sans,FontSize=${schrift},Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,Alignment=2,MarginV=36'`,
  ].join(',');
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-loop', '1', '-i', bild, '-i', mp3,
    '-vf', filter, '-t', dauer.toFixed(2),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', '-af', 'apad', '-shortest',
    ziel,
  ], { stdio: 'pipe', timeout: 600000 });
}

export function zusammenfuegen(szenen, ziel, ordner) {
  const liste = join(ordner, 'liste.txt');
  writeFileSync(liste, szenen.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', liste, '-c', 'copy', '-movflags', '+faststart', ziel], { stdio: 'pipe', timeout: 600000 });
}

// Baut ein komplettes Video aus einem Skript {szenen:[{text, bild}]}.
export async function videoBauen(skript, ordner, { format = 'hoch', stimme = 'de-DE-ConradNeural', stil = '' } = {}) {
  if (!existsSync(ordner)) mkdirSync(ordner, { recursive: true });
  const [breite, hoehe] = format === 'quer' ? [1920, 1080] : [1080, 1920];
  const clips = [];
  for (const [i, szene] of skript.szenen.entries()) {
    const bild = join(ordner, `s${i}.jpg`);
    const mp3 = join(ordner, `s${i}.mp3`);
    const srt = join(ordner, `s${i}.srt`);
    const clip = join(ordner, `s${i}.mp4`);
    const ok = await ladeBild(`${szene.bild}${stil ? `, ${stil}` : ''}`, bild, { breite, hoehe });
    if (!ok) {
      if (!clips.length) continue;
      execFileSync('cp', [join(ordner, `s${clips.at(-1).i}.jpg`), bild]);
    }
    sprechen(szene.text, mp3, srt, stimme);
    szeneRendern({ bild, mp3, srt, ziel: clip, breite, hoehe, index: i, format });
    clips.push({ i, clip });
  }
  if (!clips.length) throw new Error('Keine einzige Szene konnte gerendert werden (Bilder nicht ladbar).');
  const ziel = join(ordner, 'video.mp4');
  zusammenfuegen(clips.map((c) => c.clip), ziel, ordner);
  return { pfad: ziel, dauer: dauerSekunden(ziel), szenen: clips.length };
}
