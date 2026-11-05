// Wochenbericht (#115): läuft nach jedem Zahlen-Abruf (#103) mit. Schreibt den Verlauf fort und erstellt den Bericht
// für die App (automations-dashboard/tiktok/wochenbericht.json). Ohne Schlüssel, ohne Netz - liest nur Dateien.
import { readFileSync, writeFileSync } from 'node:fs';
import { verlaufMischen, bericht } from './lib/wochenbericht.mjs';
import { alleSkripte } from './schatten/skriptBot.mjs';
import { abSchluessel } from './lib/bufferVerteiler.mjs';

const ORDNER = 'automations-dashboard/tiktok';
const json = (p, d) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return d; } };

const verlauf = verlaufMischen(json(`${ORDNER}/verlauf.json`, []), json(`${ORDNER}/daten.json`, {}).letzte || []);
const skripte = alleSkripte();
const musterVon = (p) => skripte.find((s) => String(p.text || '').includes(s.hook.slice(0, 40)))?.muster || '';
const varianten = json('buffer-verteiler/varianten.json', {});
const varianteVon = (p) => varianten[abSchluessel(p.text)] || null;  // Schlüssel = die ersten 40 Zeichen des Hooks
const b = bericht(verlauf, Date.now(), musterVon, varianteVon);
writeFileSync(`${ORDNER}/verlauf.json`, `${JSON.stringify(verlauf)}\n`);
writeFileSync(`${ORDNER}/wochenbericht.json`, `${JSON.stringify(b, null, 1)}\n`);
console.log(`[115] Verlauf: ${verlauf.length} Posts · Woche: ${b.gesamt.posts} Posts, ${b.gesamt.aufrufe} Aufrufe`);
for (const s of b.schritte) console.log(`  - ${s}`);
