// Ziya Studio: eine Idee rein, ein fertiges KI-Video (9:16) raus - kostenlos, nach dem Higgsfield-Prinzip.
// 1) Idee -> 1-5 Shots planen (Totale, Nah, Effekt) mit Kamera-Preset   2) je Shot ein Startbild (Pollinations Flux)
// 3) Bild -> echter KI-Clip (Wan 2.2 -> LTX -> CogVideoX-Flash), leer = Preset-Kamerafahrt als Rückfall
// 4) Nachbearbeitung (Upscale 1080x1920, 30 fps Zwischenbilder, Schärfe, Farblook, Korn)   5) Shots weich überblenden.
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
import { PRESETS, presetVon, shotsPlanen, modellReihe, poolModelle, nachbearbeitung, kamerafahrt, ueberblendung, tonFormel, schnittArt } from './lib/ziyaStudio.mjs';

const LOG = '[ziya-studio]';
const ausfuehren = promisify(execFile);
const START = Date.now();
// Zeitbudget (Job-Limit 340 min): nach 230 min kein Real-ESRGAN mehr (dauert ~8 min pro Clip), nur noch Lanczos.
const HD_BIS_MIN = 230;
const ORDNER = resolve('out/ziya-studio');
const B = 1080;
const H = 1920;

const idee = String(process.env.ZIYA_IDEE || '').trim();
const preset = presetVon(process.env.ZIYA_PRESET);
const sekunden = Math.min(Math.max(Number(process.env.ZIYA_SEKUNDEN) || 3.5, 2), 5);
// Loop: Endbild = Startbild, der Clip endet, wo er anfing - TikTok spielt ihn nahtlos weiter (mehr Wiederholungen).
const loop = /^(1|ja|true|an)$/i.test(String(process.env.ZIYA_LOOP || '').trim());
const geschichte = /^(1|ja|true|an)$/i.test(String(process.env.ZIYA_GESCHICHTE || '').trim());
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
  } catch (err) { console.log(`${LOG} Hochskalierung übersprungen: ${String(err.stderr || err.message).slice(-200)}`); }
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
      else console.log(`${LOG} ${m} fehlgeschlagen: ${String(err.stderr || err.message).slice(0, 160)}`);
    }
  }
  return '';
}

