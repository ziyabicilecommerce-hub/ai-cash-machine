// Echte KI-Videoclips statt Standbild mit Kamerafahrt: jedes Szenenbild wird über kostenlose Hugging-Face-Spaces
// (Wan 2.2 / LTX-Video, Bild-zu-Video) zum bewegten Clip, optional CogVideoX-Flash (Zhipu AI, kostenlos). Ohne Schlüssel, Tageskontingent pro IP - ist es
// aufgebraucht, fällt die Szene still auf die 3D-Kamerafahrt zurück. VIDEO_KI_CLIPS=aus schaltet ab.
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ausfuehren = promisify(execFile);
const zustand = { aus: /^(0|nein|aus|false)$/i.test(String(process.env.VIDEO_KI_CLIPS || '').trim()), erschoepft: new Set(), ok: 0, fehler: 0 };
export const kiClipStatus = () => ({ ok: zustand.ok, fehler: zustand.fehler, erschoepft: [...zustand.erschoepft] });

// Bewegungs-Prompt: Szene + ruhige Kamera, damit nichts zappelt.
export const bewegungsPrompt = (bild) => `${String(bild || '').replace(/,?\s*no (text|people)[^,]*/gi, '').slice(0, 300)}, smooth cinematic camera motion, natural movement, highly detailed`;

// Hook-Szene bekommt das bessere Modell (Wan), der Rest das schnellere (LTX); ist eins erschöpft, das andere.
// Mit ZHIPU_API_KEY (kostenloses Konto bei Zhipu AI) kommt CogVideoX-Flash als dritte, kostenlose Quelle dazu.
export function modelleFuer(index, erschoepft = new Set(), { zhipu = !!process.env.ZHIPU_API_KEY } = {}) {
  return [...(index === 0 ? ['wan', 'ltx'] : ['ltx', 'wan']), ...(zhipu ? ['zhipu'] : [])].filter((m) => !erschoepft.has(m));
}

// Zhipu AI (bigmodel.cn bzw. z.ai international): CogVideoX-Flash ist dort ein kostenloses Modell.
// Auftrag anlegen, dann das Ergebnis abfragen (dauert ~3 Minuten).
const ZHIPU_BASIS = () => (process.env.ZHIPU_API_BASE || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '');
export const zhipuAuftrag = (bildBase64, prompt) => ({ model: process.env.ZHIPU_VIDEO_MODELL || 'cogvideox-flash', prompt: String(prompt).slice(0, 500), image_url: `data:image/jpeg;base64,${bildBase64}` });
async function zhipuClip(bild, prompt, ziel, { warten = 15000, versuche = 40 } = {}) {
  const kopf = { authorization: `Bearer ${process.env.ZHIPU_API_KEY}`, 'content-type': 'application/json' };
  const start = await fetch(`${ZHIPU_BASIS()}/videos/generations`, { method: 'POST', headers: kopf, body: JSON.stringify(zhipuAuftrag(readFileSync(bild).toString('base64'), prompt)) });
  const auftrag = await start.json().catch(() => ({}));
  if (start.status === 429) { const e = new Error('Zhipu: Limit erreicht'); e.code = 3; throw e; }
  if (!start.ok || !auftrag.id) throw new Error(`Zhipu ${start.status}: ${JSON.stringify(auftrag).slice(0, 160)}`);
  for (let n = 0; n < versuche; n++) {
    await new Promise((r) => setTimeout(r, warten));
    const r = await (await fetch(`${ZHIPU_BASIS()}/async-result/${auftrag.id}`, { headers: kopf })).json().catch(() => ({}));
    if (r.task_status === 'FAIL') throw new Error('Zhipu: Erzeugung fehlgeschlagen');
    const url = r.video_result?.[0]?.url;
    if (r.task_status === 'SUCCESS' && url) {
      writeFileSync(ziel, Buffer.from(await (await fetch(url)).arrayBuffer()));
      return ziel;
    }
  }
  throw new Error('Zhipu: Zeitüberschreitung');
}

// Ein Clip aus einem Standbild -> Pfad (mp4, ~3 s) oder '' (dann Rückfall).
export async function kiClip(bild, prompt, ziel, { index = 0 } = {}) {
  if (zustand.aus || !bild || !existsSync(bild)) return '';
  for (const m of modelleFuer(index, zustand.erschoepft)) {
    try {
      if (m === 'zhipu') await zhipuClip(bild, bewegungsPrompt(prompt), ziel);
      else await ausfuehren('python3', [resolve('scripts/ki_clip.py'), resolve(bild), bewegungsPrompt(prompt), resolve(ziel), m], { timeout: 240000 });
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
