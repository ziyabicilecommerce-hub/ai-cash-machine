// Video-Fabrik (#94): baut aus Skript + KI-Bildern + KI-Stimme ein fertiges
// Video mit Untertiteln - komplett ohne API-Key. Bilder: Pollinations.
// Stimme: edge-tts (kostenlose Microsoft-Stimmen). Schnitt: ffmpeg.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
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

// tonhoehe/tempo z. B. "+6Hz" / "-5%" - macht Figuren mit gleicher Grundstimme unterscheidbar.
export function sprechen(text, mp3, srt, stimme, { tonhoehe = '', tempo = '' } = {}) {
  const txt = `${mp3}.txt`;
  writeFileSync(txt, text);
  const extra = [...(tonhoehe ? [`--pitch=${tonhoehe}`] : []), ...(tempo ? [`--rate=${tempo}`] : [])];
  execFileSync('edge-tts', ['--voice', stimme, ...extra, '--file', txt, '--write-media', mp3, '--write-subtitles', srt], { stdio: 'pipe', timeout: 120000 });
}

const SCHRIFT_FETT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

// Bricht Text fuer drawtext in Zeilen um (drawtext kann nicht selbst umbrechen).
export function umbrechen(text, maxZeichen) {
  const zeilen = [];
  let zeile = '';
  for (const wort of String(text).replace(/\s+/g, ' ').trim().split(' ')) {
    if ((zeile + ' ' + wort).trim().length > maxZeichen && zeile) {
      zeilen.push(zeile);
      zeile = wort;
    } else zeile = (zeile + ' ' + wort).trim();
  }
  if (zeile) zeilen.push(zeile);
  return zeilen.slice(0, 4).join('\n');
}

function filterPfad(pfad) {
  return resolve(pfad).replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function srtPfadFuerFilter(pfad) {
  return pfad.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

// Macht aus einem Rohbild ein sauberes Standbild im Zielformat. "produkt":
// Produktfoto mittig, dahinter derselbe Hintergrund weichgezeichnet (Ad-Look).
// "vollbild": einfach formatfuellend zugeschnitten (fuer KI-Szenenbilder).
export function bildVorbereiten(roh, ziel, { breite, hoehe, modus }) {
  const cover = `scale=${breite}:${hoehe}:force_original_aspect_ratio=increase,crop=${breite}:${hoehe}`;
  const filter = modus === 'produkt'
    ? `[0:v]${cover},boxblur=40:6,eq=brightness=-0.10:saturation=1.1[bg];[0:v]scale=${Math.round(breite * 0.9)}:${Math.round(hoehe * 0.72)}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2-${Math.round(hoehe * 0.04)}`
    : `[0:v]crop=iw:ih*0.93:0:0,${cover}`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', roh, '-filter_complex', filter, '-frames:v', '1', '-q:v', '2', ziel], { stdio: 'pipe', timeout: 120000 });
}

// Kamerabewegung im Wechsel: Zoom rein, Zoom raus, Schwenk nach rechts, Schwenk nach links.
function kamera(index, frames) {
  const mitte = { x: 'iw/2-(iw/zoom/2)', y: 'ih/2-(ih/zoom/2)' };
  switch (index % 4) {
    case 0: return { z: 'min(zoom+0.0006,1.12)', ...mitte };
    case 1: return { z: 'if(eq(on,0),1.12,max(zoom-0.0006,1.0))', ...mitte };
    case 2: return { z: '1.12', x: `(iw-iw/zoom)*on/${frames}`, y: mitte.y };
    default: return { z: '1.12', x: `(iw-iw/zoom)*(1-on/${frames})`, y: mitte.y };
  }
}

// Namensschild oben links (wer gerade spricht), wie in einer Anime-Synchronisation.
function schildFilter(name, ziel, breite, hoehe) {
  const datei = `${ziel}.name.txt`;
  writeFileSync(datei, name.toUpperCase());
  const groesse = Math.round((breite > hoehe ? hoehe : breite) * 0.04);
  const rand = Math.round(groesse * 0.9);
  return `drawtext=fontfile=${SCHRIFT_FETT}:textfile='${filterPfad(datei)}':fontsize=${groesse}:fontcolor=white:box=1:boxcolor=0xff8a3d@0.85:boxborderw=${Math.round(groesse * 0.35)}:x=${rand}:y=${rand}`;
}

// Eine Szene: vorbereitetes Standbild mit Kamerabewegung, Stimme, Untertitel.
export function szeneRendern({ bild, mp3, srt, ziel, breite, hoehe, index, format, hook = '', schild = '' }) {
  const dauer = dauerSekunden(mp3) + 0.35;
  const frames = Math.ceil(dauer * 30);
  const k = kamera(index, frames);
  const schrift = format === 'quer' ? 16 : 12;
  const filter = [
    `scale=${breite * 2}:${hoehe * 2}`,
    `zoompan=z='${k.z}':x='${k.x}':y='${k.y}':d=${frames}:s=${breite}x${hoehe}:fps=30`,
    'fade=in:0:6',
    `fade=out:st=${Math.max(dauer - 0.25, 0).toFixed(2)}:d=0.25`,
    ...(schild ? [schildFilter(schild, ziel, breite, hoehe)] : []),
    ...(hook ? [hookFilter(hook, ziel, breite, hoehe)] : []),
    `subtitles='${srtPfadFuerFilter(srt)}':force_style='FontName=DejaVu Sans,FontSize=${schrift},Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,Alignment=2,MarginV=40'`,
  ].join(',');
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-i', bild, '-i', mp3,
    '-vf', filter, '-t', dauer.toFixed(2),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', '-af', 'apad',
    ziel,
  ], { stdio: 'pipe', timeout: 600000 });
}

