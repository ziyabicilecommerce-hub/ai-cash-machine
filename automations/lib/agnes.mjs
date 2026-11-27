// Agnes AI (27.11., Nutzer: "such alles raus - unlimited video generator"): laut offizieller Doku
// (github.com/AgnesAI-Labs/AgnesAI-Models) sind die Agnes-Modelle für Gratis-Nutzer ohne Zeitlimit frei, begrenzt nur pro Minute:
// Video 1 Auftrag/Minute, Bilder (1K) 20/Minute. Laut Nutzungsbedingungen gehört die Ausgabe dem Nutzer, KI-Inhalte
// müssen gekennzeichnet werden (machen wir immer). Ein eigenes Gratis-Konto, keine Zweit-Konten, Limits werden eingehalten.
// Secret: AGNES_API_KEY (platform.agnes-ai.com -> API Keys, ohne Kreditkarte).
import { readFileSync, writeFileSync } from 'node:fs';

export const agnesBereit = (env = process.env) => !!String(env.AGNES_API_KEY || '').trim();
const WURZEL = () => (process.env.AGNES_API_ROOT || 'https://apihub.agnes-ai.com').replace(/\/$/, '');
const kopf = () => ({ authorization: `Bearer ${process.env.AGNES_API_KEY}`, 'content-type': 'application/json' });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
export const alsDataUri = (datei) => `data:image/jpeg;base64,${readFileSync(datei).toString('base64')}`;

// Ergebnis-Link finden: Video steht laut Doku in "remixed_from_video_id", Bilder OpenAI-artig in data[0].url
export function findeUrl(d) {
  if (!d || typeof d !== 'object') return '';
  for (const k of ['remixed_from_video_id', 'video_url', 'url']) if (/^https?:\/\//.test(String(d[k] || ''))) return d[k];
  for (const v of Object.values(d)) {
    if (typeof v === 'string' && /^https?:\/\/\S+\.(mp4|webm|mov|png|jpe?g|webp)(\?|$)/i.test(v)) return v;
    const tief = typeof v === 'object' ? findeUrl(v) : '';
    if (tief) return tief;
  }
  return '';
}

export function clipAuftrag(prompt, bild, { breite = 720, hoehe = 1280, sekunden = 5 } = {}) {
  const auftrag = { model: 'agnes-video-v2.0', prompt: String(prompt).slice(0, 900), width: breite, height: hoehe, num_frames: sekunden >= 5 ? 121 : 81, frame_rate: 24 };
  if (bild) auftrag.image = /^https?:\/\//.test(bild) ? bild : alsDataUri(bild);
  return auftrag;
}

// POST mit Rücksicht aufs Minuten-Limit: bei 429 eine Minute warten (nicht umgehen)
async function senden(pfad, body, { laden = fetch, warten = 65000, versuche = 3 } = {}) {
  let letzter = '';
  for (let n = 0; n < versuche; n++) {
    const r = await laden(`${WURZEL()}${pfad}`, { method: 'POST', headers: kopf(), body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (r.ok) return d;
    letzter = `${r.status} ${JSON.stringify(d?.error || d).slice(0, 200)}`;
    if (r.status === 429) { await pause(warten); continue; }
    throw Object.assign(new Error(`Agnes ${letzter}`), { status: r.status, leer: r.status === 402 || /insufficient|quota|balance/i.test(letzter) });
  }
  throw Object.assign(new Error(`Agnes Minuten-Limit (${letzter})`), { status: 429 });
}

// Szenenbild MIT Figurenblättern als Vorlage (gleiche Figuren in jeder Szene) -> { ziel, url }
export async function agnesBild(prompt, refs, ziel, { breite = 720, hoehe = 1280, laden = fetch, warten } = {}) {
  const basis = { model: 'agnes-image-2.1-flash', prompt: String(prompt).slice(0, 1800), size: `${breite}x${hoehe}` };
  const bilder = (refs || []).slice(0, 5).map(alsDataUri);
  const varianten = bilder.length ? [{ ...basis, extra_body: { image: bilder } }, { ...basis, image: bilder }] : [basis, { ...basis, size: undefined }];
  let fehler;
  for (const body of varianten) {
    try {
      const d = await senden('/v1/images/generations', body, { laden, warten });
      const b64 = d?.data?.[0]?.b64_json;
      const url = findeUrl(d);
      if (b64) writeFileSync(ziel, Buffer.from(b64, 'base64'));
      else if (url) writeFileSync(ziel, Buffer.from(await (await laden(url)).arrayBuffer()));
      else throw new Error(`Agnes-Bild ohne Ergebnis: ${JSON.stringify(d).slice(0, 160)}`);
      return { ziel, url };
    } catch (err) { fehler = err; if (err.status !== 400) break; }  // 400 -> andere Schreibweise probieren
  }
  throw fehler;
}

// Mehrere Clips: Aufträge im Minutentakt anlegen, dann alle gemeinsam abfragen. auftraege: [{ nr, prompt, bild, ziel }]
export async function agnesClips(auftraege, { laden = fetch, takt = 61000, warten = 15000, maxMinuten = 60, log = console.log } = {}) {
  const ende = Date.now() + maxMinuten * 60000;
  const offen = [];
  for (const [k, a] of auftraege.entries()) {
    if (Date.now() > ende) break;
    if (k) await pause(takt);
    try {
      const d = await senden('/v1/videos', clipAuftrag(a.prompt, a.bild), { laden, warten: takt });
      const id = d.video_id || d.id;
      if (id) offen.push({ ...a, id }); else log(`[agnes] Szene ${a.nr}: keine video_id (${JSON.stringify(d).slice(0, 120)})`);
    } catch (err) {
      log(`[agnes] Szene ${a.nr}: ${String(err.message).slice(0, 200)}`);
      if (err.leer) break;
    }
  }
  const fertig = new Map();
  while (offen.length && Date.now() < ende) {
    await pause(warten);
    for (const a of [...offen]) {
      const r = await laden(`${WURZEL()}/agnesapi?video_id=${encodeURIComponent(a.id)}`, { headers: kopf() }).catch(() => null);
      const d = r && r.ok ? await r.json().catch(() => ({})) : {};
      const status = String(d.status || '').toLowerCase();
      const url = findeUrl(d);
      if (/completed|succeeded|success|done/.test(status) && url) {
        writeFileSync(a.ziel, Buffer.from(await (await laden(url)).arrayBuffer()));
        fertig.set(a.nr, a.ziel);
        offen.splice(offen.indexOf(a), 1);
        log(`[agnes] Szene ${a.nr}: Clip fertig (${d.size || '?'}, ${d.seconds || '?'} s)`);
      } else if (/failed|error|cancel/.test(status)) {
        offen.splice(offen.indexOf(a), 1);
        log(`[agnes] Szene ${a.nr}: fehlgeschlagen ${JSON.stringify(d.error || '').slice(0, 160)}`);
      }
    }
  }
  if (offen.length) log(`[agnes] ${offen.length} Clips nicht rechtzeitig fertig`);
  return fertig;
}
