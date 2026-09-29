// Werkzeuge des Ultimativ-MCP: das, was die meisten toten MCPs aus dem Live-Check (#92)
// versprochen haben (Suche, Web lesen, Kurse, Wetter, Wissen, Nachrichten, KI-Bild/Text ...),
// neu gebaut auf kostenlosen, oeffentlichen Schnittstellen ohne API-Key.
import { readFileSync, existsSync } from 'node:fs';
import { sichereZielUrl } from '../mcp-router/client.mjs';
import { askKI } from '../automations/lib/ki.mjs';

const UA = 'cashmachine-ultimativ-mcp/1.0 (+https://github.com/ziyabicilecommerce-hub/ai-cash-machine)';
const MAX_TEXT = 20000;

async function hole(url, { text = false, headers = {}, method = 'GET', body } = {}) {
  const res = await fetch(url, { method, body, headers: { 'user-agent': UA, accept: text ? '*/*' : 'application/json', ...headers }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`${new URL(url).hostname} antwortet mit HTTP ${res.status}`);
  return text ? res.text() : res.json();
}

const q = encodeURIComponent;
const kurz = (t, n = 300) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const zahl = (x, d, min, max) => Math.min(Math.max(Number(x) || d, min), max);
const sprache = (s) => (/^[a-z]{2,3}$/i.test(String(s || '')) ? String(s).toLowerCase() : 'de');

function htmlZuText(html) {
  return String(html)
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
}

// Einfache RSS/Atom-Auswertung ohne Abhaengigkeiten.
function eintraege(xml, tag) {
  return [...String(xml).matchAll(new RegExp(`<${tag}[\\s>][\\s\\S]*?<\\/${tag}>`, 'g'))].map((m) => {
    const feld = (f) => (m[0].match(new RegExp(`<${f}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${f}>`)) || [])[1] || '';
    const href = (m[0].match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    return { titel: kurz(htmlZuText(feld('title')), 200), link: feld('link').trim() || href, datum: feld('pubDate') || feld('published') || feld('updated'), text: kurz(htmlZuText(feld('description') || feld('summary')), 400) };
  });
}

// Liest eine oeffentliche Webseite; jeder Weiterleitungs-Schritt wird erneut geprueft (kein Zugriff auf interne Netze).
async function webseiteLesen({ url }) {
  let ziel = sichereZielUrl(url);
  for (let i = 0; i < 5 && ziel; i++) {
    const res = await fetch(ziel, { redirect: 'manual', headers: { 'user-agent': UA, accept: 'text/html,text/plain,application/json' }, signal: AbortSignal.timeout(20000) });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      ziel = sichereZielUrl(new URL(res.headers.get('location'), ziel).href);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const typ = res.headers.get('content-type') || '';
    const roh = (await res.text()).slice(0, 2_000_000);
    const text = typ.includes('html') ? htmlZuText(roh) : roh;
    const titel = (roh.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
    return { url: ziel, titel: kurz(titel || '', 200), text: text.slice(0, MAX_TEXT), gekuerzt: text.length > MAX_TEXT };
  }
  throw new Error('Nur oeffentliche https-Adressen sind erlaubt.');
}

async function webSuche({ suche, sprache: s }) {
  const l = sprache(s);
  const [ddg, wiki] = await Promise.allSettled([
    hole(`https://api.duckduckgo.com/?q=${q(suche)}&format=json&no_html=1&skip_disambig=1`),
    hole(`https://${l}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q(suche)}&format=json&srlimit=8`),
  ]);
  const d = ddg.status === 'fulfilled' ? ddg.value : {};
  const themen = (d.RelatedTopics || []).flatMap((t) => t.Topics || [t]).filter((t) => t.FirstURL).slice(0, 8).map((t) => ({ titel: kurz(t.Text, 200), link: t.FirstURL }));
  const artikel = wiki.status === 'fulfilled' ? (wiki.value.query?.search || []).map((a) => ({ titel: a.title, link: `https://${l}.wikipedia.org/wiki/${q(a.title.replace(/ /g, '_'))}`, text: kurz(htmlZuText(a.snippet), 250) })) : [];
  return { suche, sofortAntwort: kurz(d.AbstractText || d.Answer || '', 800), quelle: d.AbstractURL || '', themen, wikipedia: artikel };
}

async function wikipedia({ titel, sprache: s }) {
  const l = sprache(s);
  const d = await hole(`https://${l}.wikipedia.org/api/rest_v1/page/summary/${q(String(titel).replace(/ /g, '_'))}`);
  return { titel: d.title, beschreibung: d.description || '', zusammenfassung: d.extract || '', link: d.content_urls?.desktop?.page || '' };
}

async function ortSuchen({ ort, limit }) {
  const d = await hole(`https://nominatim.openstreetmap.org/search?q=${q(ort)}&format=jsonv2&limit=${zahl(limit, 5, 1, 10)}&addressdetails=0`);
  return d.map((o) => ({ name: o.display_name, lat: Number(o.lat), lon: Number(o.lon), typ: o.type }));
}

async function wetter({ ort, tage }) {
  const g = await hole(`https://geocoding-api.open-meteo.com/v1/search?name=${q(ort)}&count=1&language=de`);
  const p = (g.results || [])[0];
  if (!p) throw new Error(`Ort "${ort}" nicht gefunden`);
  const d = await hole(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current=temperature_2m,apparent_temperature,wind_speed_10m,precipitation,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto&forecast_days=${zahl(tage, 3, 1, 16)}`);
  return { ort: `${p.name}, ${p.country || ''}`.trim(), jetzt: d.current, einheiten: d.current_units, tage: (d.daily?.time || []).map((t, i) => ({ datum: t, max: d.daily.temperature_2m_max[i], min: d.daily.temperature_2m_min[i], niederschlag_mm: d.daily.precipitation_sum[i] })) };
}

async function kryptoPreise({ coins, waehrung }) {
  const ids = String(coins || 'bitcoin,ethereum').toLowerCase().replace(/\s+/g, '');
  const w = String(waehrung || 'eur').toLowerCase();
  return hole(`https://api.coingecko.com/api/v3/simple/price?ids=${q(ids)}&vs_currencies=${q(w)}&include_24hr_change=true&include_market_cap=true`);
}

async function waehrungUmrechnen({ betrag, von, nach }) {
  const d = await hole(`https://api.frankfurter.dev/v1/latest?amount=${zahl(betrag, 1, 0, 1e12)}&from=${q(String(von || 'EUR').toUpperCase())}&to=${q(String(nach || 'USD').toUpperCase())}`);
  return { betrag: d.amount, von: d.base, datum: d.date, ergebnis: d.rates, quelle: 'Europaeische Zentralbank (Frankfurter)' };
}

// Yahoo-Finance-Chart (ohne Key), Rueckfall Stooq. Symbole z. B. AAPL, SAP.DE, ^GDAXI, BTC-EUR.
async function aktienKurs({ symbol }) {
  const sym = String(symbol || '').trim();
  try {
    const d = await hole(`https://query1.finance.yahoo.com/v8/finance/chart/${q(sym.toUpperCase())}?range=5d&interval=1d`);
    const r = d.chart?.result?.[0];
    if (!r) throw new Error(d.chart?.error?.description || 'kein Ergebnis');
    const m = r.meta;
    return { symbol: m.symbol, name: m.longName || m.shortName || '', kurs: m.regularMarketPrice, vortag: m.chartPreviousClose, waehrung: m.currency, boerse: m.exchangeName, zeit: new Date(m.regularMarketTime * 1000).toISOString(), quelle: 'Yahoo Finance' };
  } catch (err) {
    const csv = await hole(`https://stooq.com/q/l/?s=${q(sym.toLowerCase())}&f=sd2t2ohlcv&h&e=csv`, { text: true }).catch(() => '');
    const [kopf, werte] = csv.trim().split('\n');
    if (!werte || /N\/D/.test(werte)) throw new Error(`Kein Kurs fuer "${sym}" (${err.message}). Beispiele: AAPL, SAP.DE, ^GDAXI`);
    const k = kopf.split(','); const w = werte.split(',');
    return { ...Object.fromEntries(k.map((x, i) => [x.toLowerCase(), w[i]])), quelle: 'Stooq' };
  }
}

async function feiertage({ land, jahr }) {
  const d = await hole(`https://date.nager.at/api/v3/PublicHolidays/${zahl(jahr, new Date().getFullYear(), 1975, 2100)}/${q(String(land || 'DE').toUpperCase())}`);
  return d.map((f) => ({ datum: f.date, name: f.localName, englisch: f.name, bundesweit: f.global }));
}

// restcountries, Rueckfall Weltbank (beide ohne Key).
async function landInfo({ land }) {
  try {
    const d = await hole(`https://restcountries.com/v3.1/name/${q(land)}?fields=name,capital,population,region,languages,currencies,timezones,flag,cca2`);
    if (!Array.isArray(d) || !d.length) throw new Error('leer');
    return d.slice(0, 3).map((l) => ({ name: l.name?.common, offiziell: l.name?.official, code: l.cca2, hauptstadt: l.capital, einwohner: l.population, region: l.region, sprachen: Object.values(l.languages || {}), waehrungen: Object.keys(l.currencies || {}), zeitzonen: l.timezones, flagge: l.flag }));
  } catch {
    const [, laender] = await hole('https://api.worldbank.org/v2/country?format=json&per_page=400');
    const such = String(land).toLowerCase();
    const treffer = (laender || []).filter((l) => l.region?.value !== 'Aggregates' && (l.name.toLowerCase().includes(such) || l.iso2Code.toLowerCase() === such || l.id.toLowerCase() === such)).slice(0, 3);
    if (!treffer.length) throw new Error(`Land "${land}" nicht gefunden (englischer Name, z. B. Japan, Germany, Turkiye)`);
    return Promise.all(treffer.map(async (l) => {
      const [, pop] = await hole(`https://api.worldbank.org/v2/country/${l.id}/indicator/SP.POP.TOTL?format=json&mrnev=1`).catch(() => [null, []]);
      return { name: l.name, code: l.iso2Code, hauptstadt: l.capitalCity, region: l.region?.value, einkommen: l.incomeLevel?.value, einwohner: pop?.[0]?.value ?? null, einwohner_jahr: pop?.[0]?.date ?? null, quelle: 'Weltbank' };
    }));
  }
}

// dictionaryapi.dev, Rueckfall Wiktionary.
async function woerterbuch({ wort }) {
  let d;
  try {
    d = await hole(`https://api.dictionaryapi.dev/api/v2/entries/en/${q(wort)}`);
  } catch {
    const w = await hole(`https://en.wiktionary.org/api/rest_v1/page/definition/${q(wort)}`);
    return (w.en || []).slice(0, 4).map((m) => ({ wort, wortart: m.partOfSpeech, erklaerungen: (m.definitions || []).slice(0, 3).map((x) => htmlZuText(x.definition)), quelle: 'Wiktionary' }));
  }
  return d.slice(0, 2).map((e) => ({ wort: e.word, lautschrift: e.phonetic || '', bedeutungen: (e.meanings || []).slice(0, 4).map((m) => ({ wortart: m.partOfSpeech, erklaerungen: m.definitions.slice(0, 3).map((x) => x.definition) })) }));
}

async function githubSuche({ suche, limit }) {
  const d = await hole(`https://api.github.com/search/repositories?q=${q(suche)}&sort=stars&per_page=${zahl(limit, 10, 1, 30)}`, { headers: { accept: 'application/vnd.github+json' } });
  return { gesamt: d.total_count, repos: (d.items || []).map((r) => ({ name: r.full_name, sterne: r.stargazers_count, beschreibung: kurz(r.description, 200), link: r.html_url, sprache: r.language, aktualisiert: r.pushed_at })) };
}

async function hackerNews({ suche, limit }) {
  const d = await hole(`https://hn.algolia.com/api/v1/search?query=${q(suche || '')}&tags=story&hitsPerPage=${zahl(limit, 10, 1, 30)}`);
  return (d.hits || []).map((h) => ({ titel: h.title, punkte: h.points, kommentare: h.num_comments, link: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, datum: h.created_at }));
}

async function arxiv({ suche, limit }) {
  const xml = await hole(`https://export.arxiv.org/api/query?search_query=all:${q(suche)}&max_results=${zahl(limit, 8, 1, 25)}&sortBy=submittedDate&sortOrder=descending`, { text: true });
  return eintraege(xml, 'entry').map((e) => ({ titel: e.titel, link: e.link, datum: e.datum, zusammenfassung: e.text }));
}

// Weltweite Nachrichten: Google-News-RSS in jeder Sprache/Region.
async function nachrichten({ suche, sprache: s, land }) {
  const l = sprache(s);
  const g = String(land || (l === 'en' ? 'US' : l.toUpperCase())).toUpperCase().slice(0, 2);
  const xml = await hole(`https://news.google.com/rss/search?q=${q(suche)}&hl=${l}&gl=${g}&ceid=${g}:${l}`, { text: true });
  return eintraege(xml, 'item').slice(0, 15).map(({ titel, link, datum }) => ({ titel, link, datum }));
}

async function bildGenerieren({ beschreibung, breite, hoehe }) {
  const url = `https://image.pollinations.ai/prompt/${q(beschreibung)}?width=${zahl(breite, 1024, 256, 2048)}&height=${zahl(hoehe, 1024, 256, 2048)}&nologo=true&seed=${Math.floor(Math.random() * 1e9)}`;
  return { bild_url: url, hinweis: 'Kostenlos ueber Pollinations; das Bild entsteht beim ersten Aufruf der URL (10-60 s).' };
}

async function textGenerieren({ anweisung }) {
  const prompt = String(anweisung).slice(0, 8000);
  for (let versuch = 0; versuch < 2; versuch++) {
    try {
      const d = await hole('https://text.pollinations.ai/openai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'openai-fast', messages: [{ role: 'user', content: prompt }] }) });
      const text = d?.choices?.[0]?.message?.content || '';
      if (text) return { text, modell: 'Pollinations openai-fast (kostenlos)' };
    } catch {
      /* zweiter Weg unten */
    }
  }
  try {
    const text = await hole(`https://text.pollinations.ai/${q(prompt.slice(0, 1500))}`, { text: true });
    if (text && !/reached its budget|enough credits|pollinations\.ai\/(pricing|pay)/i.test(text)) return { text: text.slice(0, MAX_TEXT), modell: 'Pollinations (kostenlos)' };
  } catch {
    /* Rueckfall auf die kostenlose KI-Kette */
  }
  return { text: String(await askKI(prompt, { maxTokens: 1500 })).slice(0, MAX_TEXT), modell: 'kostenlose KI-Kette (LLM7)' };
}

async function uhrzeit({ zeitzone }) {
  const tz = String(zeitzone || 'Europe/Berlin');
  const jetzt = new Date();
  return { zeitzone: tz, ortszeit: new Intl.DateTimeFormat('de-DE', { timeZone: tz, dateStyle: 'full', timeStyle: 'long' }).format(jetzt), utc: jetzt.toISOString() };
}

async function qrCode({ inhalt, groesse }) {
  const g = zahl(groesse, 300, 100, 1000);
  return { qr_bild_url: `https://api.qrserver.com/v1/create-qr-code/?size=${g}x${g}&data=${q(String(inhalt).slice(0, 900))}` };
}

// Ersatz fuer tote MCPs: sucht im eigenen Katalog (mcp-hub) Alternativen, die laut Live-Check antworten.
let katalog = null;
function ladeKatalog() {
  if (katalog) return katalog;
  const basis = new URL('../mcp-hub/', import.meta.url);
  const c = JSON.parse(readFileSync(new URL('catalog.json', basis), 'utf8'));
  const live = existsSync(new URL('live.json', basis)) ? JSON.parse(readFileSync(new URL('live.json', basis), 'utf8')).server || {} : {};
  const analyse = existsSync(new URL('analyse.json', basis)) ? JSON.parse(readFileSync(new URL('analyse.json', basis), 'utf8')).e || {} : {};
  // Unklare (0) und stark auffaellige (3) Server laut Paket-Analyse nie vorschlagen.
  const schluessel = (s) => (s.p?.startsWith('npm:') ? s.p : s.p?.startsWith('pypi:') ? `pypi:${s.p.slice(5).toLowerCase()}` : ((m) => (m ? `gh:${m[1]}/${m[2].replace(/\.git$/i, '')}`.toLowerCase() : null))((s.r || '').match(/github\.com\/([^/\s#?]+)\/([^/\s#?]+)/i)));
  katalog = { server: (c.server || []).filter((s) => ![0, 3].includes(analyse[schluessel(s)]?.[0])), live };
  return katalog;
}
async function mcpErsatz({ suche, nur_ohne_key, limit }) {
  const { server, live } = ladeKatalog();
  const woerter = String(suche || '').toLowerCase().split(/\s+/).filter(Boolean);
  const STATUS = { 0: 'tot', 1: 'antwortet', 2: 'Login noetig', 3: 'nicht pruefbar' };
  const treffer = server
    .map((s) => ({ s, punkte: woerter.reduce((p, w) => p + (`${s.n} ${s.id || ''} ${s.d || ''}`.toLowerCase().includes(w) ? 1 : 0), 0), st: s.u ? live[s.u]?.[0] : undefined }))
    .filter((x) => x.punkte > 0 && x.st !== 0 && (!nur_ohne_key || x.s.k === 0))
    .sort((a, b) => (b.st === 1) - (a.st === 1) || b.punkte - a.punkte || (b.s.s || 0) - (a.s.s || 0))
    .slice(0, zahl(limit, 10, 1, 30))
    .map(({ s, st }) => ({ name: s.n, kategorie: s.c, beschreibung: s.d || '', status: st === undefined ? 'nicht live geprueft (Paket/Repo)' : STATUS[st], ohneKey: s.k === 0, repo: s.r || '', remote: s.u || '', paket: s.p || '' }));
  return { katalog: server.length, treffer, hinweis: 'Tote Server (Live-Check) sind ausgeblendet. Fremde Server vor Nutzung selbst pruefen.' };
}

const T = (name, description, properties, required, fn) => ({ name, description, inputSchema: { type: 'object', properties, required }, fn });
const S = (description) => ({ type: 'string', description });
const N = (description) => ({ type: 'number', description });

export { hole, q, kurz, zahl, sprache, htmlZuText, textGenerieren, T, S, N, UA };

export const WERKZEUGE = [
  T('web_suche', 'Websuche ohne Key: DuckDuckGo-Sofortantwort plus Wikipedia-Treffer in jeder Sprache.', { suche: S('Suchbegriff'), sprache: S('Sprachcode, z. B. de, en, fr, ja (Standard de)') }, ['suche'], webSuche),
  T('webseite_lesen', 'Liest eine oeffentliche https-Webseite und gibt den Text zurueck (max. 20.000 Zeichen).', { url: S('https-Adresse') }, ['url'], webseiteLesen),
  T('wikipedia', 'Zusammenfassung eines Wikipedia-Artikels in jeder Sprache.', { titel: S('Artikeltitel'), sprache: S('Sprachcode (Standard de)') }, ['titel'], wikipedia),
  T('nachrichten', 'Aktuelle Nachrichten weltweit zu einem Thema (Google News RSS) in jeder Sprache/Region.', { suche: S('Thema'), sprache: S('Sprachcode, z. B. de, en, es'), land: S('Laendercode, z. B. DE, US, JP') }, ['suche'], nachrichten),
  T('wetter', 'Aktuelles Wetter und Vorhersage fuer einen Ort (Open-Meteo).', { ort: S('Ort, z. B. Berlin'), tage: N('Vorhersagetage 1-16') }, ['ort'], wetter),
  T('ort_suchen', 'Findet Orte/Adressen weltweit mit Koordinaten (OpenStreetMap).', { ort: S('Adresse oder Ort'), limit: N('max. Treffer') }, ['ort'], ortSuchen),
  T('krypto_preise', 'Krypto-Preise, 24h-Aenderung und Marktkapitalisierung (CoinGecko).', { coins: S('CoinGecko-IDs, z. B. bitcoin,ethereum,solana'), waehrung: S('z. B. eur, usd') }, [], kryptoPreise),
  T('waehrung_umrechnen', 'Waehrungen umrechnen mit EZB-Kursen.', { betrag: N('Betrag'), von: S('z. B. EUR'), nach: S('z. B. USD,TRY,JPY') }, ['betrag'], waehrungUmrechnen),
  T('aktien_kurs', 'Aktueller Aktien-/Index-/Krypto-Kurs (Yahoo Finance), z. B. AAPL, SAP.DE, ^GDAXI, BTC-EUR.', { symbol: S('Boersensymbol') }, ['symbol'], aktienKurs),
  T('feiertage', 'Gesetzliche Feiertage eines Landes und Jahres.', { land: S('Laendercode, z. B. DE, TR, US'), jahr: N('Jahr') }, [], feiertage),
  T('land_info', 'Infos zu einem Land: Hauptstadt, Einwohner, Sprachen, Waehrung, Zeitzonen.', { land: S('Landname (englisch), z. B. Germany') }, ['land'], landInfo),
  T('woerterbuch', 'Englisches Woerterbuch: Bedeutungen und Lautschrift.', { wort: S('englisches Wort') }, ['wort'], woerterbuch),
  T('github_suche', 'Sucht oeffentliche GitHub-Repositories nach Sternen sortiert.', { suche: S('Suchbegriff'), limit: N('max. Treffer') }, ['suche'], githubSuche),
  T('hacker_news', 'Sucht Hacker-News-Beitraege.', { suche: S('Suchbegriff'), limit: N('max. Treffer') }, [], hackerNews),
  T('arxiv_suche', 'Neueste wissenschaftliche Papers auf arXiv.', { suche: S('Suchbegriff'), limit: N('max. Treffer') }, ['suche'], arxiv),
  T('bild_generieren', 'Erzeugt ein KI-Bild kostenlos (Pollinations) und gibt die Bild-URL zurueck.', { beschreibung: S('Bildbeschreibung (englisch am besten)'), breite: N('Pixel'), hoehe: N('Pixel') }, ['beschreibung'], bildGenerieren),
  T('text_generieren', 'Kostenlose KI-Textgenerierung (Pollinations openai-fast).', { anweisung: S('Aufgabe/Prompt') }, ['anweisung'], textGenerieren),
  T('uhrzeit', 'Aktuelle Uhrzeit in einer Zeitzone.', { zeitzone: S('IANA-Zeitzone, z. B. Europe/Berlin, Asia/Tokyo') }, [], uhrzeit),
  T('qr_code', 'Erzeugt einen QR-Code als Bild-URL.', { inhalt: S('Text oder Link'), groesse: N('Pixel') }, ['inhalt'], qrCode),
  T('mcp_ersatz', 'Findet fuer ein Thema funktionierende MCP-Server aus dem eigenen Katalog (88.000+) - tote Server laut Live-Check werden ausgeblendet.', { suche: S('Thema, z. B. "stripe payments", "youtube"'), nur_ohne_key: { type: 'boolean', description: 'nur Server ohne Key-Pflicht' }, limit: N('max. Treffer') }, ['suche'], mcpErsatz),
];
