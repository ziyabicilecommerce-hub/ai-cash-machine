// Kostenlose Direkt-Posts ohne Metricool (#99): offizielle APIs, jeweils nur mit eigenen
// Zugangsdaten (GitHub-Secrets). Jede Plattform ist optional - fehlen ihre Secrets, wird
// sie uebersprungen. Grenzen laut Plattform-Doku (Stand 2026):
//   Instagram Reels max. 90 s (API) · Bluesky-Video max. 3 Min./100 MB · Telegram-Bot max. 50 MB
//   YouTube: Projekte ohne Google-Audit laden nur PRIVAT hoch (danach im Studio freischalten).
//   TikTok: ohne Audit als Entwurf ins TikTok-Postfach (siehe tiktok.mjs).
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { tiktok } from './tiktok.mjs';

const env = (k) => (process.env[k] || '').trim();
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const GRAPH = `https://graph.facebook.com/${env('META_GRAPH_VERSION') || 'v23.0'}`;

async function json(res, was) {
  const text = await res.text();
  let d = {};
  try { d = JSON.parse(text); } catch { /* kein JSON */ }
  if (!res.ok || d.error) throw new Error(`${was}: ${res.status} ${String(d.error?.message || d.message || text).slice(0, 200)}`);
  return d;
}

// GitHub-Release-Links leiten auf eine signierte Download-URL um - Meta braucht die direkte.
export async function direkteUrl(url) {
  const res = await fetch(url, { method: 'HEAD', redirect: 'manual' });
  return res.headers.get('location') || url;
}

// ---------- Instagram Reels (Meta Graph API, eigener Account als Tester: kein App-Review) ----------
export const instagram = {
  name: 'Instagram',
  bereit: () => Boolean(env('META_ACCESS_TOKEN') && env('INSTAGRAM_BUSINESS_ACCOUNT_ID')),
  passt: (v) => v.format === 'hoch' && v.dauer <= 90,
  async posten(v) {
    const token = env('META_ACCESS_TOKEN');
    const ig = env('INSTAGRAM_BUSINESS_ACCOUNT_ID');
    const c = await json(await fetch(`${GRAPH}/${ig}/media`, { method: 'POST', body: new URLSearchParams({ media_type: 'REELS', video_url: await direkteUrl(v.url), caption: v.text.slice(0, 2200), share_to_feed: 'true', access_token: token }) }), 'Container');
    for (let i = 0; i < 60; i++) {
      await warte(10000);
      const s = await json(await fetch(`${GRAPH}/${c.id}?fields=status_code&access_token=${encodeURIComponent(token)}`), 'Status');
      if (s.status_code === 'FINISHED') break;
      if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`Verarbeitung: ${s.status_code}`);
    }
    const p = await json(await fetch(`${GRAPH}/${ig}/media_publish`, { method: 'POST', body: new URLSearchParams({ creation_id: c.id, access_token: token }) }), 'Veroeffentlichen');
    return `Reel ${p.id}`;
  },
};

// ---------- Facebook-Seite (Page-Token) ----------
export const facebook = {
  name: 'Facebook',
  bereit: () => Boolean(env('FACEBOOK_PAGE_ID') && (env('FACEBOOK_PAGE_TOKEN') || env('META_ACCESS_TOKEN'))),
  passt: (v) => v.dauer <= 4 * 3600,
  async posten(v) {
    const token = env('FACEBOOK_PAGE_TOKEN') || env('META_ACCESS_TOKEN');
    const d = await json(await fetch(`${GRAPH}/${env('FACEBOOK_PAGE_ID')}/videos`, { method: 'POST', body: new URLSearchParams({ file_url: await direkteUrl(v.url), title: v.titel.slice(0, 250), description: v.text.slice(0, 5000), access_token: token }) }), 'Video');
    return `Video ${d.id}`;
  },
};

