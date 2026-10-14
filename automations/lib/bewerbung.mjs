// Gemeinsame Bausteine für Bewerbungs-Bot (#106) und Bewerbungs-Postfach (#107).
// Das Repo ist öffentlich - deshalb steht hier KEIN persönliches Profil im Code
// (kommt aus dem Secret BEWERBUNG_PROFIL) und der State wird AES-256-GCM-
// verschlüsselt committet (Firmen, E-Mails, Anschreiben sind sonst öffentlich).
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { loadState, saveState } from './state.mjs';
import { ueberspringenWerfen } from './config.mjs';

export const env = (k, d = '') => (process.env[k] || d).trim();
export const LIVE = env('BEWERBUNG_LIVE').toLowerCase() === 'ja';
export const BEWERBER = () => env('BEWERBER_NAME') || ueberspringenWerfen('BEWERBER_NAME fehlt.');
export const emailOk = (e) => /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(e || '') && e.length < 120;
export const heute = () => new Date().toISOString().slice(0, 10);
export const tageSeit = (datum) => (Date.now() - new Date(datum).getTime()) / 864e5;

export function gmailZugang() {
  const user = env('GMAIL_USER');
  const pass = env('GMAIL_APP_PASSWORD').replace(/\s+/g, '');
  if (!user || !pass) ueberspringenWerfen('GMAIL_USER / GMAIL_APP_PASSWORD fehlen - übersprungen.');
  return { user, pass };
}

export function profil() {
  const p = env('BEWERBUNG_PROFIL');
  if (p.length < 80) ueberspringenWerfen('BEWERBUNG_PROFIL fehlt (Lebenslauf-Fakten als Text) - ohne Profil schreibt die KI keine Bewerbung.');
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

export async function holeLebenslauf() {
  const url = env('BEWERBUNG_CV_URL');
  if (!url) ueberspringenWerfen('BEWERBUNG_CV_URL fehlt - ohne Lebenslauf-PDF wird nichts verschickt.');
  const res = await fetch(url, { redirect: 'follow' });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || buf.subarray(0, 4).toString() !== '%PDF') {
    throw new Error(`BEWERBUNG_CV_URL liefert kein PDF (HTTP ${res.status}). Drive-Datei auf "Jeder mit dem Link" stellen und Link als https://drive.google.com/uc?export=download&id=DATEI_ID eintragen.`);
  }
  return buf;
}

export const cvAnhang = (cv) => ({ filename: `Lebenslauf_${BEWERBER().replace(/\s+/g, '_')}.pdf`, content: cv, contentType: 'application/pdf' });

export function signatur() {
  const kontakt = [BEWERBER(), env('BEWERBER_ADRESSE'), env('BEWERBER_TELEFON') && `Tel.: ${env('BEWERBER_TELEFON')}`, env('GMAIL_USER')].filter(Boolean);
  return ['', 'Mit freundlichen Grüßen', '', ...kontakt].join('\n');
}

// Freemail-Domains taugen nicht zum Zuordnen von Antworten zu einer Firma.
const FREEMAIL = /^(gmail|googlemail|web|gmx|t-online|outlook|hotmail|yahoo|icloud|aol|freenet|posteo)\./i;
export const domainVon = (email) => (email || '').toLowerCase().split('@')[1] || '';
export const firmenDomain = (email) => { const d = domainVon(email); return d && !FREEMAIL.test(d) ? d : ''; };
