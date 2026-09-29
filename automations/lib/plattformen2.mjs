// Weitere kostenlose Kanaele fuer den Direkt-Poster (#99): Threads, LinkedIn, Discord,
// Reddit, Pinterest, Dailymotion. Offizielle APIs, eigene Zugangsdaten, jeweils optional.
//   Threads: eigener Account als Tester, kein App-Review · LinkedIn: "Share on LinkedIn"
//   (w_member_social) fuer das eigene Profil, self-serve · Pinterest: mit Trial-Zugang nur
//   fuer dich sichtbar (Sandbox), oeffentlich erst mit Standard-Zugang.
import { openSync, readSync, closeSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { direkteUrl } from './plattformen.mjs';

const env = (k) => (process.env[k] || '').trim();
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(res, was) {
  const text = await res.text();
  let d = {};
  try { d = JSON.parse(text); } catch { /* kein JSON */ }
  if (!res.ok || d.error) throw new Error(`${was}: ${res.status} ${String(d.error?.message || d.message || d.error_description || d.error || text).slice(0, 200)}`);
  return d;
}

const dateiBlob = async (datei) => new Blob([await readFile(datei)], { type: 'video/mp4' });

// ---------- Threads (Meta, graph.threads.net) ----------
export const threads = {
  name: 'Threads',
  bereit: () => Boolean(env('THREADS_ACCESS_TOKEN') && env('THREADS_USER_ID')),
  passt: (v) => v.dauer <= 300,
  async posten(v) {
    const api = 'https://graph.threads.net/v1.0';
    const token = env('THREADS_ACCESS_TOKEN');
    const user = env('THREADS_USER_ID');
    const c = await json(await fetch(`${api}/${user}/threads`, { method: 'POST', body: new URLSearchParams({ media_type: 'VIDEO', video_url: await direkteUrl(v.url), text: `${v.titel}\n\n#KI`.slice(0, 500), access_token: token }) }), 'Container');
    for (let i = 0; i < 60; i++) {
      await warte(10000);
      const s = await json(await fetch(`${api}/${c.id}?fields=status,error_message&access_token=${encodeURIComponent(token)}`), 'Status');
      if (s.status === 'FINISHED') break;
      if (s.status === 'ERROR' || s.status === 'EXPIRED') throw new Error(`Verarbeitung: ${s.error_message || s.status}`);
    }
    const p = await json(await fetch(`${api}/${user}/threads_publish`, { method: 'POST', body: new URLSearchParams({ creation_id: c.id, access_token: token }) }), 'Veroeffentlichen');
    return `Post ${p.id}`;
  },
};

// ---------- LinkedIn (eigenes Profil, Videos-API mit Teil-Upload) ----------
export const linkedin = {
  name: 'LinkedIn',
  bereit: () => Boolean(env('LINKEDIN_ACCESS_TOKEN')),
  passt: () => true,
  async posten(v) {
    const kopf = { Authorization: `Bearer ${env('LINKEDIN_ACCESS_TOKEN')}`, 'LinkedIn-Version': env('LINKEDIN_VERSION') || '202508', 'X-Restli-Protocol-Version': '2.0.0', 'Content-Type': 'application/json' };
    let person = env('LINKEDIN_PERSON_ID');
    if (!person) person = (await json(await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: kopf.Authorization } }), 'Profil')).sub;
    const autor = `urn:li:person:${person}`;
    const groesse = statSync(v.datei).size;
    const post = { author: autor, commentary: `${v.titel}\n\n${v.caption || ''}\n\n#KI`.slice(0, 3000), visibility: 'PUBLIC', distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false };
    if (groesse <= 500e6 && v.dauer >= 3 && v.dauer <= 1800) {
      const init = await json(await fetch('https://api.linkedin.com/rest/videos?action=initializeUpload', { method: 'POST', headers: kopf, body: JSON.stringify({ initializeUploadRequest: { owner: autor, fileSizeBytes: groesse, uploadCaptions: false, uploadThumbnail: false } }) }), 'Video-Init');
      const { uploadInstructions, video, uploadToken } = init.value;
      const teile = [];
      const fd = openSync(v.datei, 'r');
      try {
        for (const t of uploadInstructions) {
          const puffer = Buffer.alloc(t.lastByte - t.firstByte + 1);
          readSync(fd, puffer, 0, puffer.length, t.firstByte);
          const res = await fetch(t.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: puffer });
          if (!res.ok) throw new Error(`Video-Teil: ${res.status}`);
          teile.push(res.headers.get('etag'));
        }
      } finally {
        closeSync(fd);
      }
      const fertig = await fetch('https://api.linkedin.com/rest/videos?action=finalizeUpload', { method: 'POST', headers: kopf, body: JSON.stringify({ finalizeUploadRequest: { video, uploadToken: uploadToken || '', uploadedPartIds: teile } }) });
      if (!fertig.ok) await json(fertig, 'Video-Abschluss');
      post.content = { media: { title: v.titel.slice(0, 200), id: video } };
    } else {
      post.commentary = `${v.titel}\n\n${v.link}\n\n#KI`;
    }
    const res = await fetch('https://api.linkedin.com/rest/posts', { method: 'POST', headers: kopf, body: JSON.stringify(post) });
    if (!res.ok) await json(res, 'Post');
    return `Post ${res.headers.get('x-restli-id') || ''}`.trim();
  },
};

