// Ziya Studio: eine Idee rein, ein fertiges KI-Video (9:16) raus - kostenlos, nach dem Higgsfield-Prinzip.
// 1) Idee -> 1-5 Shots planen (Totale, Nah, Effekt) mit Kamera-Preset   2) je Shot ein Startbild (Pollinations Flux)
// 3) Bild -> echter KI-Clip (Wan 2.2 -> LTX -> CogVideoX-Flash), leer = Preset-Kamerafahrt als Rückfall
// 4) Nachbearbeitung (Upscale 1080x1920, 60 fps Zwischenbilder, Schärfe, Farblook, Korn)   5) Shots weich überblenden.
// 6) Tonspur: eigener Kino-Klang (Drone, Whoosh an Schnitten, Boom) + optional Sprecher (edge-tts), Lautheit wie TikTok.
// Eingaben: ZIYA_IDEE, ZIYA_PRESET, ZIYA_SHOTS (1-18, ~60 s), ZIYA_MENSCHEN=ja (Personen erlauben), ZIYA_SEKUNDEN (2-5),
// ZIYA_GESCHICHTE=ja (Kurzfilm mit eigenen Figuren, jede Szene ein anderer Moment), ZIYA_STIL (kino|cartoon|anime),
// ZIYA_LOOP=ja (nahtloser Loop, Endbild = Startbild), ZIYA_DURCHGEHEND=ja (jeder Shot startet mit dem letzten Bild des vorigen = eine durchgehende Szene), ZIYA_TEXT (Sprechertext).
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ladeBild, dauerSekunden, sprechen } from './lib/videoFabrik.mjs';
import { zhipuClip } from './lib/kiVideo.mjs';
import { seedanceClip } from './lib/seedance.mjs';
import { kaggleBereit, kaggleClips } from './lib/kaggleTurbo.mjs';
import { modalBereit, modalClips } from './lib/modalTurbo.mjs';
import { bildURL } from './lib/pollinationsMedia.mjs';
import { geschichtePlanen, STILE, stilVon } from './lib/ziyaGeschichte.mjs';
import { kiJson } from './lib/kiJson.mjs';
import { nachtwerkProjekt, datenUrl } from './lib/nachtwerkProjekt.mjs';
import { PRESETS, presetVon, shotsPlanen, modellReihe, poolModelle, nachbearbeitung, kamerafahrt, ueberblendung, tonFormel, schnittArt, KRASS, LEBENDIG, hookFilter, hookUmbrechen, uebersetzenPrompt, besterCoverZeitpunkt } from './lib/ziyaStudio.mjs';

const LOG = '[ziya-studio]';
const ausfuehren = promisify(execFile);
const START = Date.now();
// Zeitbudget (Job-Limit 340 min): nach 270 min kein Real-ESRGAN mehr (dauert ~4 min pro Kaggle-Clip), nur noch Lanczos.
const HD_BIS_MIN = 270;
const ORDNER = resolve('out/ziya-studio');
const B = 1080;
const H = 1920;
// 60 fps: TikTok-Maximum, butterweich (Zwischenbilder per minterpolate). ZIYA_FPS=30 für schnellere Läufe.
const FPS = Number(process.env.ZIYA_FPS) === 30 ? 30 : 60;

