// Shop-Doktor: prueft die LIVE-Shops nur mit oeffentlichen Daten (products.json + Produktseiten) -
// kein Shopify-Schluessel noetig. Jeder Befund ist eine echte Messung, nichts wird geschaetzt.
// Stufen: kritisch (kostet Verkaeufe oder Abmahnrisiko), wichtig (kostet Sichtbarkeit), tipp.

export const PUNKTE = { kritisch: 15, wichtig: 5, tipp: 1 };
const text = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const befund = (stufe, was, tipp = '') => ({ stufe, was, tipp });

// Werbeaussagen, die nach Heilmittelwerbegesetz/UWG schnell abgemahnt werden (Massage-/Fitnessprodukte!).
const RISKANT = [
  [/\bheilt\b|\bheilen\b|\bheilung\b/i, '"heilt/Heilung"'],
  [/schmerzfrei\b.*\bgarantiert|garantiert\b.*\bschmerzfrei/i, '"garantiert schmerzfrei"'],
  [/klinisch (bewiesen|getestet|erwiesen)/i, '"klinisch bewiesen"'],
  [/\b100\s?% (wirksam|erfolg|garantie)/i, '"100 % wirksam/Erfolg"'],
  [/ärztlich empfohlen|von ärzten empfohlen|aerztlich empfohlen/i, '"ärztlich empfohlen"'],
  [/\b(bandscheibenvorfall|arthrose|ischias|rheuma)\b.*\b(hilft|behandelt|lindert)\b|\b(hilft|behandelt|lindert)\b.*\b(bandscheibenvorfall|arthrose|ischias|rheuma)\b/i, 'Krankheit + Wirkversprechen'],
];

export function produktPruefen(p, { titelDoppelt = false } = {}) {
  const b = [];
  const bilder = p.images || [];
  const beschreibung = text(p.body_html);
  const woerter = beschreibung ? beschreibung.split(' ').length : 0;
  const varianten = p.variants || [];
  if (!bilder.length) b.push(befund('kritisch', 'Kein Produktbild', 'Ohne Bild kauft niemand und Google Shopping lehnt das Produkt ab.'));
  else if (bilder.length < 3) b.push(befund('tipp', `Nur ${bilder.length} Bild(er)`, 'Mindestens 3-5 Bilder: Detail, Anwendung, Größe/Maße.'));
  const ohneAlt = bilder.filter((x) => !String(x.alt || '').trim()).length;
  if (ohneAlt) b.push(befund('tipp', `${ohneAlt} Bild(er) ohne Alt-Text`, 'Alt-Texte helfen bei Google Bilder und Barrierefreiheit.'));
  if (!woerter) b.push(befund('kritisch', 'Keine Produktbeschreibung', 'Ohne Text keine Google-Treffer und keine Kaufgründe.'));
  else if (woerter < 80) b.push(befund('wichtig', `Beschreibung sehr kurz (${woerter} Wörter)`, '150-300 Wörter mit Nutzen, Maßen, Material, Lieferumfang.'));
  const titel = String(p.title || '');
  if (titel.length > 70) b.push(befund('tipp', `Titel lang (${titel.length} Zeichen)`, 'Google zeigt ca. 60-70 Zeichen - das Wichtigste nach vorne.'));
  if (titelDoppelt) b.push(befund('wichtig', 'Titel kommt im Shop doppelt vor', 'Doppelte Titel konkurrieren bei Google gegeneinander.'));
  if (varianten.length && varianten.every((v) => v.available === false)) b.push(befund('wichtig', 'Ausverkauft (alle Varianten)', 'Nachbestellen oder ausblenden - Werbung darauf verbrennt Geld.'));
  if (varianten.some((v) => !(Number(v.price) > 0))) b.push(befund('kritisch', 'Variante mit Preis 0 €', 'Preis setzen, sonst wird verschenkt oder der Checkout bricht.'));
  const falsch = varianten.filter((v) => Number(v.compare_at_price) > 0 && Number(v.compare_at_price) <= Number(v.price));
  if (falsch.length) b.push(befund('wichtig', 'Streichpreis ist nicht höher als der Preis', 'Streichpreis entfernen oder korrigieren.'));
  if (varianten.some((v) => Number(v.compare_at_price) > Number(v.price))) b.push(befund('tipp', 'Streichpreis aktiv - Preisangabenverordnung beachten', 'Bezugspreis muss der niedrigste Preis der letzten 30 Tage sein (§ 11 PAngV), sonst Abmahnrisiko.'));
  if (!String(p.product_type || '').trim()) b.push(befund('tipp', 'Produktart fehlt', 'Hilft Google Shopping bei der Einordnung.'));
  if (!(Array.isArray(p.tags) ? p.tags.length : String(p.tags || '').trim())) b.push(befund('tipp', 'Keine Tags', 'Tags für Filter, Sammlungen und Suche setzen.'));
  for (const [re, name] of RISKANT) if (re.test(`${titel} ${beschreibung}`)) b.push(befund('wichtig', `Riskante Werbeaussage: ${name}`, 'Heilversprechen sind für Massage-/Fitnessprodukte abmahngefährdet (HWG/UWG) - neutral formulieren.'));
  return b;
}

