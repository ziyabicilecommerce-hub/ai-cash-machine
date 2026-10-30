import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kartenSignal, kartenPicks, kaufZeitpunkt, trendsAusRss, wareTrends, verfuegbarkeit, restockMuster, neueRestocks, linksAus } from '../../automations/lib/resellingRadar.mjs';

const karte = (id, p) => ({ id, name: id, number: '1', rarity: 'Rare', set: { name: 'Set', id: 's', releaseDate: '2026/09/01' }, cardmarket: { url: 'https://www.cardmarket.com/x', prices: p } });

test('kartenSignal: steigt, fällt, stabil - ohne Preise keine Bewertung', () => {
  assert.equal(kartenSignal(karte('a', { lowPrice: 20, trendPrice: 30, avg1: 36, avg7: 32, avg30: 25 })).signal, 'steigt');
  assert.equal(kartenSignal(karte('b', { trendPrice: 20, avg1: 15, avg30: 25 })).signal, 'fällt');
  assert.equal(kartenSignal(karte('c', { trendPrice: 20, avg1: 21, avg30: 20 })).signal, 'stabil');
  assert.equal(kartenSignal(karte('d', {})), null);
  // ein einzelner teurer Tagesverkauf ist kein Trend
  assert.equal(kartenSignal(karte('e', { trendPrice: 17, avg1: 24, avg7: 18, avg30: 17.8 })).signal, 'stabil');
  // Woche deutlich hoch, letzter Tag bricht ein: noch nicht bestätigt
  assert.equal(kartenSignal(karte('f', { trendPrice: 30, avg1: 20, avg7: 30, avg30: 25 })).signal, 'stabil');
});

test('kartenPicks: nur steigend, im Budget und wiederverkaufbar - stärkster Anstieg zuerst', () => {
  const picks = kartenPicks([
    karte('teuer', { lowPrice: 80, trendPrice: 90, avg1: 120, avg30: 80 }),
    karte('billig', { lowPrice: 1, trendPrice: 2, avg1: 3, avg30: 2 }),
    karte('gut', { lowPrice: 20, trendPrice: 25, avg1: 30, avg30: 22 }),
    karte('besser', { lowPrice: 30, trendPrice: 35, avg1: 45, avg30: 30 }),
    karte('faellt', { lowPrice: 20, trendPrice: 20, avg1: 15, avg30: 25 }),
  ], { maxEuro: 40 });
  assert.deepEqual(picks.map((p) => p.id), ['besser', 'gut']);
});

test('kaufZeitpunkt: Hype direkt nach Release, dann Kaufzeit, dann halten', () => {
  const heute = new Date('2026-10-30');
  assert.equal(kaufZeitpunkt('2026/10/25', heute).phase, 'hype');
  assert.equal(kaufZeitpunkt('2026/09/20', heute).phase, 'kaufzeit');
  assert.equal(kaufZeitpunkt('2026/03/01', heute).phase, 'halten');
  assert.equal(kaufZeitpunkt('2026/11/14', heute).phase, 'vorverkauf');
  assert.equal(kaufZeitpunkt('quatsch', heute).phase, 'unbekannt');
});

test('Trends: RSS lesen und nur Ware behalten', () => {
  const xml = '<rss><item><title>Labubu Restock</title><ht:approx_traffic>20.000+</ht:approx_traffic></item><item><title><![CDATA[Bundesliga]]></title></item><item><title>Nike Air Max Dn</title></item></rss>';
  const alle = trendsAusRss(xml);
  assert.equal(alle.length, 3);
  assert.equal(alle[0].menge, '20.000+');
  assert.deepEqual(wareTrends(alle).map((t) => [t.titel, t.kategorie]), [['Labubu Restock', 'Figuren & Spielzeug'], ['Nike Air Max Dn', 'Sneaker']]);
});

