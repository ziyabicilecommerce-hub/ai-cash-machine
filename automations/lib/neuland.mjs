// NEULAND-Bruecke: die 19 NEULAND-Rechner (neuland/*.html) rechnen mit ECHTEN Daten der Cash Machine -
// derselbe Rechenmotor wie im Browser (neuland/motor-*.js), hier in Node per vm geladen.
// Geldrechner mit Bestellungen laufen im Browser (Zentrale), weil Bestellungen nie ins oeffentliche Repo gehen.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function motorenLaden(ordner = 'neuland') {
  const ctx = { window: {}, console, URL, URLSearchParams, Intl, structuredClone };
  vm.createContext(ctx);
  for (const m of ['motor-geld', 'motor-belege', 'motor-tests']) vm.runInContext(readFileSync(`${ordner}/${m}.js`, 'utf8'), ctx, { filename: `${m}.js` });
  return ctx.window.NeulandTools;
}

// Belegprobe/Belegschulden: jede Werbeaussage (Video-Titel) der letzten 14 Tage mit Beleg-Link zum Produkt;
// "geprueft" = Werbe-Check hat nichts gesperrt.
export function belegeEingabe(feed, gesperrt = new Set(), { jetzt = Date.now(), tage = 14 } = {}) {
  const gesehen = new Set();
  const claims = [];
  for (const v of feed || []) {
    if ((v.sprache || 'de') !== 'de' || v.kanal || !(jetzt - Date.parse(v.erstellt || 0) < tage * 864e5)) continue;
    const text = String(v.titel || '').trim();
    if (!text || gesehen.has(text)) continue;
    gesehen.add(text);
    const beleg = String(v.caption || '').match(/https:\/\/\S+\/products\/[^\s?]+/)?.[0] || String(v.caption || '').match(/https:\/\/(www\.)?(deskrebel|purivelle)\.store[^\s?]*/)?.[0] || '';
    if (!beleg) continue; // nur Werbung (Videos mit Shop-Link) - Anime-Folgen und Entspannungsvideos machen keine Werbeaussagen
    claims.push({ text: text.slice(0, 200), evidence_url: beleg, verified: !gesperrt.has(v.datei) });
  }
  return { claims: claims.slice(0, 80) };
}

// Rechtebuch/Rechtekalender: alle Bausteine, aus denen die Videos bestehen - ehrlich nach Lizenzlage.
// permission:false = vor kommerzieller Nutzung pruefen/klaeren (keine Rechtsberatung).
export const BAUSTEINE = [
  { name: 'Produktfotos (eigene Shopify-Shops)', license: 'Eigene Produktbilder der Shops', permission: true, expires: '' },
  { name: 'Schrift DejaVu Sans', license: 'Freie Lizenz (Bitstream Vera / Public Domain)', permission: true, expires: '' },
  { name: 'Hintergrund-Musik und Effekte (mit ffmpeg erzeugt)', license: 'Selbst erzeugt, keine fremde Musik', permission: true, expires: '' },
  { name: 'Text-KI qwen2.5 (eigene KI auf GitHub)', license: 'Apache-2.0', permission: true, expires: '' },
  { name: 'KI-Bilder (Pollinations / flux)', license: 'Nutzungsbedingungen Pollinations - kommerzielle Nutzung prüfen', permission: false, expires: '' },
  { name: 'KI-Stimmen (edge-tts / Microsoft)', license: 'Inoffizieller Zugang zu Microsoft-Stimmen - kommerzielle Nutzung klären', permission: false, expires: '' },
  { name: 'Moderatorin-Lippensync (Wav2Lip-Modell)', license: 'Wav2Lip: nur nicht-kommerzielle Forschung erlaubt', permission: false, expires: '' },
];
export const rechteEingabe = (datum = new Date().toISOString().slice(0, 10)) => ({ analysis_date: datum, assets: BAUSTEINE });

