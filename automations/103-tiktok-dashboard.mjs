// TikTok-Viral-Zentrale (#103): holt TikTok-Posts samt Zahlen aus Buffer und schreibt die Daten fürs Dashboard
// (automations-dashboard/tiktok/daten.json). Braucht BUFFER_ACCESS_TOKEN.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { API } from './lib/bufferPoster.mjs';
import { nischenAus, STANDARD_NISCHEN } from './lib/faktenKonten.mjs';
import { dashboardDaten } from './lib/tiktokDashboard.mjs';

const env = (k, d = '') => (process.env[k] || d).trim();
const TOKEN = env('BUFFER_ACCESS_TOKEN');
const ZIEL = 'automations-dashboard/tiktok/daten.json';
const json = (pfad) => { try { return JSON.parse(readFileSync(pfad, 'utf8')); } catch { return null; } };

async function gql(query, variables) {
  const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ query, variables }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || d.errors?.length) throw new Error(`Buffer ${res.status}: ${(d.errors || []).map((e) => e.message).join('; ').slice(0, 200)}`);
  return d.data;
}

async function main() {
  if (!TOKEN) { console.log('[103-tiktok-dashboard] BUFFER_ACCESS_TOKEN fehlt - uebersprungen.'); return; }
  const konto = await gql('{ account { organizations { id } } }');
  const orgId = env('BUFFER_ORGANISATION') || konto.account.organizations[0]?.id;
  const { channels } = await gql('query($i: ChannelsInput!) { channels(input: $i) { id name service } }', { i: { organizationId: orgId } });
  const kanaele = channels.filter((c) => c.service === 'tiktok').map(({ id, name }) => ({ id, name }));
  const seit = new Date(Date.now() - 30 * 86400000).toISOString();
  const posts = [];
  let after = null;
  for (let seite = 0; seite < 6; seite++) {
    const d = await gql(`query($i: PostsInput!, $a: String) { posts(input: $i, first: 50, after: $a) {
      edges { node { id status text dueAt sentAt channelId externalLink metrics { type value } } } pageInfo { hasNextPage endCursor } } }`,
    { i: { organizationId: orgId, filter: { channelIds: kanaele.map((k) => k.id), dueAt: { start: seit } } }, a: after });
    posts.push(...(d.posts.edges || []).map((e) => e.node));
    if (!d.posts.pageInfo.hasNextPage) break;
    after = d.posts.pageInfo.endCursor;
  }
  const daten = dashboardDaten({
    posts, kanaele,
    nischen: nischenAus(env('FAKTEN_NISCHEN', STANDARD_NISCHEN)),
    serien: json('fakten-kanal/verlauf.json')?.serien || {},
    lernen: json('fakten-kanal/lernen.json'),
  });
  mkdirSync('automations-dashboard/tiktok', { recursive: true });
  writeFileSync(ZIEL, JSON.stringify(daten, null, 1) + '\n');
  console.log(`[103-tiktok-dashboard] ${posts.length} Posts, ${daten.gesamt.aufrufe} Aufrufe, ${daten.geplant.length} geplant, ${daten.tipps.length} Tipps`);
}

main().catch((err) => { console.error(`[103-tiktok-dashboard] ${String(err.message).slice(0, 300)}`); process.exit(1); });
