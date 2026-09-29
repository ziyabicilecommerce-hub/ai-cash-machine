// CASHMACHINE Verbinder - kostenloser Cloudflare-Worker, der Social-Media-Konten mit einem Klick
// verbindet (wie bei Metricool): Knopf auf der Verbinden-Seite -> Plattform fragt nach Erlaubnis
// -> fertig. Der Worker tauscht den Code gegen Tokens, merkt sie sich in KV und gibt sie nur mit
// Passwort an den Direkt-Poster (#99) heraus. Die App-Schluessel liegen als Worker-Secrets.

const JSON_KOPF = { 'content-type': 'application/json; charset=utf-8' };
const G = 'https://graph.facebook.com/v21.0';

// Je Plattform: Anmeldeseite, Rechte, Code-Tausch und welche Werte der Poster bekommt.
const PLATTFORMEN = {
  tiktok: {
    name: 'TikTok', id: 'TIKTOK_CLIENT_KEY', geheim: 'TIKTOK_CLIENT_SECRET',
    auth: (e, r, s) => `https://www.tiktok.com/v2/auth/authorize/?${q({ client_key: e.TIKTOK_CLIENT_KEY, scope: e.TIKTOK_SCOPES || 'user.info.basic,video.upload', response_type: 'code', redirect_uri: r, state: s })}`,
    async tausch(e, code, r) {
      const d = await post('https://open.tiktokapis.com/v2/oauth/token/', { client_key: e.TIKTOK_CLIENT_KEY, client_secret: e.TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: r });
      if (!d.refresh_token) throw new Error(d.error_description || d.error || 'kein refresh_token');
      return { TIKTOK_CLIENT_KEY: e.TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET: e.TIKTOK_CLIENT_SECRET, TIKTOK_REFRESH_TOKEN: d.refresh_token, gueltig_bis: Date.now() + (d.refresh_expires_in || 31536000) * 1000 };
    },
  },
  youtube: {
    name: 'YouTube', id: 'GOOGLE_CLIENT_ID', geheim: 'GOOGLE_CLIENT_SECRET',
    auth: (e, r, s) => `https://accounts.google.com/o/oauth2/v2/auth?${q({ client_id: e.GOOGLE_CLIENT_ID, redirect_uri: r, response_type: 'code', scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly', access_type: 'offline', prompt: 'consent', state: s })}`,
    async tausch(e, code, r) {
      const d = await post('https://oauth2.googleapis.com/token', { code, client_id: e.GOOGLE_CLIENT_ID, client_secret: e.GOOGLE_CLIENT_SECRET, redirect_uri: r, grant_type: 'authorization_code' });
      if (!d.refresh_token) throw new Error(d.error_description || d.error || 'kein refresh_token');
      return { YOUTUBE_CLIENT_ID: e.GOOGLE_CLIENT_ID, YOUTUBE_CLIENT_SECRET: e.GOOGLE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN: d.refresh_token };
    },
  },
  meta: {
    name: 'Instagram + Facebook', id: 'META_APP_ID', geheim: 'META_APP_SECRET',
    auth: (e, r, s) => `https://www.facebook.com/v21.0/dialog/oauth?${q({ client_id: e.META_APP_ID, redirect_uri: r, state: s, scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management' })}`,
    async tausch(e, code, r) {
      const kurz = await get(`${G}/oauth/access_token?${q({ client_id: e.META_APP_ID, client_secret: e.META_APP_SECRET, redirect_uri: r, code })}`);
      if (!kurz.access_token) throw new Error(kurz.error?.message || 'kein access_token');
      const lang = await get(`${G}/oauth/access_token?${q({ grant_type: 'fb_exchange_token', client_id: e.META_APP_ID, client_secret: e.META_APP_SECRET, fb_exchange_token: kurz.access_token })}`);
      // Seiten-Token aus einem langlebigen Nutzer-Token laufen nicht ab.
      const seiten = await get(`${G}/me/accounts?${q({ fields: 'id,name,access_token,instagram_business_account', access_token: lang.access_token || kurz.access_token })}`);
      const liste = seiten.data || [];
      const seite = liste.find((x) => x.name === e.META_SEITE) || liste.find((x) => x.instagram_business_account) || liste[0];
      if (!seite) throw new Error('Keine Facebook-Seite gefunden - Instagram muss mit einer Facebook-Seite verknuepft sein');
      return { META_ACCESS_TOKEN: seite.access_token, FACEBOOK_PAGE_ID: seite.id, FACEBOOK_PAGE_TOKEN: seite.access_token, INSTAGRAM_BUSINESS_ACCOUNT_ID: seite.instagram_business_account?.id || '', konto: seite.name };
    },
  },
  threads: {
    name: 'Threads', id: 'THREADS_APP_ID', geheim: 'THREADS_APP_SECRET',
    auth: (e, r, s) => `https://threads.net/oauth/authorize?${q({ client_id: e.THREADS_APP_ID, redirect_uri: r, scope: 'threads_basic,threads_content_publish', response_type: 'code', state: s })}`,
    async tausch(e, code, r) {
      const kurz = await post('https://graph.threads.net/oauth/access_token', { client_id: e.THREADS_APP_ID, client_secret: e.THREADS_APP_SECRET, grant_type: 'authorization_code', redirect_uri: r, code });
      if (!kurz.access_token) throw new Error(kurz.error_message || kurz.error?.message || 'kein access_token');
      const lang = await get(`https://graph.threads.net/access_token?${q({ grant_type: 'th_exchange_token', client_secret: e.THREADS_APP_SECRET, access_token: kurz.access_token })}`);
      return { THREADS_ACCESS_TOKEN: lang.access_token || kurz.access_token, THREADS_USER_ID: String(kurz.user_id || ''), gueltig_bis: Date.now() + (lang.expires_in || 3600) * 1000 };
    },
    // Langlebige Threads-Tokens (60 Tage) vor Ablauf verlaengern.
    async auffrischen(e, w) {
      const d = await get(`https://graph.threads.net/refresh_access_token?${q({ grant_type: 'th_refresh_token', access_token: w.THREADS_ACCESS_TOKEN })}`);
      return d.access_token ? { ...w, THREADS_ACCESS_TOKEN: d.access_token, gueltig_bis: Date.now() + d.expires_in * 1000 } : w;
    },
  },
  linkedin: {
    name: 'LinkedIn', id: 'LINKEDIN_CLIENT_ID', geheim: 'LINKEDIN_CLIENT_SECRET',
    auth: (e, r, s) => `https://www.linkedin.com/oauth/v2/authorization?${q({ response_type: 'code', client_id: e.LINKEDIN_CLIENT_ID, redirect_uri: r, state: s, scope: 'openid profile w_member_social' })}`,
    async tausch(e, code, r) {
      const d = await post('https://www.linkedin.com/oauth/v2/accessToken', { grant_type: 'authorization_code', code, redirect_uri: r, client_id: e.LINKEDIN_CLIENT_ID, client_secret: e.LINKEDIN_CLIENT_SECRET });
      if (!d.access_token) throw new Error(d.error_description || d.error || 'kein access_token');
      const ich = await get('https://api.linkedin.com/v2/userinfo', { authorization: `Bearer ${d.access_token}` });
      return { LINKEDIN_ACCESS_TOKEN: d.access_token, LINKEDIN_PERSON_ID: ich.sub || '', konto: ich.name || '', gueltig_bis: Date.now() + (d.expires_in || 5184000) * 1000 };
    },
  },
  pinterest: {
    name: 'Pinterest', id: 'PINTEREST_APP_ID', geheim: 'PINTEREST_APP_SECRET',
    auth: (e, r, s) => `https://www.pinterest.com/oauth/?${q({ client_id: e.PINTEREST_APP_ID, redirect_uri: r, response_type: 'code', scope: 'boards:read,pins:read,pins:write', state: s })}`,
    async tausch(e, code, r) {
      const d = await post('https://api.pinterest.com/v5/oauth/token', { grant_type: 'authorization_code', code, redirect_uri: r }, { authorization: `Basic ${btoa(`${e.PINTEREST_APP_ID}:${e.PINTEREST_APP_SECRET}`)}` });
      if (!d.access_token) throw new Error(d.message || 'kein access_token');
      const boards = await get('https://api.pinterest.com/v5/boards?page_size=1', { authorization: `Bearer ${d.access_token}` });
      return { PINTEREST_ACCESS_TOKEN: d.access_token, pinterest_refresh: d.refresh_token || '', PINTEREST_BOARD_ID: boards.items?.[0]?.id || '', gueltig_bis: Date.now() + (d.expires_in || 2592000) * 1000 };
    },
    async auffrischen(e, w) {
      if (!w.pinterest_refresh) return w;
      const d = await post('https://api.pinterest.com/v5/oauth/token', { grant_type: 'refresh_token', refresh_token: w.pinterest_refresh }, { authorization: `Basic ${btoa(`${e.PINTEREST_APP_ID}:${e.PINTEREST_APP_SECRET}`)}` });
      return d.access_token ? { ...w, PINTEREST_ACCESS_TOKEN: d.access_token, pinterest_refresh: d.refresh_token || w.pinterest_refresh, gueltig_bis: Date.now() + d.expires_in * 1000 } : w;
    },
  },
};

