// Seedance (ByteDance) über die offizielle BytePlus-ModelArk-API. Neue BytePlus-Konten bekommen ein kostenloses
// Startkontingent an Video-Tokens - ist es leer, springt der Ziya-Router still auf die Gratis-Modelle zurück.
// Braucht das Secret BYTEPLUS_API_KEY. Ablauf: Auftrag anlegen, dann Ergebnis abfragen (asynchron).
import { readFileSync, writeFileSync } from 'node:fs';

const BASIS = () => (process.env.BYTEPLUS_API_BASE || 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/$/, '');
export const SEEDANCE_STANDARD = 'seedance-1-0-pro-250528';

// Auftrag: Text mit Steuerbefehlen (Seitenverhältnis wie das Startbild, Länge, Auflösung) + Startbild als data-URL.
export function seedanceAuftrag(bildBase64, prompt, { sekunden = 5, modell = process.env.SEEDANCE_MODELL || SEEDANCE_STANDARD, aufloesung = '720p' } = {}) {
  const dauer = Math.min(Math.max(Math.round(Number(sekunden) || 5), 3), 10);
  return {
    model: modell,
    content: [
      { type: 'text', text: `${String(prompt).replace(/\s+/g, ' ').trim().slice(0, 700)} --ratio adaptive --duration ${dauer} --resolution ${aufloesung} --watermark false` },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${bildBase64}` } },
    ],
  };
}

// Kontingent leer / Schlüssel ungültig -> Code 3 (der Router nimmt dann das nächste Modell).
const leer = (status, text) => status === 401 || status === 403 || status === 429 || /quota|insufficient|balance|limit|exceed/i.test(text);

export async function seedanceClip(bild, prompt, ziel, { sekunden = 5, warten = 10000, versuche = 60 } = {}) {
  const kopf = { authorization: `Bearer ${process.env.BYTEPLUS_API_KEY}`, 'content-type': 'application/json' };
  const start = await fetch(`${BASIS()}/contents/generations/tasks`, { method: 'POST', headers: kopf, body: JSON.stringify(seedanceAuftrag(readFileSync(bild).toString('base64'), prompt, { sekunden })) });
  const text = await start.text();
  const auftrag = (() => { try { return JSON.parse(text); } catch { return {}; } })();
  if (!start.ok || !auftrag.id) {
    const e = new Error(`Seedance ${start.status}: ${text.slice(0, 160)}`);
    if (leer(start.status, text)) e.code = 3;
    throw e;
  }
  for (let n = 0; n < versuche; n++) {
    await new Promise((r) => setTimeout(r, warten));
    const r = await (await fetch(`${BASIS()}/contents/generations/tasks/${auftrag.id}`, { headers: kopf })).json().catch(() => ({}));
    if (r.status === 'failed' || r.status === 'cancelled') throw new Error(`Seedance: ${r.error?.message || r.status}`);
    if (r.status === 'succeeded' && r.content?.video_url) {
      writeFileSync(ziel, Buffer.from(await (await fetch(r.content.video_url)).arrayBuffer()));
      return ziel;
    }
  }
  throw new Error('Seedance: Zeitüberschreitung');
}