const idee = String(process.env.ZIYA_IDEE || '').trim();
const preset = presetVon(process.env.ZIYA_PRESET);
const sekunden = Math.min(Math.max(Number(process.env.ZIYA_SEKUNDEN) || 3.5, 2), 5);
// Loop: Endbild = Startbild, der Clip endet, wo er anfing - TikTok spielt ihn nahtlos weiter (mehr Wiederholungen).
const loop = /^(1|ja|true|an)$/i.test(String(process.env.ZIYA_LOOP || '').trim());
const geschichte = /^(1|ja|true|an)$/i.test(String(process.env.ZIYA_GESCHICHTE || '').trim());
// Krass-Modus: Vorschau-Hook am Anfang, Impact-Schnitte (Blitz, Wackler, Bass), intensivere Bewegung, große Untertitel.
const krass = /^(1|ja|true|an)$/i.test(String(process.env.ZIYA_KRASS || '').trim());
const SCHNITT = schnittArt(presetVon(process.env.ZIYA_PRESET), { krass });
const stil = stilVon(process.env.ZIYA_STIL);
// Geschichte = viele verschiedene Orte/Momente, also kein Weiterdrehen aus dem letzten Bild.
const durchgehend = !geschichte && /^(1|ja|true|an)$/i.test(String(process.env.ZIYA_DURCHGEHEND || '').trim());
let sprechertext = String(process.env.ZIYA_TEXT || '').replace(/\s+/g, ' ').trim().slice(0, 600);
// Anime-Kampf braucht Figuren - dort sind Menschen immer erlaubt.
const menschen = preset === 'anime-kampf' || geschichte || /^(1|ja|true|an)$/i.test(String(process.env.ZIYA_MENSCHEN || '').trim());
const NEG = `static, still image, blurry, distorted, deformed, morphing, extra limbs, text, watermark, subtitles${menschen ? '' : ', people, faces'}`;

// Gratis-Video-Spaces aus dem wöchentlichen Pool (leer, wenn die Datei fehlt).
const POOL = (() => { try { return JSON.parse(readFileSync(resolve('ki-video/spaces.json'), 'utf8')); } catch { return {}; } })();

const ffmpeg = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'pipe', timeout: 600000 });

// KI-Hochskalierer (Real-ESRGAN x4, CPU): kleine KI-Clips werden echt hochgerechnet statt gestreckt.
// ZIYA_HD=aus schaltet ab; klappt es nicht, geht es mit dem Originalclip weiter.
function hochskalieren(quelle, ziel) {
  if (/^(0|nein|aus|false)$/i.test(String(process.env.ZIYA_HD || '').trim())) return quelle;
  if ((Date.now() - START) / 60000 > HD_BIS_MIN) { console.log(`${LOG} Zeitbudget knapp - Hochskalierung per Lanczos`); return quelle; }
  try {
    const t = Date.now();
    execFileSync('python3', [resolve('scripts/hochskalieren.py'), quelle, ziel, preset === 'anime-kampf' ? 'anime' : 'allgemein'], { stdio: 'pipe', timeout: 1800000 });
    if (existsSync(ziel)) { console.log(`${LOG} KI-Hochskalierung (Real-ESRGAN) in ${Math.round((Date.now() - t) / 1000)} s`); return ziel; }
  } catch (err) {
    if (err.status === 3) console.log(`${LOG} Clip schon groß genug - Lanczos statt KI-Hochskalierung`);
    else console.log(`${LOG} Hochskalierung übersprungen: ${String(err.stderr || err.message).slice(-200)}`);
  }
  return quelle;
}

async function kiClipHolen(bild, prompt, ziel, erschoepft) {
  // Loop braucht ein Endbild - das kann nur wan14, die anderen bleiben als Rückfall.
  const reihe = [...modellReihe(erschoepft, { zhipu: !!process.env.ZHIPU_API_KEY, seedance: !!process.env.BYTEPLUS_API_KEY, anime: preset === 'anime-kampf' }),
    ...poolModelle(POOL, erschoepft, { anime: preset === 'anime-kampf' })];
  for (const m of reihe) {
    try {
      if (m === 'seedance') await seedanceClip(bild, prompt, ziel, { sekunden: Math.max(sekunden, 5) });
      else if (m === 'zhipu') await zhipuClip(bild, prompt, ziel);
      else {
        await ausfuehren('python3', [resolve('scripts/ki_clip.py'), bild, prompt, ziel, m], {
          timeout: 300000, env: { ...process.env, KI_CLIP_NEG: NEG, KI_CLIP_DAUER: String(sekunden), KI_CLIP_SCHRITTE: process.env.ZIYA_SCHRITTE || '8', KI_CLIP_ENDE: loop && m === 'wan14' ? bild : '' },
        });
      }
      if (existsSync(ziel)) return m;
    } catch (err) {
      if (err.code === 3) { erschoepft.add(m); console.log(`${LOG} Kontingent ${m} für heute aufgebraucht`); }
      else {
        const text = String(err.stderr || err.message);
        console.log(`${LOG} ${m} fehlgeschlagen: ${text.slice(0, 160)}`);
        // Kaputte oder pausierte Spaces kommen heute nicht wieder - nicht bei jedem Shot erneut fragen.
        if (/PAUSED|RepositoryNotFound|RUNTIME_ERROR|BUILD_ERROR|does not exist|404/i.test(text)) erschoepft.add(m);
      }
    }
  }
  return '';
}

