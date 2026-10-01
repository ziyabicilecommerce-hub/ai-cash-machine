// Leistungs-Gedaechtnis: merkt sich jeden Post (welches Video, welcher Hook-Typ, welcher Winkel, welches
// Format), holt spaeter die echten Zahlen der Plattformen und rechnet daraus, was wirklich funktioniert.
// Nur echte Zahlen - nichts wird geschaetzt oder erfunden. Plattformen ohne Statistik-Schnittstelle
// (Telegram, Discord) werden gemerkt, aber nicht bewertet.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const POSTS = 'video-feed/posts.json';
export const LERNEN = 'automations/state/lernen.json';
const env = (k) => (process.env[k] || '').trim();
const GRAPH = () => `https://graph.facebook.com/${env('META_GRAPH_VERSION') || 'v23.0'}`;

const lesen = (pfad, leer) => { try { return existsSync(pfad) ? JSON.parse(readFileSync(pfad, 'utf8')) : leer; } catch { return leer; } };
const schreiben = (pfad, d) => { mkdirSync(dirname(pfad), { recursive: true }); writeFileSync(pfad, JSON.stringify(d, null, 1) + '\n'); };
export const postsLaden = (pfad = POSTS) => lesen(pfad, []);
export const lernstandLaden = (pfad = LERNEN) => lesen(pfad, { hookTyp: {}, winkel: {}, format: {}, gruppen: {} });

// Plattform-ID aus der Rueckmeldung des Posters ("Reel 123", "Video abc (public)", "Video-Post at://...").
export function postId(plattform, ergebnis) {
  const t = String(ergebnis || '');
  if (plattform === 'Bluesky') return t.match(/at:\/\/\S+/)?.[0] || '';
  if (plattform === 'Mastodon') return t.match(/Status (\S+)/)?.[1] || '';
  return t.match(/^(?:Reel|Video) ([\w-]+)/)?.[1] || '';
}

export function postMerken(m, plattform, ergebnis, { pfad = POSTS, jetzt = new Date() } = {}) {
  const id = postId(plattform, ergebnis);
  if (!id) return;
  const posts = postsLaden(pfad);
  posts.unshift({ plattform, id, datei: m.datei, gruppe: m.gruppe || m.datei, hookTyp: m.hookTyp || '', winkel: m.winkel || '', format: m.formatName || '', gepostet: jetzt.toISOString(), zahlen: null });
  schreiben(pfad, posts.slice(0, 3000));
}

// Echte Kennzahlen je Plattform. Rueckgabe {aufrufe?, likes, kommentare, teilen} oder null.
export const HOLER = {
  async YouTube(id, laden) {
    const t = await (await laden('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: env('YOUTUBE_CLIENT_ID'), client_secret: env('YOUTUBE_CLIENT_SECRET'), refresh_token: env('YOUTUBE_REFRESH_TOKEN'), grant_type: 'refresh_token' }) })).json();
    const d = await (await laden(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${t.access_token}` } })).json();
    const s = d.items?.[0]?.statistics;
    return s ? { aufrufe: +s.viewCount || 0, likes: +s.likeCount || 0, kommentare: +s.commentCount || 0, teilen: 0 } : null;
  },
  async Bluesky(id, laden) {
    const d = await (await laden(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(id)}`)).json();
    const p = d.posts?.[0];
    return p ? { likes: p.likeCount || 0, kommentare: p.replyCount || 0, teilen: (p.repostCount || 0) + (p.quoteCount || 0) } : null;
  },
  async Mastodon(id, laden) {
    const s = await (await laden(`${env('MASTODON_URL').replace(/\/$/, '')}/api/v1/statuses/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${env('MASTODON_TOKEN')}` } })).json();
    return s.id ? { likes: s.favourites_count || 0, kommentare: s.replies_count || 0, teilen: s.reblogs_count || 0 } : null;
  },
  async Instagram(id, laden) {
    const d = await (await laden(`${GRAPH()}/${encodeURIComponent(id)}/insights?metric=views,likes,comments,shares&access_token=${encodeURIComponent(env('META_ACCESS_TOKEN'))}`)).json();
    const w = Object.fromEntries((d.data || []).map((x) => [x.name, x.values?.[0]?.value || 0]));
    return d.data ? { aufrufe: w.views || 0, likes: w.likes || 0, kommentare: w.comments || 0, teilen: w.shares || 0 } : null;
  },
  async Facebook(id, laden) {
    const token = env('FACEBOOK_PAGE_TOKEN') || env('META_ACCESS_TOKEN');
    const d = await (await laden(`${GRAPH()}/${encodeURIComponent(id)}/video_insights?metric=total_video_views&access_token=${encodeURIComponent(token)}`)).json();
    const v = d.data?.[0]?.values?.[0]?.value;
    return Number.isFinite(v) ? { aufrufe: v, likes: 0, kommentare: 0, teilen: 0 } : null;
  },
};

