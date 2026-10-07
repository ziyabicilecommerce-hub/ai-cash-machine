// Buffer-Poster (#101): postet die frisch gebauten Fakten-Videos (out/manifest.json) ohne Zutun auf alle
// TikTok-Kanaele in Buffer - je Kanal ein anderes Video, sofort, mit KI-Kennzeichnung. Braucht nur das
// Secret BUFFER_ACCESS_TOKEN (kostenloser Schluessel unter publish.buffer.com/settings/api).
//   node automations/101-buffer-poster.mjs <Release-Basis-URL>
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { videoPruefen } from './lib/werbeCheck.mjs';
import { API, verteilen, postText, postInput, POST_MUTATION } from './lib/bufferPoster.mjs';

const env = (k, d = '') => (process.env[k] || d).trim();
const TOKEN = env('BUFFER_ACCESS_TOKEN');
const BASIS = (process.argv[2] || '').replace(/\/$/, '');

async function gql(query, variables) {
  const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }, body: JSON.stringify({ query, variables }) });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`Buffer ${res.status}: ${text.slice(0, 200)}`); }
  if (json.errors?.length) throw new Error(`Buffer: ${json.errors.map((e) => e.message).join('; ').slice(0, 300)}`);
  if (!res.ok) throw new Error(`Buffer ${res.status}`);
  return json.data;
}

async function main() {
  if (!TOKEN) { console.log('[101-buffer-poster] BUFFER_ACCESS_TOKEN fehlt - uebersprungen.'); return; }
  if (!/^https:\/\/github\.com\//.test(BASIS)) throw new Error('Release-Basis-URL fehlt');
  const manifestPfad = join('out', 'manifest.json');
  if (!existsSync(manifestPfad)) throw new Error('out/manifest.json fehlt');
  const videos = JSON.parse(readFileSync(manifestPfad, 'utf8')).filter((v) => {
    const e = videoPruefen(v);
    if (!e.ok) console.log(`[101-buffer-poster] Werbe-Check blockiert ${v.datei}`);
    return e.ok;
  });
  if (!videos.length) { console.log('[101-buffer-poster] keine Videos zum Posten.'); return; }

  const konto = await gql('{ account { organizations { id name } } }');
  const orgId = env('BUFFER_ORGANISATION') || konto.account.organizations[0]?.id;
  if (!orgId) throw new Error('Keine Buffer-Organisation gefunden');
  const { channels } = await gql('query($i: ChannelsInput!) { channels(input: $i) { id name service isDisconnected isLocked } }', { i: { organizationId: orgId } });
  const kanaele = channels.filter((c) => c.service === 'tiktok' && !c.isDisconnected && !c.isLocked).map((c) => c.id);
  if (!kanaele.length) throw new Error('Kein verbundener TikTok-Kanal in Buffer');

  // Jeden Tag mit anderem Versatz, damit nicht immer dasselbe Konto das erste Video bekommt.
  const versatz = Math.floor(Date.now() / 86400000) % kanaele.length;
  let ok = 0;
  for (const { video, kanal } of verteilen(videos, kanaele, versatz)) {
    try {
      const d = await gql(POST_MUTATION, { input: postInput(kanal, postText(video), `${BASIS}/${video.datei}`) });
      const r = d.createPost;
      if (r.__typename !== 'PostActionSuccess') throw new Error(r.message || r.__typename);
      ok++;
      console.log(`[101-buffer-poster] ✓ ${video.datei} -> Kanal ${kanal} (${r.post.status})`);
    } catch (err) {
      console.log(`[101-buffer-poster] ✗ ${video.datei}: ${String(err.message).slice(0, 200)}`);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log(`[101-buffer-poster] ${ok}/${Math.min(videos.length, kanaele.length)} TikTok-Posts abgeschickt`);
  if (!ok) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
