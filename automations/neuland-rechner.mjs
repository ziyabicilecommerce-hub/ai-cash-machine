// NEULAND-Rechner mit echten Daten (taeglich mit dem Engpass-Chef): Werbeaussagen, Lizenzen der Video-Bausteine,
// offene Aufgaben und echte Post-Zahlen (Hooks, Welt-Bot-Sprachen) -> zentrale/daten/neuland.json fuer die Zentrale.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { motorenLaden, belegeEingabe, rechteEingabe, vorhabenEingabe, versucheEingabe, allesRechnen } from './lib/neuland.mjs';
import { bericht } from './lib/werbeCheck.mjs';

const lies = (p, f) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : f; } catch { return f; } };
const ja = (k) => /^(true|1|ja)$/i.test(String(process.env[k] || '').trim());

const feed = lies('video-feed/videos.json', {}).videos || [];
const gesperrt = new Set(bericht(feed).liste.map((x) => x.datei));
const posts = lies('video-feed/posts.json', []);
const kanaele = lies('video-feed/kanaele.json', {}).kanaele || {};
const versuche = versucheEingabe(posts, feed);
const eingaben = {
  PromiseCheck: { eingabe: belegeEingabe(feed, gesperrt), quelle: 'Video-Titel der letzten 14 Tage + Werbe-Check' },
  EvidenceDebt: { eingabe: belegeEingabe(feed, gesperrt), quelle: 'Video-Titel der letzten 14 Tage + Werbe-Check' },
  RightsLedger: { eingabe: rechteEingabe(), quelle: 'Bausteine der Video-Fabrik' },
  RenewalCalendar: { eingabe: rechteEingabe(), quelle: 'Bausteine der Video-Fabrik' },
  ValueMap: { eingabe: vorhabenEingabe(kanaele, { gemini: ja('HAT_GEMINI'), pollinations: ja('HAT_POLLINATIONS') }), quelle: 'Kanal-Status + eingetragene Schlüssel' },
  ...(versuche.experiments.length ? {
    ExperimentLab: { eingabe: versuche, quelle: 'Echte Post-Zahlen (Hook-Typen, Welt-Bot-Sprachen)' },
    ExperimentSamplePlanner: { eingabe: versuche, quelle: 'Echte Post-Zahlen' },
  } : {}),
};
const T = motorenLaden();
const ergebnisse = allesRechnen(T, eingaben);
mkdirSync('zentrale/daten', { recursive: true });
writeFileSync('zentrale/daten/neuland.json', JSON.stringify({ stand: new Date().toISOString(), wartetAufZahlen: !versuche.experiments.length, ergebnisse }, null, 1) + '\n');
for (const [id, e] of Object.entries(ergebnisse)) console.log(`[neuland] ${e.name}: ${e.fehler ? `Fehler ${e.fehler}` : (e.metrics || []).slice(0, 3).map((m) => `${m.label ?? m.name ?? ''} ${m.value ?? ''}`).join(' · ')}`);
