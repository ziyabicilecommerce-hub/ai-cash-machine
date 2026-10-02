// Werbe-Check-Bericht: prueft alle Videos im Feed und schreibt zentrale/daten/werbe-check.json
// (laeuft bei jedem Seiten-Deploy - Zentrale, "Heute posten" und Bio-Seite blenden blockierte Videos aus).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { bericht } from './lib/werbeCheck.mjs';

const feed = existsSync('video-feed/videos.json') ? JSON.parse(readFileSync('video-feed/videos.json', 'utf8')).videos || [] : [];
const b = bericht(feed);
mkdirSync('zentrale/daten', { recursive: true });
writeFileSync('zentrale/daten/werbe-check.json', JSON.stringify({ stand: new Date().toISOString(), ...b }, null, 1) + '\n');
console.log(`[werbe-check] ${b.geprueft} Videos geprüft · ${b.blockiert} blockiert · ${b.hinweise} Hinweise`);
