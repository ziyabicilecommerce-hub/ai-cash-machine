// Seedance-Clips über BytePlus ModelArk (26.11., Nutzer: "genau diese Qualität, kostenlos, such international").
// Laut BytePlus-Preisseite gibt es pro Video-Modell ein Gratis-Kontingent an Tokens (einmalig, nicht täglich) - damit
// laufen echte Seedance-Clips vollautomatisch, bis es aufgebraucht ist; danach übernimmt Kaggle (Wan 2.2).
// Secret: ARK_API_KEY (BytePlus-Konsole). Optional: ARK_VIDEO_MODELL (Modell-ID aus der Konsole), ARK_API_BASE.
// Ablauf laut Doku: Auftrag anlegen (POST .../contents/generations/tasks) -> Status abfragen -> video_url laden.
import { readFileSync, writeFileSync } from 'node:fs';

export const arkBereit = () => !!process.env.ARK_API_KEY;
const BASIS = () => (process.env.ARK_API_BASE || 'https://ark.ap-southeast.bytepluses.com/api/v3').replace(/\/$/, '');
// Erst das eingestellte Modell, dann bekannte Seedance-IDs - "Modell gibt es nicht" -> nächstes probieren
export const modelle = () => [process.env.ARK_VIDEO_MODELL, 'seedance-1-0-pro-fast-251015', 'seedance-1-0-pro-250528', 'seedance-1-0-lite-i2v-250428'].filter(Boolean);
const kopf = () => ({ authorization: `Bearer ${process.env.ARK_API_KEY}`, 'content-type': 'application/json' });

export function auftrag(model, prompt, bildDatei, { sekunden = 5, aufloesung = '720p' } = {}) {
  const b64 = readFileSync(bildDatei).toString('base64');
  return {
    model,
    content: [
      { type: 'text', text: `${String(prompt).slice(0, 800)} --ratio 9:16 --duration ${sekunden} --resolution ${aufloesung} --watermark false` },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}` } },
    ],
  };
}

// Fehlerarten: Kontingent leer -> ganz aufhören; Modell unbekannt -> nächstes Modell; sonst nur diese Szene
export const leer = (status, text) => status === 402 || status === 429 || /quota|insufficient|balance|exceed|arrear|limit/i.test(text);
export const unbekannt = (status, text) => status === 404 || /model.*(not ?found|not exist|invalid)|InvalidEndpointOrModel|ModelNotOpen/i.test(text);

export async function arkClip(bildDatei, prompt, ziel, { warten = 10000, versuche = 60, laden = fetch, opts = {} } = {}) {
  let letzter = '';
  for (const model of modelle()) {
    const r = await laden(`${BASIS()}/contents/generations/tasks`, { method: 'POST', headers: kopf(), body: JSON.stringify(auftrag(model, prompt, bildDatei, opts)) });
    const d = await r.json().catch(() => ({}));
    const text = JSON.stringify(d?.error || d).slice(0, 300);
    if (!r.ok || !d.id) {
      letzter = `${model}: ${r.status} ${text}`;
      if (leer(r.status, text)) throw Object.assign(new Error(`Seedance-Kontingent leer (${letzter})`), { leer: true });
      if (unbekannt(r.status, text)) continue;
      throw new Error(`Seedance ${letzter}`);
    }
    for (let n = 0; n < versuche; n++) {
      await new Promise((res) => setTimeout(res, warten));
      const a = await laden(`${BASIS()}/contents/generations/tasks/${d.id}`, { headers: kopf() }).catch(() => null);
      const s = a && a.ok ? await a.json().catch(() => ({})) : {};
      if (s.status === 'succeeded' && s.content?.video_url) {
        writeFileSync(ziel, Buffer.from(await (await laden(s.content.video_url)).arrayBuffer()));
        return { ziel, model };
      }
      if (/failed|cancel/.test(String(s.status || ''))) throw new Error(`Seedance-Auftrag fehlgeschlagen: ${JSON.stringify(s.error || s).slice(0, 200)}`);
    }
    throw new Error('Seedance: Zeitüberschreitung');
  }
  throw new Error(`Seedance: kein Modell verfügbar (${letzter})`);
}
