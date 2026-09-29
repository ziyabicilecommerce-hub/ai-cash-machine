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

// Beat fuer Produkt-Ads (120 BPM): Kick mit Tonhoehen-Abfall, Hi-Hat auf dem Offbeat,
// leiser Akkord darunter. Rein synthetisch, daher ohne Lizenzfragen.
const BEATS = {
  house: [
    '0.5*sin(2*PI*(48+70*exp(-28*mod(t,0.5)))*mod(t,0.5))*exp(-8*mod(t,0.5))',
    '0.06*(random(0)*2-1)*exp(-70*mod(t+0.25,0.5))',
    '0.035*(sin(2*PI*220*t)+sin(2*PI*277.18*t)+sin(2*PI*329.63*t))*(0.6+0.4*sin(2*PI*0.125*t))',
  ],
  // Trap (140 BPM, Half-Time): langer 808-Kick, schnelle Hi-Hats, Snare auf 3.
  trap: [
    '0.55*sin(2*PI*(45+60*exp(-20*mod(t,0.857)))*mod(t,0.857))*exp(-3*mod(t,0.857))',
    '0.045*(random(0)*2-1)*exp(-120*mod(t,0.1071))',
    '0.12*(random(1)*2-1)*exp(-25*mod(t+0.4285,0.857))',
    '0.03*(sin(2*PI*196*t)+sin(2*PI*233.08*t))',
  ],
  // Lo-Fi (85 BPM): weicher Kick, leise Hats, Jazz-Akkord (Cmaj7).
  lofi: [
    '0.4*sin(2*PI*(50+40*exp(-25*mod(t,0.706)))*mod(t,0.706))*exp(-9*mod(t,0.706))',
    '0.03*(random(0)*2-1)*exp(-80*mod(t+0.353,0.706))',
    '0.03*(sin(2*PI*261.63*t)+sin(2*PI*329.63*t)+sin(2*PI*392*t)+sin(2*PI*493.88*t))*(0.7+0.3*sin(2*PI*0.2*t))',
  ],
  // Pop (110 BPM): Four-on-the-floor, Clap auf 2 und 4, G-Dur-Akkord.
  pop: [
    '0.5*sin(2*PI*(50+70*exp(-28*mod(t,0.545)))*mod(t,0.545))*exp(-8*mod(t,0.545))',
    '0.1*(random(1)*2-1)*exp(-30*mod(t+0.545,1.09))',
    '0.05*(random(0)*2-1)*exp(-70*mod(t+0.2725,0.545))',
    '0.03*(sin(2*PI*196*t)+sin(2*PI*246.94*t)+sin(2*PI*293.66*t))',
  ],
};
export const BEAT_STILE = Object.keys(BEATS);

// Whoosh an jedem Szenenwechsel: Rauschen mit kurzer Glockenkurve, per Bandpass geformt.
const whooshFormel = (zeiten) => zeiten.slice(0, 60).map((z) => `exp(-pow((t-${z.toFixed(2)})/0.09,2))`).join('+');

