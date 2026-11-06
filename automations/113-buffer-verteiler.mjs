// Buffer-Verteiler (#113): bespielt die Buffer-Kanäle ohne eigenen Bot mit allgemeinen Inhalten (KEINE Shop-Werbung),
// jeder Kanal etwas anderes, mindestens 5 Posts am Tag:
//   @desk.rebel (Instagram)    -> jedes Mal eine NEUE KI-Horror-Geschichte im Videobot-Look (Vorrat als Ersatz)
//   @purivelle.785 (Instagram) -> ebenfalls Horror (eigene Geschichten, nie dieselbe wie desk.rebel) - seit 06.11. statt Fakten
//   giyuuu sama (YouTube)      -> englische Horror-Shorts (skripteEn.mjs) - YouTube verteilt weltweit
// Zwei Schritte (dazwischen rendert der Workflow das Horror-Video):
//   node 113-buffer-verteiler.mjs --vorbereiten -> out/verteiler-plan.json (+ out/folge-<kanal>.json je Horror-Kanal)
//   node 113-buffer-verteiler.mjs --posten      -> postet laut Plan, Video-Links aus out/horror-urls.json
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { API, POST_MUTATION } from './lib/bufferPoster.mjs';
import { KANAELE, TIKTOK, ZIEL_PRO_TAG, passend, naechstes, postenJetzt, beitrag, heuteBerlin, zaehlen, storyEingabe, abVariante, abGewichte, AB_FEATURES, abSchluessel, sprachAnteil, formatWerte } from './lib/bufferVerteiler.mjs';
import { baueFolge, slug, gewinner } from './schatten/videobot.mjs';
import { naechstesSkriptEn, SKRIPTE_EN } from './schatten/skripteEn.mjs';
import { teil2Kandidat as teil2KandidatSync } from './schatten/skriptBot.mjs';

