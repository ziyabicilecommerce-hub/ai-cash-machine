// Gemeinsame Bausteine für Bewerbungs-Bot (#106) und Bewerbungs-Postfach (#107).
// Das Repo ist öffentlich - deshalb steht hier KEIN persönliches Profil im Code.
// Alle persönlichen Daten kommen aus EINEM Secret: BEWERBUNG_DATEN (Kopfzeilen
// "NAME: ...", "ADRESSE: ..." usw. plus Lebenslauf-Abschnitte [SCHULE], [PRAXIS] ...).
// Der State wird AES-256-GCM-verschlüsselt committet.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { loadState, saveState } from './state.mjs';
import { ueberspringenWerfen } from './config.mjs';

export const env = (k, d = '') => (process.env[k] || d).trim();
export const LIVE = env('BEWERBUNG_LIVE').toLowerCase() === 'ja';

// BEWERBUNG_DATEN parsen: Kopffelder "SCHLÜSSEL: Wert" + Abschnitte "[NAME]" mit Zeilen "links | titel | detail".
let cache;
export function daten() {
  if (cache) return cache;
  const roh = env('BEWERBUNG_DATEN');
  const felder = {}; const abschnitte = []; let aktuell = null;
  for (const zeile of roh.split(/\r?\n/)) {
    const t = zeile.trim();
    if (!t) continue;
    const kopf = t.match(/^\[(.+)\]$/);
    if (kopf) { aktuell = { titel: kopf[1].trim(), zeilen: [] }; abschnitte.push(aktuell); continue; }
    const feld = !aktuell && t.match(/^([A-ZÄÖÜa-zäöü ]+):\s*(.+)$/);
    if (feld) { felder[feld[1].trim().toUpperCase()] = feld[2].trim(); continue; }
    if (aktuell) aktuell.zeilen.push(t.split('|').map((x) => x.trim()));
  }
  cache = { roh, felder, abschnitte };
  return cache;
}
const feld = (k, altEnv) => daten().felder[k] || env(altEnv);
export const BEWERBER = () => feld('NAME', 'BEWERBER_NAME') || ueberspringenWerfen('BEWERBUNG_DATEN fehlt (NAME: ...).');
export const adresse = () => feld('ADRESSE', 'BEWERBER_ADRESSE');
export const telefon = () => feld('TELEFON', 'BEWERBER_TELEFON');
export const wohnort = () => env('BEWERBUNG_ORT') || (adresse().match(/\d{5}\s+(.+)$/) || [])[1] || 'Frankfurt am Main';
// Nur echte Endungen: Anzeigentext wie "E-Mail@Ugur.Guezel" (Name statt Adresse) darf nicht als Adresse durchgehen.
const ENDUNG = /\.(de|com|net|org|eu|info|biz|io|at|ch|li|lu|nl|be|fr|it|es|pl|cz|dk|se|uk|us|int|ag|gmbh|group|jobs|career|careers|hessen|frankfurt|berlin|hamburg|koeln|bayern|nrw|ruhr|online|digital|tech|solutions|services|global|cloud|app|ai|co|cc|me|tv|aero|bio|consulting|systems|security|network|software|energy|law|legal|team|work|company|international)$/i;
export const emailOk = (e) => /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(e || '') && e.length < 120 && ENDUNG.test(e) && !/^e-?mail@/i.test(e) && !/^(vorname|nachname|firstname|lastname|name|max\.?mustermann|mustermann|beispiel|example|your|ihr)[._@-]/i.test(e);
export const heute = () => new Date().toISOString().slice(0, 10);
export const tageSeit = (datum) => (Date.now() - new Date(datum).getTime()) / 864e5;

export function gmailZugang() {
  const user = env('GMAIL_USER') || daten().felder.EMAIL || '';
  const pass = env('GMAIL_APP_PASSWORD').replace(/\s+/g, '');
  if (!user || !pass) ueberspringenWerfen('GMAIL_APP_PASSWORD (oder EMAIL in BEWERBUNG_DATEN) fehlt - übersprungen.');
  return { user, pass };
}

export function profil() {
  const p = daten().roh || env('BEWERBUNG_PROFIL');
  if (p.length < 80) ueberspringenWerfen('BEWERBUNG_DATEN fehlt - ohne deine Daten schreibt die KI keine Bewerbung.');
  return p;
}

function schluessel() {
  const basis = env('BEWERBUNG_STATE_KEY') || env('GMAIL_APP_PASSWORD').replace(/\s+/g, '');
  if (!basis) ueberspringenWerfen('Kein Schlüssel für den verschlüsselten Bewerbungs-State.');
  return createHash('sha256').update(`bewerbung:${basis}`).digest();
}