// Klang + optional Sprecher unterlegen; der Klang duckt sich unter die Stimme. Klappt etwas nicht: Video ohne Ton.
async function tonDrauf(stumm, video, dauern, { text = sprechertext, sprecher = process.env.ZIYA_STIMME || 'de-DE-ConradNeural', name = 'stimme' } = {}) {
  const laenge = dauerSekunden(stumm);
  const klang = `aevalsrc='${tonFormel(dauern, preset, { ...SCHNITT, krass })}':s=44100:d=${laenge.toFixed(2)}`;
  let stimme = '';
  if (text) {
    try {
      stimme = join(ORDNER, `${name}.mp3`);
      await sprechen(text, stimme, join(ORDNER, `${name}.srt`), sprecher);
    } catch (err) { stimme = ''; console.log(`${LOG} Sprecher übersprungen: ${err.message}`); }
  }
  const mix = stimme
    ? '[1:a]aformat=channel_layouts=stereo,volume=0.8[k];[2:a]adelay=400|400,aformat=channel_layouts=stereo,apad,asplit[s1][s2];[k][s1]sidechaincompress=threshold=0.03:ratio=6:release=400[kd];[kd][s2]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5[a]'
    : '[1:a]aformat=channel_layouts=stereo,afade=t=out:st=' + Math.max(laenge - 1.5, 0).toFixed(2) + ':d=1.5,loudnorm=I=-14:TP=-1.5[a]';
  try {
    ffmpeg(['-i', stumm, '-f', 'lavfi', '-i', klang, ...(stimme ? ['-i', stimme] : []), '-filter_complex', mix, '-map', '0:v', '-map', '[a]',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', laenge.toFixed(2), '-movflags', '+faststart', video]);
  } catch (err) {
    console.log(`${LOG} Tonspur fehlgeschlagen, Video ohne Ton: ${String(err.stderr || err.message).slice(0, 200)}`);
    ffmpeg(['-i', stumm, '-c', 'copy', '-movflags', '+faststart', video]);
  }
}

// Startbild laden (zweiter Versuch ohne Prompt-Erweiterung). Ohne Gratis-Schlüssel stempelt der Bilddienst
// "pollinations.ai" unten rechts ins Bild: die Ecke wegschneiden und wieder auf 768x1344 bringen.
async function startbild(s, seed) {
  const bild = join(ORDNER, `shot${s.nr}.jpg`);
  const ok = await ladeBild(s.bild, bild, { breite: 768, hoehe: 1344, seed: seed + s.nr, enhance: true })
    || await ladeBild(s.bild, bild, { breite: 768, hoehe: 1344, seed: seed + s.nr + 100, enhance: false });
  // Bild-Retter-Bot: Bilddienst down (#201: 503) -> freie FLUX-Spaces auf Hugging Face, ohne Schlüssel.
  if (!ok) {
    try {
      await ausfuehren('python3', [resolve('scripts/ki_bild.py'), s.bild.slice(0, 900), bild, '768', '1344', String(seed + s.nr)], { timeout: 240000 });
      if (existsSync(bild)) { console.log(`${LOG} Shot ${s.nr}: Startbild vom Bild-Retter (FLUX-Space)`); return true; }
    } catch (err) { console.log(`${LOG} Bild-Retter ohne Erfolg: ${String(err.stdout || err.message).slice(-200)}`); }
  }
  if (ok && !process.env.POLLINATIONS_TOKEN) {
    const roh = join(ORDNER, `shot${s.nr}-wz.jpg`);
    try { copyFileSync(bild, roh); ffmpeg(['-i', roh, '-vf', 'crop=iw*0.92:ih*0.92:0:0,scale=768:1344', '-q:v', '2', bild]); } catch { copyFileSync(roh, bild); }
  }
  return ok;
}

// Krass: große TikTok-Untertitel (weiß, dicker schwarzer Rand, Bildmitte unten) aus der Sprecher-Spur einbrennen.
function untertitelEinbrennen(video, srt = join(ORDNER, 'stimme.srt')) {
  if (!existsSync(srt)) return;
  const mit = join(ORDNER, 'mit-untertitel.mp4');
  const stil = 'FontName=DejaVu Sans,Bold=1,FontSize=12,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2.5,Shadow=0,Alignment=2,MarginV=38';
  try {
    ffmpeg(['-i', video, '-vf', `subtitles=${srt.replace(/([\\:'])/g, '\\$1')}:force_style='${stil}'`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-c:a', 'copy', '-movflags', '+faststart', mit]);
    copyFileSync(mit, video);
  } catch (err) { console.log(`${LOG} Untertitel übersprungen: ${String(err.stderr || err.message).slice(0, 200)}`); }
}

// Hook: großer Text in den ersten 2,6 s (blendet aus) - hält die Zuschauer auf TikTok. Text über Datei, damit kein
// Zeichen den Filter bricht; ohne Schrift oder bei Fehlern bleibt das Video wie es ist.
// TikTok-Titelbild: Bild aus der ersten Sekunde (Höhepunkt-Hook + großer Hook-Text) als cover.jpg im Download.
// Nicht blind bei 1,0 s: dort lag am 24.10. genau der weiße Impact-Blitz (Titelbild fast komplett weiß). Mehrere
// Zeitpunkte mit sichtbarem Hook-Text prüfen und den nehmen, der am wenigsten über- oder unterbelichtet ist.
function coverBauen(video, datei = 'cover.jpg', mitHook = !!process.env.ZIYA_HOOK) {
  const zeiten = mitHook ? [0.4, 0.7, 1.7, 2.0, 2.3] : [0.4, 1.5, 2.5, 4];
  const hell = (t) => { try { const px = execFileSync('ffmpeg', ['-loglevel', 'error', '-ss', String(t), '-i', video, '-frames:v', '1', '-vf', 'scale=36:64,format=gray', '-f', 'rawvideo', 'pipe:1'], { stdio: 'pipe', timeout: 60000 }); return px.length ? px.reduce((a, b) => a + b, 0) / px.length : -1; } catch { return -1; } };
  const t = besterCoverZeitpunkt(zeiten.map((z) => [z, hell(z)]));
  try { ffmpeg(['-ss', String(t), '-i', video, '-frames:v', '1', '-q:v', '2', join(ORDNER, datei)]); console.log(`${LOG} TikTok-Titelbild: ${datei} (bei ${t} s)`); } catch { /* ohne Titelbild */ }
}

// ZIYA_ENDE: Abspann-Text in den letzten 2,5 s (Serien: "Fortsetzung folgt...").
const sauber = (x, n = 60) => String(x || '').replace(/\s+/g, ' ').trim().slice(0, n);
function hookEinblenden(video, { hook = sauber(process.env.ZIYA_HOOK), ende = sauber(process.env.ZIYA_ENDE) } = {}) {
  const schrift = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  if ((!hook && !ende) || !existsSync(schrift)) return;
  const filter = [];
  if (hook) { writeFileSync(join(ORDNER, 'hook.txt'), hookUmbrechen(hook.toUpperCase())); filter.push(hookFilter(join(ORDNER, 'hook.txt'), schrift)); }
  const laenge = dauerSekunden(video);
  if (ende && laenge > 6) { writeFileSync(join(ORDNER, 'ende.txt'), hookUmbrechen(ende.toUpperCase())); filter.push(hookFilter(join(ORDNER, 'ende.txt'), schrift, { ab: (laenge - 2.5).toFixed(2) })); }
  if (!filter.length) return;
  const mit = join(ORDNER, 'mit-hook.mp4');
  try {
    ffmpeg(['-i', video, '-vf', filter.join(','), '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-c:a', 'copy', '-movflags', '+faststart', mit]);
    copyFileSync(mit, video);
    console.log(`${LOG} Text eingeblendet: ${[hook, ende].filter(Boolean).join(' / ')}`);
  } catch (err) { console.log(`${LOG} Text übersprungen: ${String(err.stderr || err.message).slice(0, 200)}`); }
}

// Szenen ohne KI-Clip: zuerst 3D-Parallax (Tiefen-KI auf der CPU, Vorder-/Hintergrund bewegen sich verschieden),
// klappt das nicht, die flache Zoom-Fahrt. Beides mit lebendigem Licht und Körnung; Kaggle kann sie später ersetzen.
const OHNE_KI = new Set(['kamerafahrt', 'parallax']);
async function standbildFahrt(s, bild, ziel) {
  const roh = join(ORDNER, `shot${s.nr}-parallax.mp4`);
  if (!/^(0|nein|aus|false)$/i.test(String(process.env.ZIYA_PARALLAX || '').trim())) {
    try {
      await ausfuehren('python3', [resolve('scripts/parallax.py'), bild, roh, String(sekunden), PRESETS[s.preset].zoom || 'rein', String(B), String(H), String(FPS)], { timeout: 600000 });
      ffmpeg(['-i', roh, '-vf', `${LEBENDIG},${nachbearbeitung(s.preset, { roh: false, fps: FPS, krass })}`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', ziel]);
      return 'parallax';
    } catch (err) { console.log(`${LOG} 3D-Parallax übersprungen: ${String(err.stderr || err.message).slice(-200)}`); }
  }
  ffmpeg(['-i', bild, '-vf', `${kamerafahrt(s.preset, { breite: B, hoehe: H, sekunden, fps: FPS })},${nachbearbeitung(s.preset, { roh: false, fps: FPS, krass })}`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', ziel]);
  return 'kamerafahrt';
}

// Englische Fassung (ZIYA_ENGLISCH=ja): dieselben Bilder, englische Stimme/Untertitel/Hook - kostet keine GPU-Zeit.
// Übersetzt die Gratis-KI (zur Not die eigene im Lauf); klappt das nicht, gibt es eben nur die deutsche Fassung.
async function englischeFassung(stumm, deVideo, dauern) {
  const de = { text: sprechertext, hook: sauber(process.env.ZIYA_HOOK), ende: sauber(process.env.ZIYA_ENDE) };
  let en;
  try { en = await kiJson(uebersetzenPrompt(de), { maxTokens: 900 }); } catch (err) { console.log(`${LOG} Englische Fassung übersprungen: ${err.message}`); return ''; }
  const text = sauber(en?.text, 1500);
  if (de.text && text.length < 10) { console.log(`${LOG} Englische Fassung übersprungen: keine Übersetzung`); return ''; }
  const ziel = deVideo.replace(/\.mp4$/, '-en.mp4');
  await tonDrauf(stumm, ziel, dauern, { text, sprecher: process.env.ZIYA_STIMME_EN || 'en-US-GuyNeural', name: 'stimme-en' });
  if (krass) untertitelEinbrennen(ziel, join(ORDNER, 'stimme-en.srt'));
  const hook = sauber(en?.hook);
  hookEinblenden(ziel, { hook, ende: sauber(en?.ende) || (de.ende ? 'To be continued...' : '') });
  coverBauen(ziel, 'cover-en.jpg', !!hook);
  console.log(`${LOG} Englische Fassung: ${ziel.replace(`${resolve('.')}/`, '')}`);
  return ziel;
}

// Projektdatei für NACHTWERK (Handschnitt im Browser): Clips verkleinert (720x1280), damit die Datei handlich bleibt.
function nachtwerkSchreiben(fertig) {
  try {
    const shots = fertig.map((f) => {
      const klein = join(ORDNER, `nw-shot${f.nr}.mp4`);
      ffmpeg(['-i', f.datei, '-an', '-vf', 'scale=720:1280', '-c:v', 'libx264', '-preset', 'fast', '-crf', '26', '-pix_fmt', 'yuv420p', klein]);
      return { ...f, zoom: PRESETS[f.preset].zoom, daten: datenUrl(readFileSync(klein), 'video/mp4') };
    });
    const stimme = join(ORDNER, 'stimme.mp3');
    const projekt = nachtwerkProjekt({ idee, shots, genre: preset === 'grusel' ? 'horror' : 'fantasy',
      audio: existsSync(stimme) ? datenUrl(readFileSync(stimme), 'audio/mpeg') : null });
    writeFileSync(join(ORDNER, 'film.nachtwerk.json'), JSON.stringify(projekt));
    console.log(`${LOG} NACHTWERK-Projekt: film.nachtwerk.json (${shots.length} Szenen)`);
  } catch (err) { console.log(`${LOG} NACHTWERK-Projekt übersprungen: ${String(err.stderr || err.message).slice(0, 200)}`); }
}

async function main() {
  if (!idee) throw new Error('ZIYA_IDEE fehlt - beschreibe dein Video in einem Satz.');
  mkdirSync(ORDNER, { recursive: true });
  const shots = geschichte
    ? await geschichtePlanen(idee, { preset, n: Number(process.env.ZIYA_SHOTS) || 6, stil, kiJson, ersatz: () => shotsPlanen(idee, preset, process.env.ZIYA_SHOTS) })
    : shotsPlanen(idee, preset, process.env.ZIYA_SHOTS);
  if (stil !== 'kino') for (const s of shots) s.bild = s.bild.replace(STILE.kino, STILE[stil]);
  if (krass) for (const s of shots) s.bewegung = `${s.bewegung} ${KRASS}.`;
  // Geschichte ohne eigenen Sprechertext: der Erzähler liest die Sätze der Szenen.
  if (geschichte && !sprechertext) sprechertext = shots.map((s) => s.satz).filter(Boolean).join(' ').slice(0, 1500);
  const seed = Math.floor(Math.random() * 1e9);
  const erschoepft = new Set();
  const fertig = [];
  console.log(`${LOG} "${idee}" · Preset ${PRESETS[preset].name} · ${shots.length} Shot(s)`);

  // GPU-Turbo: Modal (30 $ Gratis-Guthaben/Monat, 720p, schnell) liefert alle Shots vorab, wenn eingerichtet.
  // Kaggle (T4, langsam, nicht immer verlässlich) bremst nie: es rechnet nebenher, während die Gratis-Spaces arbeiten,
  // und ersetzt am Ende nur Szenen, die sonst Standbild-Kamerafahrten geblieben wären. ZIYA_KAGGLE=aus schaltet es ab.
  // Startbilder vorab laden (gleiche Bilder für GPU und Rückfall, im gewählten Stil, ohne Wasserzeichen).
  const mitKaggle = kaggleBereit() && !/^(0|nein|aus|false)$/i.test(String(process.env.ZIYA_KAGGLE || '').trim());
  const gpu = modalBereit() ? 'modal' : mitKaggle ? 'kaggle' : '';
  if (gpu) for (const s of shots) await startbild(s, seed);
  const gpuShots = () => shots.map((s) => {
    const datei = join(ORDNER, `shot${s.nr}.jpg`);
    return { ...s, bildUrl: bildURL(s.bild, { width: 768, height: 1344, seed: seed + s.nr }), ...(existsSync(datei) ? { bildB64: readFileSync(datei).toString('base64') } : {}) };
  });
  // T4: Start + Modell ~15 min, dann ~19 min pro Clip. Höchstens 220 min (Job-Limit 340, danach Hochskalieren + Schnitt).
  const gpuOpts = { negativ: NEG, sekunden, qualitaet: process.env.ZIYA_QUALITAET || 'kino', maxMinuten: Math.min(Number(process.env.ZIYA_KAGGLE_MIN) || 220, 220, 60 + shots.length * 20) };
  const vonKaggle = gpu === 'modal' ? await modalClips(gpuShots(), ORDNER, gpuOpts) : new Map();
  // Kaggle rechnet von hinten: die ersten Shots schaffen meist noch die Gratis-Spaces, bevor ihr Tageslimit greift
  // (Test 24.10.: Kaggle baute Shot 1+2 umsonst). So landet jede Kaggle-Minute in einer Szene, die sonst Standbild bliebe.
  const kaggleNebenher = gpu === 'kaggle' ? kaggleClips(gpuShots().reverse(), ORDNER, gpuOpts).catch(() => new Map()) : null;
  let letzterRoh = '';
  for (const s of shots) {
    const bild = join(ORDNER, `shot${s.nr}.jpg`);
    const roh = join(ORDNER, `shot${s.nr}-roh.mp4`);
    const ziel = join(ORDNER, `shot${s.nr}.mp4`);
    // Durchgehend: letztes Bild des vorigen KI-Clips als Startbild - Motiv, Licht und Ort bleiben gleich (eine Szene).
    if (durchgehend && letzterRoh) {
      try { ffmpeg(['-sseof', '-0.1', '-i', letzterRoh, '-frames:v', '1', '-q:v', '2', bild]); } catch { /* dann neues Bild */ }
    }
    // Sonst gleicher Grund-Seed für alle Shots, damit Stil und Farben zusammenpassen.
    // Bildquelle hakt manchmal: zweiter Versuch ohne Prompt-Erweiterung, sonst das Bild des vorigen Shots.
    if (!existsSync(bild) && !(await startbild(s, seed))) {
      const vorher = fertig.length ? join(ORDNER, `shot${fertig[fertig.length - 1].nr}.jpg`) : '';
      if (!vorher || !existsSync(vorher)) {
        // Bilddienst down (#201: 503): Kaggle hat sich die Bilder evtl. selbst geholt - Platz für den Kaggle-Clip freihalten.
        if (kaggleNebenher) { fertig.push({ ...s, datei: join(ORDNER, `shot${s.nr}.mp4`), modell: 'fehlt', dauer: 0 }); console.log(`${LOG} Shot ${s.nr}: kein Startbild, wartet auf Kaggle`); }
        else console.log(`${LOG} Shot ${s.nr}: kein Startbild, übersprungen`);
        continue;
      }
      copyFileSync(vorher, bild);
      console.log(`${LOG} Shot ${s.nr}: Bildquelle hakt, nehme das Bild des vorigen Shots`);
    }
    if (vonKaggle.has(s.nr)) {
      copyFileSync(vonKaggle.get(s.nr), roh);
      const kbild = join(ORDNER, 'kaggle-out', `shot${s.nr}.jpg`);
      if (existsSync(kbild)) copyFileSync(kbild, bild);
    }
    const modell = vonKaggle.has(s.nr) ? gpu : await kiClipHolen(bild, s.bewegung, roh, erschoepft);
    letzterRoh = modell ? roh : '';
    if (modell) {
      const hd = hochskalieren(roh, join(ORDNER, `shot${s.nr}-hd.mp4`));
      ffmpeg(['-i', hd, '-an', '-vf', nachbearbeitung(s.preset, { breite: B, hoehe: H, fps: FPS, krass }), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', ziel]);
    }
    const rueckfall = modell ? '' : await standbildFahrt(s, bild, ziel);
    fertig.push({ ...s, datei: ziel, modell: modell || rueckfall, dauer: dauerSekunden(ziel) });
    console.log(`${LOG} ✓ Shot ${s.nr} (${PRESETS[s.preset].name}) mit ${modell || (rueckfall === 'parallax' ? '3D-Parallax (kein KI-Kontingent)' : 'Kamerafahrt (kein KI-Kontingent)')}`);
  }
  if (kaggleNebenher) {
    const offen = fertig.filter((f) => OHNE_KI.has(f.modell) || f.modell === 'fehlt');
    console.log(`${LOG} Kaggle: ${offen.length} Standbild-Szene(n) warten auf Kaggle-Clips`);
    const kaggle = offen.length ? await kaggleNebenher : new Map();
    for (const f of offen) {
      if (!kaggle.has(f.nr)) continue;
      const hd = hochskalieren(kaggle.get(f.nr), join(ORDNER, `shot${f.nr}-kaggle-hd.mp4`));
      ffmpeg(['-i', hd, '-an', '-vf', nachbearbeitung(f.preset, { breite: B, hoehe: H, fps: FPS, krass }), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', f.datei]);
      console.log(`${LOG} ✓ Shot ${f.nr}: Kaggle-Clip ${f.modell === 'fehlt' ? 'statt fehlendem Startbild' : 'ersetzt die Kamerafahrt'}`);
      Object.assign(f, { modell: 'kaggle', dauer: dauerSekunden(f.datei) });
    }
  }
  for (let i = fertig.length - 1; i >= 0; i--) if (fertig[i].modell === 'fehlt') fertig.splice(i, 1);
  if (!fertig.length) throw new Error('Kein einziger Shot entstanden (Bildquelle nicht erreichbar).');

  const stempel = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const video = join(ORDNER, `ziya-${stempel}.mp4`);
  // Krass: Hook - 1,2 s aus dem Höhepunkt (letzter KI-Clip) ganz vorne, dann Blitz und die Geschichte von vorn.
  if (krass && fertig.length > 2) {
    const hoehepunkt = [...fertig].reverse().find((f) => !OHNE_KI.has(f.modell)) || fertig[fertig.length - 1];
    const hook = join(ORDNER, 'hook.mp4');
    try {
      ffmpeg(['-ss', Math.max(hoehepunkt.dauer / 2 - 0.6, 0).toFixed(2), '-i', hoehepunkt.datei, '-t', '1.2', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p', hook]);
      fertig.unshift({ ...hoehepunkt, nr: 0, datei: hook, dauer: dauerSekunden(hook) });
    } catch (err) { console.log(`${LOG} Hook übersprungen: ${String(err.stderr || err.message).slice(0, 160)}`); }
  }
  const { filter } = ueberblendung(fertig.map((f) => f.dauer), SCHNITT);
  const stumm = join(ORDNER, 'stumm.mp4');
  ffmpeg([...fertig.flatMap((f) => ['-i', f.datei]), '-filter_complex', filter, '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', stumm]);
  await tonDrauf(stumm, video, fertig.map((f) => f.dauer));
  if (krass) untertitelEinbrennen(video);
  hookEinblenden(video);
  coverBauen(video);
  const videoEn = /^(1|ja|true|an)$/i.test(String(process.env.ZIYA_ENGLISCH || '').trim()) ? await englischeFassung(stumm, video, fertig.map((f) => f.dauer)) : '';

  const bericht = { idee, preset, video: video.replace(`${resolve('.')}/`, ''), ...(videoEn ? { video_en: videoEn.replace(`${resolve('.')}/`, '') } : {}), shots: fertig.map(({ nr, preset: p, modell, dauer }) => ({ nr, preset: p, modell, dauer })) };
  writeFileSync(join(ORDNER, 'bericht.json'), JSON.stringify(bericht, null, 2));
  nachtwerkSchreiben(fertig);
  const ki = fertig.filter((f) => !OHNE_KI.has(f.modell)).length;
  console.log(`${LOG} Fertig: ${bericht.video} · ${ki}/${fertig.length} Shots echte KI-Clips`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `## 🎬 Ziya Studio\n**Idee:** ${idee}\n\n**Preset:** ${PRESETS[preset].name} · **Shots:** ${fertig.length} · **echte KI-Clips:** ${ki}\n\n${fertig.map((f) => `- Shot ${f.nr}: ${PRESETS[f.preset].name} → ${f.modell}`).join('\n')}\n\nDas Video liegt unten bei **Artifacts** (ziya-video).\n`, { flag: 'a' });
  }
}

// exit: ein nicht mehr gebrauchter Kaggle-Lauf (Warte-Timer) soll den Job nicht offen halten.
main().then(() => process.exit(0)).catch((err) => {
  console.error(`${LOG} Fehler:`, err.message);
  process.exit(1);
});