// Klang + optional Sprecher unterlegen; der Klang duckt sich unter die Stimme. Klappt etwas nicht: Video ohne Ton.
async function tonDrauf(stumm, video, dauern) {
  const laenge = dauerSekunden(stumm);
  const klang = `aevalsrc='${tonFormel(dauern, preset, schnittArt(preset))}':s=44100:d=${laenge.toFixed(2)}`;
  let stimme = '';
  if (sprechertext) {
    try {
      stimme = join(ORDNER, 'stimme.mp3');
      await sprechen(sprechertext, stimme, join(ORDNER, 'stimme.srt'), process.env.ZIYA_STIMME || 'de-DE-ConradNeural');
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
  if (ok && !process.env.POLLINATIONS_TOKEN) {
    const roh = join(ORDNER, `shot${s.nr}-wz.jpg`);
    try { copyFileSync(bild, roh); ffmpeg(['-i', roh, '-vf', 'crop=iw*0.92:ih*0.92:0:0,scale=768:1344', '-q:v', '2', bild]); } catch { copyFileSync(roh, bild); }
  }
  return ok;
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
  // Geschichte ohne eigenen Sprechertext: der Erzähler liest die Sätze der Szenen.
  if (geschichte && !sprechertext) sprechertext = shots.map((s) => s.satz).filter(Boolean).join(' ').slice(0, 1500);
  const seed = Math.floor(Math.random() * 1e9);
  const erschoepft = new Set();
  const fertig = [];
  console.log(`${LOG} "${idee}" · Preset ${PRESETS[preset].name} · ${shots.length} Shot(s)`);

  // GPU-Turbo: alle Shots auf einmal - Modal (30 $ Gratis-Guthaben/Monat, 720p, keine Warteschlange) wenn eingerichtet,
  // sonst die kostenlose Kaggle-GPU (480x832, danach hochskaliert). Fehlt ein Clip, macht der Router unten weiter.
  // Startbilder vorab hier laden (gleiche Bilder für GPU und Rückfall, im gewählten Stil, ohne Wasserzeichen).
  const gpu = modalBereit() ? 'modal' : kaggleBereit() ? 'kaggle' : '';
  if (gpu) for (const s of shots) await startbild(s, seed);
  const vonKaggle = gpu
    ? await (gpu === 'modal' ? modalClips : kaggleClips)(shots.map((s) => {
      const datei = join(ORDNER, `shot${s.nr}.jpg`);
      return { ...s, bildUrl: bildURL(s.bild, { width: 768, height: 1344, seed: seed + s.nr }), ...(existsSync(datei) ? { bildB64: readFileSync(datei).toString('base64') } : {}) };
    }), ORDNER,
      // T4: Start + Modell ~15 min, dann ~15-20 min pro Clip (3 Shots brauchten >80 min). Höchstens 200 min.
      { negativ: NEG, sekunden, qualitaet: process.env.ZIYA_QUALITAET || 'kino', maxMinuten: Math.min(200, 60 + shots.length * 20) })
    : new Map();
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
      if (!vorher || !existsSync(vorher)) { console.log(`${LOG} Shot ${s.nr}: kein Startbild, übersprungen`); continue; }
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
      ffmpeg(['-i', hd, '-an', '-vf', nachbearbeitung(s.preset, { breite: B, hoehe: H }), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', ziel]);
    } else {
      ffmpeg(['-i', bild, '-vf', `${kamerafahrt(s.preset, { breite: B, hoehe: H, sekunden })},${nachbearbeitung(s.preset, { roh: false })}`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', ziel]);
    }
    fertig.push({ ...s, datei: ziel, modell: modell || 'kamerafahrt', dauer: dauerSekunden(ziel) });
    console.log(`${LOG} ✓ Shot ${s.nr} (${PRESETS[s.preset].name}) mit ${modell || 'Kamerafahrt (kein KI-Kontingent)'}`);
  }
  if (!fertig.length) throw new Error('Kein einziger Shot entstanden (Bildquelle nicht erreichbar).');

  const stempel = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const video = join(ORDNER, `ziya-${stempel}.mp4`);
  const { filter } = ueberblendung(fertig.map((f) => f.dauer), schnittArt(preset));
  const stumm = join(ORDNER, 'stumm.mp4');
  ffmpeg([...fertig.flatMap((f) => ['-i', f.datei]), '-filter_complex', filter, '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', stumm]);
  await tonDrauf(stumm, video, fertig.map((f) => f.dauer));

  const bericht = { idee, preset, video: video.replace(`${resolve('.')}/`, ''), shots: fertig.map(({ nr, preset: p, modell, dauer }) => ({ nr, preset: p, modell, dauer })) };
  writeFileSync(join(ORDNER, 'bericht.json'), JSON.stringify(bericht, null, 2));
  nachtwerkSchreiben(fertig);
  const ki = fertig.filter((f) => f.modell !== 'kamerafahrt').length;
  console.log(`${LOG} Fertig: ${bericht.video} · ${ki}/${fertig.length} Shots echte KI-Clips`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `## 🎬 Ziya Studio\n**Idee:** ${idee}\n\n**Preset:** ${PRESETS[preset].name} · **Shots:** ${fertig.length} · **echte KI-Clips:** ${ki}\n\n${fertig.map((f) => `- Shot ${f.nr}: ${PRESETS[f.preset].name} → ${f.modell}`).join('\n')}\n\nDas Video liegt unten bei **Artifacts** (ziya-video).\n`, { flag: 'a' });
  }
}

main().catch((err) => {
  console.error(`${LOG} Fehler:`, err.message);
  process.exit(1);
});