// Grosse Schlagzeile oben in den ersten Sekunden (Hook fuer Kurzvideos).
function hookFilter(text, ziel, breite, hoehe) {
  const datei = `${ziel}.hook.txt`;
  writeFileSync(datei, umbrechen(text.toUpperCase(), breite > hoehe ? 30 : 15));
  const groesse = Math.round((breite > hoehe ? hoehe : breite) * 0.058);
  return `drawtext=fontfile=${SCHRIFT_FETT}:textfile='${filterPfad(datei)}':fontsize=${groesse}:fontcolor=white:line_spacing=${Math.round(groesse * 0.2)}:box=1:boxcolor=black@0.55:boxborderw=${Math.round(groesse * 0.4)}:x=(w-text_w)/2:y=h*0.12:enable='lt(t,3.5)':alpha='if(lt(t,0.25),t/0.25,if(gt(t,3.0),(3.5-t)/0.5,1))'`;
}

// Vorschaubild: erstes Szenenbild abgedunkelt plus Titel.
export function vorschaubildBauen(bild, ziel, titel, { breite, hoehe }) {
  const datei = `${ziel}.titel.txt`;
  writeFileSync(datei, umbrechen(titel.toUpperCase(), breite > hoehe ? 22 : 12));
  const groesse = Math.round((breite > hoehe ? hoehe : breite) * 0.07);
  const filter = `scale=${breite}:${hoehe},eq=brightness=-0.12,drawtext=fontfile=${SCHRIFT_FETT}:textfile='${filterPfad(datei)}':fontsize=${groesse}:fontcolor=white:borderw=${Math.round(groesse * 0.08)}:bordercolor=black:line_spacing=${Math.round(groesse * 0.15)}:x=(w-text_w)/2:y=(h-text_h)/2`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', bild, '-vf', filter, '-frames:v', '1', '-q:v', '3', ziel], { stdio: 'pipe', timeout: 120000 });
}

export function zusammenfuegen(szenen, ziel, ordner) {
  const liste = join(ordner, 'liste.txt');
  writeFileSync(liste, szenen.map((s) => `file '${resolve(s).replace(/'/g, "'\\''")}'`).join('\n'));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', liste, '-c', 'copy', '-movflags', '+faststart', ziel], { stdio: 'pipe', timeout: 600000 });
}

async function ladeUrl(url, ziel) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) return false;
  writeFileSync(ziel, Buffer.from(await res.arrayBuffer()));
  return true;
}

// Baut ein komplettes Video. Szene: {text, foto?: URL eines echten Produktfotos, bild?: KI-Bild-Prompt, stimme?, tonhoehe?, tempo?: eigene Sprecherstimme, schild?: Name oben links}.
export async function videoBauen(skript, ordner, { format = 'hoch', stimme = 'de-DE-SeraphinaMultilingualNeural', stil = '', hook = '' } = {}) {
  if (!existsSync(ordner)) mkdirSync(ordner, { recursive: true });
  const [breite, hoehe] = format === 'quer' ? [1920, 1080] : [1080, 1920];
  const clips = [];
  let letztesBild = '';
  for (const [i, szene] of skript.szenen.entries()) {
    const roh = join(ordner, `r${i}.img`);
    const bild = join(ordner, `s${i}.jpg`);
    const mp3 = join(ordner, `s${i}.mp3`);
    const srt = join(ordner, `s${i}.srt`);
    const clip = join(ordner, `s${i}.mp4`);
    let ok = false;
    let modus = 'vollbild';
    if (szene.foto) {
      ok = await ladeUrl(szene.foto, roh).catch(() => false);
      modus = 'produkt';
    }
    if (!ok && szene.bild) {
      ok = await ladeBild(`${szene.bild}, family friendly, fully clothed${stil ? `, ${stil}` : ''}`, roh, { breite, hoehe });
      modus = 'vollbild';
    }
    try {
      if (ok) bildVorbereiten(roh, bild, { breite, hoehe, modus });
      else if (letztesBild) execFileSync('cp', [letztesBild, bild]);
      else continue;
      sprechen(szene.text, mp3, srt, szene.stimme || stimme, { tonhoehe: szene.tonhoehe, tempo: szene.tempo });
      szeneRendern({ bild, mp3, srt, ziel: clip, breite, hoehe, index: i, format, hook: clips.length === 0 ? hook : '', schild: szene.schild || '' });
      letztesBild = bild;
      clips.push(clip);
    } catch (err) {
      console.log(`[video-fabrik] Szene ${i + 1} uebersprungen: ${String(err.message).slice(0, 200)}`);
    }
  }
  if (!clips.length) throw new Error('Keine einzige Szene konnte gerendert werden.');
  const ziel = join(ordner, 'video.mp4');
  zusammenfuegen(clips, ziel, ordner);
  let vorschau = '';
  try {
    vorschau = join(ordner, 'vorschau.jpg');
    vorschaubildBauen(clips[0].replace(/\.mp4$/, '.jpg'), vorschau, skript.hook || skript.titel || '', { breite, hoehe });
  } catch (err) {
    console.log(`[video-fabrik] Vorschaubild fehlgeschlagen: ${String(err.message).slice(0, 150)}`);
    vorschau = '';
  }
  return { pfad: ziel, vorschau, dauer: dauerSekunden(ziel), szenen: clips.length };
}
