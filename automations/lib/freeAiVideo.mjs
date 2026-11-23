// free.ai als weitere kostenlose Quelle für echte KI-Clips (23.11., Nutzer: "binde free.ai an"): Wan 2.2 Bild-zu-Video.
// Gratis-Konto (E-Mail bestätigen, keine Karte) hat 30.000 Tokens am Tag - ein Clip kostet laut free.ai genau so viel,
// also ~1 Clip pro Tag. Deshalb nur für die Hook-Szene. Schlüssel als GitHub-Secret FREEAI_API_KEY.
// Bekannt (free.ai-Seiten): POST /v1/upload/ (Bild hochladen -> öffentliche URL), POST /v1/video/generate/ mit
// { prompt, duration, aspect_ratio, model, image_url }, Bearer-Auth. Antwortform und Abfrage-Endpunkt sind nicht
// öffentlich beschrieben - deshalb tolerant: Video-URL irgendwo in der Antwort suchen, sonst Auftrags-ID abfragen.
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const BASIS = () => (process.env.FREEAI_API_BASE || 'https://api.free.ai').replace(/\/$/, '');
const kopf = () => ({ authorization: `Bearer ${process.env.FREEAI_API_KEY}` });

// Erste Video-URL irgendwo in einer (verschachtelten) Antwort
export function findeVideoUrl(x) {
  if (typeof x === 'string') return /^https?:\/\/\S+\.(mp4|webm|mov)(\?\S*)?$/i.test(x) ? x : '';
  if (x && typeof x === 'object') for (const v of Object.values(x)) { const u = findeVideoUrl(v); if (u) return u; }
  return '';
}
export const findeId = (x) => String(x?.id || x?.job_id || x?.task_id || x?.data?.id || x?.data?.job_id || x?.data?.task_id || '');
export const fehlgeschlagen = (x) => /fail|error|cancel/i.test(String(x?.status || x?.state || x?.data?.status || ''));
// Kein Guthaben/Limit -> für heute erschöpft (code 3 wie bei den anderen Quellen)
export const erschoepft = (status, x) => status === 402 || status === 429 || /insufficient|quota|limit|tokens/i.test(JSON.stringify(x || {}).slice(0, 400));

async function hochladen(bild) {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(bild)], { type: 'image/jpeg' }), basename(bild).replace(/\.\w+$/, '') + '.jpg');
  const r = await fetch(`${BASIS()}/v1/upload/`, { method: 'POST', headers: kopf(), body: form });
  const d = await r.json().catch(() => ({}));
  const url = d.url || d.public_url || d.file_url || d.data?.url || d.data?.public_url;
  if (!r.ok || !url) throw Object.assign(new Error(`free.ai Upload ${r.status}: ${JSON.stringify(d).slice(0, 160)}`), erschoepft(r.status, d) ? { code: 3 } : {});
  return url;
}

export async function freeAiClip(bild, prompt, ziel, { warten = 10000, versuche = 36 } = {}) {
  const image_url = await hochladen(bild);
  const body = { prompt: String(prompt).slice(0, 500), duration: 5, aspect_ratio: '9:16', image_url, ...(process.env.FREEAI_VIDEO_MODELL ? { model: process.env.FREEAI_VIDEO_MODELL } : {}) };
  const r = await fetch(`${BASIS()}/v1/video/generate/`, { method: 'POST', headers: { ...kopf(), 'content-type': 'application/json' }, body: JSON.stringify(body) });
  let d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`free.ai ${r.status}: ${JSON.stringify(d).slice(0, 160)}`), erschoepft(r.status, d) ? { code: 3 } : {});
  let url = findeVideoUrl(d);
  const id = findeId(d);
  // Asynchron: mögliche Abfrage-Endpunkte der Reihe nach probieren, bis eine Video-URL kommt
  const wege = id ? [`/v1/video/generate/${id}/`, `/v1/video/${id}/`, `/v1/jobs/${id}/`, `/v1/video/status/${id}/`] : [];
  for (let n = 0; !url && id && n < versuche; n++) {
    await new Promise((res) => setTimeout(res, warten));
    for (const w of wege) {
      const a = await fetch(`${BASIS()}${w}`, { headers: kopf() }).catch(() => null);
      if (!a || !a.ok) continue;
      d = await a.json().catch(() => ({}));
      if (fehlgeschlagen(d)) throw new Error(`free.ai: Erzeugung fehlgeschlagen (${JSON.stringify(d).slice(0, 120)})`);
      url = findeVideoUrl(d);
      if (url) break;
    }
  }
  if (!url) throw new Error(`free.ai: keine Video-URL bekommen (${JSON.stringify(d).slice(0, 160)})`);
  writeFileSync(ziel, Buffer.from(await (await fetch(url)).arrayBuffer()));
  return ziel;
}
