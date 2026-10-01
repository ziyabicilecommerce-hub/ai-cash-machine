// Kommentar-Agent: liest neue Kommentare unter den eigenen Posts (aus video-feed/posts.json) und antwortet
// ehrlich - Fragen und Kaufinteresse mit Produkt-Link, Lob mit Dank. Beschwerden, Gesundheitsfragen,
// Streit und Unklares beantwortet er NICHT selbst, sondern meldet sie dir. Spam wird ignoriert.
// Plattformen mit offizieller Kommentar-API: YouTube, Instagram, Facebook, Bluesky, Mastodon.
// (TikTok bietet Apps keine Kommentar-API; X liest Antworten erst im kostenpflichtigen Tarif.)

const env = (k) => (process.env[k] || '').trim();
const GRAPH = () => `https://graph.facebook.com/${env('META_GRAPH_VERSION') || 'v23.0'}`;
const text = (html) => String(html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

async function json(res, was) {
  const t = await res.text();
  let d = {};
  try { d = t ? JSON.parse(t) : {}; } catch { /* kein JSON */ }
  if (!res.ok || d.error) throw new Error(`${was}: ${res.status} ${String(d.error?.message || d.message || d.error || t).slice(0, 160)}`);
  return d;
}

// Je Plattform: bereit(), lesen(post) -> [{id, autor, text, zeit, ref}], antworten(kommentar, text) -> id
export const ADAPTER = {
  Bluesky: {
    bereit: () => Boolean(env('BLUESKY_HANDLE') && env('BLUESKY_APP_PASSWORD')),
    async lesen(post, laden = fetch) {
      const d = await json(await laden(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(post.id)}&depth=1`), 'Thread');
      const wurzel = d.thread?.post;
      return (d.thread?.replies || []).map((r) => r.post).filter(Boolean).map((p) => ({
        id: p.uri, autor: p.author?.handle || '', text: p.record?.text || '', zeit: p.record?.createdAt || p.indexedAt,
        ref: { root: { uri: wurzel.uri, cid: wurzel.cid }, parent: { uri: p.uri, cid: p.cid } },
      }));
    },
    async antworten(k, antwort, laden = fetch) {
      const s = await json(await laden('https://bsky.social/xrpc/com.atproto.server.createSession', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: env('BLUESKY_HANDLE'), password: env('BLUESKY_APP_PASSWORD') }) }), 'Login');
      const pds = s.didDoc?.service?.find((x) => x.id === '#atproto_pds')?.serviceEndpoint || 'https://bsky.social';
      const r = await json(await laden(`${pds}/xrpc/com.atproto.repo.createRecord`, { method: 'POST', headers: { Authorization: `Bearer ${s.accessJwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record: { $type: 'app.bsky.feed.post', text: antwort.slice(0, 300), createdAt: new Date().toISOString(), reply: k.ref } }) }), 'Antwort');
      return r.uri;
    },
    eigen: (k) => k.autor === env('BLUESKY_HANDLE'),
  },
  Mastodon: {
    bereit: () => Boolean(env('MASTODON_URL') && env('MASTODON_TOKEN')),
    async lesen(post, laden = fetch) {
      const basis = env('MASTODON_URL').replace(/\/$/, '');
      const d = await json(await laden(`${basis}/api/v1/statuses/${encodeURIComponent(post.id)}/context`, { headers: { Authorization: `Bearer ${env('MASTODON_TOKEN')}` } }), 'Kontext');
      return (d.descendants || []).filter((s) => s.in_reply_to_id === post.id).map((s) => ({ id: s.id, autor: s.account?.acct || '', text: text(s.content), zeit: s.created_at, ref: { id: s.id, acct: s.account?.acct } }));
    },
    async antworten(k, antwort, laden = fetch) {
      const basis = env('MASTODON_URL').replace(/\/$/, '');
      const s = await json(await laden(`${basis}/api/v1/statuses`, { method: 'POST', headers: { Authorization: `Bearer ${env('MASTODON_TOKEN')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: `@${k.ref.acct} ${antwort}`.slice(0, 500), in_reply_to_id: k.ref.id, visibility: 'public' }) }), 'Antwort');
      return s.id;
    },
    eigen: (k) => false,
  },
  YouTube: {
    // Antworten braucht den Scope youtube.force-ssl (nicht nur youtube.upload) beim Refresh-Token.
    bereit: () => Boolean(env('YOUTUBE_CLIENT_ID') && env('YOUTUBE_CLIENT_SECRET') && env('YOUTUBE_REFRESH_TOKEN')),
    async token(laden) {
      return (await json(await laden('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ client_id: env('YOUTUBE_CLIENT_ID'), client_secret: env('YOUTUBE_CLIENT_SECRET'), refresh_token: env('YOUTUBE_REFRESH_TOKEN'), grant_type: 'refresh_token' }) }), 'Token')).access_token;
    },
    async lesen(post, laden = fetch) {
      const t = await this.token(laden);
      const d = await json(await laden(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&maxResults=50&videoId=${encodeURIComponent(post.id)}`, { headers: { Authorization: `Bearer ${t}` } }), 'Kommentare');
      return (d.items || []).filter((i) => !i.snippet?.totalReplyCount).map((i) => { const s = i.snippet.topLevelComment.snippet; return { id: i.snippet.topLevelComment.id, autor: s.authorDisplayName, text: s.textOriginal, zeit: s.publishedAt, ref: { parentId: i.snippet.topLevelComment.id }, kanal: s.authorChannelId?.value }; });
    },
    async antworten(k, antwort, laden = fetch) {
      const t = await this.token(laden);
      const d = await json(await laden('https://www.googleapis.com/youtube/v3/comments?part=snippet', { method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ snippet: { parentId: k.ref.parentId, textOriginal: antwort.slice(0, 1000) } }) }), 'Antwort');
      return d.id;
    },
    eigen: () => false,
  },
  Instagram: {
    bereit: () => Boolean(env('META_ACCESS_TOKEN') && env('INSTAGRAM_BUSINESS_ACCOUNT_ID')),
    async lesen(post, laden = fetch) {
      const d = await json(await laden(`${GRAPH()}/${encodeURIComponent(post.id)}/comments?fields=id,text,username,timestamp,replies{id}&access_token=${encodeURIComponent(env('META_ACCESS_TOKEN'))}`), 'Kommentare');
      return (d.data || []).filter((c) => !c.replies?.data?.length).map((c) => ({ id: c.id, autor: c.username || '', text: c.text || '', zeit: c.timestamp, ref: { id: c.id } }));
    },
    async antworten(k, antwort, laden = fetch) {
      const d = await json(await laden(`${GRAPH()}/${encodeURIComponent(k.ref.id)}/replies`, { method: 'POST', body: new URLSearchParams({ message: antwort.slice(0, 2000), access_token: env('META_ACCESS_TOKEN') }) }), 'Antwort');
      return d.id;
    },
    eigen: () => false,
  },
  Facebook: {
    bereit: () => Boolean(env('FACEBOOK_PAGE_ID') && (env('FACEBOOK_PAGE_TOKEN') || env('META_ACCESS_TOKEN'))),
    token: () => env('FACEBOOK_PAGE_TOKEN') || env('META_ACCESS_TOKEN'),
    async lesen(post, laden = fetch) {
      const d = await json(await laden(`${GRAPH()}/${encodeURIComponent(post.id)}/comments?fields=id,message,from,created_time,comment_count&access_token=${encodeURIComponent(this.token())}`), 'Kommentare');
      return (d.data || []).filter((c) => !c.comment_count && c.from?.id !== env('FACEBOOK_PAGE_ID')).map((c) => ({ id: c.id, autor: c.from?.name || '', text: c.message || '', zeit: c.created_time, ref: { id: c.id } }));
    },
    async antworten(k, antwort, laden = fetch) {
      const d = await json(await laden(`${GRAPH()}/${encodeURIComponent(k.ref.id)}/comments`, { method: 'POST', body: new URLSearchParams({ message: antwort.slice(0, 2000), access_token: this.token() }) }), 'Antwort');
      return d.id;
    },
    eigen: () => false,
  },
};

