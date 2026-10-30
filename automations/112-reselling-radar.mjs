// #112 Reselling-Radar (Deutschland): holt stündlich kostenlose, echte Daten und schreibt sie für die App
// (automations-dashboard/reselling/) in daten.json:
//  - Pokémon-Karten, deren Cardmarket-Preis (EUR) gerade steigt und die ins Budget passen (pokemontcg.io, ohne Schlüssel)
//  - was in Deutschland gerade gesucht wird und Ware ist (Google-Trends-RSS)
//  - Lagerstatus der Produkte aus GitHub-Issues mit dem Label "restock"; bei Restock kommt ein Kommentar ins Issue
//    (= Push-Benachrichtigung über die GitHub-App) und die Uhrzeit wird für das Restock-Muster gespeichert.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { shopifyTreffer, kartenPicks, kartenStatistik, kaufZeitpunkt, trendsAusRss, wareTrends, verfuegbarkeit, restockMuster, neueRestocks, linksAus } from './lib/resellingRadar.mjs';

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

async function nochmal(f, versuche = 3) {
  for (let i = 1; ; i++) {
    try { return await f(); } catch (e) { if (i >= versuche) throw e; await new Promise((r) => setTimeout(r, 4000 * i)); }
  }
}

// Ersatzquelle, falls pokemontcg.io ausfällt: TCGdex (kostenlos, deutsche Kartennamen, Cardmarket-Preise in EUR).
// Quelle 1: TCGdex (kostenlos, deutsche Kartennamen, Cardmarket-Preise in EUR)
async function pokemonTcgdex() {
  const API = 'https://api.tcgdex.net/v2/de';
  const liste = await holen(`${API}/sets`, { json: true });
  const neueste = [];
  for (const s of liste.slice(-14).reverse()) {
    try { neueste.push(await holen(`${API}/sets/${s.id}`, { json: true })); } catch { /* Set ohne Details */ }
    if (neueste.length >= 8) break;
  }
  neueste.sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)));
  const karten = [];
  for (const set of neueste.slice(0, 6)) {
    const ids = (set.cards || []).map((c) => c.id);
    for (let i = 0; i < ids.length; i += 10) {
      const stapel = await Promise.all(ids.slice(i, i + 10).map((id) => holen(`${API}/cards/${id}`, { json: true }).catch(() => null)));
      for (const c of stapel.filter(Boolean)) {
        const cm = c.pricing?.cardmarket;
        if (!cm) continue;
        karten.push({
          id: c.id, name: c.name, number: c.localId, rarity: c.rarity || '', images: { small: c.image ? `${c.image}/low.webp` : '' },
          set: { name: set.name, id: set.id, releaseDate: set.releaseDate },
          cardmarket: { url: `https://www.cardmarket.com/de/Pokemon/Products/Search?searchString=${encodeURIComponent(c.name)}`,
            prices: { lowPrice: cm.low, trendPrice: cm.trend, avg1: cm.avg1, avg7: cm.avg7, avg30: cm.avg30 } },
        });
      }
    }
  }
  return { karten, sets: neueste.slice(0, 6).map((s) => ({ name: s.name, id: s.id, release: s.releaseDate, logo: s.logo ? `${s.logo}.webp` : '' })) };
}

// Quelle 2: pokemontcg.io (englische Namen, ebenfalls Cardmarket-Preise) - antwortet oft mit 500, daher kleine Seiten
async function pokemonTcgApi() {
  const sets = (await holen('https://api.pokemontcg.io/v2/sets?orderBy=-releaseDate&pageSize=8', { json: true })).data || [];
  const karten = [];
  for (const s of sets) {
    for (let seite = 1; seite <= 4; seite++) {
      try {
        const d = await nochmal(() => holen(`https://api.pokemontcg.io/v2/cards?q=set.id:${s.id}&page=${seite}&pageSize=100&select=id,name,number,rarity,images,set,cardmarket`, { json: true }), 2);
        karten.push(...(d.data || []));
        if ((d.data || []).length < 100) break;
      } catch (e) { log('Set-Seite übersprungen:', s.id, seite, e.message); break; }
    }
  }
  return { karten, sets: sets.map((s) => ({ name: s.name, id: s.id, release: s.releaseDate, logo: s.images?.logo || '' })) };
}

