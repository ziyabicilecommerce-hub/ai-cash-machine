// #112 Reselling-Radar (Hessen): holt alle 10 Minuten kostenlose, echte Daten und schreibt sie für die App
// (automations-dashboard/reselling/) in daten.json:
//  - Pokémon-Karten, deren Cardmarket-Preis (EUR) gerade steigt und die ins Budget passen (pokemontcg.io, ohne Schlüssel)
//  - was in Deutschland gerade gesucht wird und Ware ist (Google-Trends-RSS)
//  - Lagerstatus der Produkte aus GitHub-Issues mit dem Label "restock"; bei Restock kommt ein Kommentar ins Issue
//    (= Push-Benachrichtigung über die GitHub-App) und die Uhrzeit wird für das Restock-Muster gespeichert.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dauerDeals } from './lib/dauerbrenner.mjs';
import { DM_SUCHE, bbox, dmFilialen, dmProdukte, dmTiles, ohneRoh, neuImBestand, filialMeldungen } from './lib/filialRadar.mjs';
import { styleCode, alarme, bildVarianten, kurseFortschreiben, bildBegriffe, bingBild, ddgVqd, ddgBild, commonsBild, suchLink, nikeDrops, overpassAbfrage, laedenAusOsm, HEIMAT, shopifyTreffer, kartenPicks, kartenStatistik, kaufZeitpunkt, trendsAusRss, wareTrends, verfuegbarkeit, restockMuster, neueRestocks, linksAus } from './lib/resellingRadar.mjs';

const ORDNER = 'automations-dashboard/reselling';
const DATEN = `${ORDNER}/daten.json`;
const VERLAUF = `${ORDNER}/verlauf.json`;
const LAEDEN = `${ORDNER}/laeden.json`;
const BILDER = `${ORDNER}/bilder.json`;
const FILIALEN = `${ORDNER}/filialen.json`;
const REPO = process.env.GITHUB_REPOSITORY || '';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const BUDGET = Number(process.env.RESELLING_BUDGET || 40);
const PUSH_THEMA = process.env.NTFY_TOPIC || 'reselling-radar-hattersheim';  // ntfy.sh: kostenlose Push-Nachrichten ohne Konto
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
        // Als Besucher aus Deutschland in Euro fragen - sonst zeigen manche Shops dem US-Server Netto- oder Dollarpreise
        const j = await holen(`https://${domain}/search/suggest.json?q=${encodeURIComponent(b)}&resources[type]=product&resources[limit]=8&country=DE&currency=EUR`,
          { json: true, kopf: { cookie: 'localization=DE; cart_currency=EUR', 'accept-language': 'de-DE,de;q=0.9' } });
        treffer.push(...shopifyTreffer(j, domain, b)); ok = true;
      } catch (e) { if (!ok) { log('Shop übersprungen:', domain, e.message); break; } }
    }
    if (ok) erreicht.push(domain.replace(/^(www|eu|shop)\./, ''));
  }
  const gesehen = new Set();
  const sinnvoll = (t) => t.preis == null || t.preis >= 5;  // Gratis-Beigaben und Centartikel lohnen nicht
  return { treffer: treffer.filter((t) => sinnvoll(t) && !gesehen.has(t.url) && gesehen.add(t.url)).sort((a, b) => (a.preis ?? 999) - (b.preis ?? 999)), erreicht };
}

// Release-Kalender: kommende Nike-SNKRS-Drops in Deutschland (Bild, Modell, Preis, Uhrzeit).
// Nike ändert die Feed-Parameter ab und zu - deshalb mehrere Varianten, die erste funktionierende gewinnt.
async function sneakerDrops() {
  const basis = 'https://api.nike.com/product_feed/threads/v3/?anchor=0&count=60&filter=marketplace(DE)&filter=language(de)'
    + '&filter=channelId(010794e5-35fe-4e32-aaff-cd2c74f89d61)&filter=exclusiveAccess(true,false)';
  const varianten = [`${basis}&filter=upcoming(true)&sort=effectiveStartSellDateAsc`, `${basis}&filter=upcoming(true)`, basis, `${basis.replace('/v3/', '/v2/')}&filter=upcoming(true)`];
  let letzter;
  for (const url of varianten) {
    try { return nikeDrops(await holen(url, { json: true, kopf: { accept: 'application/json', 'nike-api-caller-id': 'com.nike.commerce.snkrs.web' } })); } catch (e) { letzter = e; }
  }
  throw letzter;
}