// Produktseite (HTML) - was Google und Social-Plattformen beim Teilen sehen.
export function seitePruefen({ status, ms, html }) {
  const b = [];
  if (status !== 200) return [befund('kritisch', `Seite nicht erreichbar (HTTP ${status || 'Fehler'})`, 'Link prüfen - Besucher landen im Nichts.')];
  if (ms > 3000) b.push(befund('wichtig', `Lädt langsam (${(ms / 1000).toFixed(1)} s)`, 'Bilder verkleinern, Apps entfernen - jede Sekunde kostet Käufe.'));
  const h = String(html || '');
  const titel = h.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '';
  if (!titel) b.push(befund('wichtig', 'Kein Seitentitel (<title>)', 'Seitentitel in Shopify unter "Suchmaschinen-Eintrag" setzen.'));
  if (!/<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(h)) b.push(befund('wichtig', 'Keine Meta-Beschreibung', 'Unter "Suchmaschinen-Eintrag" 140-160 Zeichen mit Nutzen + Preis.'));
  if (!/<meta[^>]+property=["']og:image["']/i.test(h)) b.push(befund('tipp', 'Kein Vorschaubild für Social (og:image)', 'Beim Teilen auf WhatsApp/Facebook erscheint sonst kein Bild.'));
  const jsonld = [...h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join(' ');
  if (!/"@type"\s*:\s*"Product"/.test(jsonld)) b.push(befund('wichtig', 'Keine Produkt-Daten für Google (JSON-LD)', 'Ohne strukturierte Daten keine Preis-/Sterne-Anzeige in Google.'));
  else if (!/"offers"/.test(jsonld)) b.push(befund('wichtig', 'Produkt-Daten ohne Preis/Verfügbarkeit (offers)', 'Theme aktualisieren oder JSON-LD ergänzen.'));
  return b;
}

// Pflichtseiten fuer Online-Shops in Deutschland (fehlen sie, drohen Abmahnungen).
export const PFLICHT = [
  ['Impressum', ['/policies/legal-notice', '/pages/impressum']],
  ['Widerrufsbelehrung', ['/policies/refund-policy', '/pages/widerruf', '/pages/widerrufsbelehrung']],
  ['Datenschutzerklärung', ['/policies/privacy-policy', '/pages/datenschutz']],
  ['AGB', ['/policies/terms-of-service', '/pages/agb']],
  ['Versand & Zahlung', ['/policies/shipping-policy', '/pages/versand']],
];

export function shopPruefen({ start, robots, sitemap, pflicht }) {
  const b = [];
  if (start.status !== 200) b.push(befund('kritisch', `Startseite nicht erreichbar (HTTP ${start.status || 'Fehler'})`, 'Shop offline oder Passwortschutz aktiv?'));
  else if (start.ms > 3000) b.push(befund('wichtig', `Startseite lädt langsam (${(start.ms / 1000).toFixed(1)} s)`, 'Große Bilder/Videos und unnötige Apps entfernen.'));
  if (/password|passwort/i.test(start.url || '')) b.push(befund('kritisch', 'Shop hinter Passwort', 'Niemand kann kaufen - Passwortschutz in Shopify entfernen.'));
  if (!sitemap) b.push(befund('wichtig', 'Keine sitemap.xml', 'Google findet neue Produkte langsamer.'));
  if (!robots) b.push(befund('tipp', 'Keine robots.txt', ''));
  for (const [name, ok] of pflicht) if (!ok) b.push(befund('kritisch', `${name} fehlt`, 'Pflichtseite für Shops in Deutschland - Abmahnrisiko. In Shopify unter Einstellungen > Richtlinien anlegen.'));
  return b;
}

export const punktzahl = (befunde) => Math.max(0, 100 - befunde.reduce((s, x) => s + (PUNKTE[x.stufe] || 0), 0));

// Doppelte Titel im Shop (normalisiert).
export function doppelteTitel(produkte) {
  const n = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim();
  const zahl = new Map();
  for (const p of produkte) zahl.set(n(p.title), (zahl.get(n(p.title)) || 0) + 1);
  return new Set(produkte.filter((p) => zahl.get(n(p.title)) > 1).map((p) => p.id));
}
