// Ultimativ-MCP, Teil 2: Wissen & Alltag - alles kostenlose, oeffentliche Schnittstellen ohne API-Key.
import { hole, q, kurz, zahl, sprache, htmlZuText, T, S, N } from './werkzeuge.mjs';

async function ortKoordinaten(ort) {
  const g = await hole(`https://geocoding-api.open-meteo.com/v1/search?name=${q(ort)}&count=1&language=de`);
  const p = g.results?.[0];
  if (!p) throw new Error(`Ort "${ort}" nicht gefunden`);
  return { name: `${p.name}${p.country ? `, ${p.country}` : ''}`, lat: p.latitude, lon: p.longitude };
}

async function uebersetzen({ text, von, nach }) {
  const d = await hole(`https://api.mymemory.translated.net/get?q=${q(String(text).slice(0, 480))}&langpair=${sprache(von || 'de')}|${sprache(nach || 'en')}`);
  return { uebersetzung: d.responseData?.translatedText || '', quelle: 'MyMemory (kostenlos, max. ~500 Zeichen je Anfrage)' };
}

async function buchSuche({ suche, limit }) {
  const d = await hole(`https://openlibrary.org/search.json?q=${q(suche)}&limit=${zahl(limit, 8, 1, 25)}`);
  return (d.docs || []).map((b) => ({ titel: b.title, autor: (b.author_name || []).join(', '), jahr: b.first_publish_year, link: `https://openlibrary.org${b.key}` }));
}

async function serienSuche({ suche }) {
  const d = await hole(`https://api.tvmaze.com/search/shows?q=${q(suche)}`);
  return d.slice(0, 10).map(({ show: s }) => ({ titel: s.name, start: s.premiered, status: s.status, genres: s.genres, bewertung: s.rating?.average, sender: s.network?.name || s.webChannel?.name, info: kurz(htmlZuText(s.summary || ''), 300), link: s.url }));
}

async function rezeptSuche({ suche }) {
  const d = await hole(`https://www.themealdb.com/api/json/v1/1/search.php?s=${q(suche)}`);
  return (d.meals || []).slice(0, 5).map((m) => ({
    name: m.strMeal, kategorie: m.strCategory, herkunft: m.strArea,
    zutaten: Array.from({ length: 20 }, (_, i) => [m[`strIngredient${i + 1}`], m[`strMeasure${i + 1}`]]).filter(([z]) => z && z.trim()).map(([z, m2]) => `${(m2 || '').trim()} ${z.trim()}`.trim()),
    anleitung: kurz(m.strInstructions, 1500), video: m.strYoutube,
  }));
}

async function cocktailSuche({ suche }) {
  const d = await hole(`https://www.thecocktaildb.com/api/json/v1/1/search.php?s=${q(suche)}`);
  return (d.drinks || []).slice(0, 5).map((c) => ({
    name: c.strDrink, alkoholisch: c.strAlcoholic, glas: c.strGlass,
    zutaten: Array.from({ length: 15 }, (_, i) => [c[`strIngredient${i + 1}`], c[`strMeasure${i + 1}`]]).filter(([z]) => z).map(([z, m]) => `${(m || '').trim()} ${z}`.trim()),
    anleitung: c.strInstructionsDE || c.strInstructions,
  }));
}

async function witz({ sprache: s }) {
  const l = ['de', 'en', 'es', 'fr', 'pt', 'cs'].includes(sprache(s)) ? sprache(s) : 'de';
  const d = await hole(`https://v2.jokeapi.dev/joke/Any?lang=${l}&safe-mode`);
  return { witz: d.type === 'twopart' ? `${d.setup}\n${d.delivery}` : d.joke, kategorie: d.category };
}

async function zitat() {
  const [d] = await hole('https://zenquotes.io/api/random');
  return { zitat: d?.q, autor: d?.a };
}

async function plzInfo({ plz, land }) {
  const l = /^[a-z]{2}$/i.test(String(land || '')) ? String(land).toLowerCase() : 'de';
  const d = await hole(`https://api.zippopotam.us/${l}/${q(String(plz).trim())}`);
  return { plz: d['post code'], land: d.country, orte: (d.places || []).map((p) => ({ ort: p['place name'], bundesland: p.state, lat: p.latitude, lon: p.longitude })) };
}

async function erdbeben({ staerke }) {
  const d = await hole('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson');
  const min = zahl(staerke, 4.5, 0, 9);
  return (d.features || []).filter((f) => f.properties.mag >= min).slice(0, 20).map((f) => ({ staerke: f.properties.mag, ort: f.properties.place, zeit: new Date(f.properties.time).toISOString(), tsunami: Boolean(f.properties.tsunami), link: f.properties.url }));
}

