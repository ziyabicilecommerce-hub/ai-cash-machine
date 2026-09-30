// Gedaechtnis fuer den Welt-Bot (#96): Skripte und Uebersetzungen werden einmal von der Gratis-KI
// erzeugt und danach wiederverwendet (welt-cache/*.json im Repo). So braucht der Welt-Bot nach ein
// paar Tagen kaum noch KI-Anfragen - vorher waren es ~2.100 Uebersetzungen pro Tag, mehr als jedes
// Gratis-Kontingent hergibt. Neue Bilder gibt es trotzdem taeglich (Tages-Seed fuer den Hintergrund).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const CACHE_DIR = 'welt-cache';
const lesen = (datei, leer) => { try { return JSON.parse(readFileSync(datei, 'utf8')); } catch { return leer; } };
const schreiben = (datei, daten) => { mkdirSync(dirname(datei), { recursive: true }); writeFileSync(datei, JSON.stringify(daten)); };

// Schluessel eines deutschen Skripts: aendert sich der Text, wird neu uebersetzt.
export const schluessel = (sk) => createHash('sha1').update(JSON.stringify([sk.titel, sk.hook || '', sk.caption, sk.szenen.map((s) => s.text)])).digest('hex').slice(0, 16);

// Deutsche Skripte je Produkt (bzw. Top-5 je Shop): {id: {erstellt: ms, skripte: [...]}}
export const skripteLaden = () => lesen(join(CACHE_DIR, 'skripte.json'), {});
export const skripteSpeichern = (daten, basis = '.') => schreiben(join(basis, CACHE_DIR, 'skripte.json'), daten);

// Uebersetzungen einer Sprache: {schluessel: {titel, hook, caption, saetze}}
export const uebersetzungenLaden = (sprache) => lesen(join(CACHE_DIR, `${sprache}.json`), {});
export function uebersetzungenSpeichern(sprache, daten, gueltig, basis = '.') {
  // Nur Eintraege fuer Skripte behalten, die noch im Umlauf sind - die Datei waechst nicht endlos.
  const sauber = Object.fromEntries(Object.entries(daten).filter(([k]) => gueltig.has(k)));
  schreiben(join(basis, CACHE_DIR, `${sprache}.json`), sauber);
}

// Setzt eine gespeicherte Uebersetzung auf ein deutsches Skript (Fotos, Preis, Link bleiben).
export function anwenden(sk, t, kurzHook) {
  if (!t || !Array.isArray(t.saetze) || t.saetze.length !== sk.szenen.length) return null;
  return { ...sk, titel: String(t.titel || sk.titel).slice(0, 120), hook: kurzHook(t.hook || t.titel || sk.titel), caption: String(t.caption || sk.caption).slice(0, 2000), szenen: sk.szenen.map((x, j) => ({ ...x, text: String(t.saetze[j]).slice(0, 400) })) };
}
export const auszug = (sk) => ({ titel: sk.titel, hook: sk.hook || '', caption: sk.caption, saetze: sk.szenen.map((x) => x.text) });
export const vorhanden = () => existsSync(CACHE_DIR);
