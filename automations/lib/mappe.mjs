// Komplette Bewerbungsmappe (Lebenslauf, Anschreiben, Zeugnisse) als EIN PDF-Anhang.
// Die Mappe liegt AES-256-GCM-verschlüsselt im Repo (öffentlich!) - Schlüssel nur im
// Secret BEWERBUNG_MAPPE_KEY. Seite 2 ist das Anschreiben: sie wird für jede Firma neu
// gebaut, mit Anschrift, Datum und Stellentitel. Ohne Schlüssel/Datei -> null (alte Anhänge).
import { createDecipheriv, createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PDFArray, PDFDocument, StandardFonts, decodePDFRawStream, rgb } from 'pdf-lib';

const DATEI = fileURLToPath(new URL('../data/bewerbungsmappe.enc', import.meta.url));
const ANSCHREIBEN_SEITE = 1; // 0-basiert: Seite 2

const sauber = (font, t) => [...String(t || '')].map((z) => { try { font.encodeText(z); return z; } catch { return ''; } }).join('').replace(/\s+/g, ' ').trim();

let roh;
export function mappeVorhanden() {
  const key = (process.env.BEWERBUNG_MAPPE_KEY || '').trim();
  if (!key || !existsSync(DATEI)) return false;
  if (!roh) {
    const buf = readFileSync(DATEI);
    const d = createDecipheriv('aes-256-gcm', createHash('sha256').update(`mappe:${key}`).digest(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    roh = Buffer.concat([d.update(buf.subarray(28)), d.final()]);
  }
  return true;
}

function umbrechen(font, groesse, text, breite) {
  const zeilen = []; let zeile = '';
  for (const wort of text.split(' ')) {
    const probe = zeile ? `${zeile} ${wort}` : wort;
    if (font.widthOfTextAtSize(probe, groesse) > breite && zeile) { zeilen.push(zeile); zeile = wort; } else zeile = probe;
  }
  if (zeile) zeilen.push(zeile);
  return zeilen;
}

// Titel aus Anzeigen kürzen: "(m/w/d)" usw. raus.
const kurzTitel = (t) => String(t || '').replace(/\((m|w|d|f|x|i)(\s*[/|,]\s*(m|w|d|f|x|i))+\)/gi, '').replace(/\s+/g, ' ').trim();

// Positionen der Platzhalter auf Seite 2 der Vorlage (pt, von oben gemessen, A4).
const LINKS = 71; const RECHTS = 530.2; const BREITE = RECHTS - LINKS;
const ANSCHRIFT = { oben: 132, unten: 175, zeilen: [143.6, 156.8, 170.1] };
const DATUM = { oben: 194, unten: 209.5, basis: 205.3 };
const BETREFF = { oben: 229, unten: 247, basis: 242 };
const EINLEITUNG = { oben: 291, unten: 317.5, zeilen: [300.2, 313.4] };

// Platzhalter-Texte ([Unternehmensname], Datum, Betreff) ganz aus dem Seiteninhalt löschen,
// damit Bewerbermanagement-Systeme sie nicht unter den weißen Flächen mitlesen.
function platzhalterLoeschen(doc, seite) {
  const H = seite.getHeight();
  const weg = [ANSCHRIFT.zeilen[0], ANSCHRIFT.zeilen[1], ANSCHRIFT.zeilen[2], DATUM.basis, BETREFF.basis].map((b) => H - b);
  const inhalt = seite.node.Contents();
  if (!(inhalt instanceof PDFArray)) return;
  const streams = inhalt.asArray();
  for (const ref of streams) {
    const stream = doc.context.lookup(ref);
    let text;
    try { text = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1'); } catch { continue; }
    const neu = text.replace(/BT\/\w+ [\d.]+ Tf [\d.]+ ([\d.]+) Td[\s\S]*?ET/g, (block, y) => (weg.some((w) => Math.abs(w - Number(y)) < 2.5) ? '' : block));
    if (neu !== text) doc.context.assign(ref, doc.context.flateStream(Buffer.from(neu, 'latin1')));
  }
}

// Überdeckt die Platzhalter auf der Vorlagenseite und schreibt die Firmendaten hinein.
// Der restliche Text der Seite bleibt genau so, wie er in der Mappe steht.
async function seiteAusfuellen(doc, { firma, strasse, plzOrt, titel, ausbildung }) {
  const seite = doc.getPage(ANSCHREIBEN_SEITE);
  platzhalterLoeschen(doc, seite);
  const H = seite.getHeight();
  const normal = await doc.embedFont(StandardFonts.TimesRoman);
  const fett = await doc.embedFont(StandardFonts.TimesRomanBold);
  const schwarz = rgb(0, 0, 0);
  const weiss = (x1, oben, x2, unten) => seite.drawRectangle({ x: x1, y: H - unten, width: x2 - x1, height: unten - oben, color: rgb(1, 1, 1) });
  const text = (t, x, basis, font, g) => seite.drawText(t, { x, y: H - basis, size: g, font, color: schwarz });
  const passend = (font, t, g, min = 8) => { while (g > min && font.widthOfTextAtSize(t, g) > BREITE) g -= 0.25; return g; };

  weiss(LINKS - 1, ANSCHRIFT.oben, 340, ANSCHRIFT.unten);
  const zeilen = [[sauber(fett, firma), fett], [sauber(normal, strasse), normal], [sauber(normal, plzOrt), normal]].filter(([t]) => t);
  zeilen.forEach(([t, font], i) => text(t, LINKS, ANSCHRIFT.zeilen[i], font, passend(font, t, 11)));

  const datum = `Hattersheim am Main, ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' })}`;
  weiss(370, DATUM.oben, RECHTS + 2, DATUM.unten);
  text(datum, RECHTS - normal.widthOfTextAtSize(datum, 11), DATUM.basis, normal, 11);

  const t = sauber(fett, kurzTitel(titel)) || 'Mitarbeiter';
  const betreff = ausbildung ? `Bewerbung um einen Ausbildungsplatz als ${t}` : `Bewerbung als ${t}`;
  weiss(LINKS - 1, BETREFF.oben, RECHTS + 2, BETREFF.unten);
  text(betreff, LINKS, BETREFF.basis, fett, passend(fett, betreff, 13, 9));

  if (!ausbildung) {
    const start = 'da ich gerne ins Berufsleben einsteigen und mich beruflich weiterentwickeln möchte, bewerbe ich mich';
    let satz = umbrechen(normal, 11, `${start} bei Ihnen um eine Stelle als ${t}.`, BREITE);
    if (satz.length > 2) satz = umbrechen(normal, 11, `${start} bei Ihnen um eine Stelle in Ihrem Unternehmen.`, BREITE);
    weiss(LINKS - 1, EINLEITUNG.oben, RECHTS + 2, EINLEITUNG.unten);
    satz.forEach((z, i) => text(z, LINKS, EINLEITUNG.zeilen[i], normal, 11));
  }
}

// Liefert den Mail-Anhang oder null, wenn keine Mappe hinterlegt ist.
export async function mappeAnhang({ firma, strasse = '', plz = '', ort = '', titel, ausbildung = false }) {
  if (!mappeVorhanden()) return null;
  const doc = await PDFDocument.load(roh);
  await seiteAusfuellen(doc, { firma, strasse, plzOrt: [plz, ort].filter(Boolean).join(' '), titel, ausbildung });
  return { filename: 'Bewerbungsmappe.pdf', content: Buffer.from(await doc.save({ useObjectStreams: true })), contentType: 'application/pdf' };
}

// Anschrift aus BA-Daten: Details (Arbeitgeber-Adresse) vor Suchtreffer (nur Ort).
export function anschriftAus(st = {}) {
  const fl = st.details?.flags || {};
  const a = fl.arbeitgeberAdresse || fl.arbeitgeberadresse || fl.arbeitsorte?.[0] || {};
  const o = st.arbeitsort || {};
  return {
    strasse: [a.strasse, a.hausnummer].filter(Boolean).join(' '),
    plz: a.plz || o.plz || '',
    ort: a.ort || o.ort || '',
  };
}