const TOKEN = (process.env.BUFFER_ACCESS_TOKEN || '').trim();
const STAND = 'buffer-verteiler/stand.json';
const PLAN = 'out/verteiler-plan.json';
const VARIANTEN = 'buffer-verteiler/varianten.json';  // A/B-Test: welches Video hatte welche Features
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
      edges { node { id status channelId dueAt sentAt text } } pageInfo { hasNextPage endCursor } } }`,
    { i: { organizationId: orgId, filter: { channelIds: ids, dueAt: { start: heuteBerlin() } } }, a: after });
    posts.push(...d.posts.edges.map((e) => e.node));
    if (!d.posts.pageInfo.hasNextPage) break;
    after = d.posts.pageInfo.endCursor;
  }
  return posts;
}

// KI nur, wenn ein starker Schlüssel da ist - die kleine eigene KI verwirft ihre Geschichten ohnehin (spart ~2 Min. pro Kanal)
export const kiVerfuegbar = (env = process.env) => Boolean(env.GEMINI_API_KEY || env.GROQ_API_KEY || env.POLLINATIONS_TOKEN || /^(1|ja|an|true)$/i.test(env.HORROR_KI_LOKAL || ''));

// Horror: 1) Teil 2 eines eigenen Hits, 2) abwechselnd ein TikTok-Hit, 3) KI (mit Schlüssel), 4) Skript-Bot (lernt, welches Muster läuft), 5) Vorrat
async function horrorSkript(gepostet, konto = '') {
  const bekannt = Object.keys(gepostet).map((k) => k.replace(/^horror:(hit:)?/, ''));
  const skripte = json('automations-dashboard/tiktok/skripte.json', { skripte: [] }).skripte;
  const letzte = json('automations-dashboard/tiktok/daten.json', {}).letzte || [];
  const hit = gewinner(skripte, letzte).map((g) => skripte.find((s) => slug(s.titel) === g.slug)).find((s) => s && !bekannt.includes(slug(s.titel)));
  const zuletztHit = Object.entries(gepostet).sort((a, b) => String(b[1]).localeCompare(String(a[1])))[0]?.[0]?.startsWith('horror:hit:');
  const { naechstesSkript, teil2Kandidat } = await import('./schatten/skriptBot.mjs');
  const fortsetzung = teil2Kandidat(konto, bekannt, letzte);
  if (fortsetzung) return { skript: fortsetzung, herkunft: 'Teil 2 eines Hits' };
  if (hit && !zuletztHit) return { skript: hit, herkunft: 'TikTok-Hit', schluessel: `hit:${slug(hit.titel)}` };
  if (kiVerfuegbar()) try {
    const { neueGeschichte, geschichtenKi } = await import('./schatten/horrorKi.mjs');
    const s = await neueGeschichte(geschichtenKi, bekannt, { hooks: skripte.map((x) => x.hook) });
    if (s) return { skript: s, herkunft: 'KI (neu)' };
  } catch (e) { console.log(`[113] KI nicht verfügbar: ${String(e.message).slice(0, 120)}`); }
  // Skript-Bot: neue Geschichten aus bewährten Mustern, ohne KI - das Muster mit den meisten Aufrufen zuerst
  const bot = naechstesSkript(bekannt, letzte);
  if (bot) return { skript: bot, herkunft: 'Skript-Bot' };
  if (hit) return { skript: hit, herkunft: 'TikTok-Hit', schluessel: `hit:${slug(hit.titel)}` };
  const vorrat = skripte.filter((s) => !bekannt.includes(slug(s.titel)));
  const s = vorrat[Math.floor(Math.random() * vorrat.length)];
  return s ? { skript: s, herkunft: 'Vorrat' } : null;
}

// Englischer Kanal: eigene, von Hand geschriebene Geschichten (skripteEn.mjs)
function horrorSkriptEn(gepostet) {
  const bekannt = Object.keys(gepostet).map((key) => key.replace(/^horror:/, ''));
  const letzte = json('automations-dashboard/tiktok/daten.json', {}).letzte || [];
  const fortsetzung = teil2KandidatSync('giyuuu', bekannt, letzte, { alle: SKRIPTE_EN, suffix: ' – Part 2' });
  if (fortsetzung) return { skript: fortsetzung, herkunft: 'Part 2 of a hit' };
  const s = naechstesSkriptEn(bekannt, letzte);
  return s ? { skript: s, herkunft: 'English' } : null;
}

async function vorbereiten() {
  const posts = await postsHeute([...KANAELE, ...TIKTOK].map((k) => k.id));
  const videos = json('video-feed/videos.json', { videos: [] }).videos || [];
  const stand = json(STAND, {});
  const plan = [], horrorKanaele = [];
  const wb = json('automations-dashboard/tiktok/wochenbericht.json', {});
  const gewichte = abGewichte(wb.ab);
  const enAnteil = sprachAnteil(wb.sprachTest);
  const angepasst = Object.entries(gewichte).filter(([f, aus]) => aus !== AB_FEATURES[f]);
  bericht('### 📤 Buffer-Verteiler');
  if (angepasst.length) bericht(`- 🧪 A/B-Gewinner übernommen: ${angepasst.map(([f, aus]) => `${f} ${aus < 0.5 ? 'meist an' : 'meist aus'}`).join(', ')}`);
  for (const k of KANAELE) {
    const { heute, letzter } = zaehlen(posts, k.id);
    if (!postenJetzt(heute, letzter)) { bericht(`- ${k.name}: heute ${heute} Posts - jetzt nicht (Abstand/Ziel)`); continue; }
    // Mix-Kanal: diesmal Deutsch oder Englisch (Sprach-Test)
    const quelle = k.quelle === 'horror-mix' ? (Math.random() < enAnteil ? 'horror-en' : 'horror') : k.quelle;
    if (quelle.startsWith('horror')) {
      // jeder Horror-Kanal bekommt eine EIGENE Geschichte: was ein anderer Kanal schon hatte oder in diesem Lauf bekommt, ist tabu
      const schonDa = Object.fromEntries([...Object.values(stand).flatMap((x) => Object.entries(x || {})), ...plan.map((x) => [x.schluessel, 'jetzt'])]);
      // Zweite Sicherung gegen doppelte Posts: was laut Buffer heute schon auf diesem Kanal lief (Hook im Text), ist tabu -
      // auch wenn der gespeicherte Stand es aus irgendeinem Grund nicht kennt
      const heuteTexte = posts.filter((x) => x.channelId === k.id).map((x) => String(x.text || ''));
      const schonHeute = (sk) => [sk.hook, sk.hook2].some((hk) => hk && heuteTexte.some((t) => t.includes(String(hk).slice(0, 40))));
      const extra = {};
      let h = null;
      for (let versuch = 0; versuch < 5; versuch++) {
        const gepostet = { ...schonDa, ...(stand[k.id] || {}), ...extra };
        h = quelle === 'horror-en' ? horrorSkriptEn(gepostet) : await horrorSkript(gepostet, k.name);
        if (!h || !schonHeute(h.skript)) break;
        bericht(`- ↩️ ${k.name}: „${h.skript.titel}“ lief heute schon - nehme eine andere`);
        extra[`horror:${h.schluessel || slug(h.skript.titel)}`] = 'heute';
        h = null;
      }
      if (!h) { bericht(`- ⚠️ ${k.name}: keine Horror-Geschichte`); continue; }
      const variante = abVariante(Math.random, gewichte);
      if (!h.skript.hook2) variante.duhook = false;  // nur Skript-Bot-Geschichten haben einen Du-Hook
      const hook = variante.duhook ? h.skript.hook2 : h.skript.hook;
      const folge = baueFolge({ ...h.skript, hook, weiter: '', posten: '', kurz: true, ...variante });
      mkdirSync('out', { recursive: true });
      writeFileSync(`out/folge-${k.id}.json`, JSON.stringify({ ...folge, _slug: slug(h.skript.titel) }, null, 1));
      horrorKanaele.push(k.id);
      plan.push({ kanal: k.id, horror: true, schluessel: `horror:${h.schluessel || slug(h.skript.titel)}`, titel: h.skript.titel, heute, herkunft: h.herkunft, variante, hook, quelle });
      continue;
    }
    // stärkstes Format dieses Kontos zuerst (z. B. "Wahr oder Mythos?" bei purivelle) - in 20 % der Fälle frei, damit andere weiter getestet werden
    const fw = Math.random() < 0.8 ? formatWerte(json('automations-dashboard/tiktok/daten.json', {}).letzte || [], k.name) : null;
    const v = naechstes(passend(videos, k.quelle, k.name), stand[k.id] || {}, fw);
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
  // Kein Auffüllen mehr (04.11.): mehr TikTok-Posts drückten die Reichweite pro Video - Qualität vor Menge.
  void fehlt; void stunde;
  if (horrorKanaele.length) { ausgabe('horror=ja'); ausgabe(`horror_kanaele=${horrorKanaele.join(' ')}`); }
  mkdirSync('out', { recursive: true });
  writeFileSync(PLAN, JSON.stringify(plan, null, 1));
}

async function posten() {
  const plan = json(PLAN, []);
  const urls = json('out/horror-urls.json', {});
  const stand = json(STAND, {});
  const varianten = json(VARIANTEN, {});
  for (const p of plan) {
    const k = KANAELE.find((x) => x.id === p.kanal);
    let v = p.video;
    if (p.horror) {
      const horrorUrl = urls[k.id];
      if (!/^https:\/\//.test(horrorUrl || '')) { bericht(`- ❌ ${k.name}: Horror-Video nicht gerendert`); continue; }
      const folge = json(`out/folge-${k.id}.json`, {});
      v = { url: horrorUrl, titel: p.titel, caption: folge.caption || p.titel };
    }
    const { text, metadata } = beitrag(v, k.dienst, p.quelle || k.quelle);
    try {
      // Horror: Titelbild = Bild bei 0,35 s (Hook steht schon da) - so sieht das Profil einheitlich aus
      const video = p.horror ? { url: v.url, metadata: { thumbnailOffset: 350 } } : { url: v.url };
      const d = await gql(POST_MUTATION, { input: { channelId: k.id, text, schedulingType: 'automatic', mode: 'shareNow', assets: [{ video }], metadata } });
      const r = d.createPost;
      if (r.__typename !== 'PostActionSuccess') throw new Error(r.message || r.__typename);
      (stand[k.id] ||= {})[p.schluessel] = new Date().toISOString();
      if (p.variante) varianten[abSchluessel(p.hook)] = { kanal: k.name, zeit: new Date().toISOString(), ...p.variante };
      const ab = (p.quelle === 'horror-en' && k.quelle === 'horror-mix' ? ' [EN]' : p.quelle === 'horror' && k.quelle === 'horror-mix' ? ' [DE]' : '') + (p.variante ? ` [ohne: ${Object.entries(p.variante).filter(([, an]) => !an).map(([f]) => f).join(', ') || '–'}]` : '');
      bericht(`- ✅ ${k.name}: „${String(p.titel).slice(0, 60)}“${p.herkunft ? ` (${p.herkunft})` : ''}${ab} gepostet (heute dann ${p.heute + 1})`);
      const cover = urls[`${k.id}_cover`];
      if (p.horror && k.dienst === 'instagram' && /^https:\/\//.test(cover || '')) {
        try {  // Story ist nur ein Anstoß - schlägt sie fehl, bleibt das Reel trotzdem
          const st = (await gql(POST_MUTATION, { input: storyEingabe(k.id, cover, (p.quelle || k.quelle) === 'horror-en') })).createPost;
          bericht(st.__typename === 'PostActionSuccess' ? `  - 📲 Story dazu gepostet` : `  - ⚠️ Story nicht gepostet: ${st.message || st.__typename}`);
        } catch (e) { bericht(`  - ⚠️ Story nicht gepostet: ${String(e.message).slice(0, 150)}`); }
      }
    } catch (e) {
      bericht(`- ❌ ${k.name}: ${String(e.message).slice(0, 200)}`);
    }
  }
  mkdirSync('buffer-verteiler', { recursive: true });
  writeFileSync(STAND, `${JSON.stringify(stand, null, 1)}\n`);
  writeFileSync(VARIANTEN, `${JSON.stringify(varianten, null, 1)}\n`);
}

const [modus] = process.argv.slice(2);
if (import.meta.url !== `file://${process.argv[1]}`) { /* als Modul geladen (Tests) */ } else if (!TOKEN) console.log('[113-buffer-verteiler] BUFFER_ACCESS_TOKEN fehlt - übersprungen.');
else (modus === '--posten' ? posten() : vorbereiten()).catch((e) => { console.error(`[113-buffer-verteiler] ${String(e.message).slice(0, 300)}`); process.exit(1); });
