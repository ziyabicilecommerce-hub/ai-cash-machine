// TikTok (Content Posting API v2) fuer den Direkt-Poster (#99) - kostenlos.
// Modus "entwurf" (Standard, ohne TikTok-Audit): Video landet als Entwurf im TikTok-
// Postfach, du tippst in der App auf "Posten". Modus "direkt" (nach dem Audit): Video geht
// sofort online; ohne Audit erlaubt TikTok dabei nur SELF_ONLY (privat).
// Zugang: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN (Seite /tiktok-verbinden/).
import { openSync, readSync, closeSync, statSync } from 'node:fs';

const env = (k) => (process.env[k] || '').trim();
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const API = 'https://open.tiktokapis.com/v2';

async function antwort(res, was) {
  const d = await res.json().catch(() => ({}));
  if (!res.ok || (d.error && d.error.code && d.error.code !== 'ok')) throw new Error(`${was}: ${res.status} ${d.error?.code || ''} ${String(d.error?.message || d.error_description || '').slice(0, 200)}`);
  return d;
}

async function zugang() {
  const d = await antwort(await fetch(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_key: env('TIKTOK_CLIENT_KEY'), client_secret: env('TIKTOK_CLIENT_SECRET'), grant_type: 'refresh_token', refresh_token: env('TIKTOK_REFRESH_TOKEN') }),
  }), 'Token');
  if (d.refresh_token && d.refresh_token !== env('TIKTOK_REFRESH_TOKEN')) console.log('[tiktok] Hinweis: TikTok hat einen neuen Refresh-Token ausgegeben - der alte bleibt bis zu seinem Ablauf (365 Tage) gueltig.');
  return d.access_token;
}

// TikTok-Regeln: Stuecke 5-64 MB, das letzte darf groesser sein; kleine Videos in einem Stueck.
function stuecke(groesse) {
  if (groesse <= 64e6) return { chunk: groesse, anzahl: 1 };
  const chunk = 10 * 1024 * 1024;
  return { chunk, anzahl: Math.floor(groesse / chunk) };
}

async function hochladen(uploadUrl, datei, groesse, { chunk, anzahl }) {
  const fd = openSync(datei, 'r');
  try {
    for (let i = 0; i < anzahl; i++) {
      const start = i * chunk;
      const ende = i === anzahl - 1 ? groesse - 1 : start + chunk - 1;
      const puffer = Buffer.alloc(ende - start + 1);
      readSync(fd, puffer, 0, puffer.length, start);
      const res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(puffer.length), 'Content-Range': `bytes ${start}-${ende}/${groesse}` }, body: puffer });
      if (![200, 201, 206].includes(res.status)) throw new Error(`Upload Stueck ${i + 1}/${anzahl}: ${res.status} ${(await res.text()).slice(0, 150)}`);
    }
  } finally {
    closeSync(fd);
  }
}

export const tiktok = {
  name: 'TikTok',
  bereit: () => Boolean(env('TIKTOK_CLIENT_KEY') && env('TIKTOK_CLIENT_SECRET') && env('TIKTOK_REFRESH_TOKEN')),
  // TikTok-Videos: Hochformat, 3 s bis 10 Min.
  passt: (v) => v.format === 'hoch' && v.dauer >= 3 && v.dauer <= 600,
  async posten(v) {
    const token = await zugang();
    const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8' };
    const groesse = statSync(v.datei).size;
    const s = stuecke(groesse);
    const quelle = { source: 'FILE_UPLOAD', video_size: groesse, chunk_size: s.chunk, total_chunk_count: s.anzahl };
    const direkt = env('TIKTOK_MODUS') === 'direkt';
    let init;
    if (direkt) {
      const info = await antwort(await fetch(`${API}/post/publish/creator_info/query/`, { method: 'POST', headers: auth }), 'Creator-Info');
      const erlaubt = info.data?.privacy_level_options || [];
      const wunsch = env('TIKTOK_SICHTBARKEIT') || 'PUBLIC_TO_EVERYONE';
      const privacy = erlaubt.includes(wunsch) ? wunsch : erlaubt.includes('SELF_ONLY') ? 'SELF_ONLY' : erlaubt[0];
      init = await antwort(await fetch(`${API}/post/publish/video/init/`, {
        method: 'POST', headers: auth,
        body: JSON.stringify({ post_info: { title: v.text.slice(0, 2200), privacy_level: privacy, disable_comment: false, disable_duet: false, disable_stitch: false, is_aigc: true }, source_info: quelle }),
      }), 'Init (Direkt)');
    } else {
      init = await antwort(await fetch(`${API}/post/publish/inbox/video/init/`, { method: 'POST', headers: auth, body: JSON.stringify({ source_info: quelle }) }), 'Init (Entwurf)');
    }
    await hochladen(init.data.upload_url, v.datei, groesse, s);
    for (let i = 0; i < 40; i++) {
      await warte(6000);
      const st = await antwort(await fetch(`${API}/post/publish/status/fetch/`, { method: 'POST', headers: auth, body: JSON.stringify({ publish_id: init.data.publish_id }) }), 'Status');
      const stand = st.data?.status;
      if (stand === 'SEND_TO_USER_INBOX') return 'Entwurf im TikTok-Postfach – in der App auf „Posten“ tippen';
      if (stand === 'PUBLISH_COMPLETE') return 'veroeffentlicht';
      if (stand === 'FAILED') throw new Error(`Verarbeitung: ${st.data?.fail_reason || 'fehlgeschlagen'}`);
    }
    return `hochgeladen (${init.data.publish_id}), Status noch offen`;
  },
};
