// 3 Anfaenge pro Video: dasselbe Video mit drei verschiedenen ersten Sekunden (Frage, Warnung,
// Widerspruch). Gepostet wird je Kanal eine andere Variante (taeglich rotierend); der Leistungs-
// Sammler misst, welcher Anfang die Leute haelt, und die Fabrik nimmt kuenftig mehr davon.
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { kurzHook } from './shopProdukte.mjs';
import { lernstandLaden, waehlen } from './leistung.mjs';

export const HOOK_TYPEN = ['frage', 'warnung', 'widerspruch'];
export const anfaengeAn = () => !/^(0|nein|aus|false)$/i.test(String(process.env.VIDEO_ANFAENGE || '').trim());

export const ANFAENGE_REGEL =
  'Schreibe zusaetzlich "anfaenge": genau 3 alternative Anfaenge fuer dasselbe Video, je einer pro Typ - ' +
  '"frage" (Frage, die eine Wissensluecke oeffnet), "warnung" (Stopp/Fehler-Warnung), "widerspruch" (widerspricht dem, was fast alle glauben). ' +
  'Je Anfang: "satz" (erster gesprochener Satz, max. 8 Woerter, passt nahtlos zur zweiten Szene) und "hook" (Text-Overlay, 2-5 Woerter). ';

// Nimmt die KI-Anfaenge auf: der laut echten Zahlen staerkste Typ wird das Hauptvideo, die anderen
// beiden werden Varianten. Ohne Zahlen wird reihum ausprobiert (UCB, siehe leistung.mjs).
export function anfaengeEinbauen(skript, liste, { lernstand = lernstandLaden() } = {}) {
  if (!anfaengeAn() || !Array.isArray(liste) || skript.szenen.length < 3) return skript;
  const saetze = new Map();
  for (const a of liste) {
    const typ = String(a?.typ || '').toLowerCase();
    const satz = String(a?.satz || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (HOOK_TYPEN.includes(typ) && satz.length > 5 && !saetze.has(typ)) saetze.set(typ, { typ, satz, hook: kurzHook(a.hook || satz) });
  }
  if (saetze.size < 2) return skript;
  const alle = [...saetze.values()];
  // Noch keine echten Zahlen: Hauptvideo bleibt beim urspruenglichen Anfang (z. B. dem Labor-Hook),
  // zwei der drei Typen laufen taeglich wechselnd als Varianten mit.
  if (!Object.keys(lernstand.hookTyp || {}).length) {
    const t = Math.floor(Date.now() / 864e5);
    return { ...skript, hookTyp: 'original', anfaenge: [alle[t % alle.length], alle[(t + 1) % alle.length]].filter((a, i, l) => l.indexOf(a) === i) };
  }
  const haupt = saetze.get(waehlen([...saetze.keys()], lernstand.hookTyp)) || alle[0];
  skript.szenen[0] = { ...skript.szenen[0], text: haupt.satz };
  return { ...skript, hook: haupt.hook, hookTyp: haupt.typ, anfaenge: alle.filter((a) => a !== haupt) };
}

// Kopiert die fertigen Varianten neben das Hauptvideo: basis-frage.mp4, basis-warnung.mp4 ...
export function anfaengeAblegen(v, basis, ordner) {
  const varianten = (v.varianten || []).filter((x) => x.pfad && existsSync(x.pfad)).map((x) => {
    const datei = `${basis}-${x.typ}.mp4`;
    copyFileSync(x.pfad, join(ordner, datei));
    return { datei, hookTyp: x.typ, hook: x.hook };
  });
  return varianten.length ? { varianten } : {};
}

// Welche Datei bekommt welcher Kanal? Kanal k am Tag t -> Variante (k + t) mod n. So sieht jeder
// Kanal ueber die Tage jede Variante, und an einem Tag laufen alle Varianten parallel.
export function varianteFuer(m, kanalIndex, tag = Math.floor(Date.now() / 864e5)) {
  const alle = [{ datei: m.datei, hookTyp: m.hookTyp || '' }, ...(m.varianten || [])];
  return alle[(kanalIndex + tag) % alle.length];
}