test('verfuegbarkeit: schema.org zuerst, sonst Button-Texte', () => {
  assert.equal(verfuegbarkeit('{"@type":"Offer","availability":"https://schema.org/InStock"}'), 'auf Lager');
  assert.equal(verfuegbarkeit('{"availability":"http://schema.org/OutOfStock"} <button>In den Warenkorb</button>'), 'ausverkauft');
  assert.equal(verfuegbarkeit('<meta property="product:availability" content="out of stock">'), 'ausverkauft');
  assert.equal(verfuegbarkeit('{"availability":"https://schema.org/PreOrder"}'), 'Vorbestellung');
  assert.equal(verfuegbarkeit('<p>Leider ausverkauft</p>'), 'ausverkauft');
  assert.equal(verfuegbarkeit('<button>In den Warenkorb</button>'), 'auf Lager');
  assert.equal(verfuegbarkeit('<html>nichts</html>'), null);
});

test('Restocks: nur der Wechsel nach "auf Lager" zählt, Muster nach Wochentag und Uhrzeit', () => {
  assert.deepEqual(neueRestocks({ a: 'ausverkauft', b: 'auf Lager', c: 'unbekannt' }, { a: 'auf Lager', b: 'auf Lager', c: 'auf Lager', d: 'auf Lager' }), ['a', 'c']);
  const m = restockMuster([{ zeit: '2026-11-05T08:00:00Z' }, { zeit: '2026-11-12T08:10:00Z' }, { zeit: '2026-11-07T15:00:00Z' }]);
  assert.equal(m.anzahl, 3);
  assert.deepEqual(m.tage[0], ['Do', 2]);
  assert.deepEqual(m.stunden[0], ['09 Uhr', 2]);
});

test('linksAus: Produkt-Links aus dem Issue, ohne GitHub-Links und Dubletten', () => {
  assert.deepEqual(linksAus('Restock bitte\nhttps://www.smythstoys.com/de/x https://github.com/a/b https://www.smythstoys.com/de/x'), ['https://www.smythstoys.com/de/x']);
});

test('kartenPicks: steigt nichts deutlich, kommen die besten Bewegungen markiert statt einer leeren Liste', async () => {
  const { kartenPicks: picks, kartenStatistik } = await import('../../automations/lib/resellingRadar.mjs');
  // x: günstiges Angebot unter Marktpreis (Spread) = Gewinn möglich; y: kein Gewinn nach Gebühren -> raus
  const leicht = [karte('x', { lowPrice: 15, trendPrice: 22, avg1: 22, avg30: 21 }), karte('y', { lowPrice: 20, trendPrice: 20, avg1: 19, avg30: 21 })];
  const p = picks(leicht);
  assert.deepEqual(p.map((k) => [k.id, k.nurBewegung, k.profi.signal]), [['x', true, 'HOLD']]);
  assert.deepEqual(kartenStatistik([...leicht, karte('z', {})]), { karten: 3, mitPreis: 2, imBudget: 2, steigend: 0, fallend: 1 });
});

test('profiAnalyse: Gewinn nach Gebühren, ROI, Signal - und Kursverlauf', async () => {
  const { profiAnalyse, kurseFortschreiben } = await import('../../automations/lib/resellingRadar.mjs');
  const a = profiAnalyse({ prozent: 20, preis: { tief: 10, trend: 25, schnitt7: 24 } });
  assert.equal(a.gewinn, 21.3 - 10);  // 24 * 0,95 - 1,5 Versand - 10 Einstieg
  assert.equal(a.signal, 'STRONG BUY');
  assert.equal(profiAnalyse({ prozent: -12, preis: { tief: 10, trend: 30 } }).signal, 'PASS');
  assert.equal(profiAnalyse({ prozent: 0, preis: { tief: 20, trend: 21 } }).signal, 'PASS');
  const jetzt = new Date('2026-10-30T12:00:00Z');
  const k = kurseFortschreiben({ a: [['2026-10-01T00:00:00Z', 5], ['2026-10-30T11:00:00Z', 9]], weg: [['2026-10-30T11:00:00Z', 1]] }, [{ id: 'a', preis: { trend: 10 } }], jetzt);
  assert.deepEqual(k, { a: [['2026-10-30T11:00:00Z', 9], ['2026-10-30T12:00:00.000Z', 10]] });
});

