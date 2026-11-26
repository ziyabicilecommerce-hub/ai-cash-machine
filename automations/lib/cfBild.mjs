// Kostenlose KI-Bilder MIT Figuren-Vorlage über Cloudflare Workers AI (26.11., Nutzer: "kostenlos, für immer").
// FLUX.2 [klein] 4B nimmt bis zu 4 Referenzbilder (input_image_0..3, je < 512 px) -> gleiche Figuren in jeder Szene.
// Gratis-Kontingent: 10.000 Neurons pro Tag (laut Berichten ~100 Neurons pro Bild). Secrets: CF_ACCOUNT_ID, CF_API_TOKEN.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

export const CF_BILD_MODELL = () => process.env.CF_BILD_MODELL || '@cf/black-forest-labs/flux-2-klein-4b';
export const cfBereit = () => !!(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN);

// Referenz auf höchstens 504 px verkleinern (Cloudflare verlangt < 512 px je Eingabebild)
export function refVerkleinern(datei) {
  return execFileSync('ffmpeg', ['-loglevel', 'error', '-i', datei, '-vf', 'scale=504:504:force_original_aspect_ratio=decrease', '-q:v', '3', '-f', 'mjpeg', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000 });
}

// Antwort tolerant lesen: JSON {result:{image: base64}} oder direkt Bilddaten
export async function bildAusAntwort(res) {
  const typ = res.headers.get('content-type') || '';
  if (typ.startsWith('image/')) return Buffer.from(await res.arrayBuffer());
  const d = await res.json().catch(() => ({}));
  const b64 = d?.result?.image || d?.image || '';
  if (!res.ok || !b64) throw new Error(`Cloudflare ${res.status}: ${String(d?.errors?.[0]?.message || JSON.stringify(d).slice(0, 160))}`);
  return Buffer.from(b64, 'base64');
}

export async function cfBild(prompt, refs, ziel, { breite = 720, hoehe = 1280, laden = fetch } = {}) {
  const form = new FormData();
  form.append('prompt', String(prompt).slice(0, 2000));
  form.append('width', String(breite));
  form.append('height', String(hoehe));
  refs.slice(0, 4).forEach((r, i) => form.append(`input_image_${i}`, new Blob([refVerkleinern(r)], { type: 'image/jpeg' }), `ref${i}.jpg`));
  const res = await laden(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(process.env.CF_ACCOUNT_ID)}/ai/run/${CF_BILD_MODELL()}`, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.CF_API_TOKEN}` }, body: form, signal: AbortSignal.timeout(180000),
  });
  writeFileSync(ziel, await bildAusAntwort(res));
  if (readFileSync(ziel).length < 5000) throw new Error('Cloudflare: Bild zu klein / leer');
  return ziel;
}
