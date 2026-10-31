// Reselling-Radar (#112): reine Funktionen - welche Pokémon-Karten steigen (echte Cardmarket-Preise in EUR),
// was in Deutschland gerade gesucht wird (Google Trends), ob ein beobachtetes Produkt auf Lager ist
// und zu welchen Wochentagen/Uhrzeiten Restocks bisher kamen. Ohne Netz testbar.

const zahl = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const runden = (v) => Math.round(v * 100) / 100;

// Eine Karte bewerten: Trend = Preis der letzten 7 Tage gegen den 30-Tage-Schnitt.
export function kartenSignal(karte) {
  const p = karte?.cardmarket?.prices || {};
  const tief = zahl(p.lowPrice), trend = zahl(p.trendPrice), a1 = zahl(p.avg1), a7 = zahl(p.avg7), a30 = zahl(p.avg30);
  if (!trend || !a30) return null;
  // Wochenschnitt gegen Monatsschnitt - ein einzelner teurer Verkauf (Tagesschnitt) soll keinen Trend vortäuschen.
  const jetzt = a7 || a1 || trend;
  const prozent = Math.round((jetzt / a30 - 1) * 100);
  const bestaetigt = !a1 || !a7 || a1 >= a7 * 0.95;  // der letzte Tag hält das Niveau der Woche
  const signal = prozent >= 8 && bestaetigt ? 'steigt' : prozent <= -8 ? 'fällt' : 'stabil';
  return {
    id: karte.id, name: karte.name, nummer: karte.number, seltenheit: karte.rarity || '',
    set: karte.set?.name || '', setId: karte.set?.id || '', release: karte.set?.releaseDate || '',
    bild: karte.images?.small || '', link: karte.cardmarket?.url || '',
    preis: { tief: tief && runden(tief), trend: runden(trend), schnitt7: a7 && runden(a7), schnitt30: runden(a30) },
    prozent, signal,
  };
}

// Profi-Analyse wie im Trading: Einstieg (günstigstes Angebot), Ziel (Marktpreis), Gewinn nach Cardmarket-Gebühr + Versand,
// ROI, Momentum (7 gegen 30 Tage) und daraus ein Score 0-100 mit Signal STRONG BUY / BUY / HOLD / PASS.
export function profiAnalyse(k, { gebuehr = 0.05, versand = 1.5 } = {}) {
  const p = k.preis || {};
  const einstieg = p.tief ?? p.trend;
  const ziel = Math.min(p.trend, p.schnitt7 ?? p.trend);  // vorsichtig: das kleinere von Trend und Wochenschnitt
  const gewinn = runden(ziel * (1 - gebuehr) - versand - einstieg);
  const roi = Math.round((gewinn / einstieg) * 100);
  const momentum = k.prozent ?? 0;
  const score = Math.max(0, Math.min(100, Math.round(40 + Math.min(roi, 100) * 0.35 + momentum * 1.5 + (gewinn >= 5 ? 8 : 0))));
  const signal = momentum <= -8 || gewinn < 1 ? 'PASS' : score >= 75 ? 'STRONG BUY' : score >= 60 ? 'BUY' : score >= 45 ? 'HOLD' : 'PASS';
  return { einstieg, ziel: runden(ziel), gewinn, roi, momentum, spread: runden(p.trend - einstieg), score, signal };
}

// Picks fürs Budget: kaufbar bis maxEuro, wiederverkaufbar (Trend über minEuro), bester Profi-Score zuerst.
export function kartenPicks(karten, { minEuro = 8, maxEuro = 40, anzahl = 30 } = {}) {
  return karten.map(kartenSignal).filter(Boolean)
    .filter((k) => k.preis.trend >= minEuro && (k.preis.tief ?? k.preis.trend) <= maxEuro && k.signal !== 'fällt')
    .map((k) => ({ ...k, profi: profiAnalyse(k), nurBewegung: k.signal !== 'steigt' }))
    .filter((k) => k.profi.signal !== 'PASS' || k.signal === 'steigt')
    .sort((a, b) => b.profi.score - a.profi.score || b.prozent - a.prozent)
    .slice(0, anzahl);
}

// Kursverlauf je Karte (stündlich, 7 Tage) für die Mini-Charts
export function kurseFortschreiben(kurse = {}, picks = [], jetzt = new Date()) {
  const grenze = jetzt.getTime() - 7 * 86400000, neu = {};
  for (const k of picks) neu[k.id] = [...(kurse[k.id] || []).filter(([t]) => Date.parse(t) >= grenze), [jetzt.toISOString(), k.preis.trend]].slice(-168);
  return neu;
}

