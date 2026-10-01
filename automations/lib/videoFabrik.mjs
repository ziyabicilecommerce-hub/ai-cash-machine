// Video-Fabrik (#94): baut aus Skript + KI-Bildern + KI-Stimme ein fertiges
// Video mit Untertiteln - komplett ohne API-Key. Bilder: Pollinations.
// Stimme: edge-tts (kostenlose Microsoft-Stimmen). Schnitt: ffmpeg.
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { bildURL } from './pollinationsMedia.mjs';
import { musikUnterlegen, untertitelZusammenfuegen, BEAT_STILE, BEAT_PERIODE } from './videoExtras.mjs';
import { freistellen, hintergrundHolen, assAusSrt, ebenenVorbereiten, premiumSzene, premiumStandbild, themaFuer, preisText, glanzBauen, bokehBauen } from './premium.mjs';
import { effekteAn, lichtLeckBauen, qrBauen, uebergangFuer, endkarteAss, funkelnAss, strahlenBauen } from './effekte.mjs';
import { anwendungBild } from './anwendung.mjs';

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
// Asynchron, damit waehrend Stimme/Schnitt schon das naechste Bild geladen wird.
const ausfuehren = promisify(execFile);

export function dauerSekunden(datei) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', datei]).toString().trim();
  return Number(out) || 0;
}