export function ladeGeheim(name, leer = {}) {
  const roh = loadState(name);
  if (!roh.enc) return structuredClone(leer);
  try {
    const [iv, tag, daten] = roh.enc.split('.').map((t) => Buffer.from(t, 'base64'));
    const d = createDecipheriv('aes-256-gcm', schluessel(), iv);
    d.setAuthTag(tag);
    return { ...structuredClone(leer), ...JSON.parse(Buffer.concat([d.update(daten), d.final()]).toString('utf8')) };
  } catch {
    // Falscher Schlüssel = lieber abbrechen als den State überschreiben und alle Firmen doppelt anschreiben.
    throw new Error(`State ${name} lässt sich nicht entschlüsseln - wurde BEWERBUNG_STATE_KEY/GMAIL_APP_PASSWORD geändert?`);
  }
}

export function speichereGeheim(name, daten) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', schluessel(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(daten), 'utf8'), c.final()]);
  saveState(name, { enc: [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.') });
}

export function gmailTransport() {
  const { user, pass } = gmailZugang();
  return nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });
}

// Ohne BEWERBUNG_CV_URL baut der Bot den Lebenslauf selbst aus BEWERBUNG_DATEN.
// Mit URL (auch normaler Drive-Teilen-Link) wird das eigene PDF genommen.
export async function holeLebenslauf() {
  let url = env('BEWERBUNG_CV_URL');
  if (!url) {
    if (!daten().abschnitte.length) ueberspringenWerfen('Weder BEWERBUNG_CV_URL noch Lebenslauf-Abschnitte in BEWERBUNG_DATEN - nichts zum Anhängen.');
    const { lebenslaufPdf } = await import('./lebenslaufPdf.mjs');
    return lebenslaufPdf({ name: BEWERBER(), kontakt: [adresse(), telefon() && `Mobil: ${telefon()}`, gmailZugang().user && `E-Mail: ${gmailZugang().user}`].filter(Boolean), felder: daten().felder, abschnitte: daten().abschnitte, ort: wohnort() });
  }
  const driveId = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/)?.[1];
  if (driveId) url = `https://drive.google.com/uc?export=download&id=${driveId}`;
  const res = await fetch(url, { redirect: 'follow' });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || buf.subarray(0, 4).toString() !== '%PDF') {
    throw new Error(`BEWERBUNG_CV_URL liefert kein PDF (HTTP ${res.status}). Drive-Datei auf "Jeder mit dem Link" stellen und Link als https://drive.google.com/uc?export=download&id=DATEI_ID eintragen.`);
  }
  return buf;
}

export const cvAnhang = (cv) => ({ filename: `Lebenslauf_${BEWERBER().replace(/\s+/g, '_')}.pdf`, content: cv, contentType: 'application/pdf' });

export function signatur() {
  const kontakt = [BEWERBER(), adresse(), telefon() && `Tel.: ${telefon()}`, gmailZugang().user].filter(Boolean);
  return ['', 'Mit freundlichen Grüßen', '', ...kontakt].join('\n');
}

// Freemail-Domains taugen nicht zum Zuordnen von Antworten zu einer Firma.
const FREEMAIL = /^(gmail|googlemail|web|gmx|t-online|outlook|hotmail|yahoo|icloud|aol|freenet|posteo)\./i;
export const domainVon = (email) => (email || '').toLowerCase().split('@')[1] || '';
export const firmenDomain = (email) => { const d = domainVon(email); return d && !FREEMAIL.test(d) ? d : ''; };

// Berichte und Alarme gehen per Mail an dich selbst (kein Telegram).
export async function meldeMir(betreff, text, transport = gmailTransport()) {
  const { user } = gmailZugang();
  await transport.sendMail({ from: `Bewerbungs-Bot <${user}>`, to: user, subject: betreff, text });
}

// Anschreiben als PDF-Anhang, eigener Brief pro Firma.
export async function anschreibenAnhang({ firma, ort, betreff, anschreiben }) {
  const { anschreibenPdf } = await import('./anschreibenPdf.mjs');
  const absender = [BEWERBER(), adresse(), telefon() && `Tel.: ${telefon()}`, gmailZugang().user].filter(Boolean);
  const content = await anschreibenPdf({ absender, empfaenger: [firma, ort], ort: (adresse().match(/\d{5}\s+(.+)$/) || [])[1] || wohnort(), betreff, text: anschreiben });
  return { filename: `Anschreiben_${BEWERBER().replace(/\s+/g, '_')}.pdf`, content, contentType: 'application/pdf' };
}
