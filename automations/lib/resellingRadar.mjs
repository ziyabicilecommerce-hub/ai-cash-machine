// Reselling-Radar (#112): reine Funktionen - welche Pokémon-Karten steigen (echte Cardmarket-Preise in EUR),
// was in Deutschland gerade gesucht wird (Google Trends), ob ein beobachtetes Produkt auf Lager ist
// und zu welchen Wochentagen/Uhrzeiten Restocks bisher kamen. Ohne Netz testbar.

const zahl = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const runden = (v) => Math.round(v * 100) / 100;

// Eine Karte bewerten: Trend = Preis der letzten Tage gegen den 30-Tage-Schnitt.
export function kartenSignal(karte) {
  const p = karte?.cardmarket?.prices || {};
  const tief = zahl(p.lowPrice), trend = zahl(p.trendPrice), a1 = zahl(p.avg1), a7 = zahl(p.avg7), a30 = zahl(p.avg30);
  if (!trend || !a30) return null;
  const jetzt = a1 || a7 || trend;
  const prozent = Math.round((jetzt / a30 - 1) * 100);
  const signal = prozent >= 12 ? 'steigt' : prozent <= -12 ? 'fällt' : 'stabil';
  return {
    id: karte.id, name: karte.name, nummer: karte.number, seltenheit: karte.rarity || '',
    set: karte.set?.name || '', setId: karte.set?.id || '', release: karte.set?.releaseDate || '',
    bild: karte.images?.small || '', link: karte.cardmarket?.url || '',
    preis: { tief: tief && runden(tief), trend: runden(trend), schnitt7: a7 && runden(a7), schnitt30: runden(a30) },
    prozent, signal,
  };
}

// Picks fürs Budget: kaufbar bis maxEuro, wiederverkaufbar (Trend über minEuro), stärkster Anstieg zuerst.
// Steigt gerade nichts deutlich, kommen die Karten mit der besten Bewegung (markiert), statt einer leeren Liste.
export function kartenPicks(karten, { minEuro = 8, maxEuro = 40, anzahl = 30 } = {}) {
  const imBudget = karten.map(kartenSignal).filter(Boolean)
    .filter((k) => k.preis.trend >= minEuro && (k.preis.tief ?? k.preis.trend) <= maxEuro)
    .sort((a, b) => b.prozent - a.prozent || b.preis.trend - a.preis.trend);
  const steigend = imBudget.filter((k) => k.signal === 'steigt');
  return (steigend.length ? steigend : imBudget.filter((k) => k.prozent > 0).map((k) => ({ ...k, nurBewegung: true }))).slice(0, anzahl);
}

// Zahlen zur Kontrolle: wie viele Karten hatten Preise, wie viele im Budget, wie viele steigen?
export function kartenStatistik(karten, { minEuro = 8, maxEuro = 40 } = {}) {
  const bewertet = karten.map(kartenSignal).filter(Boolean);
  const budget = bewertet.filter((k) => k.preis.trend >= minEuro && (k.preis.tief ?? k.preis.trend) <= maxEuro);
  return { karten: karten.length, mitPreis: bewertet.length, imBudget: budget.length, steigend: budget.filter((k) => k.signal === 'steigt').length };
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
