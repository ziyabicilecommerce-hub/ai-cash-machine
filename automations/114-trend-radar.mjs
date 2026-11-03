// Trend-Radar (#114): holt täglich, was gerade gefragt ist (Google-Trends DE, nur harmlose Alltagsthemen; Reddit-Horror
// nur als Stimmung; sonst Saison-Kalender) und lässt die lokale Gratis-KI daraus neue Horror-Geschichten schreiben.
// Die geprüften Geschichten kommen in den Videobot-Vorrat (automations-dashboard/tiktok/skripte.json) - Autopilot,
// Instagram-Verteiler und Fortsetzungen nutzen sie automatisch. Übersicht: automations-dashboard/tiktok/trends.json
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { rssTitel, redditTitel, themenHeute } from './lib/trendRadar.mjs';
import { neueGeschichte } from './schatten/horrorKi.mjs';
import { kiJson } from './lib/kiJson.mjs';
import { slug } from './schatten/videobot.mjs';

const SKRIPTE = 'automations-dashboard/tiktok/skripte.json';
const TRENDS = 'automations-dashboard/tiktok/trends.json';
const ANZAHL = Math.min(Math.max(parseInt(process.env.TREND_ANZAHL || '3', 10) || 3, 1), 6);
const bericht = (z) => { console.log(z); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${z}\n`); };

async function holen(url, art) {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (trend-radar; +github actions)' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(String(res.status));
    return art === 'json' ? await res.json() : await res.text();
  } catch (e) { console.log(`[114] ${new URL(url).hostname}: ${e.message} - weiter ohne`); return null; }
}

async function main() {
  const trends = rssTitel(await holen('https://trends.google.de/trending/rss?geo=DE', 'text') || '');
  const reddit = [...redditTitel(await holen('https://www.reddit.com/r/creepypasta/top.json?t=week&limit=15', 'json')),
    ...redditTitel(await holen('https://www.reddit.com/r/nosleep/top.json?t=week&limit=15', 'json'))];
  const themen = themenHeute({ trends, reddit, anzahl: ANZAHL });
  const daten = JSON.parse(readFileSync(SKRIPTE, 'utf8'));
  const bekannt = daten.skripte.map((s) => slug(s.titel));
  bericht(`### 📈 Trend-Radar: ${trends.length} Google-Trends, ${reddit.length} Reddit-Titel gelesen`);
  const neu = [];
  for (const t of themen) {
    const s = await neueGeschichte(kiJson, bekannt, { thema: t.thema, inspiration: t.inspiration });
    if (!s || bekannt.includes(slug(s.titel))) { bericht(`- ⚠️ ${t.thema}: keine gute Geschichte (Hook zu schwach oder KI aus)`); continue; }
    const eintrag = { ...s, trend: t.thema, quelle: t.quelle, erstellt: new Date().toISOString().slice(0, 10) };
    daten.skripte.push(eintrag); bekannt.push(slug(s.titel)); neu.push(eintrag);
    bericht(`- ✅ ${t.thema} → „${s.titel}“: ${s.hook}`);
  }
  if (neu.length) writeFileSync(SKRIPTE, `${JSON.stringify(daten, null, 1)}\n`);
  writeFileSync(TRENDS, `${JSON.stringify({ stand: new Date().toISOString(), themen, neu: neu.map((s) => ({ titel: s.titel, hook: s.hook, trend: s.trend, quelle: s.quelle })) }, null, 1)}\n`);
  bericht(`${neu.length} neue Geschichten im Vorrat (jetzt ${daten.skripte.length}).`);
}

main().catch((e) => { console.error(`[114-trend-radar] ${String(e.message).slice(0, 300)}`); process.exit(1); });