// Zahlen zur Kontrolle: wie viele Karten hatten Preise, wie viele im Budget, wie viele steigen/fallen (= Markt-Stimmung)?
export function kartenStatistik(karten, { minEuro = 8, maxEuro = 40 } = {}) {
  const bewertet = karten.map(kartenSignal).filter(Boolean);
  const budget = bewertet.filter((k) => k.preis.trend >= minEuro && (k.preis.tief ?? k.preis.trend) <= maxEuro);
  return { karten: karten.length, mitPreis: bewertet.length, imBudget: budget.length, steigend: budget.filter((k) => k.signal === 'steigt').length, fallend: budget.filter((k) => k.signal === 'fällt').length };
}

// Wann kaufen? Faustregel aus dem Kartenmarkt: kurz nach Release sind Einzelkarten am teuersten,
// nach einigen Wochen am günstigsten, danach steigen gefragte Karten wieder.
export function kaufZeitpunkt(release, heute = new Date()) {
  const t = Date.parse(String(release).replace(/\//g, '-'));
  if (Number.isNaN(t)) return { phase: 'unbekannt', rat: 'Release-Datum unbekannt.' };
  const tage = Math.floor((heute.getTime() - t) / 86400000);
  if (tage < 0) return { phase: 'vorverkauf', tage, rat: `Erscheint in ${-tage} Tagen: Vorbestellen zum UVP ist die sicherste Wette, Einzelkarten noch nicht kaufen.` };
  if (tage < 21) return { phase: 'hype', tage, rat: 'Gerade erschienen: Einzelkarten sind jetzt am teuersten - warten. Displays/Boxen zum UVP mitnehmen.' };
  if (tage < 75) return { phase: 'kaufzeit', tage, rat: 'Beste Kaufzeit: der Release-Hype ist vorbei, viele verkaufen ihre Karten günstig.' };
  return { phase: 'halten', tage, rat: 'Älteres Set: Nachschub wird knapp - gefragte Karten und versiegelte Ware steigen eher.' };
}

// Google-Trends-RSS (geo=DE) lesen: Suchbegriff + ungefähre Suchmenge.
export function trendsAusRss(xml) {
  const raus = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const titel = m[1].match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim();
    const menge = m[1].match(/<ht:approx_traffic>([^<]+)<\/ht:approx_traffic>/)?.[1]?.trim() || '';
    if (titel) raus.push({ titel: titel.replace(/&amp;/g, '&'), menge });
  }
  return raus;
}

// Welche Trends sind Ware, die man weiterverkaufen kann?
export const KATEGORIEN = [
  ['Sammelkarten', /pok[eé]mon|tcg|one piece karte|lorcana|yu-?gi-?oh|magic the gathering|panini|topps|sammelkarte|booster/i],
  ['Figuren & Spielzeug', /labubu|pop mart|funko|lego|hot wheels|figur|plüsch|squishmallow|sonny angel|tamagotchi|bearbrick/i],
  ['Sneaker', /nike|jordan|adidas|yeezy|new balance|asics|samba|campus|dunk|on cloud|salomon|sneaker/i],
  ['Klamotten', /trikot|hoodie|jacke|north face|stone island|carhartt|supreme|corteiz|trapstar|stüssy|stussy|ralph lauren|moncler/i],
  ['Technik & Games', /playstation|ps5|switch|nintendo|xbox|iphone|airpods|steam deck|gpu|grafikkarte|konsole/i],
  ['Trend-Produkte', /stanley|owala|dubai schokolade|prime drink|labubu|adventskalender|parfum|dyson/i],
];
export function kategorie(text) {
  return KATEGORIEN.find(([, re]) => re.test(text))?.[0] || null;
}
export const wareTrends = (trends) => trends.map((t) => ({ ...t, kategorie: kategorie(t.titel) })).filter((t) => t.kategorie);

// Lagerstatus aus einer Produktseite: schema.org-Angaben (JSON-LD/Microdata/Meta) haben Vorrang, sonst Button-Texte.
export function verfuegbarkeit(html) {
  const h = String(html);
  const schema = [...h.matchAll(/"availability"\s*:\s*"(?:https?:\/\/schema\.org\/)?(\w+)"/gi)].map((m) => m[1].toLowerCase());
  const meta = h.match(/(?:itemprop=["']availability["'][^>]*(?:href|content)=["'](?:https?:\/\/schema\.org\/)?(\w+)|product:availability["'][^>]*content=["']([\w ]+))/i);
  const werte = [...schema, ...(meta ? [String(meta[1] || meta[2]).toLowerCase().replace(/\s/g, '')] : [])];
  if (werte.some((w) => /^(instock|limitedavailability|onlineonly|instoreonly|in_stock)$/.test(w))) return 'auf Lager';
  if (werte.some((w) => /^(preorder|presale)$/.test(w))) return 'Vorbestellung';
  if (werte.some((w) => /^(outofstock|soldout|discontinued|backorder|out_of_stock|oos)$/.test(w))) return 'ausverkauft';
  if (/ausverkauft|nicht (mehr )?verfügbar|derzeit nicht lieferbar|sold out/i.test(h)) return 'ausverkauft';
  if (/in den warenkorb|jetzt kaufen|add to cart/i.test(h)) return 'auf Lager';
  return null;
}

// Restock-Muster: an welchen Wochentagen/Uhrzeiten (deutsche Zeit) kam bisher Ware rein?
const TAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export function restockMuster(ereignisse) {
  const zaehl = (key) => Object.entries(ereignisse.reduce((m, e) => ((m[key(e)] = (m[key(e)] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]);
  const teile = (z) => Object.fromEntries(new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(z)).map((p) => [p.type, p.value]));
  const tag = (e) => TAGE.find((t) => teile(e.zeit).weekday?.startsWith(t)) || teile(e.zeit).weekday;
  return { anzahl: ereignisse.length, tage: zaehl(tag).slice(0, 3), stunden: zaehl((e) => `${teile(e.zeit).hour} Uhr`).slice(0, 3) };
}

// Neue Restocks aus altem und neuem Lagerstatus: nur der Wechsel nach "auf Lager" zählt.
export function neueRestocks(alt = {}, neu = {}) {
  return Object.entries(neu).filter(([url, s]) => s === 'auf Lager' && alt[url] && alt[url] !== 'auf Lager').map(([url]) => url);
}

// Links aus einem Issue-Text (die Beobachtungsliste kommt aus GitHub-Issues mit dem Label "restock").
export const linksAus = (text) => [...new Set(String(text || '').match(/https?:\/\/[^\s)<>"']+/g) || [])].filter((u) => !/github\.com/.test(u));

// Live-Lager bei Online-Shops mit Shopify-Suche (öffentliche Vorschlagssuche, ohne Schlüssel):
// /search/suggest.json liefert Titel, Preis, Link und ob der Artikel verfügbar ist.
export function shopifyTreffer(json, domain, begriff) {
  const produkte = json?.resources?.results?.products || [];
  return produkte.map((p) => ({
    titel: String(p.title || '').trim(), preis: Number.parseFloat(p.price) || null, verfuegbar: p.available !== false,
    url: /^https?:\/\//.test(p.url || '') ? p.url : `https://${domain}${String(p.url || '').split('?')[0]}`,
    bild: typeof p.image === 'string' ? p.image : p.image?.url || p.featured_image?.url || '',
    laden: domain.replace(/^(www|eu|shop)\./, ''), begriff,
  })).filter((p) => p.titel && p.verfuegbar);
}

// Läden vor Ort: 50 km um Hattersheim (Frankfurt, Mainz, Wiesbaden, Darmstadt, Hanau …), Daten aus OpenStreetMap.
export const HEIMAT = { name: 'Hattersheim am Main', lat: 50.0697, lon: 8.4867, radiusKm: 50 };
const KETTEN = 'Smyths Toys|Müller|Drogerie Müller|MediaMarkt|Media Markt|Saturn|Snipes|SNIPES|Foot Locker|JD Sports|Thalia|GameStop|LEGO|Galeria|Nike|adidas|Kaufland|Rossmann|Douglas|Hugendubel';
export function overpassAbfrage(h = HEIMAT) {
  const um = `around:${h.radiusKm * 1000},${h.lat},${h.lon}`;
  const art = '["shop"~"^(toys|games|video_games|collector|hobby|comic|anime|model|trade|second_hand)$"]';
  const kette = `["shop"]["brand"~"^(${KETTEN})$",i]`;
  const name = `["shop"]["name"~"^(${KETTEN})",i]`;
  return `[out:json][timeout:180];(nwr${art}(${um});nwr${kette}(${um});nwr${name}(${um}););out center tags;`;
}

export function entfernungKm(a, b) {
  const r = (x) => (x * Math.PI) / 180;
  const d = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(d)) * 10) / 10;
}

// Welche Ware gibt es dort? Für den Filter in der App.
export function ladenArt(tags = {}) {
  const t = `${tags.brand || ''} ${tags.name || ''}`.toLowerCase();
  if (/smyths|lego|toys|spielwaren|spielzeug/.test(t) || ['toys', 'model'].includes(tags.shop)) return 'Spielzeug & Figuren';
  if (/tcg|card|karten|pokémon|pokemon|comic|manga|anime/.test(t) || ['games', 'collector', 'comic', 'anime', 'hobby', 'trade'].includes(tags.shop)) return 'Karten & Sammeln';
  if (/mediamarkt|media markt|saturn|gamestop/.test(t) || tags.shop === 'video_games' || tags.shop === 'electronics') return 'Technik & Games';
  if (/snipes|foot locker|jd sports|nike|adidas/.test(t) || ['shoes', 'clothes', 'sports'].includes(tags.shop)) return 'Sneaker & Klamotten';
  if (/thalia|hugendubel/.test(t) || tags.shop === 'books') return 'Bücher & Manga';
  if (/müller|rossmann|douglas/.test(t) || ['chemist', 'cosmetics', 'perfumery'].includes(tags.shop)) return 'Drogerie & Beauty';
  if (tags.shop === 'second_hand') return 'Second-Hand';
  return 'Kaufhaus & Markt';
}

export function laedenAusOsm(json, h = HEIMAT) {
  const gesehen = new Set();
  return (json?.elements || []).map((e) => {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon, t = e.tags || {};
    if (lat == null || !t.name) return null;
    const adresse = [[t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '), [t['addr:postcode'], t['addr:city']].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return { name: t.name, art: ladenArt(t), km: entfernungKm(h, { lat, lon }), lat, lon, adresse, ort: t['addr:city'] || '',
      zeiten: t.opening_hours || '', web: /^https?:\/\//.test(t.website || t['contact:website'] || '') ? (t.website || t['contact:website']) : '' };
  }).filter((l) => l && !gesehen.has(`${l.name}|${l.adresse || l.lat}`) && gesehen.add(`${l.name}|${l.adresse || l.lat}`))
    .sort((a, b) => a.km - b.km);
}

// Release-Kalender: kommende Nike-SNKRS-Drops für Deutschland (öffentlicher Produkt-Feed der Nike-Seite).
// Liefert Modell, Farbe, Bild, Preis, Release-Zeit und Link - unbekannte Felder werden einfach übersprungen.
export function nikeDrops(json, heute = new Date()) {
  const raus = [];
  for (const o of json?.objects || []) {
    const slug = o.publishedContent?.properties?.seo?.slug;
    for (const p of o.productInfo || []) {
      const start = p.launchView?.startEntryDate || p.merchProduct?.commerceStartDate;
      const t = Date.parse(start);
      if (!start || Number.isNaN(t) || t < heute.getTime() - 86400000) continue;
      const titel = p.productContent?.fullTitle || [p.productContent?.title, p.productContent?.subtitle].filter(Boolean).join(' ');
      if (!titel) continue;
      raus.push({
        titel, farbe: p.productContent?.colorDescription || '', preis: p.merchPrice?.currentPrice ?? p.merchPrice?.fullPrice ?? null,
        bild: p.imageUrls?.productImageUrl || '', zeit: new Date(t).toISOString(), art: p.launchView?.method || '',
        link: slug ? `https://www.nike.com/de/launch/t/${slug}` : 'https://www.nike.com/de/launch', marke: 'Nike', kat: 'Sneaker',
      });
    }
  }
  const gesehen = new Set();
  return raus.filter((d) => !gesehen.has(d.titel + d.zeit) && gesehen.add(d.titel + d.zeit)).sort((a, b) => a.zeit.localeCompare(b.zeit));
}

// Bilder für Hype, Saison und Katalog: pro Suchbegriff ein kleines Vorschaubild (Bing-Bildersuche, sonst DuckDuckGo, sonst Wikimedia Commons).
export const bildBegriffe = (saison = {}, katalog = {}, hype = {}) => [...new Set([
  ...(hype.produkte || []), ...Object.values(saison.monate || {}).flat(), ...(katalog.produkte || []),
].map((t) => t.bild || t.q).filter(Boolean))];
export function bingBild(html) {
  const m = String(html || '').match(/&quot;murl&quot;:&quot;(https?:\/\/.*?)&quot;.*?&quot;turl&quot;:&quot;(https:\/\/.*?)&quot;/);
  return m ? { url: m[2].replace(/&amp;/g, '&'), quelle: m[1].replace(/&amp;/g, '&') } : null;
}
export const ddgVqd = (html) => String(html || '').match(/vqd=["']?([\d-]+)["']?/)?.[1] || '';
export function ddgBild(json) {
  const r = (json?.results || []).find((x) => /^https:\/\//.test(x.thumbnail || ''));
  return r ? { url: r.thumbnail, quelle: r.url || '' } : null;
}
export function commonsBild(json) {
  const p = Object.values(json?.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).find((x) => x.imageinfo?.[0]?.thumburl);
  return p ? { url: p.imageinfo[0].thumburl, quelle: p.imageinfo[0].descriptionurl || '' } : null;
}
// Shop-Suchlink: {q} = URL-kodiert, {q-} = mit Bindestrichen (z. B. Kleinanzeigen)
export const suchLink = (vorlage, q) => String(vorlage).replace('{q-}', encodeURIComponent(String(q).trim().replace(/\s+/g, '-'))).replace('{q}', encodeURIComponent(q));

// Alarme "sofort kaufen": neue STRONG-BUY-Karten, Drops in den nächsten 90 Minuten, neu eingetroffene Ware im Budget.
// gemeldet = { schluessel: Zeitpunkt } verhindert Wiederholungen (Karten frühestens nach 3 Tagen erneut).
const eu = (n) => `${Number(n).toFixed(2).replace('.', ',')} €`;
export function alarme({ picks = [], kalender = [], liveNeu = [], budget = 40 }, gemeldet = {}, jetzt = new Date()) {
  const t = jetzt.getTime(), raus = [];
  const frisch = (k, tage) => gemeldet[k] && t - Date.parse(gemeldet[k]) < tage * 86400000;
  for (const k of picks) {
    if (k.profi?.signal !== 'STRONG BUY' || frisch(`karte:${k.id}`, 3)) continue;
    raus.push({ schluessel: `karte:${k.id}`, art: 'Karte', titel: `🚨 STRONG BUY: ${k.name}`, bild: k.bild, link: k.link,
      text: `Kaufen ab ${eu(k.profi.einstieg)} · Ziel ${eu(k.profi.ziel)} · +${eu(k.profi.gewinn)} nach Gebühren (ROI ${k.profi.roi} %)` });
  }
  for (const d of kalender) {
    const bis = Date.parse(d.zeit) - t;
    if (bis < -15 * 60000 || bis > 90 * 60000 || frisch(`drop:${d.titel}:${d.zeit}`, 30)) continue;
    raus.push({ schluessel: `drop:${d.titel}:${d.zeit}`, art: 'Drop', titel: `⏰ Drop gleich: ${d.titel}`, bild: d.bild, link: d.link,
      text: `${d.farbe ? `${d.farbe} · ` : ''}${d.preis ? `${eu(d.preis)} · ` : ''}Start ${new Date(d.zeit).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })} Uhr` });
  }
  for (const w of liveNeu) {
    if (raus.filter((a) => a.art === 'Neu').length >= 2) break;  // nicht zuspammen
    if (w.preis == null || w.preis > budget || frisch(`neu:${w.url}`, 30)) continue;
    raus.push({ schluessel: `neu:${w.url}`, art: 'Neu', titel: `🆕 Neu auf Lager: ${w.titel}`, bild: w.bild, link: w.url, text: `${eu(w.preis)} bei ${w.laden}` });
  }
  return raus;
}

// Kartenbild: TCGdex hat neue Sets oft noch nicht auf Deutsch - dann die englische oder japanische Variante nehmen.
export const bildVarianten = (url) => (/assets\.tcgdex\.net\/de\//.test(url || '') ? [url, url.replace('/de/', '/en/'), url.replace('/de/', '/ja/')] : [url].filter(Boolean));

// Nike-Style-Code aus der Bildadresse (…/DotCom/IQ3922_001 -> IQ3922-001) für die Bildsuche
export const styleCode = (url) => String(url || '').match(/\/([A-Z0-9]{5,8})_(\d{3})(?:[?/]|$)/)?.slice(1, 3).join('-') || '';
