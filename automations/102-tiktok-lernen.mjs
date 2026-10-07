// TikTok-Lernen (#102): holt die TikTok-Posts der letzten 21 Tage samt Zahlen aus Buffer und schreibt
// fakten-kanal/lernen.json ({ bevorzugt: 'quiz' | 'mythos' | null, ... }). Der Fakten-Kanal liest die Datei.
// Braucht BUFFER_ACCESS_TOKEN; ohne Token oder bei Fehlern bleibt alles wie bisher.
import { writeFileSync, mkdirSync } from 'node:fs';
import { API } from './lib/bufferPoster.mjs';
import { auswerten } from './lib/tiktokLernen.mjs';

const env = (k, d = '') => (process.env[k] || d).trim();
const TOKEN = env('BUFFER_ACCESS_TOKEN');

async function gql(query, variables) {
  const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ query, variables }) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors?.length) throw new Error(`Buffer ${res.status}: ${(json.errors || []).map((e) => e.message).join('; ').slice(0, 200)}`);
  return json.data;
}

async function main() {
  if (!TOKEN) { console.log('[102-tiktok-lernen] BUFFER_ACCESS_TOKEN fehlt - uebersprungen.'); return; }
  const konto = await gql('{ account { organizations { id } } }');
  const orgId = env('BUFFER_ORGANISATION') || konto.account.organizations[0]?.id;
  const { channels } = await gql('query($i: ChannelsInput!) { channels(input: $i) { id service } }', { i: { organizationId: orgId } });
  const ids = channels.filter((c) => c.service === 'tiktok').map((c) => c.id);
  const seit = new Date(Date.now() - 21 * 86400000).toISOString();
  const posts = [];
  let after = null;
  for (let seite = 0; seite < 5; seite++) {
    const d = await gql(`query($i: PostsInput!, $a: String) { posts(input: $i, first: 50, after: $a) {
      edges { node { text metrics { type value } } } pageInfo { hasNextPage endCursor } } }`,
    { i: { organizationId: orgId, filter: { channelIds: ids, status: ['sent'], dueAt: { start: seit } } }, a: after });
    posts.push(...(d.posts.edges || []).map((e) => e.node));
    if (!d.posts.pageInfo.hasNextPage) break;
    after = d.posts.pageInfo.endCursor;
  }
  const ergebnis = { stand: new Date().toISOString(), posts: posts.length, ...auswerten(posts) };
  mkdirSync('fakten-kanal', { recursive: true });
  writeFileSync('fakten-kanal/lernen.json', JSON.stringify(ergebnis, null, 1) + '\n');
  console.log(`[102-tiktok-lernen] ${posts.length} Posts ausgewertet: Quiz ${ergebnis.quiz.punkte} (${ergebnis.quiz.n}), Mythos ${ergebnis.mythos.punkte} (${ergebnis.mythos.n}) -> bevorzugt: ${ergebnis.bevorzugt || 'noch offen'}`);
}

main().catch((err) => { console.log(`[102-tiktok-lernen] uebersprungen: ${String(err.message).slice(0, 200)}`); });
