// Trend-Radar: liest jeden Morgen die Google-Trends der letzten 24 h in Deutschland (offener RSS-Feed,
// kein Schluessel) und behaelt nur Begriffe, die zur Nische der Shops passen (Fitness, Ruecken,
// Massage, Buero ...). Die Video-Fabrik bekommt sie als Angebot - nur aufgreifen, wenn es ehrlich passt.
// Trend-Sounds werden bewusst NICHT kopiert: Musik aus fremden Videos ist urheberrechtlich geschuetzt.
import { writeFileSync, mkdirSync } from 'node:fs';

export const ZIEL = 'automations/state/trends.json';
const NISCHE = (process.env.TREND_NISCHE || 'fitness,training,workout,sport,gym,klimmzug,muskel,ruecken,rücken,nacken,schulter,haltung,massage,entspann,verspann,schmerz,yoga,pilates,dehnen,stretching,homeoffice,büro,buero,schreibtisch,wellness,schlaf,stress,abnehmen,gesund')
  .split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);

const decode = (t) => t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

export function trendsLesen(xml) {
  return [...String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const titel = decode(item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '');
    const verkehr = Number((item.match(/<ht:approx_traffic>([\d.,+]+)/)?.[1] || '0').replace(/[^\d]/g, '')) || 0;
    const news = [...item.matchAll(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/g)].map((m) => decode(m[1]));
    return { titel, verkehr, news };
  }).filter((t) => t.titel);
}

export const passt = (t, nische = NISCHE) => {
  const text = `${t.titel} ${t.news.join(' ')}`.toLowerCase();
  return nische.some((w) => text.includes(w));
};

async function main() {
  const res = await fetch('https://trends.google.com/trending/rss?geo=DE', { headers: { 'User-Agent': 'Mozilla/5.0 trend-radar' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Google Trends ${res.status}`);
  const alle = trendsLesen(await res.text());
  const passend = alle.filter((t) => passt(t)).sort((a, b) => b.verkehr - a.verkehr).map((t) => t.titel);
  mkdirSync('automations/state', { recursive: true });
  writeFileSync(ZIEL, JSON.stringify({ stand: new Date().toISOString(), quelle: 'Google Trends DE (24 h)', gesamt: alle.length, passend, top: alle.slice(0, 10).map((t) => t.titel) }, null, 1) + '\n');
  console.log(`[trend-radar] ${alle.length} Trends, ${passend.length} passen zur Nische${passend.length ? `: ${passend.slice(0, 5).join(', ')}` : ''}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((err) => { console.log(`[trend-radar] ${err.message} - Fabrik arbeitet ohne Trend-Hinweis.`); });