// Grober Vorfilter ohne KI: Spam und Gesundheitsthemen erkennt er sicher, den Rest bewertet die KI.
export function vorfilter(t) {
  const s = String(t || '').toLowerCase();
  if (!s.trim() || /https?:\/\/|www\.|t\.me\/|whatsapp|dm me|follow me|check my|crypto|bitcoin|onlyfans|\bverdien(e|st) \d+/.test(s)) return 'spam';
  if (/schmerz|arzt|krank|bandscheib|arthrose|schwanger|verletz|operation|\bop\b|ischias|rheuma|medizin/.test(s)) return 'gesundheit';
  // International: Gesundheitsthemen auch auf Englisch, Spanisch, Franzoesisch, Italienisch, Portugiesisch, Tuerkisch, Polnisch, Niederlaendisch.
  if (/\bpain|doctor|injur|surgery|pregnan|sciatica|arthritis|hernia|disc (problem|issue)|medical|dolor|médic|medic[oa]\b|lesi[oó]n|embaraz|douleur|médecin|bless[ée]|enceinte|dolore|infortun|incinta|gravidez|grávida|ağrı|doktor|hamile|ból|lekarz|kontuzj|ciąż|pijn|dokter|blessure|zwanger/.test(s)) return 'gesundheit';
  return '';
}