// Langsame, schwebende Klangflaeche (oder Beat) in Videolaenge, leise unter die Stimme gemischt.
// whoosh: Zeitpunkte (s), an denen ein Uebergangs-Rauschen liegt.
export async function musikUnterlegen(video, dauer, { stimmung = 'ruhig', lautstaerke, whoosh = [], ding = [], stil = 'house' } = {}) {
  const d = Math.ceil(dauer) + 1;
  let quelle;
  let kette;
  if (stimmung === 'beat') {
    quelle = (BEATS[stil] || BEATS.house).join('+');
    kette = `highpass=f=35,afade=t=in:d=1,afade=t=out:st=${Math.max(d - 2, 0)}:d=2,volume=${lautstaerke ?? 0.4}`;
  } else {
    const toene = STIMMUNGEN[stimmung] || STIMMUNGEN.ruhig;
    quelle = toene
      .map((hz, i) => `${(0.05 - i * 0.008).toFixed(3)}*sin(2*PI*${hz}*t)*(0.55+0.45*sin(2*PI*${(0.03 + i * 0.013).toFixed(3)}*t+${i}))`)
      .join('+');
    kette = `lowpass=f=1400,aecho=0.8:0.6:600|1100:0.25|0.15,afade=t=in:d=3,afade=t=out:st=${Math.max(d - 4, 0)}:d=4,volume=${lautstaerke ?? 1.2}`;
  }
  const mitWhoosh = whoosh.length > 0;
  // "Ding" (zwei helle, abklingende Toene) z. B. wenn das Preisschild erscheint.
  const dingFormel = ding.slice(0, 5).map((z) => `if(gte(t,${z.toFixed(2)}),(0.22*sin(2*PI*1760*(t-${z.toFixed(2)}))+0.12*sin(2*PI*2637*(t-${z.toFixed(2)})))*exp(-6*(t-${z.toFixed(2)})),0)`).join('+');
  const tmp = `${video}.musik.mp4`;
  await ausfuehren('ffmpeg', [
    '-loglevel', 'error', '-y', '-i', video,
    '-f', 'lavfi', '-i', `aevalsrc='${quelle}':s=44100:d=${d}`,
    ...(mitWhoosh ? ['-f', 'lavfi', '-i', `aevalsrc='0.5*(random(1)*2-1)*(${whooshFormel(whoosh)})':s=44100:d=${d}`] : []),
    ...(dingFormel ? ['-f', 'lavfi', '-i', `aevalsrc='${dingFormel}':s=44100:d=${d}`] : []),
    '-filter_complex',
    // Beat: Musik duckt sich per Sidechain unter die Stimme, am Ende Lautheit wie auf TikTok/Reels (-14 LUFS).
    (stimmung === 'beat'
      ? `[0:a]asplit[s1][s2];[1:a]${kette},aformat=channel_layouts=stereo[m0];[m0][s2]sidechaincompress=threshold=0.02:ratio=5:attack=15:release=350[m];`
      : `[0:a]anull[s1];[1:a]${kette},aformat=channel_layouts=stereo[m];`) +
      (mitWhoosh ? '[2:a]bandpass=f=1500:width_type=o:w=2.5,volume=0.8,aformat=channel_layouts=stereo[w];' : '') +
      (dingFormel ? `[${mitWhoosh ? 3 : 2}:a]aformat=channel_layouts=stereo[dg];` : '') +
      `[s1][m]${mitWhoosh ? '[w]' : ''}${dingFormel ? '[dg]' : ''}amix=inputs=${2 + (mitWhoosh ? 1 : 0) + (dingFormel ? 1 : 0)}` +
      `:duration=first:normalize=0${stimmung === 'beat' ? ',loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100' : ''}[a]`,
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

// Tages-Highlights: die ersten Sekunden (Hook) mehrerer Videos hintereinander - ein eigenes
// Kurzvideo "Die Top-Produkte des Tages", Lautheit auf -14 LUFS.
export async function zusammenschnittBauen(videos, ziel, { sekunden = 6 } = {}) {
  const n = videos.length;
  const teile = videos.map((_, i) => `[${i}:v]setpts=PTS-STARTPTS,fps=30,scale=1080:1920,setsar=1,format=yuv420p[v${i}];[${i}:a]asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo[a${i}]`).join(';');
  const kette = videos.map((_, i) => `[v${i}][a${i}]`).join('');
  const gesamt = n * sekunden;
  await ausfuehren('ffmpeg', [
    '-loglevel', 'error', '-y', ...videos.flatMap((v) => ['-t', String(sekunden), '-i', v]),
    '-filter_complex', `${teile};${kette}concat=n=${n}:v=1:a=1[vc][ac];[vc]fade=t=out:st=${gesamt - 0.6}:d=0.6[v];[ac]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=44100,afade=t=out:st=${gesamt - 0.6}:d=0.6[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', ziel,
  ], { timeout: 1200000, maxBuffer: 16 * 1024 * 1024 });
  return gesamt;
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
