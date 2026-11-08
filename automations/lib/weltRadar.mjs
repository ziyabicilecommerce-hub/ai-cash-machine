// Welt-Radar (#114): welche Gruselthemen steigen gerade in China, Indien, Tokio, Paris und New York - und was wird dort gesucht.
//   Gruselthemen: Wikipedia-Aufrufe in der Landessprache (zh, hi, ja, fr, en) - die passenden Artikel findet Wikipedia selbst
//                 (Sprachlinks der englischen Artikel, eine Abfrage pro Sprache)
//   Suchtrends:   Google-Trends je Land (Indien, Japan, Frankreich, New York); China blockt Google -> Baidu-Hotlist
// Die Suchtrends sind nur Info für die App (echte Nachrichten) - in Geschichten kommen nur die gefilterten Gruselthemen.
import { BEGRIFFE, anstieg } from './radarQuellen.mjs';
import { rssTitel } from './trendRadar.mjs';

export const REGIONEN = [
  { name: 'China', flagge: '🇨🇳', wiki: 'zh', baidu: true },
  { name: 'Indien', flagge: '🇮🇳', wiki: 'hi', trends: 'IN' },
  { name: 'Tokio', flagge: '🇯🇵', wiki: 'ja', trends: 'JP' },
  { name: 'Paris', flagge: '🇫🇷', wiki: 'fr', trends: 'FR' },
  { name: 'New York', flagge: '🇺🇸', wiki: 'en', trends: 'US-NY', ersatz: 'US' },
];

// Wikipedia verlangt für die Such-Schnittstelle einen Absender mit Kontakt (sonst 403) - hier die Projektseite
const KOPF = { 'user-agent': 'ai-cash-machine-trend-radar/1.0 (https://github.com/ziyabicilecommerce-hub/ai-cash-machine)', 'api-user-agent': 'ai-cash-machine-trend-radar/1.0' };
const holen = async (laden, url, art = 'json') => {
  const res = await laden(url, { headers: KOPF, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(String(res.status));
  return art === 'json' ? res.json() : res.text();
};
const tag = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
const norm = (t) => String(t).replace(/_/g, ' ').trim();

// Sprachlinks: englischer Artikel -> Artikel in der Landessprache (Weiterleitungen werden mitgenommen)
export function sprachlinksAus(d) {
  const umweg = Object.fromEntries([...(d?.query?.normalized || []), ...(d?.query?.redirects || [])].map((x) => [norm(x.from), norm(x.to)]));
  const ziel = {};
  for (const p of Object.values(d?.query?.pages || {})) { const l = p.langlinks?.[0]?.['*']; if (l) ziel[norm(p.title)] = l; }
  return (en) => { let t = norm(en); for (let i = 0; i < 3 && umweg[t]; i++) t = umweg[t]; return ziel[t] || null; };
}

// Baidu-Hotlist (China): die Antwort kommt mal flach, mal verschachtelt - beides wird gelesen
export function baiduWoerter(d) {
  const inhalt = d?.data?.cards?.[0]?.content || [];
  const liste = Array.isArray(inhalt[0]?.content) ? inhalt[0].content : inhalt;
  return liste.map((x) => String(x?.word || x?.query || '').trim()).filter(Boolean);
}

async function regionMessen(region, { laden, jetzt, begriffe }) {
  const r = { name: region.name, flagge: region.flagge, horror: [], trends: [], quelle: [] };
  // 1) Gruselthemen in der Landessprache
  try {
    let titel = (en) => norm(en);
    if (region.wiki !== 'en') {
      // in Päckchen zu 10 Titeln (kurze Adressen, ein kaputtes Päckchen kostet nicht alles)
      const finder = [];
      for (let i = 0; i < begriffe.length; i += 10) {
        try {
          finder.push(sprachlinksAus(await holen(laden, `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=langlinks&lllimit=500&lllang=${region.wiki}&titles=${encodeURIComponent(begriffe.slice(i, i + 10).map((b) => b.en).join('|'))}`)));
        } catch (e) { r.fehler = `Sprachlinks ${region.wiki}: ${e.message}`; }
      }
      titel = (en) => finder.map((f) => f(en)).find(Boolean) || null;
    }
    const ende = new Date(jetzt.getTime() - 864e5), start = new Date(jetzt.getTime() - 19 * 864e5);
    const werte = await Promise.all(begriffe.map(async (b) => {
      const lokal = titel(b.en);
      if (!lokal) return null;
      try {
        const d = await holen(laden, `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${region.wiki}.wikipedia/all-access/user/${encodeURIComponent(lokal.replace(/ /g, '_'))}/daily/${tag(start)}/${tag(ende)}`);
        const w = anstieg((d.items || []).map((x) => x.views || 0));
        return w ? { name: b.name, ...w } : null;
      } catch { return null; }
    }));
    r.horror = werte.filter(Boolean).sort((a, b) => b.anstieg - a.anstieg).slice(0, 5);
    r.gemessen = werte.filter(Boolean).length;
    r.quelle.push(`wikipedia-${region.wiki}`);
  } catch (e) { r.fehler = `Wikipedia ${region.wiki}: ${e.message}`; }
  // 2) Was dort gerade gesucht wird
  try {
    if (region.baidu) {
      r.trends = baiduWoerter(await holen(laden, 'https://top.baidu.com/api/board?platform=wise&tab=realtime')).slice(0, 5);
      r.quelle.push('baidu');
    } else {
      let t = rssTitel(await holen(laden, `https://trends.google.com/trending/rss?geo=${region.trends}`, 'text').catch(() => ''));
      if (!t.length && region.ersatz) t = rssTitel(await holen(laden, `https://trends.google.com/trending/rss?geo=${region.ersatz}`, 'text').catch(() => ''));
      r.trends = t.slice(0, 5);
      if (t.length) r.quelle.push('google-trends');
    }
  } catch { /* ohne Suchtrends */ }
  return r;
}

export async function weltRadar({ laden = fetch, jetzt = new Date(), begriffe = BEGRIFFE, regionen = REGIONEN } = {}) {
  const aus = [];  // Regionen nacheinander (je Region 30 Abrufe parallel) - schont die Wikipedia-Server
  for (const reg of regionen) aus.push(await regionMessen(reg, { laden, jetzt, begriffe }));
  return aus;
}

// Welches Gruselthema steigt in den meisten Regionen? (Anstieg >= 1.2) -> weltweiter Trend, gut für den englischen Kanal
export function weltweitHeiss(welt = []) {
  const zaehler = {};
  for (const r of welt) for (const h of r.horror || []) if (h.anstieg >= 1.2) (zaehler[h.name] ||= []).push(r.name);
  return Object.entries(zaehler).map(([name, wo]) => ({ name, wo })).sort((a, b) => b.wo.length - a.wo.length);
}
