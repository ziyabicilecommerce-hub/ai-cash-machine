// #112 Reselling-Radar (Deutschland): holt stündlich kostenlose, echte Daten und schreibt sie für die App
// (automations-dashboard/reselling/) in daten.json:
//  - Pokémon-Karten, deren Cardmarket-Preis (EUR) gerade steigt und die ins Budget passen (pokemontcg.io, ohne Schlüssel)
//  - was in Deutschland gerade gesucht wird und Ware ist (Google-Trends-RSS)
//  - Lagerstatus der Produkte aus GitHub-Issues mit dem Label "restock"; bei Restock kommt ein Kommentar ins Issue
//    (= Push-Benachrichtigung über die GitHub-App) und die Uhrzeit wird für das Restock-Muster gespeichert.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { kartenPicks, kaufZeitpunkt, trendsAusRss, wareTrends, verfuegbarkeit, restockMuster, neueRestocks, linksAus } from './lib/resellingRadar.mjs';

const ORDNER = 'automations-dashboard/reselling';
const DATEN = `${ORDNER}/daten.json`;
const VERLAUF = `${ORDNER}/verlauf.json`;
const REPO = process.env.GITHUB_REPOSITORY || '';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const BUDGET = Number(process.env.RESELLING_BUDGET || 40);
const BROWSER = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'accept-language': 'de-DE,de;q=0.9' };
const log = (...a) => console.log('[112-reselling]', ...a);

async function holen(url, { json = false, kopf = {} } = {}) {
  const res = await fetch(url, { headers: { ...BROWSER, ...kopf }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return json ? res.json() : res.text();
}
const lesen = (p, fallback) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };

async function pokemon() {
  const sets = (await holen('https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate&pageSize=6', { json: true })).data || [];
  const karten = [];
  for (const s of sets) {
    try {
      const d = await holen(`https://api.pokemontcg.io/v2/cards?q=set.id:${s.id}&pageSize=250&select=id,name,number,rarity,images,set,cardmarket`, { json: true });
      karten.push(...(d.data || []));
    } catch (e) { log('Set übersprungen:', s.id, e.message); }
  }
  return {
    picks: kartenPicks(karten, { maxEuro: BUDGET }),
    sets: sets.map((s) => ({ name: s.name, id: s.id, release: s.releaseDate, logo: s.images?.logo || '', ...kaufZeitpunkt(s.releaseDate) })),
    geprueft: karten.length,
  };
}

async function trends() {
  const alle = trendsAusRss(await holen('https://trends.google.com/trending/rss?geo=DE'));
  return { ware: wareTrends(alle), top: alle.slice(0, 12) };
}

async function issues() {
  if (!REPO || !TOKEN) return [];
  const liste = await holen(`https://api.github.com/repos/${REPO}/issues?labels=restock&state=open&per_page=50`, { json: true, kopf: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json' } });
  return liste.flatMap((i) => linksAus(`${i.title}\n${i.body}`).map((url) => ({ url, issue: i.number, titel: i.title.replace(/^restock:\s*/i, '') })));
}

async function kommentieren(nr, text) {
  if (!REPO || !TOKEN) return;
  await fetch(`https://api.github.com/repos/${REPO}/issues/${nr}/comments`, {
    method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
    body: JSON.stringify({ body: text }),
  }).catch(() => {});
}

async function main() {
  mkdirSync(ORDNER, { recursive: true });
  const alt = lesen(DATEN, {});
  const verlauf = lesen(VERLAUF, { status: {}, restocks: [] });
  const fehler = [];
  const teil = async (name, f, ersatz) => { try { return await f(); } catch (e) { fehler.push(`${name}: ${e.message}`); log(name, 'fehlgeschlagen:', e.message); return ersatz; } };

  const poke = await teil('Pokémon-Preise', pokemon, alt.pokemon || { picks: [], sets: [] });
  const hype = await teil('Google Trends', trends, alt.trends || { ware: [], top: [] });
  const beobachtet = await teil('Beobachtungsliste', issues, []);

  const status = {};
  const produkte = [];
  for (const p of beobachtet) {
    const s = await teil(`Lager ${new URL(p.url).hostname}`, async () => verfuegbarkeit(await holen(p.url)), null);
    status[p.url] = s || verlauf.status[p.url] || 'unbekannt';
    produkte.push({ ...p, status: status[p.url], laden: new URL(p.url).hostname.replace(/^www\./, '') });
  }
  const jetzt = new Date().toISOString();
  for (const url of neueRestocks(verlauf.status, status)) {
    const p = produkte.find((x) => x.url === url);
    verlauf.restocks.push({ url, zeit: jetzt, titel: p?.titel || url });
    if (p) await kommentieren(p.issue, `✅ **Wieder auf Lager!** (${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })})\n\n${url}`);
    log('Restock:', url);
  }
  verlauf.status = { ...verlauf.status, ...status };
  verlauf.restocks = verlauf.restocks.slice(-500);
  for (const p of produkte) p.muster = restockMuster(verlauf.restocks.filter((r) => r.url === p.url));

  const daten = { stand: jetzt, budget: BUDGET, pokemon: poke, trends: hype, produkte, restocks: verlauf.restocks.slice(-20).reverse(), muster: restockMuster(verlauf.restocks), fehler };
  writeFileSync(DATEN, `${JSON.stringify(daten, null, 1)}\n`);
  writeFileSync(VERLAUF, `${JSON.stringify(verlauf, null, 1)}\n`);
  log(`fertig: ${poke.picks?.length || 0} Karten-Picks, ${hype.ware?.length || 0} Ware-Trends, ${produkte.length} beobachtete Produkte, Fehler: ${fehler.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