// ---------- YouTube (Data API v3, OAuth-Refresh-Token; ~6 Uploads/Tag im Gratis-Kontingent) ----------
let ytUploads = 0;
export const youtube = {
  name: 'YouTube',
  bereit: () => Boolean(env('YOUTUBE_CLIENT_ID') && env('YOUTUBE_CLIENT_SECRET') && env('YOUTUBE_REFRESH_TOKEN')),
  passt: () => ytUploads < (parseInt(env('YOUTUBE_MAX_PRO_LAUF'), 10) || 3),
  async posten(v) {
    ytUploads++;
    const t = await json(await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: env('YOUTUBE_CLIENT_ID'), client_secret: env('YOUTUBE_CLIENT_SECRET'), refresh_token: env('YOUTUBE_REFRESH_TOKEN'), grant_type: 'refresh_token' }) }), 'Token');
    const groesse = statSync(v.datei).size;
    const kurz = v.format === 'hoch' && v.dauer <= 180;
    const meta = {
      snippet: { title: `${v.titel}${kurz ? ' #Shorts' : ''}`.slice(0, 100), description: v.text.slice(0, 4900), categoryId: env('YOUTUBE_KATEGORIE') || '22', defaultLanguage: v.sprache === 'int' ? undefined : v.sprache },
      status: { privacyStatus: env('YOUTUBE_SICHTBARKEIT') || 'private', selfDeclaredMadeForKids: false, containsSyntheticMedia: true },
    };
    const start = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Length': String(groesse), 'X-Upload-Content-Type': 'video/mp4' },
      body: JSON.stringify(meta),
    });
    if (!start.ok) await json(start, 'Upload-Start');
    const ziel = start.headers.get('location');
    const d = await json(await fetch(ziel, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(groesse) }, body: Readable.toWeb(createReadStream(v.datei)), duplex: 'half' }), 'Upload');
    return `Video ${d.id} (${d.status?.privacyStatus || meta.status.privacyStatus})`;
  },
};

// ---------- Bluesky (AT Protocol, App-Passwort, keine App-Pruefung) ----------
function linkFacette(text, url) {
  const start = Buffer.byteLength(text.slice(0, text.indexOf(url)));
  return [{ index: { byteStart: start, byteEnd: start + Buffer.byteLength(url) }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }] }];
}
const kuerzen = (t, n) => { const z = [...new Intl.Segmenter().segment(t)].map((s) => s.segment); return z.length <= n ? t : `${z.slice(0, n - 1).join('')}…`; };

export const bluesky = {
  name: 'Bluesky',
  bereit: () => Boolean(env('BLUESKY_HANDLE') && env('BLUESKY_APP_PASSWORD')),
  passt: () => true,
  async posten(v) {
    const s = await json(await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: env('BLUESKY_HANDLE'), password: env('BLUESKY_APP_PASSWORD') }) }), 'Login');
    const pds = s.didDoc?.service?.find((x) => x.id === '#atproto_pds')?.serviceEndpoint || 'https://bsky.social';
    const auth = { Authorization: `Bearer ${s.accessJwt}` };
    const record = { $type: 'app.bsky.feed.post', createdAt: new Date().toISOString(), langs: v.sprache === 'int' ? ['en'] : [v.sprache] };
    const video = v.dauer <= 180 && statSync(v.datei).size <= 100e6;
    if (video) {
      const sa = await json(await fetch(`${pds}/xrpc/com.atproto.server.getServiceAuth?aud=${encodeURIComponent(`did:web:${new URL(pds).host}`)}&lxm=com.atproto.repo.uploadBlob&exp=${Math.floor(Date.now() / 1000) + 1800}`, { headers: auth }), 'Service-Auth');
      const up = await fetch(`https://video.bsky.app/xrpc/app.bsky.video.uploadVideo?did=${encodeURIComponent(s.did)}&name=${encodeURIComponent(v.dateiname)}`, { method: 'POST', headers: { Authorization: `Bearer ${sa.token}`, 'Content-Type': 'video/mp4', 'Content-Length': String(statSync(v.datei).size) }, body: Readable.toWeb(createReadStream(v.datei)), duplex: 'half' });
      const job = await up.json().catch(() => ({}));
      const jobId = job.jobId || job.jobStatus?.jobId;
      if (!jobId) throw new Error(`Video-Upload: ${up.status} ${JSON.stringify(job).slice(0, 200)}`);
      let blob = job.jobStatus?.blob;
      for (let i = 0; !blob && i < 60; i++) {
        await warte(5000);
        const st = await json(await fetch(`https://video.bsky.app/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(jobId)}`, { headers: auth }), 'Video-Status');
        if (st.jobStatus?.state === 'JOB_STATE_FAILED') throw new Error(`Video-Verarbeitung: ${st.jobStatus.error || 'fehlgeschlagen'}`);
        blob = st.jobStatus?.blob;
      }
      if (!blob) throw new Error('Video-Verarbeitung dauert zu lange');
      record.text = kuerzen(`${v.titel}\n\n#KI`, 300);
      record.embed = { $type: 'app.bsky.embed.video', video: blob, aspectRatio: v.format === 'hoch' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 } };
    } else {
      const text = `${kuerzen(v.titel, 200)}\n\n${v.link}\n\n#KI`;
      record.text = text;
      record.facets = linkFacette(text, v.link);
    }
    const r = await json(await fetch(`${pds}/xrpc/com.atproto.repo.createRecord`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record }) }), 'Post');
    return video ? `Video-Post ${r.uri}` : `Link-Post ${r.uri}`;
  },
};