// Beide Quellen zusammen - je mehr Karten mit Preis, desto eher findet sich, was gerade steigt.
async function pokemon() {
  const quellen = [];
  for (const [name, f] of [['TCGdex', pokemonTcgdex], ['pokemontcg.io', pokemonTcgApi]]) {
    try { const r = await f(); if (r.karten.length) quellen.push({ name, ...r }); log(name, r.karten.length, 'Karten'); } catch (e) { log(name, 'aus:', e.message); }
  }
  if (!quellen.length) throw new Error('keine Preisquelle erreichbar');
  const gesehen = new Set();
  const karten = quellen.flatMap((q) => q.karten).filter((k) => {
    const schluessel = `${String(k.set?.releaseDate).replace(/\//g, '-')}|${String(k.number).replace(/^0+/, '')}`;  // gleiche Karte aus beiden Quellen nur einmal
    return gesehen.has(schluessel) ? false : (gesehen.add(schluessel), true);
  });
  const sets = quellen[0].sets.length ? quellen[0].sets : quellen[1]?.sets || [];
  return {
    picks: kartenPicks(karten, { maxEuro: BUDGET }),
    sets: sets.map((s) => ({ ...s, ...kaufZeitpunkt(s.release) })),
    geprueft: karten.length, statistik: kartenStatistik(karten, { maxEuro: BUDGET }), quelle: quellen.map((q) => q.name).join(' + '),
  };
}

async function trends() {
  const alle = trendsAusRss(await holen('https://trends.google.com/trending/rss?geo=DE'));
  return { ware: wareTrends(alle), top: alle.slice(0, 12) };
}

// Bekannte, echte Online-Shops mit Shopify-Suche - was gerade auf Lager ist, mit Preis und Kauflink.
// Shops ohne öffentliche Suche werden beim Probieren automatisch übersprungen.
const LIVE_SHOPS = [
  ['afew-store.com', ['jordan', 'dunk', 'samba', 'new balance', 'cap']],
  ['www.allikestore.com', ['jordan', 'dunk', 'samba', 'new balance', 'carhartt']],
  ['www.overkillshop.com', ['jordan', 'dunk', 'samba', 'new balance', 'new era']],
  ['www.asphaltgold.com', ['jordan', 'dunk', 'samba', 'new balance', 'asics']],
  ['www.43einhalb.com', ['jordan', 'dunk', 'samba', 'new balance']],
  ['www.uebervart-shop.de', ['carhartt', 'cap', 'stüssy']],
  ['www.sneakersnstuff.com', ['jordan', 'dunk', 'new balance', 'asics']],
  ['eu.kith.com', ['new balance', 'asics', 'cap']],
  ['funkoeurope.com', ['funko pop', 'exclusive', 'bitty pop']],
  ['www.hhv.de', ['vinyl limited', 'new balance', 'samba']],
];
async function liveShops() {
  const treffer = [], erreicht = [];
  for (const [domain, begriffe] of LIVE_SHOPS) {
    let ok = false;
    for (const b of begriffe) {
      try {
        const j = await holen(`https://${domain}/search/suggest.json?q=${encodeURIComponent(b)}&resources[type]=product&resources[limit]=8`, { json: true });
        treffer.push(...shopifyTreffer(j, domain, b)); ok = true;
      } catch (e) { if (!ok) { log('Shop übersprungen:', domain, e.message); break; } }
    }
    if (ok) erreicht.push(domain.replace(/^(www|eu|shop)\./, ''));
  }
  const gesehen = new Set();
  return { treffer: treffer.filter((t) => !gesehen.has(t.url) && gesehen.add(t.url)).sort((a, b) => (a.preis ?? 999) - (b.preis ?? 999)), erreicht };
}

async function issues() {
  if (!REPO || !TOKEN) return [];
  // Auch Freunde ohne Rechte am Repo: deren Issues haben kein Label, aber den Titel "Restock: ..."
  const liste = (await holen(`https://api.github.com/repos/${REPO}/issues?state=open&per_page=100`, { json: true, kopf: { authorization: `Bearer ${TOKEN}`, accept: 'application/vnd.github+json' } }))
    .filter((i) => !i.pull_request && ((i.labels || []).some((l) => l.name === 'restock') || /^restock:/i.test(i.title || '')))
    .slice(0, 40);
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
  const live = await teil('Live-Shops', liveShops, alt.live || { treffer: [], erreicht: [] });

  const status = {};
  const produkte = [];
  for (const p of beobachtet.slice(0, 60)) {  // Obergrenze, damit niemand den Bot mit Links flutet
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

  const daten = { stand: jetzt, budget: BUDGET, pokemon: poke, trends: hype, live, produkte, restocks: verlauf.restocks.slice(-20).reverse(), muster: restockMuster(verlauf.restocks), fehler };
  writeFileSync(DATEN, `${JSON.stringify(daten, null, 1)}\n`);
  writeFileSync(VERLAUF, `${JSON.stringify(verlauf, null, 1)}\n`);
  log(`fertig: ${poke.picks?.length || 0} Karten-Picks, ${hype.ware?.length || 0} Ware-Trends, ${live.treffer?.length || 0} Live-Treffer bei ${live.erreicht?.length || 0} Shops, ${produkte.length} beobachtete Produkte, Fehler: ${fehler.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