test('shopifyTreffer: nur verfügbare Artikel, absolute Kauflinks, Preis als Zahl', async () => {
  const { shopifyTreffer } = await import('../../automations/lib/resellingRadar.mjs');
  const j = { resources: { results: { products: [
    { title: 'Nike Dunk Low', price: '119.99', available: true, url: '/products/dunk-low?_pos=1', image: 'https://cdn.shop/x.jpg' },
    { title: 'Samba OG', price: '120.00', available: false, url: '/products/samba' },
  ] } } };
  const t = shopifyTreffer(j, 'www.overkillshop.com', 'dunk');
  assert.equal(t.length, 1);
  assert.deepEqual([t[0].titel, t[0].preis, t[0].url, t[0].laden], ['Nike Dunk Low', 119.99, 'https://www.overkillshop.com/products/dunk-low', 'overkillshop.com']);
  assert.deepEqual(shopifyTreffer({}, 'x.de', 'y'), []);
});

test('Katalog: jedes Produkt hat Kauf- und Verkaufslinks zu bekannten Shops', async () => {
  const { readFileSync } = await import('node:fs');
  const k = JSON.parse(readFileSync(new URL('../../automations-dashboard/reselling/katalog.json', import.meta.url), 'utf8'));
  assert.ok(k.produkte.length >= 25);
  for (const p of k.produkte) {
    assert.ok(p.kaufen.length && p.verkaufen.length && p.q, p.name);
    for (const s of p.kaufen) assert.ok(k.shops[s] || k.verkaufen[s], `${p.name}: Shop ${s}`);
    for (const s of p.verkaufen) assert.ok(k.verkaufen[s], `${p.name}: Verkauf ${s}`);
  }
  for (const s of Object.values({ ...k.shops, ...k.verkaufen })) assert.match(s.suche, /^https:\/\//);
});

test('Läden vor Ort (50 km um Hattersheim): Entfernung, Art des Ladens, Dubletten raus, nächster zuerst', async () => {
  const { laedenAusOsm, entfernungKm, HEIMAT, overpassAbfrage } = await import('../../automations/lib/resellingRadar.mjs');
  const mainz = { lat: 49.9929, lon: 8.2473 };
  assert.ok(entfernungKm(HEIMAT, mainz) > 15 && entfernungKm(HEIMAT, mainz) < 22, 'Mainz ist ca. 19 km entfernt');
  const osm = { elements: [
    { type: 'node', lat: 50.11, lon: 8.68, tags: { shop: 'toys', name: 'Smyths Toys', brand: 'Smyths Toys', 'addr:city': 'Frankfurt am Main', website: 'https://www.smythstoys.com' } },
    { type: 'way', center: { lat: 49.99, lon: 8.25 }, tags: { shop: 'games', name: 'Kartenladen Mainz' } },
    { type: 'node', lat: 50.11, lon: 8.68, tags: { shop: 'toys', name: 'Smyths Toys', brand: 'Smyths Toys', 'addr:city': 'Frankfurt am Main', website: 'https://www.smythstoys.com' } },
    { type: 'node', lat: 50.0, lon: 8.3, tags: { shop: 'toys' } },
  ] };
  const l = laedenAusOsm(osm);
  assert.equal(l.length, 2);
  assert.deepEqual(l.map((x) => [x.name, x.art]), [['Smyths Toys', 'Spielzeug & Figuren'], ['Kartenladen Mainz', 'Karten & Sammeln']]);
  assert.match(overpassAbfrage(), /around:50000,50\.0697,8\.4867/);
  assert.doesNotMatch(overpassAbfrage(), /DE-HE/);
});

test('nikeDrops: kommende Drops mit Modell, Bild, Preis, Zeit und Link - Vergangenes raus', async () => {
  const { nikeDrops } = await import('../../automations/lib/resellingRadar.mjs');
  const feed = { objects: [
    { publishedContent: { properties: { seo: { slug: 'air-jordan-1-test' } } }, productInfo: [{
      productContent: { fullTitle: 'Air Jordan 1 High OG', colorDescription: 'Black/White' }, merchPrice: { currentPrice: 189.99 },
      imageUrls: { productImageUrl: 'https://static.nike.com/x.jpg' }, launchView: { startEntryDate: '2026-11-07T08:00:00.000Z', method: 'DAN' } }] },
    { productInfo: [{ productContent: { title: 'Alt' }, launchView: { startEntryDate: '2026-01-01T08:00:00.000Z' } }] },
  ] };
  const d = nikeDrops(feed, new Date('2026-10-31'));
  assert.equal(d.length, 1);
  assert.deepEqual([d[0].titel, d[0].preis, d[0].link, d[0].zeit], ['Air Jordan 1 High OG', 189.99, 'https://www.nike.com/de/launch/t/air-jordan-1-test', '2026-11-07T08:00:00.000Z']);
  assert.deepEqual(nikeDrops({}), []);
});

test('Saison-Plan: jeder Monat hat Tipps, alle Shops gibt es im Katalog', async () => {
  const { readFileSync } = await import('node:fs');
  const lies = (n) => JSON.parse(readFileSync(new URL(`../../automations-dashboard/reselling/${n}`, import.meta.url), 'utf8'));
  const saison = lies('saison.json'), k = lies('katalog.json');
  for (let m = 1; m <= 12; m++) {
    const tipps = saison.monate[m];
    assert.ok(tipps?.length >= 2, `Monat ${m}`);
    for (const t of tipps) {
      assert.ok(['kaufen', 'verkaufen'].includes(t.aktion) && t.name && t.warum && t.q, `Monat ${m}: ${t.name}`);
      for (const s of [...(t.kaufen || []), ...(t.verkaufen || [])]) assert.ok(k.shops[s] || k.verkaufen[s], `Monat ${m}: Shop ${s}`);
    }
  }
});

test('Bilder: Suchbegriffe, DuckDuckGo, Commons und Shop-Suchlinks', async () => {
  const { bildBegriffe, bingBild, ddgVqd, ddgBild, commonsBild, suchLink } = await import('../../automations/lib/resellingRadar.mjs');
  const b = bildBegriffe({ monate: { 1: [{ q: 'lego' }, { q: 'x', bild: 'lego set' }] } }, { produkte: [{ q: 'lego' }] }, { produkte: [{ q: 'labubu' }] });
  assert.deepEqual(b, ['labubu', 'lego', 'lego set']);
  assert.equal(bingBild('m="{&quot;murl&quot;:&quot;https://s/a.jpg&quot;,&quot;turl&quot;:&quot;https://tse1.mm.bing.net/th?id=1&amp;pid=Api&quot;}"').url, 'https://tse1.mm.bing.net/th?id=1&pid=Api');
  assert.equal(bingBild('nichts'), null);
  assert.equal(ddgVqd('foo vqd="4-1234-5678" bar'), '4-1234-5678');
  assert.equal(ddgBild({ results: [{ thumbnail: 'http://x' }, { thumbnail: 'https://tse1.mm.bing.net/th?id=1', url: 'https://shop' }] }).url, 'https://tse1.mm.bing.net/th?id=1');
  assert.equal(ddgBild({ results: [] }), null);
  assert.equal(commonsBild({ query: { pages: { 2: { index: 2, imageinfo: [{ thumburl: 'https://b' }] }, 1: { index: 1, imageinfo: [{ thumburl: 'https://a' }] } } } }).url, 'https://a');
  assert.equal(suchLink('https://www.kleinanzeigen.de/s-{q-}/k0', 'halloween kostüm'), 'https://www.kleinanzeigen.de/s-halloween-kost%C3%BCm/k0');
  assert.equal(suchLink('https://www.amazon.de/s?k={q}', 'a b'), 'https://www.amazon.de/s?k=a%20b');
});
