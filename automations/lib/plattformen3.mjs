// Plattform 14 und 15 fuer den Direkt-Poster (#99): X (Twitter) und Tumblr - direkt ueber die offiziellen
// APIs, ohne Fremddienst. Beide nutzen OAuth 1.0a mit eigenen App-Schluesseln (einmal im Entwickler-
// Portal anlegen, als GitHub-Secrets eintragen). Jeder Post traegt den KI-Hinweis.
//   X: Free-Tier reicht (Posten + Medien-Upload, ca. 17 Posts/24 h je Konto).
//   Tumblr: eigene App unter tumblr.com/oauth/apps, Video-Post im Neue-Post-Format (NPF).
import { createHmac, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';

const env = (k) => (process.env[k] || '').trim();
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const prozent = (s) => encodeURIComponent(String(s)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// OAuth 1.0a (RFC 5849): Signatur ueber Methode, URL und alle Parameter (Query + Formular, nicht multipart).
export function oauthHeader({ methode, url, parameter = {}, schluessel, geheim, token, tokenGeheim, nonce = randomBytes(16).toString('hex'), zeit = Math.floor(Date.now() / 1000) }) {
  const oauth = { oauth_consumer_key: schluessel, oauth_nonce: nonce, oauth_signature_method: 'HMAC-SHA1', oauth_timestamp: String(zeit), oauth_token: token, oauth_version: '1.0' };
  const u = new URL(url);
  const alle = { ...Object.fromEntries(u.searchParams), ...parameter, ...oauth };
  const norm = Object.keys(alle).sort().map((k) => `${prozent(k)}=${prozent(alle[k])}`).join('&');
  const basis = [methode.toUpperCase(), prozent(`${u.origin}${u.pathname}`), prozent(norm)].join('&');
  const signatur = createHmac('sha1', `${prozent(geheim)}&${prozent(tokenGeheim || '')}`).update(basis).digest('base64');
  return 'OAuth ' + Object.entries({ ...oauth, oauth_signature: signatur }).sort().map(([k, v]) => `${prozent(k)}="${prozent(v)}"`).join(', ');
}

async function antwort(res, was) {
  const text = await res.text();
  let d = {};
  try { d = text ? JSON.parse(text) : {}; } catch { /* kein JSON */ }
  if (!res.ok) throw new Error(`${was}: ${res.status} ${String(d.detail || d.errors?.[0]?.message || d.meta?.msg || d.title || text).slice(0, 200)}`);
  return d;
}

// ---------- X (Twitter): Video per Chunked-Upload, dann Post mit media_id ----------
const xSchluessel = () => ({ schluessel: env('X_API_KEY'), geheim: env('X_API_SECRET'), token: env('X_ACCESS_TOKEN'), tokenGeheim: env('X_ACCESS_SECRET') });
let xPosts = 0;
export const x = {
  name: 'X',
  bereit: () => Boolean(env('X_API_KEY') && env('X_API_SECRET') && env('X_ACCESS_TOKEN') && env('X_ACCESS_SECRET')),
  // X: max. 140 s Video, 512 MB; Free-Tier: wenige Posts pro Tag - hoechstens 5 je Lauf.
  passt: (v) => v.dauer <= 140 && statSync(v.datei).size <= 512e6 && xPosts < 5,
  async posten(v) {
    xPosts++;
    const UP = 'https://upload.twitter.com/1.1/media/upload.json';
    const s = xSchluessel();
    const formular = async (parameter) => antwort(await fetch(UP, { method: 'POST', headers: { Authorization: oauthHeader({ methode: 'POST', url: UP, parameter, ...s }), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(parameter) }), parameter.command);
    const puffer = await readFile(v.datei);
    const init = await formular({ command: 'INIT', total_bytes: String(puffer.length), media_type: 'video/mp4', media_category: 'tweet_video' });
    const id = init.media_id_string;
    for (let i = 0, teil = 0; i < puffer.length; i += 4 * 1024 * 1024, teil++) {
      const form = new FormData();
      form.append('command', 'APPEND'); form.append('media_id', id); form.append('segment_index', String(teil));
      form.append('media', new Blob([puffer.subarray(i, i + 4 * 1024 * 1024)], { type: 'application/octet-stream' }));
      // Multipart: nur die OAuth-Parameter werden signiert.
      await antwort(await fetch(UP, { method: 'POST', headers: { Authorization: oauthHeader({ methode: 'POST', url: UP, ...s }) }, body: form }), 'APPEND');
    }
    let status = (await formular({ command: 'FINALIZE', media_id: id })).processing_info;
    for (let i = 0; status && status.state !== 'succeeded' && i < 60; i++) {
      if (status.state === 'failed') throw new Error(`Video-Verarbeitung: ${status.error?.message || 'fehlgeschlagen'}`);
      await warte((status.check_after_secs || 5) * 1000);
      const url = `${UP}?command=STATUS&media_id=${id}`;
      status = (await antwort(await fetch(url, { headers: { Authorization: oauthHeader({ methode: 'GET', url, ...s }) } }), 'STATUS')).processing_info;
    }
    const TWEET = 'https://api.x.com/2/tweets';
    const text = `${v.titel}\n\n${v.shopLink || v.link || ''}\n\n#KI`.slice(0, 280);
    const d = await antwort(await fetch(TWEET, { method: 'POST', headers: { Authorization: oauthHeader({ methode: 'POST', url: TWEET, ...s }), 'Content-Type': 'application/json' }, body: JSON.stringify({ text, media: { media_ids: [id] } }) }), 'Post');
    return `Video ${d.data?.id}`;
  },
};

// ---------- Tumblr: Video-Post im Neue-Post-Format (multipart: JSON + Videodatei) ----------
export const tumblr = {
  name: 'Tumblr',
  bereit: () => Boolean(env('TUMBLR_CONSUMER_KEY') && env('TUMBLR_CONSUMER_SECRET') && env('TUMBLR_TOKEN') && env('TUMBLR_TOKEN_SECRET') && env('TUMBLR_BLOG')),
  passt: (v) => v.dauer <= 600 && statSync(v.datei).size <= 500e6,
  async posten(v) {
    const url = `https://api.tumblr.com/v2/blog/${encodeURIComponent(env('TUMBLR_BLOG'))}/posts`;
    const inhalt = {
      content: [
        { type: 'video', media: [{ type: 'video/mp4', identifier: 'video' }] },
        { type: 'text', text: `${v.titel}\n\n${v.caption || ''}`.slice(0, 4000) },
        ...(v.shopLink || v.link ? [{ type: 'link', url: v.shopLink || v.link }] : []),
      ],
      tags: 'ki,ai generated',
    };
    const form = new FormData();
    form.append('json', JSON.stringify(inhalt));
    form.append('video', new Blob([await readFile(v.datei)], { type: 'video/mp4' }), v.dateiname);
    const auth = oauthHeader({ methode: 'POST', url, schluessel: env('TUMBLR_CONSUMER_KEY'), geheim: env('TUMBLR_CONSUMER_SECRET'), token: env('TUMBLR_TOKEN'), tokenGeheim: env('TUMBLR_TOKEN_SECRET') });
    const d = await antwort(await fetch(url, { method: 'POST', headers: { Authorization: auth }, body: form }), 'Post');
    return `Post ${d.response?.id_string || d.response?.id || ''}`.trim();
  },
};