export function antwortPrompt(k, post) {
  return `Du betreust die Kommentare eines Online-Shops. Produkt im Video: "${post.titel}". Infos: "${String(post.caption || '').slice(0, 500)}". Link: ${post.shopLink || '(keiner)'}.\n` +
    `Kommentar von ${k.autor}: "${String(k.text).slice(0, 500)}"\n` +
    'Ordne den Kommentar ein: "kauf" (Frage zu Preis/Kauf/Versand/Größe), "frage" (Frage zum Produkt), "lob", "kritik" (Beschwerde, Ärger, Problem mit Bestellung), "sonstiges". ' +
    'Bei kauf/frage/lob schreibe eine kurze, freundliche Antwort IN DER SPRACHE DES KOMMENTARS (auf Deutsch mit Du; max. 2 Sätze, 1 Emoji erlaubt). Nur Fakten aus den Infos, nichts erfinden (keine Lieferzeiten, Rabatte oder Eigenschaften, die nicht dastehen). ' +
    'Keine Heilversprechen. Bei kauf den Link anhängen. Wenn du die Antwort nicht sicher weißt: Kategorie "sonstiges". ' +
    'Antworte NUR mit JSON: {"kategorie":"...","antwort":"..."}';
}

// Entscheidung je Kommentar: 'antworten' (mit Text), 'melden' (an dich) oder 'ignorieren'.
export async function entscheiden(k, post, ki) {
  const v = vorfilter(k.text);
  if (v === 'spam') return { aktion: 'ignorieren', grund: 'Spam' };
  if (v === 'gesundheit') return { aktion: 'melden', grund: 'Gesundheitsfrage - bitte persönlich antworten' };
  const d = await ki(antwortPrompt(k, post));
  const kat = String(d?.kategorie || '').toLowerCase();
  const antwort = String(d?.antwort || '').replace(/\s+/g, ' ').trim();
  if (kat === 'kritik') return { aktion: 'melden', grund: 'Kritik/Beschwerde' };
  if (!['kauf', 'frage', 'lob'].includes(kat) || antwort.length < 3 || vorfilter(antwort.replace(post.shopLink || '§', '')) === 'gesundheit') return { aktion: 'melden', grund: 'Unklar - lieber du' };
  // Links nur den eigenen Shop-Link zulassen.
  const links = antwort.match(/https?:\/\/\S+/g) || [];
  if (links.some((l) => !post.shopLink || !l.startsWith(post.shopLink.split('?')[0]))) return { aktion: 'melden', grund: 'Antwort enthielt fremden Link' };
  return { aktion: 'antworten', kategorie: kat, antwort };
}
