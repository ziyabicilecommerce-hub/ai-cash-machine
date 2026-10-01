// Such-Radar (taeglich): echte Google- und YouTube-Suchvorschlaege je Produkt -> zentrale/daten/suchbegriffe.json.
// Die Video-Fabrik greift echte Fragen auf, die Zentrale zeigt Ideen und Hashtags. Kostenlos, ohne Schluessel.
import { readFileSync, writeFileSync } from 'node:fs';
import { ZIEL, produktRadar, handleAus } from './lib/suchRadar.mjs';

async function main() {
  const { produkte = [] } = JSON.parse(readFileSync('zentrale/daten/produkte.json', 'utf8'));
  const aus = {};
  let leer = 0;
  for (const p of produkte) {
    const r = await produktRadar(p);
    if (!r.google.length && !r.youtube.length) leer++;
    aus[handleAus(p.url)] = r;
  }
  if (produkte.length && leer === produkte.length) throw new Error('keine Vorschlaege erhalten (gesperrt oder offline) - alte Daten bleiben');
  writeFileSync(ZIEL, JSON.stringify({ stand: new Date().toISOString(), quelle: 'Google- und YouTube-Autocomplete (DE)', produkte: aus }, null, 1) + '\n');
  const f = Object.values(aus).reduce((s, x) => s + x.fragen.length, 0);
  console.log(`[such-radar] ${produkte.length} Produkte, ${f} echte Fragen gefunden`);
}

main().catch((err) => { console.log(`[such-radar] ${err.message}`); });