async function luftqualitaet({ ort }) {
  const o = await ortKoordinaten(ort);
  const d = await hole(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${o.lat}&longitude=${o.lon}&current=european_aqi,pm10,pm2_5,ozone,nitrogen_dioxide,uv_index`);
  return { ort: o.name, ...d.current, einheiten: d.current_units, hinweis: 'European AQI: 0-20 gut, 20-40 ok, 40-60 maessig, 60-80 schlecht, >80 sehr schlecht' };
}

async function sonnenzeiten({ ort, datum }) {
  const o = await ortKoordinaten(ort);
  const tag = /^\d{4}-\d{2}-\d{2}$/.test(String(datum || '')) ? datum : 'today';
  const d = await hole(`https://api.sunrise-sunset.org/json?lat=${o.lat}&lng=${o.lon}&date=${tag}&formatted=0`);
  const zeit = (x) => new Date(x).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  return { ort: o.name, sonnenaufgang: zeit(d.results.sunrise), sonnenuntergang: zeit(d.results.sunset), tageslaenge_std: (d.results.day_length / 3600).toFixed(1), zeitzone: 'Europe/Berlin' };
}

async function issPosition() {
  const d = await hole('https://api.wheretheiss.at/v1/satellites/25544').catch(async () => {
    const o = await hole('http://api.open-notify.org/iss-now.json');
    return { latitude: Number(o.iss_position.latitude), longitude: Number(o.iss_position.longitude), altitude: 420, velocity: 27600 };
  });
  return { breite: d.latitude, laenge: d.longitude, hoehe_km: Math.round(d.altitude), geschwindigkeit_kmh: Math.round(d.velocity), karte: `https://www.openstreetmap.org/?mlat=${d.latitude}&mlon=${d.longitude}#map=4/${d.latitude}/${d.longitude}` };
}

async function nasaBild() {
  const d = await hole('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY');
  return { titel: d.title, datum: d.date, erklaerung: kurz(d.explanation, 1200), bild: d.hdurl || d.url, typ: d.media_type };
}

async function bundesliga({ liga }) {
  const l = ['bl1', 'bl2', 'bl3'].includes(String(liga || '').toLowerCase()) ? String(liga).toLowerCase() : 'bl1';
  const jetzt = new Date();
  const saison = jetzt.getMonth() >= 6 ? jetzt.getFullYear() : jetzt.getFullYear() - 1;
  const d = await hole(`https://api.openligadb.de/getbltable/${l}/${saison}`);
  return d.map((t, i) => ({ platz: i + 1, team: t.teamName, spiele: t.matches, punkte: t.points, tore: `${t.goals}:${t.opponentGoals}`, differenz: t.goalDiff }));
}

async function bahnAbfahrten({ bahnhof, minuten }) {
  const orte = await hole(`https://v6.db.transport.rest/locations?query=${q(bahnhof)}&results=1&addresses=false&poi=false`).catch((err) => { throw new Error(`Der freie DB-Dienst (db.transport.rest) ist gerade nicht erreichbar (${err.message}) - bitte spaeter erneut versuchen.`); });
  const halt = orte[0];
  if (!halt) throw new Error(`Bahnhof "${bahnhof}" nicht gefunden`);
  const d = await hole(`https://v6.db.transport.rest/stops/${q(halt.id)}/departures?duration=${zahl(minuten, 60, 10, 240)}&results=25`);
  return { bahnhof: halt.name, abfahrten: (d.departures || d).slice(0, 25).map((a) => ({ zeit: a.when || a.plannedWhen, linie: a.line?.name, richtung: a.direction, gleis: a.platform || a.plannedPlatform, verspaetung_min: a.delay != null ? Math.round(a.delay / 60) : null, ausfall: Boolean(a.cancelled) })) };
}

async function musikSuche({ suche }) {
  const d = await hole(`https://api.deezer.com/search?q=${q(suche)}&limit=10`);
  return (d.data || []).map((t) => ({ titel: t.title, kuenstler: t.artist?.name, album: t.album?.title, dauer_s: t.duration, vorschau_30s: t.preview, link: t.link }));
}

async function podcastSuche({ suche, land }) {
  const c = /^[a-z]{2}$/i.test(String(land || '')) ? String(land).toLowerCase() : 'de';
  const d = await hole(`https://itunes.apple.com/search?media=podcast&term=${q(suche)}&country=${c}&limit=10`);
  return (d.results || []).map((p) => ({ name: p.collectionName, autor: p.artistName, folgen: p.trackCount, genre: p.primaryGenreName, rss: p.feedUrl, link: p.collectionViewUrl }));
}

async function lebensmittel({ barcode }) {
  const ean = String(barcode).replace(/\D/g, '');
  if (ean.length < 8) throw new Error('Bitte einen EAN-Barcode (8-13 Ziffern) angeben');
  const d = await hole(`https://world.openfoodfacts.org/api/v2/product/${ean}.json`);
  const p = d.product;
  if (!p) throw new Error('Produkt nicht gefunden');
  return { name: p.product_name_de || p.product_name, marke: p.brands, menge: p.quantity, nutriscore: p.nutriscore_grade, nova: p.nova_group, zutaten: kurz(p.ingredients_text_de || p.ingredients_text, 800), allergene: p.allergens_tags, naehrwerte_100g: { kcal: p.nutriments?.['energy-kcal_100g'], fett: p.nutriments?.fat_100g, zucker: p.nutriments?.sugars_100g, eiweiss: p.nutriments?.proteins_100g, salz: p.nutriments?.salt_100g } };
}

async function heuteInGeschichte({ sprache: s }) {
  const l = ['de', 'en', 'fr', 'es', 'it', 'pt', 'ru', 'sv', 'ar', 'bs', 'tr'].includes(sprache(s)) ? sprache(s) : 'de';
  const jetzt = new Date();
  const d = await hole(`https://api.wikimedia.org/feed/v1/wikipedia/${l}/onthisday/events/${String(jetzt.getMonth() + 1).padStart(2, '0')}/${String(jetzt.getDate()).padStart(2, '0')}`);
  return (d.events || []).slice(0, 15).map((e) => ({ jahr: e.year, ereignis: kurz(e.text, 300) }));
}

export const WERKZEUGE2 = [
  T('uebersetzen', 'Uebersetzt Text zwischen Sprachen (MyMemory, bis ~500 Zeichen je Anfrage).', { text: S('Text'), von: S('Quellsprache, z. B. de'), nach: S('Zielsprache, z. B. en, tr, es') }, ['text'], uebersetzen),
  T('buch_suche', 'Sucht Buecher (Open Library): Titel, Autor, Jahr.', { suche: S('Titel, Autor oder Thema'), limit: N('max. Treffer') }, ['suche'], buchSuche),
  T('serien_suche', 'Infos zu TV-Serien (TVMaze): Start, Status, Genre, Bewertung, Sender.', { suche: S('Serienname') }, ['suche'], serienSuche),
  T('rezept_suche', 'Kochrezepte mit Zutaten und Anleitung (TheMealDB).', { suche: S('Gericht, z. B. pasta, chicken') }, ['suche'], rezeptSuche),
  T('cocktail_suche', 'Cocktail-/Drink-Rezepte mit Zutaten (TheCocktailDB).', { suche: S('Drink, z. B. mojito') }, ['suche'], cocktailSuche),
  T('witz', 'Zufaelliger, jugendfreier Witz (JokeAPI) auf Deutsch oder Englisch.', { sprache: S('de oder en') }, [], witz),
  T('zitat', 'Zufaelliges inspirierendes Zitat mit Autor.', {}, [], zitat),
  T('plz_info', 'Postleitzahl -> Ort, Bundesland, Koordinaten (viele Laender).', { plz: S('Postleitzahl'), land: S('Laendercode, z. B. de, at, ch, us') }, ['plz'], plzInfo),
  T('erdbeben', 'Erdbeben weltweit der letzten 24 Stunden (USGS).', { staerke: N('Mindeststaerke, Standard 4.5') }, [], erdbeben),
  T('luftqualitaet', 'Aktuelle Luftqualitaet, Feinstaub, Ozon und UV-Index fuer einen Ort.', { ort: S('Ort') }, ['ort'], luftqualitaet),
  T('sonnenzeiten', 'Sonnenaufgang, Sonnenuntergang und Tageslaenge fuer einen Ort.', { ort: S('Ort'), datum: S('YYYY-MM-DD, Standard heute') }, ['ort'], sonnenzeiten),
  T('iss_position', 'Aktuelle Position der Internationalen Raumstation (ISS).', {}, [], issPosition),
  T('nasa_bild_des_tages', 'NASA Astronomy Picture of the Day mit Erklaerung.', {}, [], nasaBild),
  T('bundesliga_tabelle', 'Aktuelle Bundesliga-Tabelle (OpenLigaDB).', { liga: S('bl1, bl2 oder bl3') }, [], bundesliga),
  T('bahn_abfahrten', 'Abfahrten an einem Bahnhof in Deutschland mit Gleis und Verspaetung (DB).', { bahnhof: S('Bahnhof, z. B. Frankfurt Hbf'), minuten: N('Zeitraum in Minuten') }, ['bahnhof'], bahnAbfahrten),
  T('musik_suche', 'Sucht Songs (Deezer) mit 30-Sekunden-Vorschau.', { suche: S('Song oder Kuenstler') }, ['suche'], musikSuche),
  T('podcast_suche', 'Sucht Podcasts (Apple Podcasts) inkl. RSS-Feed.', { suche: S('Thema oder Name'), land: S('Laendercode, Standard de') }, ['suche'], podcastSuche),
  T('lebensmittel_info', 'Lebensmittel per Barcode: Naehrwerte, Nutri-Score, Zutaten, Allergene (Open Food Facts).', { barcode: S('EAN-Barcode') }, ['barcode'], lebensmittel),
  T('heute_in_geschichte', 'Was an diesem Tag in der Geschichte passiert ist (Wikipedia).', { sprache: S('Sprachcode, Standard de') }, [], heuteInGeschichte),
];