// Vorschaubilder für Saison-Tipps und Katalog (fehlende sofort, sonst alle 14 Tage neu) + wöchentlicher Check der Shop-Links.
async function bilder() {
  const alt = lesen(BILDER, { bilder: {}, links: {} });
  const begriffe = bildBegriffe(lesen(`${ORDNER}/saison.json`, {}), lesen(`${ORDNER}/katalog.json`, {}), { produkte: [...(lesen(`${ORDNER}/hype.json`, {}).produkte || []), ...(lesen(`${ORDNER}/evergreen.json`, {}).produkte || [])] });
  const faellig = begriffe.filter((b) => !alt.bilder[b]?.url || Date.now() - Date.parse(alt.bilder[b].stand) > 14 * 86400000).slice(0, 25);
  for (const b of faellig) {
    let bild = null;
    try { bild = bingBild(await holen(`https://www.bing.com/images/search?q=${encodeURIComponent(b)}&form=HDRSC2&first=1&setlang=de&cc=DE`)); } catch (e) { log('Bing', b, e.message); }
    if (!bild) try {
      const vqd = ddgVqd(await holen(`https://duckduckgo.com/?q=${encodeURIComponent(b)}&iax=images&ia=images`));
      if (vqd) bild = ddgBild(await holen(`https://duckduckgo.com/i.js?l=de-de&o=json&q=${encodeURIComponent(b)}&vqd=${vqd}&f=,,,,,&p=1`, { json: true, kopf: { referer: 'https://duckduckgo.com/' } }));
    } catch (e) { log('Bildsuche', b, e.message); }
    if (!bild) {
      try { bild = commonsBild(await holen(`https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=5&gsrsearch=${encodeURIComponent(`${b} filetype:bitmap`)}&prop=imageinfo&iiprop=url&iiurlwidth=240`, { json: true, kopf: { 'user-agent': 'reselling-radar/1.0 (https://github.com/ziyabicilecommerce-hub/ai-cash-machine)' } })); } catch (e) { log('Commons', b, e.message); }
    }
    if (bild) alt.bilder[b] = { ...bild, stand: new Date().toISOString() };
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (!alt.linksStand || Date.now() - Date.parse(alt.linksStand) > 7 * 86400000) {
    const k = lesen(`${ORDNER}/katalog.json`, {});
    alt.links = {};
    for (const [id, s] of Object.entries({ ...k.shops, ...k.verkaufen })) {
      try { const r = await fetch(suchLink(s.suche, 'lego'), { headers: BROWSER, redirect: 'follow', signal: AbortSignal.timeout(20000) }); alt.links[id] = r.status; } catch (e) { alt.links[id] = e.message.slice(0, 60); }
    }
    alt.linksStand = new Date().toISOString();
    log('Link-Check:', JSON.stringify(alt.links));
  }
  writeFileSync(BILDER, `${JSON.stringify(alt, null, 1)}\n`);
  return Object.keys(alt.bilder).length;
}

// Läden vor Ort (50 km um Hattersheim) aus OpenStreetMap - einmal pro Woche reicht (oder wenn sich die Abfrage ändert).
async function laedenVorOrt() {
  const alt = lesen(LAEDEN, null);
  const abfrage = overpassAbfrage(HEIMAT);
  if (alt?.abfrage === abfrage && alt.version === 2 && Date.now() - Date.parse(alt.stand) < 7 * 86400000 && alt.laeden?.length) return alt;
  for (const server of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const res = await fetch(server, { method: 'POST', body: new URLSearchParams({ data: abfrage }), headers: { 'user-agent': 'reselling-radar (github actions)' }, signal: AbortSignal.timeout(200000) });
      if (!res.ok) throw new Error(`${res.status}`);
      const laeden = laedenAusOsm(await res.json(), HEIMAT);
      const daten = { stand: new Date().toISOString(), version: 2, heimat: HEIMAT, abfrage, laeden };
      writeFileSync(LAEDEN, `${JSON.stringify(daten, null, 1)}\n`);
      log('Läden vor Ort:', laeden.length);
      return daten;
    } catch (e) { log('Overpass', server, 'aus:', e.message); }
  }
  if (alt) return alt;
  throw new Error('OpenStreetMap nicht erreichbar');
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

// Push aufs Handy über ntfy.sh (App "ntfy", Thema abonnieren) - mit Bild und Kauf-Link
async function pushen(a) {
  const res = await fetch('https://ntfy.sh/', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ topic: PUSH_THEMA, title: a.titel, message: a.text, click: a.link, ...(a.bild ? { attach: a.bild } : {}), priority: 4, tags: ['moneybag'],
      actions: [a.link && { action: 'view', label: a.art === 'Filiale' ? 'Route' : 'Jetzt kaufen', url: a.link }, a.shop && { action: 'view', label: 'Zum Produkt', url: a.shop }].filter(Boolean) }) });
  if (!res.ok) throw new Error(`ntfy ${res.status}`);
}