// Vorhabenwaage: deine offenen Aufgaben nach Wirkung x Vertrauen / Aufwand (Erfahrungswerte, Stunden-Aufwand 1-5).
const KANAL_WERT = {
  TikTok: [10, 0.6, 5], Instagram: [9, 0.7, 4], YouTube: [9, 0.7, 4], Facebook: [7, 0.7, 3], Pinterest: [6, 0.6, 3], Telegram: [5, 0.9, 1],
  Bluesky: [4, 0.8, 1], Discord: [4, 0.8, 1], X: [5, 0.5, 4], Threads: [5, 0.6, 3], LinkedIn: [5, 0.6, 3], Reddit: [4, 0.4, 2], Mastodon: [3, 0.8, 1], Tumblr: [2, 0.6, 2], Dailymotion: [2, 0.6, 2],
};
export function vorhabenEingabe(kanaele = {}, { gemini = false, pollinations = false } = {}) {
  const priorities = Object.entries(KANAL_WERT).filter(([k]) => !kanaele[k]?.verbunden).map(([k, [impact, confidence, effort]]) => ({ name: `${k} verbinden`, impact, confidence, effort }));
  if (!gemini) priorities.push({ name: 'Kostenlosen GEMINI_API_KEY eintragen (bessere Video-Texte)', impact: 8, confidence: 0.9, effort: 1 });
  if (!pollinations) priorities.push({ name: 'Kostenlosen POLLINATIONS_TOKEN eintragen (Beispiel-Szenen)', impact: 5, confidence: 0.6, effort: 1 });
  return { priorities };
}

// Versuchsfeld/Testkompass: echte Post-Zahlen. Interaktionsrate = (Likes + Kommentare + Teilen) / Aufrufe.
// Gruppen: Hook-Typen (Frage = Kontrolle) und Sprachen aus dem Welt-Bot (Deutsch = Kontrolle).
export function versucheEingabe(posts, feed = []) {
  const sprache = new Map(feed.map((v) => [v.datei, v.sprache || 'de']));
  const reif = (posts || []).filter((p) => p.zahlen && Number(p.zahlen.aufrufe) > 0);
  const summe = (l) => ({ v: l.reduce((s, p) => s + Number(p.zahlen.aufrufe), 0), c: l.reduce((s, p) => s + (Number(p.zahlen.likes) || 0) + (Number(p.zahlen.kommentare) || 0) + (Number(p.zahlen.teilen) || 0), 0) });
  const vergleiche = (gruppe, kontrolle, name) => {
    const k = summe(reif.filter((p) => gruppe(p) === kontrolle));
    return [...new Set(reif.map(gruppe))].filter((g) => g && g !== kontrolle).map((g) => {
      const x = summe(reif.filter((p) => gruppe(p) === g));
      return { name: `${name}: ${g} vs. ${kontrolle}`, control_visitors: k.v, control_conversions: Math.min(k.c, k.v), variant_visitors: x.v, variant_conversions: Math.min(x.c, x.v) };
    }).filter((e) => e.control_visitors > 0 && e.variant_visitors > 0);
  };
  return { experiments: [...vergleiche((p) => p.hookTyp || 'frage', 'frage', 'Hook'), ...vergleiche((p) => sprache.get(p.datei) || 'de', 'de', 'Sprache')] };
}

// Alle Rechner ausfuehren; ein Fehler in einem Rechner stoppt die anderen nicht.
export function allesRechnen(T, eingaben) {
  const aus = {};
  for (const [id, { eingabe, quelle }] of Object.entries(eingaben)) {
    const t = T[id];
    if (!t) continue;
    try { aus[id] = { name: t.name, beschreibung: t.description, quelle, ...t.run(structuredClone(eingabe)) }; } catch (err) { aus[id] = { name: t.name, beschreibung: t.description, quelle, fehler: String(err.message).slice(0, 200) }; }
  }
  return aus;
}
