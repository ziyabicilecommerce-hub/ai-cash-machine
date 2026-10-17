// Ziya Studio: eine Idee rein, ein fertiges KI-Video (9:16) raus - kostenlos, nach dem Higgsfield-Prinzip.
// 1) Idee -> 1-5 Shots planen (Totale, Nah, Effekt) mit Kamera-Preset   2) je Shot ein Startbild (Pollinations Flux)
// 3) Bild -> echter KI-Clip (Wan 2.2 -> LTX -> CogVideoX-Flash), leer = Preset-Kamerafahrt als Rückfall
// 4) Nachbearbeitung (Upscale 1080x1920, 30 fps Zwischenbilder, Schärfe, Farblook, Korn)   5) Shots weich überblenden.
// Eingaben: ZIYA_IDEE, ZIYA_PRESET, ZIYA_SHOTS (1-5), ZIYA_MENSCHEN=ja (Personen erlauben), ZIYA_SEKUNDEN (2-5).
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ladeBild, dauerSekunden } from './lib/videoFabrik.mjs';
import { zhipuClip } from './lib/kiVideo.mjs';
import { PRESETS, presetVon, shotsPlanen, modellReihe, nachbearbeitung, kamerafahrt, ueberblendung } from './lib/ziyaStudio.mjs';

const LOG = '[ziya-studio]';
const ausfuehren = promisify(execFile);
const ORDNER = resolve('out/ziya-studio');
const B = 1080;
const H = 1920;

const idee = String(process.env.ZIYA_IDEE || '').trim();
const preset = presetVon(process.env.ZIYA_PRESET);
const sekunden = Math.min(Math.max(Number(process.env.ZIYA_SEKUNDEN) || 3.5, 2), 5);
const menschen = /^(1|ja|true|an)$/i.test(String(process.env.ZIYA_MENSCHEN || '').trim());
const NEG = `static, still image, blurry, distorted, deformed, morphing, extra limbs, text, watermark, subtitles${menschen ? '' : ', people, faces'}`;

const ffmpeg = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'pipe', timeout: 600000 });

async function kiClipHolen(bild, prompt, ziel, erschoepft) {
  for (const m of modellReihe(erschoepft, { zhipu: !!process.env.ZHIPU_API_KEY })) {
    try {
      if (m === 'zhipu') await zhipuClip(bild, prompt, ziel);
      else {
        await ausfuehren('python3', [resolve('scripts/ki_clip.py'), bild, prompt, ziel, m], {
          timeout: 300000, env: { ...process.env, KI_CLIP_NEG: NEG, KI_CLIP_DAUER: String(sekunden), KI_CLIP_SCHRITTE: process.env.ZIYA_SCHRITTE || '8' },
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

async function main() {
  if (!idee) throw new Error('ZIYA_IDEE fehlt - beschreibe dein Video in einem Satz.');
  mkdirSync(ORDNER, { recursive: true });
  const shots = shotsPlanen(idee, preset, process.env.ZIYA_SHOTS);
  const seed = Math.floor(Math.random() * 1e9);
  const erschoepft = new Set();
  const fertig = [];
  console.log(`${LOG} "${idee}" · Preset ${PRESETS[preset].name} · ${shots.length} Shot(s)`);

  for (const s of shots) {
    const bild = join(ORDNER, `shot${s.nr}.jpg`);
    const roh = join(ORDNER, `shot${s.nr}-roh.mp4`);
    const ziel = join(ORDNER, `shot${s.nr}.mp4`);
    // Gleicher Grund-Seed für alle Shots, damit Stil und Farben zusammenpassen.
    if (!(await ladeBild(s.bild, bild, { breite: 768, hoehe: 1344, seed: seed + s.nr, enhance: true }))) {
      console.log(`${LOG} Shot ${s.nr}: kein Startbild, übersprungen`);
      continue;
    }
    const modell = await kiClipHolen(bild, s.bewegung, roh, erschoepft);
    if (modell) {
      ffmpeg(['-i', roh, '-an', '-vf', nachbearbeitung(s.preset, { breite: B, hoehe: H }), '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', ziel]);
    } else {
      ffmpeg(['-i', bild, '-vf', `${kamerafahrt(s.preset, { breite: B, hoehe: H, sekunden })},${nachbearbeitung(s.preset, { roh: false })}`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', ziel]);
    }
    fertig.push({ ...s, datei: ziel, modell: modell || 'kamerafahrt', dauer: dauerSekunden(ziel) });
    console.log(`${LOG} ✓ Shot ${s.nr} (${PRESETS[s.preset].name}) mit ${modell || 'Kamerafahrt (kein KI-Kontingent)'}`);
  }
  if (!fertig.length) throw new Error('Kein einziger Shot entstanden (Bildquelle nicht erreichbar).');

  const stempel = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const video = join(ORDNER, `ziya-${stempel}.mp4`);
  const { filter } = ueberblendung(fertig.map((f) => f.dauer));
  ffmpeg([...fertig.flatMap((f) => ['-i', f.datei]), '-filter_complex', filter, '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video]);

  const bericht = { idee, preset, video: video.replace(`${resolve('.')}/`, ''), shots: fertig.map(({ nr, preset: p, modell, dauer }) => ({ nr, preset: p, modell, dauer })) };
  writeFileSync(join(ORDNER, 'bericht.json'), JSON.stringify(bericht, null, 2));
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
