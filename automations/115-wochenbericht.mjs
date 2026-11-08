// Wochenbericht (#115): läuft nach jedem Zahlen-Abruf (#103) mit. Schreibt den Verlauf fort und erstellt den Bericht
// für die App (automations-dashboard/tiktok/wochenbericht.json). Ohne Schlüssel, ohne Netz - liest nur Dateien.
import { readFileSync, writeFileSync } from 'node:fs';
import { verlaufMischen, bericht, vorrat, sprachTest } from './lib/wochenbericht.mjs';
import { SKRIPTE_EN } from './schatten/skripteEn.mjs';
import { slug } from './schatten/videobot.mjs';
import { alleSkripte, passt } from './schatten/skriptBot.mjs';
import { abSchluessel } from './lib/bufferVerteiler.mjs';

const ORDNER = 'automations-dashboard/tiktok';
const json = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };

const verlauf = verlaufMischen(json(`${ORDNER}/verlauf.json`, []), json(`${ORDNER}/daten.json`, {}).letzte || []);
const skripte = alleSkripte();
const musterVon = (p) => skripte.find((s) => passt(p, s))?.muster || '';
const varianten = json('buffer-verteiler/varianten.json', {});
const varianteVon = (p) => varianten[abSchluessel(p.text)] || null;  // Schlüssel = die ersten 40 Zeichen des Hooks
const b = bericht(verlauf, Date.now(), musterVon, varianteVon);
// Sprach-Test YouTube: englisch = passt zu einer englischen Geschichte (beide Hooks); Zeitraum wie der Bericht (reif, 7 Tage)
const reif = verlauf.filter((p) => { const a = Date.now() - new Date(p.zeit); return a >= 864e5 && a < 8 * 864e5; });
b.sprachTest = sprachTest(reif, (p) => SKRIPTE_EN.some((s) => passt(p, s)) || /\b(the|you|your|my|is)\b/i.test(String(p.text || '')));
if (b.sprachTest.de.n >= 4 && b.sprachTest.en.n >= 4) {
  const { de, en } = b.sprachTest;
  b.schritte.push(`Sprach-Test YouTube: Deutsch Ø ${de.schnitt} (${de.n}) · Englisch Ø ${en.schnitt} (${en.n})${en.schnitt >= 1.5 * Math.max(de.schnitt, 1) ? ' - Englisch gewinnt, bekommt jetzt 85 %.' : de.schnitt >= 1.5 * Math.max(en.schnitt, 1) ? ' - Deutsch gewinnt, bekommt jetzt 85 %.' : ' - noch kein klarer Sieger.'}`);
}
const gepostet = Object.values(json('buffer-verteiler/stand.json', {})).flatMap((k) => Object.keys(k || {}));
// Verbrauch pro Tag: Deutsch = desk.rebel + purivelle (je bis 6); Englisch = YouTube (bis 8, davon ~85 % Englisch)
b.vorrat = { de: vorrat(skripte.map((x) => slug(x.titel)), gepostet, 12), en: vorrat(SKRIPTE_EN.map((x) => slug(x.titel)), gepostet, 7) };
for (const [sprache, v] of Object.entries(b.vorrat)) {
  if (v.tage < 4) b.schritte.unshift(`⚠️ Geschichten-Vorrat ${sprache === 'de' ? 'Deutsch' : 'Englisch'}: nur noch ${v.rest} (≈ ${v.tage} Tage). Neue Muster bestellen oder GEMINI_API_KEY eintragen.`);
}
writeFileSync(`${ORDNER}/verlauf.json`, `${JSON.stringify(verlauf)}\n`);
writeFileSync(`${ORDNER}/wochenbericht.json`, `${JSON.stringify(b, null, 1)}\n`);
console.log(`[115] Verlauf: ${verlauf.length} Posts · Woche: ${b.gesamt.posts} Posts, ${b.gesamt.aufrufe} Aufrufe`);
for (const s of b.schritte) console.log(`  - ${s}`);