// Kartenbilder prüfen: erste Variante, die wirklich lädt
async function bildPruefen(url) {
  for (const u of bildVarianten(url)) {
    try { const r = await fetch(u, { method: 'HEAD', signal: AbortSignal.timeout(8000) }); if (r.ok) return u; } catch { /* nächste */ }
  }
  return url;
}

// Drop-Bilder: Nikes alte Bildadressen laden oft nicht mehr - prüfen, sonst Produktbild per Bildsuche (Style-Code), gemerkt in bilder.json
async function ladbar(u) {
  try { const r = await fetch(u, { headers: BROWSER, signal: AbortSignal.timeout(8000) }); return r.ok && /^image\//.test(r.headers.get('content-type') || ''); } catch { return false; }
}
async function dropBilder(drops) {
  const datei = lesen(BILDER, { bilder: {}, links: {} });
  for (const d of drops) {
    const schluessel = `drop:${styleCode(d.bild) || d.titel}`;
    if (/static\.nike\.com/.test(d.bild || '')) continue;  // schon ein gutes Bild aus dem Feed
    if (datei.bilder[schluessel]?.url) { d.bild = datei.bilder[schluessel].url; continue; }
    let neu = '';
    for (const u of [d.bild && `${d.bild}?fmt=jpg&wid=400&hei=400`, d.bild].filter(Boolean)) if (await ladbar(u)) { neu = u; break; }
    if (!neu) {
      try { neu = bingBild(await holen(`https://www.bing.com/images/search?q=${encodeURIComponent(`nike ${styleCode(d.bild)} ${d.titel}`)}&form=HDRSC2&first=1&setlang=de&cc=DE`))?.url || ''; } catch (e) { log('Drop-Bild', d.titel, e.message); }
    }
    if (neu) { datei.bilder[schluessel] = { url: neu, stand: new Date().toISOString() }; d.bild = neu; } else log('Drop ohne Bild:', d.titel);
  }
  log('Drop-Bilder:', drops.filter((d) => d.bild).length, 'von', drops.length);
  writeFileSync(BILDER, `${JSON.stringify(datei, null, 1)}\n`);
  return drops;
}

// Filial-Radar: dm-Filialen im 50-km-Umkreis (wöchentlich), gefragte Produkte und deren Bestand (alle 15 Min.)
async function filialRadar(alt, verlauf) {
  if (alt.filial?.stand && Date.now() - Date.parse(alt.filial.stand) < 14 * 60000) return { daten: alt.filial, meldungen: [] };
  let fil = lesen(FILIALEN, null);
  if (!fil?.filialen?.length || Date.now() - Date.parse(fil.stand) > 7 * 86400000) {
    const roh = await holen(`https://store-data-service.services.dmtech.com/stores/bbox/${bbox(HEIMAT)}`, { json: true });
    fil = { stand: new Date().toISOString(), filialen: dmFilialen(roh, HEIMAT) };
    if (!fil.filialen.length) throw new Error(`dm-Filialen: 0 erkannt, Antwort: ${JSON.stringify(roh).slice(0, 300)}`);
    writeFileSync(FILIALEN, `${JSON.stringify(fil, null, 1)}\n`);
  }
  // dm ändert seine (inoffiziellen) Adressen ab und zu: mehrere probieren, die funktionierende merken
  const SUCHE = [
    (q) => `https://product-search.services.dmtech.com/de/search/static?query=${q}&pageSize=24&currentPage=0`,
    (q) => `https://product-search.services.dmtech.com/de/search?query=${q}&pageSize=24&currentPage=0`,
    (q) => `https://products.dm.de/product/de/search?q=${q}&pageSize=24`,
  ];
  const reihe = (liste, gut) => [...(gut != null ? [gut] : []), ...liste.keys()].filter((v, i, a) => a.indexOf(v) === i);
  const produkte = [];
  for (const q of DM_SUCHE) {
    for (const i of reihe(SUCHE, fil.suche)) {
      try {
        const roh = await holen(SUCHE[i](encodeURIComponent(q)), { json: true }), p = dmProdukte(roh, q);
        if (!p.length) { log('dm-Suche leer', i, q, JSON.stringify(roh).slice(0, 300)); continue; }
        fil.suche = i;
        for (const x of p.slice(0, 10)) if (!produkte.some((y) => y.dan === x.dan)) produkte.push(x);
        break;
      } catch (e) { log('dm-Suche', i, q, e.message.slice(0, 120)); }
    }
  }
  if (produkte.length && produkte[0].preis == null && !produkte[0].bild) log('dm-Produkt-Beispiel', JSON.stringify(produkte[0]._roh || {}).slice(0, 600));
  // Bestand je Filiale (neuere v2-Schnittstelle), die 25 nächsten dm-Filialen; erst Filialnummer, sonst interne Filial-ID
  const bestand = {}, dans = produkte.map((p) => p.dan).join(',');
  for (const f of fil.filialen.slice(0, 25)) {
    for (const id of [...new Set([fil.idArt === 'nummer' ? f.nummer : f.id, f.id, f.nummer])]) {  // dm will die interne ID (z. B. D2ED)
      try {
        const roh = await holen(`https://products.dm.de/availability/api/v2/tiles/DE/${dans}?pickupStoreId=${encodeURIComponent(id)}`, { json: true });
        const b = dmTiles(roh, f.nummer);
        if (!Object.keys(b).length) continue;
        fil.idArt = id === f.id && id !== f.nummer ? 'id' : 'nummer'; Object.assign(bestand, b); break;
      } catch (e) { log('dm-Bestand', f.nummer, id, e.message.slice(0, 100)); }
    }
  }
  writeFileSync(FILIALEN, `${JSON.stringify(fil, null, 1)}\n`);
  const altStatus = verlauf.filial || {};
  const ersterLauf = !Object.keys(altStatus).length;
  const meldungen = filialMeldungen(neuImBestand(altStatus, bestand, ersterLauf), produkte, fil.filialen, bestand).slice(0, 3);
  for (const [k, v] of Object.entries(bestand)) if (v) altStatus[k] = v.da;  // unbekannt (null) ändert nichts
  verlauf.filial = altStatus;
  const daten = { stand: new Date().toISOString(), filialen: fil.filialen.length, produkte: produkte.map((p) => ({ ...ohneRoh(p),
    vorrat: fil.filialen.filter((f) => bestand[`${p.dan}|${f.nummer}`]?.da).slice(0, 8).map((f) => ({ name: f.name, adresse: f.adresse, km: f.km, lat: f.lat, lon: f.lon, menge: bestand[`${p.dan}|${f.nummer}`]?.menge ?? null })) })) };
  log(`Filial-Radar: ${fil.filialen.length} dm-Filialen, ${produkte.length} Produkte, ${Object.values(bestand).filter((v) => v?.da).length} Treffer auf Lager, ${meldungen.length} neu`);
  return { daten, meldungen };
}

async function main() {
  mkdirSync(ORDNER, { recursive: true });
  const alt = lesen(DATEN, {});
  const verlauf = lesen(VERLAUF, { status: {}, restocks: [] });
  const fehler = [];
  const teil = async (name, f, ersatz) => { try { return await f(); } catch (e) { fehler.push(`${name}: ${e.message}`); log(name, 'fehlgeschlagen:', e.message); return ersatz; } };

  // Pokémon-Preise sind ~1000 Abfragen - die reichen stündlich; Kalender, Lager und Restocks laufen alle 10 Minuten.
  const pokeFrisch = alt.pokemon?.stand && Date.now() - Date.parse(alt.pokemon.stand) < 55 * 60000 && alt.pokemon.geprueft;
  const poke = pokeFrisch ? alt.pokemon
    : { ...(await teil('Pokémon-Preise', pokemon, alt.pokemon || { picks: [], sets: [] })), stand: new Date().toISOString() };
  // Kursverlauf nur bei frischen Preisen fortschreiben (stündlich) und an die Picks hängen
  if (!pokeFrisch) verlauf.kurse = kurseFortschreiben(verlauf.kurse, poke.picks || []);
  for (const k of poke.picks || []) k.kurs = (verlauf.kurse?.[k.id] || []).map(([, v]) => v);
  if (!pokeFrisch) for (const k of poke.picks || []) k.bild = await bildPruefen(k.bild);
  const hype = await teil('Google Trends', trends, alt.trends || { ware: [], top: [] });
  const beobachtet = await teil('Beobachtungsliste', issues, []);
  const live = await teil('Live-Shops', liveShops, alt.live || { treffer: [], erreicht: [] });
  const vorOrt = await teil('Läden vor Ort', laedenVorOrt, null);
  const bildZahl = await teil('Bilder', bilder, 0);
  const drops = await teil('Sneaker-Kalender', sneakerDrops, alt.kalender?.filter((k) => k.kat === 'Sneaker') || []);
  await teil('Drop-Bilder', () => dropBilder(drops), null);
  const setTermine = (poke.sets || []).filter((x) => ['vorverkauf', 'hype'].includes(x.phase)).map((x) => ({
    titel: `Pokémon: ${x.name}`, farbe: x.phase === 'vorverkauf' ? 'Neues Set - vorbestellen' : 'Gerade erschienen', preis: null,
    bild: x.logo, zeit: new Date(Date.parse(String(x.release).replace(/\//g, '-'))).toISOString(), link: 'https://www.pokemon.com/de/pokemon-sammelkartenspiel', marke: 'Pokémon', kat: 'Sammelkarten' }));
  const kalender = [...drops, ...setTermine].sort((a, b) => a.zeit.localeCompare(b.zeit)).slice(0, 60);

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
    await teil('Push', () => pushen({ titel: `✅ Wieder auf Lager: ${p?.titel || new URL(url).hostname}`, text: 'Schnell sein - Restock!', link: url }), null);
    if (p) await kommentieren(p.issue, `✅ **Wieder auf Lager!** (${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })})\n\n${url}`);
    log('Restock:', url);
  }
  verlauf.status = { ...verlauf.status, ...status };
  verlauf.restocks = verlauf.restocks.slice(-500);
  for (const p of produkte) p.muster = restockMuster(verlauf.restocks.filter((r) => r.url === p.url));

  // Sofort-kaufen-Alarme: neue Ware nur melden, wenn es einen Vorlauf gab (sonst wäre beim ersten Lauf alles "neu")
  const bekannt = new Set((alt.live?.treffer || []).map((x) => x.url));
  const liveNeu = alt.live?.treffer?.length ? (live.treffer || []).filter((x) => !bekannt.has(x.url)) : [];
  verlauf.gemeldet = verlauf.gemeldet || {};
  const filial = await teil('Filial-Radar', () => filialRadar(alt, verlauf), { daten: alt.filial || null, meldungen: [] });
  // Dauerbrenner-Deals: Live-Angebot mit mindestens 25 € Gewinn gegen den Richtwert -> Push (je Angebot nur einmal pro Woche)
  const eu = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;
  const deals = dauerDeals(lesen(`${ORDNER}/evergreen.json`, {}), live.treffer || [])
    .filter((d) => d.gewinn >= 25 && !(verlauf.gemeldet[`deal:${d.t.url}`] && Date.now() - Date.parse(verlauf.gemeldet[`deal:${d.t.url}`]) < 7 * 86400000))
    .slice(0, 2).map((d) => ({ schluessel: `deal:${d.t.url}`, art: 'Deal', titel: `💰 Deal: ${d.e.name} für ${eu(d.t.preis)}`, bild: d.t.bild, link: d.t.url,
      text: `${d.t.laden} · ${d.t.titel}\nVerkauf ca. ${d.e.vk[0]}–${d.e.vk[1]} € → Gewinn ca. +${eu(d.gewinn)} (ROI ${d.roi} %)\nGröße prüfen, vorher verkaufte Preise checken.` }));
  const neueAlarme = [...filial.meldungen, ...deals, ...alarme({ picks: poke.picks || [], kalender, liveNeu, budget: BUDGET }, verlauf.gemeldet)].slice(0, 7);
  for (const a of neueAlarme) {
    verlauf.gemeldet[a.schluessel] = jetzt;
    await teil('Push', () => pushen(a), null);
  }
  for (const [k, z] of Object.entries(verlauf.gemeldet)) if (Date.now() - Date.parse(z) > 40 * 86400000) delete verlauf.gemeldet[k];
  const alarmListe = [...neueAlarme.map((a) => ({ ...a, zeit: jetzt })), ...(alt.alarme || [])].slice(0, 20);

  const daten = { stand: jetzt, budget: BUDGET, push: { thema: PUSH_THEMA }, alarme: alarmListe, filial: filial.daten, kalender, pokemon: poke, trends: hype, live, produkte, restocks: verlauf.restocks.slice(-20).reverse(), muster: restockMuster(verlauf.restocks), fehler };
  writeFileSync(DATEN, `${JSON.stringify(daten, null, 1)}\n`);
  writeFileSync(VERLAUF, `${JSON.stringify(verlauf, null, 1)}\n`);
  log(`fertig: ${kalender.length} Kalender-Termine, ${vorOrt?.laeden?.length || 0} Läden vor Ort, ${bildZahl} Bilder, ${poke.picks?.length || 0} Karten-Picks, ${hype.ware?.length || 0} Ware-Trends, ${live.treffer?.length || 0} Live-Treffer bei ${live.erreicht?.length || 0} Shops, ${produkte.length} beobachtete Produkte, ${neueAlarme.length} Alarme, Fehler: ${fehler.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