// ---------- Telegram-Kanal (Bot-API) ----------
export const telegram = {
  name: 'Telegram',
  bereit: () => Boolean(env('TELEGRAM_BOT_TOKEN') && env('TELEGRAM_KANAL_ID')),
  passt: () => true,
  async posten(v) {
    const api = `https://api.telegram.org/bot${env('TELEGRAM_BOT_TOKEN')}`;
    if (statSync(v.datei).size <= 49e6) {
      const form = new FormData();
      form.append('chat_id', env('TELEGRAM_KANAL_ID'));
      form.append('caption', v.text.slice(0, 1024));
      form.append('supports_streaming', 'true');
      form.append('video', new Blob([await (await import('node:fs/promises')).readFile(v.datei)], { type: 'video/mp4' }), v.dateiname);
      await json(await fetch(`${api}/sendVideo`, { method: 'POST', body: form }), 'sendVideo');
      return 'Video';
    }
    await json(await fetch(`${api}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env('TELEGRAM_KANAL_ID'), text: `${v.titel}\n\n${v.link}`.slice(0, 4000) }) }), 'sendMessage');
    return 'Link';
  },
};

// ---------- Mastodon (eigener Zugangstoken, Instanz frei waehlbar) ----------
export const mastodon = {
  name: 'Mastodon',
  bereit: () => Boolean(env('MASTODON_URL') && env('MASTODON_TOKEN')),
  passt: () => true,
  async posten(v) {
    const basis = env('MASTODON_URL').replace(/\/$/, '');
    const auth = { Authorization: `Bearer ${env('MASTODON_TOKEN')}` };
    const status = { status: `${v.titel}\n\n${v.link}\n\n#KI`.slice(0, 500), language: v.sprache === 'int' ? 'en' : v.sprache };
    if (statSync(v.datei).size <= 95e6) {
      const form = new FormData();
      form.append('file', new Blob([await (await import('node:fs/promises')).readFile(v.datei)], { type: 'video/mp4' }), v.dateiname);
      form.append('description', v.titel.slice(0, 1400));
      let m = await json(await fetch(`${basis}/api/v2/media`, { method: 'POST', headers: auth, body: form }), 'Medien-Upload');
      for (let i = 0; !m.url && i < 60; i++) { await warte(5000); m = await json(await fetch(`${basis}/api/v1/media/${m.id}`, { headers: auth }), 'Medien-Status'); }
      status.media_ids = [m.id];
    }
    const s = await json(await fetch(`${basis}/api/v1/statuses`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(status) }), 'Status');
    return s.url || 'Post';
  },
};

export const PLATTFORMEN = [youtube, tiktok, instagram, facebook, bluesky, telegram, mastodon];
