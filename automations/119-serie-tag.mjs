// Serie "100 Tage KI-Firma" (#119): baut jeden Tag die Folge und plant sie in Buffer ein.
//   node automations/119-serie-tag.mjs --vorbereiten        -> out/serie-folge.json (Tag, Hook, Szenen, Sprechertext)
//   node automations/119-serie-tag.mjs --posten <video-url> -> plant die Folge auf TikTok + YouTube (18:30 Uhr deutsche Zeit)
// Dazwischen rendert automations/serie/render.py das Video (Bildschirmfotos, Stimme, Beat).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, appendFileSync } from 'node:fs';
import { API, POST_MUTATION, berlinZeitpunkt } from './lib/bufferPoster.mjs';
import { tagNummer, folgeFuer, beitragFuer, KANAELE, POST_ZEIT, ZIEL_TAGE } from './lib/serieFolgen.mjs';

const json = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const bericht = (z) => { console.log(z); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${z}\n`); };
const FOLGE = 'out/serie-folge.json';

function zahlen() {
  const bots = readdirSync('automations').filter((f) => f.endsWith('.mjs')).length;
  const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
  const alarme = json('automations-dashboard/reselling/daten.json', {}).alarme || [];
  const vonHeute = alarme.filter((a) => String(a.zeit || '').slice(0, 10) >= heute).length;
  return { bots, deals: vonHeute || alarme.length };
}

if (process.argv.includes('--vorbereiten')) {
  const tag = Number(process.env.SERIE_TAG) || tagNummer();
  if (tag < 1 || tag > ZIEL_TAGE) { bericht(`Serie: Tag ${tag} liegt außerhalb von 1-${ZIEL_TAGE}, nichts zu tun.`); process.exit(0); }
  // Tag 1 wurde am 22.11. von Hand in Buffer eingeplant (docs/serie/tag-01.mp4) - nicht doppelt posten
  if (tag === 1 && !process.env.SERIE_TAG) { bericht('Serie: Tag 1 ist schon von Hand eingeplant.'); process.exit(0); }
  const folge = folgeFuer(tag, zahlen());
  mkdirSync('out', { recursive: true });
  writeFileSync(FOLGE, JSON.stringify(folge, null, 1));
  bericht(`🎬 Serie Tag ${tag}: „${folge.hook.join(' ')}“`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag=${tag}\n`);
}

if (process.argv.includes('--posten')) {
  const url = process.argv[process.argv.indexOf('--posten') + 1];
  const token = (process.env.BUFFER_ACCESS_TOKEN || '').trim();
  if (!/^https:\/\//.test(url || '') || !token) { bericht('Serie: Video-Link oder BUFFER_ACCESS_TOKEN fehlt - nichts gepostet.'); process.exit(1); }
  const folge = json(FOLGE, null);
  if (!folge) { bericht('Serie: out/serie-folge.json fehlt.'); process.exit(1); }
  const heute = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
  const ziel = berlinZeitpunkt(heute, POST_ZEIT);
  // Zu spät gestartet (GitHub verschiebt Zeitpläne manchmal)? Dann sofort posten statt gar nicht.
  const dueAt = ziel - Date.now() > 10 * 60000 ? new Date(ziel).toISOString().replace('.000Z', 'Z') : null;
  let fehler = 0;
  for (const k of KANAELE) {
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ query: POST_MUTATION, variables: { input: beitragFuer(folge, k, url, dueAt) } }) });
      const d = await res.json();
      const r = d.data?.createPost;
      if (!res.ok || d.errors?.length || r?.__typename !== 'PostActionSuccess') throw new Error(r?.message || (d.errors || []).map((e) => e.message).join('; ') || res.status);
      bericht(`- ✅ ${k.name}: Tag ${folge.tag} ${dueAt ? `geplant für ${POST_ZEIT} Uhr` : 'sofort gepostet'}`);
    } catch (e) { fehler++; bericht(`- ⚠️ ${k.name}: ${String(e.message).slice(0, 200)}`); }
  }
  if (fehler === KANAELE.length) process.exit(1);
}
