// Buffer-Verteiler (#113): bespielt die Buffer-Kanäle ohne eigenen Bot mit EIGENEN Inhalten, mindestens 5 am Tag:
//   @desk.rebel (Instagram)   -> DeskRebel-Videos aus der Video-Fabrik (#94)
//   @purivelle.785 (Instagram)-> Purivelle-Videos aus der Video-Fabrik (#94)
//   giyuuu sama (YouTube)     -> Shorts der eigenen Anime-Serie "Kage no Shiro" (#95/#104)
// Pro Lauf höchstens 1 Post je Kanal. Zählt dazu die Posts der 3 TikTok-Konten (Serie, Videobot, Fakten).
// Braucht BUFFER_ACCESS_TOKEN. Stand (was wann gepostet wurde) liegt in buffer-verteiler/stand.json.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { API, POST_MUTATION } from './lib/bufferPoster.mjs';
import { KANAELE, TIKTOK, ZIEL_PRO_TAG, passend, naechstes, postenJetzt, beitrag, heuteBerlin, zaehlen } from './lib/bufferVerteiler.mjs';

const TOKEN = (process.env.BUFFER_ACCESS_TOKEN || '').trim();
const STAND = 'buffer-verteiler/stand.json';
const json = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const bericht = (z) => { console.log(z); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${z}\n`); };

async function gql(query, variables) {
  const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ query, variables }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.errors?.length) throw new Error(`Buffer ${res.status}: ${(d.errors || []).map((e) => e.message).join('; ').slice(0, 200)}`);
  return d.data;
}

async function postsHeute(orgId, ids) {
  const posts = [];
  let after = null;
  for (let seite = 0; seite < 4; seite++) {
    const d = await gql(`query($i: PostsInput!, $a: String) { posts(input: $i, first: 100, after: $a) {
      edges { node { id status channelId dueAt sentAt } } pageInfo { hasNextPage endCursor } } }`,
    { i: { organizationId: orgId, filter: { channelIds: ids, dueAt: { start: heuteBerlin() } } }, a: after });
    posts.push(...d.posts.edges.map((e) => e.node));
    if (!d.posts.pageInfo.hasNextPage) break;
    after = d.posts.pageInfo.endCursor;
  }
  return posts;
}

async function main() {
  if (!TOKEN) { console.log('[113-buffer-verteiler] BUFFER_ACCESS_TOKEN fehlt - übersprungen.'); return; }
  const orgId = (process.env.BUFFER_ORGANISATION || '').trim() || (await gql('{ account { organizations { id } } }')).account.organizations[0]?.id;
  const posts = await postsHeute(orgId, [...KANAELE, ...TIKTOK].map((k) => k.id));
  const videos = json('video-feed/videos.json', { videos: [] }).videos || [];
  const stand = json(STAND, {});
  bericht('### 📤 Buffer-Verteiler');
  for (const k of KANAELE) {
    const { heute, letzter } = zaehlen(posts, k.id);
    if (!postenJetzt(heute, letzter)) { bericht(`- ${k.name}: heute ${heute} Posts - jetzt nicht (Abstand/Ziel erreicht)`); continue; }
    const v = naechstes(passend(videos, k.quelle), stand[k.id] || {});
    if (!v) { bericht(`- ⚠️ ${k.name}: keine passenden Videos im Feed`); continue; }
    const { text, metadata } = beitrag(v, k.dienst);
    try {
      const d = await gql(POST_MUTATION, { input: { channelId: k.id, text, schedulingType: 'automatic', mode: 'shareNow', assets: [{ video: { url: v.url } }], metadata } });
      const r = d.createPost;
      if (r.__typename !== 'PostActionSuccess') throw new Error(r.message || r.__typename);
      (stand[k.id] ||= {})[v.datei] = new Date().toISOString();
      bericht(`- ✅ ${k.name}: „${String(v.titel).slice(0, 60)}“ gepostet (heute dann ${heute + 1})`);
    } catch (e) {
      bericht(`- ❌ ${k.name}: ${String(e.message).slice(0, 200)}`);
    }
  }
  let fehlt = false;
  for (const k of TIKTOK) {
    const { heute } = zaehlen(posts, k.id);
    if (heute < ZIEL_PRO_TAG) fehlt = true;
    bericht(`- @${k.name} (TikTok): heute ${heute} Posts${heute < ZIEL_PRO_TAG ? ` (unter ${ZIEL_PRO_TAG})` : ''}`);
  }
  // Abends noch ein TikTok-Konto unter 5? Dann legt der Workflow ein Extra-Horror-Video vom Videobot nach.
  const stunde = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  if (fehlt && stunde >= 20 && process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, 'tiktok_auffuellen=ja\n');
    bericht('- ➕ TikTok unter 5 Posts: Videobot legt ein Extra-Video nach.');
  }
  mkdirSync('buffer-verteiler', { recursive: true });
  writeFileSync(STAND, `${JSON.stringify(stand, null, 1)}\n`);
}

main().catch((e) => { console.error(`[113-buffer-verteiler] ${String(e.message).slice(0, 300)}`); process.exit(1); });
