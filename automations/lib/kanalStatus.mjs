// Kanal-Status fuer die Zentrale (Bereich "15 Kanäle"): welche Plattform ist verbunden, wie viele Posts
// heute, letzter Erfolg und letzter Fehler. Enthaelt KEINE Zugangsdaten - nur ja/nein und Zeitpunkte.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

export const STATUS = 'video-feed/kanaele.json';

export function statusSchreiben(liste, { pfad = STATUS, jetzt = new Date() } = {}) {
  let alt = {};
  try { alt = existsSync(pfad) ? JSON.parse(readFileSync(pfad, 'utf8')).kanaele || {} : {}; } catch { alt = {}; }
  const kanaele = {};
  for (const k of liste) {
    const a = alt[k.name] || {};
    kanaele[k.name] = {
      verbunden: k.verbunden, heute: k.heute, limit: k.limit,
      letzterErfolg: k.ok || a.letzterErfolg || null,
      letzterFehler: k.fehler ? { text: k.fehler, zeit: k.zeit } : k.ok ? null : a.letzterFehler || null,
    };
  }
  // Nur schreiben, wenn sich etwas geaendert hat - sonst entsteht jede Stunde ein leerer Commit.
  if (JSON.stringify(kanaele) === JSON.stringify(alt) && existsSync(pfad)) return kanaele;
  mkdirSync('video-feed', { recursive: true });
  writeFileSync(pfad, JSON.stringify({ stand: jetzt.toISOString(), kanaele }, null, 1) + '\n');
  return kanaele;
}
