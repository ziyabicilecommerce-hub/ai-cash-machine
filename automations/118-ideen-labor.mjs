// Ideen-Labor (#118): läuft jeden Tag. Liest die Zahlen aller Horror-Kanäle (TikTok, Instagram, YouTube), sucht die
// Fehler, und wechselt nach 2 Tagen die Idee eines Kanals, wenn sie nicht besser als normal läuft (Jackpot = bleibt).
// Stand: automations-dashboard/tiktok/ideen.json (die Video-Bots lesen daraus die laufende Idee je Kanal).
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { IDEEN, KANAELE, tagAuswerten, ausBuffer, zusammenfuehren } from './lib/ideenLabor.mjs';
import { API } from './lib/bufferPoster.mjs';

const DATEI = 'automations-dashboard/tiktok/ideen.json';
const json = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const TOKEN = (process.env.BUFFER_ACCESS_TOKEN || '').trim();
async function gql(query, variables) {
  const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ query, variables }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.errors?.length) throw new Error(`Buffer ${res.status}: ${(d.errors || []).map((e) => e.message).join('; ').slice(0, 200)}`);
  return d.data;
}
// Frische Zahlen der letzten 16 Tage direkt aus Buffer (ohne Schlüssel oder bei Fehler: nur verlauf.json)
async function frischAusBuffer() {
  if (!TOKEN) return [];
  try {
    const orgId = (await gql('{ account { organizations { id } } }')).account.organizations[0]?.id;
    const { channels } = await gql('query($i: ChannelsInput!) { channels(input: $i) { id name service } }', { i: { organizationId: orgId } });
    const kanaele = channels.filter((c) => ['tiktok', 'instagram', 'youtube'].includes(c.service));
    const posts = [];
    let after = null;
    for (let seite = 0; seite < 6; seite++) {
      const d = await gql(`query($i: PostsInput!, $a: String) { posts(input: $i, first: 50, after: $a) {
        edges { node { id status text sentAt channelId metricsUpdatedAt metrics { type value } } } pageInfo { hasNextPage endCursor } } }`,
      { i: { organizationId: orgId, filter: { channelIds: kanaele.map((k) => k.id), dueAt: { start: new Date(Date.now() - 16 * 864e5).toISOString() } } }, a: after });
      posts.push(...(d.posts.edges || []).map((e) => e.node));
      if (!d.posts.pageInfo.hasNextPage) break;
      after = d.posts.pageInfo.endCursor;
    }
    const frisch = ausBuffer(posts, kanaele);
    console.log(`[118] ${frisch.length} Videos mit frischen Zahlen aus Buffer`);
    return frisch;
  } catch (e) { console.log(`[118] Buffer nicht erreichbar - nur verlauf.json: ${String(e.message).slice(0, 150)}`); return []; }
}
const verlauf = zusammenfuehren(json('automations-dashboard/tiktok/verlauf.json', []), await frischAusBuffer());
const daten = json('automations-dashboard/tiktok/daten.json', {});
const labor = json(DATEI, { kanaele: {} });
const jetzt = Date.now();
const name = (id) => IDEEN.find((i) => i.id === id)?.name || id;
const zeilen = ['## 🧪 Ideen-Labor', '', '| Kanal | Idee | seit | Videos | Ø Aufrufe | normal | Sehdauer | Urteil |', '|---|---|---|---|---|---|---|---|'];
const fehlerZeilen = [];

for (const k of KANAELE) {
  const vorher = labor.kanaele[k];
  const { stand, urteil, fehler, ergeb } = tagAuswerten(vorher, verlauf, k, jetzt, daten.fehler || []);
  labor.kanaele[k] = { ...stand, fehler, letzteAuswertung: new Date(jetzt).toISOString(), ergebnis: ergeb };
  const text = { start: '🆕 Start', warten: '⏳ sammelt noch', jackpot: '🎰 JACKPOT - bleibt', 'jackpot-hält': '🎰 Jackpot hält', gewechselt: `🔄 gewechselt (vorher: ${name(vorher?.idee)})` }[urteil];
  zeilen.push(`| ${k} | ${name(stand.idee)} | ${String(stand.seit).slice(5, 10)} | ${ergeb.n} | ${ergeb.aufrufe} | ${stand.basis} | ${ergeb.sehdauer} s | ${text} |`);
  for (const f of fehler) fehlerZeilen.push(`- **${k}:** ${f}`);
}
labor.stand = new Date(jetzt).toISOString();
writeFileSync(DATEI, `${JSON.stringify(labor, null, 1)}\n`);
const bericht = [...zeilen, '', '### 🔍 Gefundene Fehler', ...(fehlerZeilen.length ? fehlerZeilen : ['- keine']), ''].join('\n');
console.log(bericht);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, bericht);