// Ein Wert pro Post: Aufrufe, wo es sie gibt, sonst gewichtete Reaktionen (Kommentar 2x, Teilen 3x).
export const wert = (z) => (z ? (Number.isFinite(z.aufrufe) && z.aufrufe > 0 ? z.aufrufe : z.likes + 2 * z.kommentare + 3 * z.teilen) : null);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };

// Lernstand: je Plattform relativ zum eigenen Median (ein TikTok-Aufruf ist kein Bluesky-Like),
// dann gemittelt je Hook-Typ, Winkel, Format und Video-Gruppe. punkte > 0 = besser als ueblich.
export function lernstandRechnen(posts) {
  const reif = posts.filter((p) => wert(p.zahlen) !== null);
  const mediane = {};
  for (const pl of new Set(reif.map((p) => p.plattform))) mediane[pl] = median(reif.filter((p) => p.plattform === pl).map((p) => wert(p.zahlen)));
  const stand = { stand: new Date().toISOString(), posts: reif.length, hookTyp: {}, winkel: {}, format: {}, gruppen: {} };
  for (const p of reif) {
    const punkte = Math.log((wert(p.zahlen) + 1) / (mediane[p.plattform] + 1));
    for (const [feld, schluessel] of [['hookTyp', p.hookTyp], ['winkel', p.winkel], ['format', p.format], ['gruppen', p.gruppe]]) {
      if (!schluessel) continue;
      const e = (stand[feld][schluessel] ||= { n: 0, summe: 0 });
      e.n += 1; e.summe += punkte;
      if (feld === 'gruppen') (e.dateien ||= {})[p.datei] = [...(e.dateien[p.datei] || []), punkte];
    }
  }
  for (const feld of ['hookTyp', 'winkel', 'format', 'gruppen']) for (const e of Object.values(stand[feld])) e.punkte = Math.round((e.summe / e.n) * 1000) / 1000;
  // Gewinner je Gruppe (3 Anfaenge eines Videos): beste Variante, sobald jede mindestens 2 Messungen hat.
  for (const e of Object.values(stand.gruppen)) {
    const v = Object.entries(e.dateien || {}).map(([d, w]) => ({ d, n: w.length, p: w.reduce((a, b) => a + b, 0) / w.length }));
    if (v.length > 1 && v.every((x) => x.n >= 2)) e.gewinner = v.sort((a, b) => b.p - a.p)[0].d;
  }
  return stand;
}

// Auswahl mit Lernen (UCB): unbekannte Optionen werden erst ausprobiert, danach gewinnt, was echte
// Zahlen bringt - mit etwas Neugier, damit ein frueher Zufallstreffer nicht fuer immer gewinnt.
export function waehlen(optionen, statistik = {}, { neugier = 0.6, seed = 0 } = {}) {
  if (!optionen.length) return '';
  const neu = optionen.filter((o) => !(statistik[o]?.n > 0));
  if (neu.length) return neu[Math.abs(seed) % neu.length];
  const gesamt = optionen.reduce((s, o) => s + statistik[o].n, 0);
  return optionen.map((o) => ({ o, w: statistik[o].punkte + neugier * Math.sqrt(Math.log(gesamt + 1) / statistik[o].n) })).sort((a, b) => b.w - a.w)[0].o;
}

export function lernstandSpeichern(stand, pfad = LERNEN) { schreiben(pfad, stand); }