const q = (o) => new URLSearchParams(o).toString();
async function post(url, felder, kopf = {}) {
  const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', ...kopf }, body: q(felder) });
  return res.json().catch(() => ({}));
}
async function get(url, kopf = {}) {
  const res = await fetch(url, { headers: { accept: 'application/json', ...kopf } });
  return res.json().catch(() => ({}));
}

// Zeitkonstanter Passwort-Vergleich; Passwort muss mind. 16 Zeichen haben.
async function passwortOk(env, eingabe) {
  const soll = String(env.VERBINDER_PASSWORT || '');
  if (soll.length < 16 || typeof eingabe !== 'string') return false;
  const [a, b] = await Promise.all([soll, eingabe].map(async (x) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(x)))));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const antwort = (daten, status, kopf) => new Response(JSON.stringify(daten), { status, headers: { ...JSON_KOPF, ...kopf } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const erlaubt = env.SEITE_URSPRUNG || 'https://ziyabicilecommerce-hub.github.io';
    const cors = { 'access-control-allow-origin': erlaubt, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST, OPTIONS', vary: 'origin' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const [, teil, p] = url.pathname.split('/');
    const rueck = (x) => `${url.origin}/callback/${x}`;
    const passwort = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');

    // Status fuer die Verbinden-Seite: welche Plattformen eingerichtet/verbunden sind.
    if (teil === 'status') {
      if (!(await passwortOk(env, passwort))) return antwort({ fehler: 'Passwort falsch' }, 401, cors);
      const liste = await Promise.all(Object.entries(PLATTFORMEN).map(async ([k, c]) => {
        const w = await env.VERBINDUNGEN.get(k, 'json');
        return { plattform: k, name: c.name, eingerichtet: Boolean(env[c.id] && env[c.geheim]), verbunden: Boolean(w), konto: w?.konto || '', gueltig_bis: w?.gueltig_bis || 0, rueckleitung: rueck(k) };
      }));
      return antwort({ plattformen: liste }, 200, cors);
    }

    // Start: Seite schickt Passwort, bekommt die Anmelde-Adresse der Plattform zurueck.
    if (teil === 'start' && req.method === 'POST') {
      const c = PLATTFORMEN[p];
      if (!c) return antwort({ fehler: 'Unbekannte Plattform' }, 404, cors);
      if (!(await passwortOk(env, passwort))) return antwort({ fehler: 'Passwort falsch' }, 401, cors);
      if (!env[c.id] || !env[c.geheim]) return antwort({ fehler: `${c.name}: App-Schluessel fehlen noch (${c.id}, ${c.geheim})` }, 400, cors);
      const state = crypto.randomUUID();
      await env.VERBINDUNGEN.put(`state:${state}`, p, { expirationTtl: 600 });
      return antwort({ url: c.auth(env, rueck(p), state) }, 200, cors);
    }

    // Rueckkehr von der Plattform: Code gegen Tokens tauschen, speichern, zur Seite zurueck.
    if (teil === 'callback') {
      const zurueck = new URL(env.SEITE_URL || 'https://ziyabicilecommerce-hub.github.io/ai-cash-machine/verbinden/');
      const c = PLATTFORMEN[p];
      const state = url.searchParams.get('state') || '';
      const gemerkt = state && (await env.VERBINDUNGEN.get(`state:${state}`));
      try {
        if (!c || gemerkt !== p) throw new Error('Sitzung abgelaufen - bitte nochmal auf Verbinden klicken');
        await env.VERBINDUNGEN.delete(`state:${state}`);
        if (url.searchParams.get('error')) throw new Error(url.searchParams.get('error_description') || url.searchParams.get('error'));
        const werte = await c.tausch(env, url.searchParams.get('code') || '', rueck(p));
        await env.VERBINDUNGEN.put(p, JSON.stringify({ ...werte, verbunden_am: Date.now() }));
        zurueck.searchParams.set('verbunden', p);
      } catch (err) {
        zurueck.searchParams.set('fehler', `${c?.name || p}: ${String(err.message).slice(0, 200)}`);
      }
      return Response.redirect(zurueck.toString(), 302);
    }

    // Tokens fuer den Direkt-Poster (GitHub Actions) - frischt ablaufende Tokens vorher auf.
    if (teil === 'tokens') {
      if (!(await passwortOk(env, passwort))) return antwort({ fehler: 'Passwort falsch' }, 401, {});
      const werte = {};
      for (const [k, c] of Object.entries(PLATTFORMEN)) {
        let w = await env.VERBINDUNGEN.get(k, 'json');
        if (!w) continue;
        if (c.auffrischen && w.gueltig_bis && w.gueltig_bis - Date.now() < 14 * 86400000) {
          const neu = await c.auffrischen(env, w).catch(() => w);
          if (neu !== w) { w = neu; await env.VERBINDUNGEN.put(k, JSON.stringify(w)); }
        }
        for (const [name, wert] of Object.entries(w)) if (/^[A-Z][A-Z0-9_]+$/.test(name) && wert) werte[name] = String(wert);
      }
      return antwort(werte, 200, {});
    }

    // Trennen: Verbindung einer Plattform loeschen.
    if (teil === 'trennen' && req.method === 'POST') {
      if (!(await passwortOk(env, passwort))) return antwort({ fehler: 'Passwort falsch' }, 401, cors);
      if (!PLATTFORMEN[p]) return antwort({ fehler: 'Unbekannte Plattform' }, 404, cors);
      await env.VERBINDUNGEN.delete(p);
      return antwort({ ok: true }, 200, cors);
    }

    return antwort({ name: 'CASHMACHINE Verbinder', ok: true }, 200, cors);
  },
};