export async function ladeBild(prompt, ziel, { breite, hoehe, seed, enhance }) {
  for (let versuch = 0; versuch < 4; versuch++) {
    try {
      const res = await fetch(bildURL(prompt, { width: breite, height: hoehe, seed, enhance }), { signal: AbortSignal.timeout(120000) });
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
export async function sprechen(text, mp3, srt, stimme, { tonhoehe = '', tempo = '' } = {}) {
  const txt = `${mp3}.txt`;
  writeFileSync(txt, text);
  const extra = [...(tonhoehe ? [`--pitch=${tonhoehe}`] : []), ...(tempo ? [`--rate=${tempo}`] : [])];
  for (let versuch = 0; ; versuch++) {
    try {
      await ausfuehren('edge-tts', ['--voice', stimme, ...extra, '--file', txt, '--write-media', mp3, '--write-subtitles', srt], { timeout: 120000 });
      return;
    } catch (err) {
      if (versuch >= 2) throw err;
      await warte(3000 * (versuch + 1));
    }
  }
}

const SCHRIFT_FETT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

// drawtext nutzt DejaVu (Latein, Kyrillisch, Griechisch). Andere Schriften (Arabisch, CJK,
// Indisch, Thai ...) wuerden als Kaestchen erscheinen - dann kein Text-Overlay. Untertitel
// laufen ueber libass mit Noto-Fallback und koennen alle Schriften.
export const schriftOk = (text) => /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{N}\p{P}\p{S}\p{Zs}\p{M}]*$/u.test(String(text));

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

// Weichgezeichneter Hintergrund aus dem Produktfoto (Premium-Ersatz, wenn kein KI-Hintergrund da ist).
function unscharfHintergrund(roh, ziel, { breite, hoehe }) {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', roh, '-vf', `scale=${breite}:${hoehe}:force_original_aspect_ratio=increase,crop=${breite}:${hoehe},boxblur=40:6,eq=brightness=-0.12:saturation=1.15`, '-frames:v', '1', '-q:v', '2', ziel], { stdio: 'pipe', timeout: 120000 });
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
export async function szeneRendern({ bild, mp3, srt, ziel, breite, hoehe, index, format, hook = '', schild = '' }) {
  const dauer = dauerSekunden(mp3) + 0.35;
  const frames = Math.ceil(dauer * 30);
  const k = kamera(index, frames);
  const schrift = format === 'quer' ? 16 : 12;
  const filter = [
    `scale=${breite * 2}:${hoehe * 2}`,
    `zoompan=z='${k.z}':x='${k.x}':y='${k.y}':d=${frames}:s=${breite}x${hoehe}:fps=30`,
    // Erste Szene ohne Schwarzblende - Bild 1 ist das, was im Feed stehen bleibt.
    ...(index === 0 ? [] : ['fade=in:0:6']),
    `fade=out:st=${Math.max(dauer - 0.25, 0).toFixed(2)}:d=0.25`,
    ...(schild && schriftOk(schild) ? [schildFilter(schild, ziel, breite, hoehe)] : []),
    ...(hook && schriftOk(hook) ? [hookFilter(hook, ziel, breite, hoehe)] : []),
    `subtitles='${srtPfadFuerFilter(srt)}':force_style='FontName=DejaVu Sans,FontSize=${schrift},Bold=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Shadow=0,Alignment=2,MarginV=40'`,
  ].join(',');
  await ausfuehren('ffmpeg', [
    '-loglevel', 'error', '-y', '-i', bild, '-i', mp3,
    '-vf', filter, '-t', dauer.toFixed(2),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-r', '30',
    '-c:a', 'aac', '-b:a', '160k', '-ar', '44100', '-ac', '2', '-af', 'apad',
    ziel,
  ], { timeout: 600000, maxBuffer: 16 * 1024 * 1024 });
}

// Grosse Schlagzeile oben in den ersten Sekunden (Hook fuer Kurzvideos).
function hookFilter(text, ziel, breite, hoehe) {
  const datei = `${ziel}.hook.txt`;
  writeFileSync(datei, umbrechen(text.toUpperCase(), breite > hoehe ? 30 : 15));
  const groesse = Math.round((breite > hoehe ? hoehe : breite) * 0.058);
  return `drawtext=fontfile=${SCHRIFT_FETT}:textfile='${filterPfad(datei)}':fontsize=${groesse}:fontcolor=white:line_spacing=${Math.round(groesse * 0.2)}:box=1:boxcolor=black@0.55:boxborderw=${Math.round(groesse * 0.4)}:x=(w-text_w)/2:y=h*0.12:enable='lt(t,3.5)':alpha='if(gt(t,3.0),(3.5-t)/0.5,1)'`;
}

// Vorschaubild: erstes Szenenbild abgedunkelt plus Titel.
export function vorschaubildBauen(bild, ziel, titel, { breite, hoehe }) {
  const datei = `${ziel}.titel.txt`;
  writeFileSync(datei, umbrechen(titel.toUpperCase(), breite > hoehe ? 22 : 12));
  const groesse = Math.round((breite > hoehe ? hoehe : breite) * 0.07);
  if (!titel || !schriftOk(titel)) {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', bild, '-vf', `scale=${breite}:${hoehe}`, '-frames:v', '1', '-q:v', '3', ziel], { stdio: 'pipe', timeout: 120000 });
    return;
  }
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

// Holt das Rohbild einer Szene: echtes Produktfoto, sonst KI-Bild.
async function bildHolen(szene, roh, { breite, hoehe, stil }) {
  // Anwendungs-Szene: Person mit dem echten Produkt (Produktfoto als Vorlage), sonst normales Produktfoto.
  if (szene.anwendung && (await anwendungBild(szene.anwendung, roh, { breite, hoehe }).catch(() => false))) return 'anwendung';
  if (szene.foto && (await ladeUrl(szene.foto, roh).catch(() => false))) return 'produkt';
  if (szene.bild && (await ladeBild(`${szene.bild}, family friendly, fully clothed${stil ? `, ${stil}` : ''}`, roh, { breite, hoehe }))) return 'vollbild';
  return '';
}

// Baut ein komplettes Video. Szene: {text, foto?: URL eines echten Produktfotos, bild?: KI-Bild-Prompt, stimme?, tonhoehe?, tempo?: eigene Sprecherstimme, schild?: Name oben links}.
// bildAlle: nur jede n-te Szene bekommt ein neues Bild (die anderen nutzen es mit anderer
// Kamerabewegung weiter) - so passen auch 1-Stunden-Videos in das 6-Stunden-Limit.
// musik: 'ruhig' | 'anime' legt eine eigene, leise Klangflaeche darunter. Szene.kapitel setzt
// eine YouTube-Kapitelmarke. Zurueck kommen auch Kapitelmarken und eine Gesamt-.srt.
// premium: Produkt freigestellt vor KI-Hintergrund (skript.hintergrund = {prompt, seed}),
// 2.5D-Parallaxe, Farblook, Wort-fuer-Wort-Untertitel, Beat und Whoosh (siehe premium.mjs).
export async function videoBauen(skript, ordner, { format = 'hoch', stimme = 'de-DE-SeraphinaMultilingualNeural', stil = '', hook = '', bildAlle = 1, musik = '', premium = false, sprache = 'de' } = {}) {
  if (!existsSync(ordner)) mkdirSync(ordner, { recursive: true });
  const [breite, hoehe] = format === 'quer' ? [1920, 1080] : [1080, 1920];
  const szenen = skript.szenen;
  const neu = (i) => i % Math.max(1, bildAlle) === 0;
  const vorab = new Map();
  const holen = (i) => {
    if (!vorab.has(i)) vorab.set(i, bildHolen(szenen[i], join(ordner, `r${i}.img`), { breite, hoehe, stil }).catch(() => ''));
    return vorab.get(i);
  };
  const clips = [];
  const srtTeile = [];
  const kapitel = [];
  let zeit = 0;
  let letztesBild = '';
  let ebenen = null;
  let produktEbenen = null;
  const hgKi = join(ordner, 'hintergrund.jpg');
  const mitKiHg = premium && (await hintergrundHolen(skript.hintergrund, hgKi, { breite, hoehe, laden: ladeBild }).catch(() => false));
  // Premium: erst alle Szenen sprechen - so ist die Gesamtlaenge fuer den Fortschrittsbalken bekannt.
  // Etwas schnellere Stimme (+6 %) wirkt in Ads energischer.
  const dauern = [];
  if (premium) {
    for (const [i, szene] of szenen.entries()) {
      try {
        await sprechen(szene.text, join(ordner, `s${i}.mp3`), join(ordner, `s${i}.srt`), szene.stimme || stimme, { tonhoehe: szene.tonhoehe, tempo: szene.tempo || '+6%' });
        dauern[i] = dauerSekunden(join(ordner, `s${i}.mp3`)) + 0.3;
      } catch { dauern[i] = 0; }
    }
  }
  const gesamt = dauern.reduce((a, b) => a + (b || 0), 0) || 1;
  const glanz = premium ? glanzBauen(join(ordner, 'glanz.png'), hoehe) : '';
  const bokeh = premium ? bokehBauen(join(ordner, 'bokeh.png'), breite, hoehe) : '';
  // Effekt-Paket: Zoom-Punch, wechselnde Uebergaenge, Light-Leak, QR-Endkarte (VIDEO_EFFEKTE=0 schaltet ab).
  const fx = premium && effekteAn();
  const leck = fx ? lichtLeckBauen(join(ordner, 'leck.png'), breite, hoehe) : '';
  const qr = fx ? qrBauen(skript.link, join(ordner, 'qr.png')) : '';
  const strahlen = fx ? strahlenBauen(join(ordner, 'strahlen.png'), Math.round(breite * 1.3)) : '';
  // Beat-Stil schon hier festlegen: Musik und Beat-Pump im Bild laufen im selben Takt.
  const beatStil = BEAT_STILE[Math.abs(Number(skript.hintergrund?.seed) || 0) % BEAT_STILE.length];
  // Untertitel-Stil wechselt je Produkt (VIDEO_UNTERTITEL=karaoke|box legt ihn fest).
  const seedZahl = Math.abs(Number(skript.hintergrund?.seed) || 0);
  const untertitelStil = /^(karaoke|box)$/.test(process.env.VIDEO_UNTERTITEL || '') ? process.env.VIDEO_UNTERTITEL : seedZahl % 2 ? 'box' : 'karaoke';
  let dingZeit = 0;
  const start = Date.now();
  for (const [i, szene] of szenen.entries()) {
    const bild = join(ordner, `s${i}.jpg`);
    const mp3 = join(ordner, `s${i}.mp3`);
    const srt = join(ordner, `s${i}.srt`);
    const clip = join(ordner, `s${i}.mp4`);
    const modus = neu(i) || !letztesBild ? await holen(i) : '';
    // Naechstes neues Bild schon laden, waehrend diese Szene gesprochen und geschnitten wird.
    const naechstes = szenen.findIndex((_, j) => j > i && neu(j));
    if (naechstes > 0) holen(naechstes);
    try {
      if (premium) {
        const roh = join(ordner, `r${i}.img`);
        if (modus === 'produkt') {
          const vg = join(ordner, `s${i}.png`);
          const hg = mitKiHg ? hgKi : join(ordner, `s${i}.hg.jpg`);
          if (!mitKiHg) unscharfHintergrund(roh, hg, { breite, hoehe });
          ebenen = ebenenVorbereiten({ hg, vg: (await freistellen(roh, vg).catch(() => false)) ? vg : roh, breite, hoehe, basis: join(ordner, `e${i}`) });
          produktEbenen ||= ebenen;
        } else if (modus) ebenen = ebenenVorbereiten({ hg: roh, vg: '', breite, hoehe, basis: join(ordner, `e${i}`) });
        else if (!ebenen) continue;
        premiumStandbild({ ...ebenen, ziel: bild, breite, hoehe });
      } else if (modus) bildVorbereiten(join(ordner, `r${i}.img`), bild, { breite, hoehe, modus });
      else if (letztesBild) execFileSync('cp', [letztesBild, bild]);
      else continue;
      if (!premium) await sprechen(szene.text, mp3, srt, szene.stimme || stimme, { tonhoehe: szene.tonhoehe, tempo: szene.tempo });
      else if (!dauern[i]) continue;
      if (premium) {
        const ass = join(ordner, `s${i}.ass`);
        // Hook und Endkarte (Preis + Shop) laufen ueber .ass - so klappen sie in allen 50 Sprachen.
        const letzte = i === szenen.length - 1;
        assAusSrt(srt, ass, {
          breite, hoehe, sprache, thema: themaFuer(skript.hintergrund?.seed),
          hook: clips.length === 0 ? hook : '',
          hinweis: modus === 'anwendung' ? 'KI-Beispiel' : '',
          preis: szene.preis ? preisText(szene.preis, sprache, skript.waehrung) : letzte ? preisText(skript.preis, sprache, skript.waehrung) : '',
          rang: szene.rang || 0,
          shop: letzte && !fx ? skript.shop || '' : '',
          marke: String(skript.shop || '').split('.')[0].toUpperCase(), untertitelStil,
          fortschritt: { von: dauern.slice(0, i).reduce((a, b) => a + (b || 0), 0) / gesamt, bis: dauern.slice(0, i + 1).reduce((a, b) => a + (b || 0), 0) / gesamt, dauerMs: dauern[i] * 1000 },
        });
        if (letzte) dingZeit = zeit + 0.4;
        if (fx && letzte) endkarteAss(ass, { breite, hoehe, qr: !!qr, shop: skript.shop || '', cta: skript.cta || 'LINK IN BIO' });
        const mitPreis = !!(szene.preis || (letzte && skript.preis));
        if (fx && ebenen?.fgP) funkelnAss(ass, { breite, hoehe, dauerMs: dauern[i] * 1000, seed: seedZahl + i, burst: mitPreis ? { x: Math.round(breite * 0.7), y: Math.round(hoehe * 0.1), ms: 380 } : null });
        const hookSzene = clips.length === 0;
        const effekt = fx ? { art: uebergangFuer(clips.length), leck, qr: letzte ? qr : '', wackeln: hookSzene, drop: hookSzene, strahlen: hookSzene ? strahlen : '', beat: { p: BEAT_PERIODE[beatStil], off: zeit }, stoss: mitPreis ? 0.38 : null } : null;
        await premiumSzene({ ...ebenen, mp3, ass, ziel: clip, breite, hoehe, dauer: dauerSekunden(mp3) + 0.3, index: i, glanz, bokeh, nah: i % 3 === 2 && i < szenen.length - 1, effekt });
      } else await szeneRendern({ bild, mp3, srt, ziel: clip, breite, hoehe, index: i, format, hook: clips.length === 0 ? hook : '', schild: szene.schild || '' });
      letztesBild = bild;
      clips.push(clip);
      if (szene.kapitel) kapitel.push({ zeit, titel: szene.kapitel });
      srtTeile.push({ srt, start: zeit });
      zeit += dauerSekunden(clip);
    } catch (err) {
      console.log(`[video-fabrik] Szene ${i + 1} uebersprungen: ${String(err.message).slice(0, 200)}`);
    }
    if (szenen.length > 40 && (i + 1) % 25 === 0) console.log(`[video-fabrik] ${i + 1}/${szenen.length} Szenen (${Math.round((Date.now() - start) / 60000)} Min.)`);
  }
  if (!clips.length) throw new Error('Keine einzige Szene konnte gerendert werden.');
  const ziel = join(ordner, 'video.mp4');
  zusammenfuegen(clips, ziel, ordner);
  // Reine Stimmspur (vor der Musik) - z. B. fuer die lippensynchrone KI-Moderatorin.
  const stimmspur = join(ordner, 'stimme.wav');
  try { execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', ziel, '-vn', '-ac', '1', '-ar', '16000', stimmspur], { stdio: 'pipe', timeout: 300000 }); } catch { /* ohne Stimmspur */ }
  if (musik || premium) {
    try {
      await musikUnterlegen(ziel, zeit, premium && !musik ? { stimmung: 'beat', stil: beatStil, whoosh: srtTeile.slice(1).map((t) => t.start), ding: dingZeit ? [dingZeit] : [], boom: fx ? [0.05] : [], riser: fx && dingZeit ? [dingZeit - 0.4] : [] } : { stimmung: musik });
    } catch (err) {
      console.log(`[video-fabrik] Musik fehlgeschlagen: ${String(err.message).slice(0, 150)}`);
    }
  }
  const untertitel = join(ordner, 'untertitel.srt');
  untertitelZusammenfuegen(srtTeile, untertitel);
  let vorschau = '';
  try {
    vorschau = join(ordner, 'vorschau.jpg');
    vorschaubildBauen(clips[0].replace(/\.mp4$/, '.jpg'), vorschau, skript.hook || skript.titel || '', { breite, hoehe });
  } catch (err) {
    console.log(`[video-fabrik] Vorschaubild fehlgeschlagen: ${String(err.message).slice(0, 150)}`);
    vorschau = '';
  }
  return { pfad: ziel, vorschau, untertitel, kapitel, dauer: dauerSekunden(ziel), szenen: clips.length, ebenen: produktEbenen, stimme: existsSync(stimmspur) ? stimmspur : '' };
}