// ---------- Discord (Webhook eines eigenen Kanals) ----------
export const discord = {
  name: 'Discord',
  bereit: () => Boolean(env('DISCORD_WEBHOOK_URL')),
  passt: () => true,
  async posten(v) {
    const text = `**${v.titel}**\n${(v.caption || '').slice(0, 1500)}\n\n${v.link}\n-# KI-generiert`.slice(0, 2000);
    if (statSync(v.datei).size <= 9.5e6) {
      const form = new FormData();
      form.append('payload_json', JSON.stringify({ content: text }));
      form.append('files[0]', await dateiBlob(v.datei), v.dateiname);
      await json(await fetch(`${env('DISCORD_WEBHOOK_URL')}?wait=true`, { method: 'POST', body: form }), 'Webhook');
      return 'Video';
    }
    await json(await fetch(`${env('DISCORD_WEBHOOK_URL')}?wait=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: text }) }), 'Webhook');
    return 'Link';
  },
};

// ---------- Reddit (Script-App, Link-Post; standardmaessig ins eigene Profil) ----------
let redditPosts = 0;
export const reddit = {
  name: 'Reddit',
  bereit: () => Boolean(env('REDDIT_CLIENT_ID') && env('REDDIT_CLIENT_SECRET') && env('REDDIT_USERNAME') && env('REDDIT_PASSWORD')),
  // Reddit mag keine Massen-Posts: hoechstens einer pro Lauf.
  passt: () => redditPosts < (parseInt(env('REDDIT_MAX_PRO_LAUF'), 10) || 1),
  async posten(v) {
    redditPosts++;
    const ua = `ai-cash-machine/1.0 by u/${env('REDDIT_USERNAME')}`;
    const t = await json(await fetch('https://www.reddit.com/api/v1/access_token', { method: 'POST', headers: { Authorization: `Basic ${Buffer.from(`${env('REDDIT_CLIENT_ID')}:${env('REDDIT_CLIENT_SECRET')}`).toString('base64')}`, 'User-Agent': ua }, body: new URLSearchParams({ grant_type: 'password', username: env('REDDIT_USERNAME'), password: env('REDDIT_PASSWORD') }) }), 'Token');
    const sr = env('REDDIT_SUBREDDIT') || `u_${env('REDDIT_USERNAME')}`;
    const d = await json(await fetch('https://oauth.reddit.com/api/submit', { method: 'POST', headers: { Authorization: `Bearer ${t.access_token}`, 'User-Agent': ua }, body: new URLSearchParams({ sr, kind: 'link', title: `${v.titel} [KI]`.slice(0, 300), url: v.url, resubmit: 'true', api_type: 'json' }) }), 'Submit');
    const fehler = d.json?.errors || [];
    if (fehler.length) throw new Error(`Submit: ${JSON.stringify(fehler).slice(0, 200)}`);
    return d.json?.data?.url || `r/${sr}`;
  },
};

// ---------- Pinterest (Video-Pin; Trial-Zugang = nur fuer dich sichtbar) ----------
export const pinterest = {
  name: 'Pinterest',
  bereit: () => Boolean(env('PINTEREST_ACCESS_TOKEN') && env('PINTEREST_BOARD_ID')),
  passt: (v) => v.format === 'hoch' && v.dauer >= 4 && v.dauer <= 900 && Boolean(v.vorschauUrl),
  async posten(v) {
    const api = env('PINTEREST_API_BASIS') || 'https://api.pinterest.com/v5';
    const auth = { Authorization: `Bearer ${env('PINTEREST_ACCESS_TOKEN')}` };
    const m = await json(await fetch(`${api}/media`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ media_type: 'video' }) }), 'Media-Init');
    const form = new FormData();
    for (const [k, w] of Object.entries(m.upload_parameters || {})) form.append(k, w);
    form.append('file', await dateiBlob(v.datei), v.dateiname);
    const up = await fetch(m.upload_url, { method: 'POST', body: form });
    if (!up.ok) throw new Error(`Upload: ${up.status}`);
    for (let i = 0; i < 60; i++) {
      await warte(5000);
      const s = await json(await fetch(`${api}/media/${m.media_id}`, { headers: auth }), 'Media-Status');
      if (s.status === 'succeeded') break;
      if (s.status === 'failed') throw new Error('Video-Verarbeitung fehlgeschlagen');
    }
    const pin = await json(await fetch(`${api}/pins`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ board_id: env('PINTEREST_BOARD_ID'), title: v.titel.slice(0, 100), description: `${v.caption || ''}\n\n#KI`.slice(0, 800), link: v.shopLink || v.link, media_source: { source_type: 'video_id', media_id: m.media_id, cover_image_url: v.vorschauUrl } }) }), 'Pin');
    return `Pin ${pin.id}`;
  },
};

// ---------- Dailymotion (internationale Videoplattform, Passwort-Grant) ----------
export const dailymotion = {
  name: 'Dailymotion',
  bereit: () => Boolean(env('DAILYMOTION_API_KEY') && env('DAILYMOTION_API_SECRET') && env('DAILYMOTION_USERNAME') && env('DAILYMOTION_PASSWORD')),
  passt: (v) => v.dauer <= 4 * 3600 && statSync(v.datei).size <= 4e9,
  async posten(v) {
    const api = 'https://api.dailymotion.com';
    const t = await json(await fetch(`${api}/oauth/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: env('DAILYMOTION_API_KEY'), client_secret: env('DAILYMOTION_API_SECRET'), username: env('DAILYMOTION_USERNAME'), password: env('DAILYMOTION_PASSWORD'), scope: 'manage_videos' }) }), 'Token');
    const auth = { Authorization: `Bearer ${t.access_token}` };
    const ziel = await json(await fetch(`${api}/file/upload`, { headers: auth }), 'Upload-Ziel');
    const form = new FormData();
    form.append('file', await dateiBlob(v.datei), v.dateiname);
    const datei = await json(await fetch(ziel.upload_url, { method: 'POST', body: form }), 'Upload');
    const d = await json(await fetch(`${api}/me/videos`, { method: 'POST', headers: auth, body: new URLSearchParams({ url: datei.url, title: v.titel.slice(0, 255), description: v.text.slice(0, 3000), channel: env('DAILYMOTION_KATEGORIE') || 'lifestyle', tags: 'ki,ai', published: 'true', is_created_for_kids: 'false' }) }), 'Video');
    return `Video ${d.id}`;
  },
};
