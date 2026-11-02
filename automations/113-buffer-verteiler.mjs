// Buffer-Verteiler (#113): bespielt die Buffer-Kanäle ohne eigenen Bot mit allgemeinen Inhalten (KEINE Shop-Werbung),
// jeder Kanal etwas anderes, mindestens 5 Posts am Tag:
//   @desk.rebel (Instagram)    -> jedes Mal eine NEUE KI-Horror-Geschichte im Videobot-Look (Vorrat als Ersatz)
//   @purivelle.785 (Instagram) -> Fakten / "Was wäre wenn?" aus dem Fakten-Kanal (#100)
//   giyuuu sama (YouTube)      -> Shorts der eigenen Anime-Serie "Kage no Shiro" (#95)
// Zwei Schritte (dazwischen rendert der Workflow das Horror-Video):
//   node 113-buffer-verteiler.mjs --vorbereiten   -> out/verteiler-plan.json (+ out/folge.json, Ausgabe horror=ja)
//   node 113-buffer-verteiler.mjs --posten [url]  -> postet laut Plan, [url] = gerendertes Horror-Video
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { API, POST_MUTATION } from './lib/bufferPoster.mjs';
import { KANAELE, TIKTOK, ZIEL_PRO_TAG, passend, naechstes, postenJetzt, beitrag, heuteBerlin, zaehlen } from './lib/bufferVerteiler.mjs';
import { baueFolge, slug } from './schatten/videobot.mjs';

const TOKEN = (process.env.BUFFER_ACCESS_TOKEN || '').trim();
const STAND = 'buffer-verteiler/stand.json';
const PLAN = 'out/verteiler-plan.json';
const json = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const bericht = (z) => { console.log(z); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${z}\n`); };
const ausgabe = (z) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${z}\n`); };

async function gql(query, variables) {
  const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ query, variables }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.errors?.length) throw new Error(`Buffer ${res.status}: ${(d.errors || []).map((e) => e.message).join('; ').slice(0, 200)}`);
  return d.data;
}

async function postsHeute(ids) {
  const orgId = (process.env.BUFFER_ORGANISATION || '').trim() || (await gql('{ account { organizations { id } } }')).account.organizations[0]?.id;
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

// Horror: neue KI-Geschichte, sonst eine aus dem Vorrat, die dieser Kanal noch nicht hatte
async function horrorSkript(gepostet) {
  const bekannt = Object.keys(gepostet).map((k) => k.replace(/^horror:/, ''));
  try {
    const { kiJson } = await import('./lib/kiJson.mjs');
    const { neueGeschichte } = await import('./schatten/horrorKi.mjs');
    const s = await neueGeschichte(kiJson, bekannt);
    if (s) return { skript: s, herkunft: 'KI (neu)' };
  } catch (e) { console.log(`[113] KI nicht verfügbar: ${String(e.message).slice(0, 120)}`); }
  const vorrat = json('automations-dashboard/tiktok/skripte.json', { skripte: [] }).skripte.filter((s) => !bekannt.includes(slug(s.titel)));
  const s = vorrat[Math.floor(Math.random() * vorrat.length)];
  return s ? { skript: s, herkunft: 'Vorrat' } : null;
}

async function vorbereiten() {
  const posts = await postsHeute([...KANAELE, ...TIKTOK].map((k) => k.id));
  const videos = json('video-feed/videos.json', { videos: [] }).videos || [];
  const stand = json(STAND, {});
  const plan = [];
  bericht('### 📤 Buffer-Verteiler');
  for (const k of KANAELE) {
    const { heute, letzter } = zaehlen(posts, k.id);
    if (!postenJetzt(heute, letzter)) { bericht(`- ${k.name}: heute ${heute} Posts - jetzt nicht (Abstand/Ziel)`); continue; }
    if (k.quelle === 'horror') {
      const h = await horrorSkript(stand[k.id] || {});
      if (!h) { bericht(`- ⚠️ ${k.name}: keine Horror-Geschichte`); continue; }
      const folge = baueFolge({ ...h.skript, weiter: '', posten: '', kurz: true });
      mkdirSync('out', { recursive: true });
      writeFileSync('out/folge.json', JSON.stringify(folge, null, 1));
      ausgabe('horror=ja'); ausgabe(`slug=${slug(h.skript.titel)}`);
      plan.push({ kanal: k.id, horror: true, schluessel: `horror:${slug(h.skript.titel)}`, titel: h.skript.titel, heute, herkunft: h.herkunft });
      continue;
    }
    const v = naechstes(passend(videos, k.quelle, k.name), stand[k.id] || {});
    if (!v) { bericht(`- ⚠️ ${k.name}: keine passenden Videos`); continue; }
    plan.push({ kanal: k.id, video: v, schluessel: v.datei, titel: v.titel, heute });
  }
  let fehlt = false;
  for (const k of TIKTOK) {
    const { heute } = zaehlen(posts, k.id);
    if (heute < ZIEL_PRO_TAG) fehlt = true;
    bericht(`- @${k.name} (TikTok): heute ${heute} Posts${heute < ZIEL_PRO_TAG ? ` (unter ${ZIEL_PRO_TAG})` : ''}`);
  }
  // Abends noch ein TikTok-Konto unter 5? Dann legt der Workflow ein Extra-Horror-Video vom Videobot nach.
  const stunde = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  if (fehlt && stunde >= 20) { ausgabe('tiktok_auffuellen=ja'); bericht('- ➕ TikTok unter 5 Posts: Videobot legt ein Extra-Video nach.'); }
  mkdirSync('out', { recursive: true });
  writeFileSync(PLAN, JSON.stringify(plan, null, 1));
}

async function posten(horrorUrl) {
  const plan = json(PLAN, []);
  const stand = json(STAND, {});
  for (const p of plan) {
    const k = KANAELE.find((x) => x.id === p.kanal);
    let v = p.video;
    if (p.horror) {
      if (!/^https:\/\//.test(horrorUrl || '')) { bericht(`- ❌ ${k.name}: Horror-Video nicht gerendert`); continue; }
      const folge = json('out/folge.json', {});
      v = { url: horrorUrl, titel: p.titel, caption: `${folge.caption || p.titel}\n\n#horror #gruselgeschichte #creepypasta #gänsehaut #horrorstory` };
    }
    const { text, metadata } = beitrag(v, k.dienst);
    try {
      const d = await gql(POST_MUTATION, { input: { channelId: k.id, text, schedulingType: 'automatic', mode: 'shareNow', assets: [{ video: { url: v.url } }], metadata } });
      const r = d.createPost;
      if (r.__typename !== 'PostActionSuccess') throw new Error(r.message || r.__typename);
      (stand[k.id] ||= {})[p.schluessel] = new Date().toISOString();
      bericht(`- ✅ ${k.name}: „${String(p.titel).slice(0, 60)}“${p.herkunft ? ` (${p.herkunft})` : ''} gepostet (heute dann ${p.heute + 1})`);
    } catch (e) {
      bericht(`- ❌ ${k.name}: ${String(e.message).slice(0, 200)}`);
    }
  }
  mkdirSync('buffer-verteiler', { recursive: true });
  writeFileSync(STAND, `${JSON.stringify(stand, null, 1)}\n`);
}

const [modus, arg] = process.argv.slice(2);
if (!TOKEN) console.log('[113-buffer-verteiler] BUFFER_ACCESS_TOKEN fehlt - übersprungen.');
else (modus === '--posten' ? posten(arg) : vorbereiten()).catch((e) => { console.error(`[113-buffer-verteiler] ${String(e.message).slice(0, 300)}`); process.exit(1); });
