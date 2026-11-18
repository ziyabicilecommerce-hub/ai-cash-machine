// Ideen-Labor (#118): läuft jeden Tag. Liest die Zahlen aller Horror-Kanäle (TikTok, Instagram, YouTube), sucht die
// Fehler, und wechselt nach 2 Tagen die Idee eines Kanals, wenn sie nicht besser als normal läuft (Jackpot = bleibt).
// Stand: automations-dashboard/tiktok/ideen.json (die Video-Bots lesen daraus die laufende Idee je Kanal).
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { IDEEN, KANAELE, tagAuswerten } from './lib/ideenLabor.mjs';

const DATEI = 'automations-dashboard/tiktok/ideen.json';
const json = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };
const verlauf = json('automations-dashboard/tiktok/verlauf.json', []);
const daten = json('automations-dashboard/tiktok/daten.json', {});
const labor = json(DATEI, { kanaele: {} });
const jetzt = Date.now();
const name = (id) => IDEEN.find((i) => i.id === id)?.name || id;
const zeilen = ['## 🧪 Ideen-Labor', '', '| Kanal | Idee | seit | Videos | Ø Aufrufe | normal | Sehdauer | Urteil |', '|---|---|---|---|---|---|---|---|'];
const fehlerZeilen = [];

for (const k of KANAELE) {
  const vorher = labor.kanaele[k];
  const { stand, urteil, fehler, ergeb } = tagAuswerten(vorher, verlauf, k, jetzt, daten.fehler || []);
  labor.kanaele[k] = { ...stand, fehler, letzteAuswertung: new Date(jetzt).toISOString(), ergebnis: ergeb };
  const text = { start: '🆕 Start', warten: '⏳ sammelt noch', jackpot: '🎰 JACKPOT - bleibt', 'jackpot-hält': '🎰 Jackpot hält', gewechselt: `🔄 gewechselt (vorher: ${name(vorher?.idee)})` }[urteil];
  zeilen.push(`| ${k} | ${name(stand.idee)} | ${String(stand.seit).slice(5, 10)} | ${ergeb.n} | ${ergeb.aufrufe} | ${stand.basis} | ${ergeb.sehdauer} s | ${text} |`);
  for (const f of fehler) fehlerZeilen.push(`- **${k}:** ${f}`);
}
labor.stand = new Date(jetzt).toISOString();
writeFileSync(DATEI, `${JSON.stringify(labor, null, 1)}\n`);
const bericht = [...zeilen, '', '### 🔍 Gefundene Fehler', ...(fehlerZeilen.length ? fehlerZeilen : ['- keine']), ''].join('\n');
console.log(bericht);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, bericht);
