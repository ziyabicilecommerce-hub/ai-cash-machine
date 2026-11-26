// Komplette Bewerbungsmappe (Lebenslauf, Anschreiben, Zeugnisse) als EIN PDF-Anhang.
// Die Mappe liegt AES-256-GCM-verschlüsselt im Repo (öffentlich!) - Schlüssel nur im
// Secret BEWERBUNG_MAPPE_KEY. Seite 2 ist das Anschreiben: sie wird für jede Firma neu
// gebaut, mit Anschrift, Datum und Stellentitel. Ohne Schlüssel/Datei -> null (alte Anhänge).
import { createDecipheriv, createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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

const IT = /\bit\b|it-|informatik|cyber|security|sicherheit|netzwerk|helpdesk|support|system|software|daten|digital|edv/i;

// Text von Seite 2. Bewusst ohne Firmennamen von Praktikumsbetrieben (Repo ist öffentlich),
// die stehen im Lebenslauf der Mappe.
function absaetze({ titel, ausbildung, firma }) {
  return [
    ausbildung
      ? `hiermit bewerbe ich mich bei Ihnen um einen Ausbildungsplatz als ${titel}. Ich kann sofort beginnen und freue mich darauf, bei Ihnen Schritt für Schritt alles von Grund auf zu lernen.`
      : `hiermit bewerbe ich mich bei Ihnen als ${titel}. Ich kann sofort bei Ihnen anfangen und möchte mich mit voller Motivation in Ihr Team einbringen.`,
    'Nach meinem Hauptschulabschluss habe ich die Berufsfachschule zum Übergang in Ausbildung an der Konrad-Adenauer-Schule in Kriftel besucht und dort im Sommer 2025 einen dem Hauptschulabschluss gleichwertigen Abschluss erworben. Anschließend habe ich an einer berufsvorbereitenden Bildungsmaßnahme teilgenommen. Jetzt bin ich bereit, beruflich richtig durchzustarten.',
    IT.test(titel)
      ? 'Computer und IT interessieren mich schon lange. Mit Word und Excel arbeite ich sicher, und neue Programme und Systeme lerne ich schnell. In einem Praktikum in einer Versicherungsagentur habe ich außerdem erste Erfahrungen im Büro gesammelt: Ich habe bei Überweisungen geholfen, Telefonate geführt und Kunden betreut.'
      : 'In einem Praktikum in einer Versicherungsagentur habe ich erste Erfahrungen im Büro gesammelt: Ich habe bei Überweisungen geholfen, Telefonate geführt und Kunden betreut. Mit Word und Excel arbeite ich sicher, und neue Aufgaben am PC lerne ich schnell.',
    'In weiteren Praktika in zwei Autohäusern und im Einzelhandel habe ich gelernt, sorgfältig zu arbeiten, im Team mit anzupacken und auch bei viel Betrieb den Überblick zu behalten. Ich spreche Deutsch, Türkisch und Englisch.',
    `Ich bin pünktlich, zuverlässig und lernbereit und möchte mich bei ${firma} langfristig einbringen und weiterentwickeln. Über eine Einladung zu einem persönlichen Gespräch freue ich mich sehr.`,
  ];
}

// Seite 2 komplett neu: Arial-artig (Helvetica), 11 pt, Briefaufbau wie die Vorlage.
async function neueSeite(doc, { absender, firma, strasse, plzOrt, titel, ausbildung }) {
  const alt = doc.getPage(ANSCHREIBEN_SEITE);
  const [B, H] = [alt.getWidth(), alt.getHeight()];
  const seite = doc.insertPage(ANSCHREIBEN_SEITE, [B, H]);
  doc.removePage(ANSCHREIBEN_SEITE + 1);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const LINKS = 71; const RECHTS = B - 65; const BREITE = RECHTS - LINKS; const G = 11;
  let y = 70;
  const schreib = (t, font = normal, g = G, abstand = 14) => { seite.drawText(t, { x: LINKS, y: H - y, size: g, font, color: rgb(0, 0, 0) }); y += abstand; };
  const passend = (font, t, g) => { while (g > 8 && font.widthOfTextAtSize(t, g) > BREITE) g -= 0.25; return g; };

  schreib(sauber(fett, absender.name), fett, 14, 16);
  for (const z of absender.zeilen) schreib(sauber(normal, z), normal, 10, 13);
  y += 30;
  const anschrift = [[firma, fett], [strasse, normal], [plzOrt, normal]].map(([t, f]) => [sauber(f, t), f]).filter(([t]) => t);
  for (const [t, f] of anschrift) schreib(t, f, passend(f, t, G));
  y += 28 + (3 - anschrift.length) * 14;

  const datum = `${absender.ort}, ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' })}`;
  seite.drawText(datum, { x: RECHTS - normal.widthOfTextAtSize(datum, G), y: H - y, size: G, font: normal, color: rgb(0, 0, 0) });
  y += 36;

  const t = sauber(fett, kurzTitel(titel)) || 'Mitarbeiter';
  const betreff = ausbildung ? `Bewerbung um einen Ausbildungsplatz als ${t}` : `Bewerbung als ${t}`;
  for (const z of umbrechen(fett, 12, betreff, BREITE)) schreib(z, fett, 12, 15);
  y += 18;

  schreib('Sehr geehrte Damen und Herren,');
  y += 8;
  for (const a of absaetze({ titel: t, ausbildung, firma: sauber(normal, firma) || 'Ihrem Unternehmen' })) {
    for (const z of umbrechen(normal, G, sauber(normal, a), BREITE)) schreib(z);
    y += 8;
  }
  y += 4;
  schreib('Mit freundlichen Grüßen');
  y += 24;
  schreib(sauber(normal, absender.name));
  y += 10;
  seite.drawText('Anlagen:', { x: LINKS, y: H - y, size: G, font: fett, color: rgb(0, 0, 0) });
  seite.drawText(' Lebenslauf und Zeugnisse', { x: LINKS + fett.widthOfTextAtSize('Anlagen:', G), y: H - y, size: G, font: normal, color: rgb(0, 0, 0) });
}

// Absender aus BEWERBUNG_DATEN (kein persönliches Datum im Code).
async function absenderDaten() {
  const { BEWERBER, adresse, telefon, daten, env, wohnort } = await import('./bewerbung.mjs');
  const email = env('GMAIL_USER') || daten().felder.EMAIL || '';
  return {
    name: BEWERBER(),
    zeilen: [adresse().replace(/,\s*(?=\d{5})/, ' · '), [telefon(), email].filter(Boolean).join(' · ')].filter(Boolean),
    ort: wohnort(),
  };
}

// Liefert den Mail-Anhang oder null, wenn keine Mappe hinterlegt ist.
export async function mappeAnhang({ firma, strasse = '', plz = '', ort = '', titel, ausbildung = false }) {
  if (!mappeVorhanden()) return null;
  const doc = await PDFDocument.load(roh);
  await neueSeite(doc, { absender: await absenderDaten(), firma, strasse, plzOrt: [plz, ort].filter(Boolean).join(' '), titel, ausbildung });
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
