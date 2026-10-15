// Bewerbungs-Bot - sucht jeden Werktag passende Büro-Stellen/Ausbildungen in der
// Jobbörse der Bundesagentur für Arbeit, filtert Vertrieb raus, lässt die KI
// prüfen ob die Stelle zum Lebenslauf passt, schreibt ein individuelles
// Anschreiben und schickt es mit Lebenslauf-PDF über Gmail an die Firma.
// Nach 12 Tagen ohne Antwort geht automatisch EINE höfliche Nachfass-Mail raus.
// Jede Bewerbung bekommt ein eigenes Anschreiben-PDF. Bericht per Mail an dich.
// Antworten wertet #107 (Bewerbungs-Postfach) aus. Zeitplan: Mo-Fr 08:00.
//
// Secrets: GMAIL_USER, GMAIL_APP_PASSWORD, BEWERBUNG_CV_URL, BEWERBUNG_PROFIL,
// BEWERBER_NAME, BEWERBER_ADRESSE, BEWERBER_TELEFON. Optional: BEWERBUNG_LIVE=ja
// (sonst Testmodus: alles geht an GMAIL_USER selbst), BEWERBUNG_MAX_PRO_TAG,
// BEWERBUNG_ORT, BEWERBUNG_UMKREIS_KM, BEWERBUNG_SUCHBEGRIFFE, BEWERBUNG_STATE_KEY.
import { askKI, parseJsonFromText } from './lib/ki.mjs';
import {
  env, LIVE, BEWERBER, emailOk, heute, tageSeit, gmailZugang, profil, ladeGeheim, speichereGeheim,
  gmailTransport, holeLebenslauf, cvAnhang, signatur, meldeMir, anschreibenAnhang,
} from './lib/bewerbung.mjs';

export const STATE_BOT = 'bewerbungs-bot';
export const STATE_POSTFACH = 'bewerbungs-postfach';
const API = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service';
const API_HEADERS = { 'X-API-Key': 'jobboerse-jobsuche', 'User-Agent': 'Jobsuche/2.9.2 (de.arbeitsagentur.jobboerse)' };
const MAX_PRO_TAG = Math.max(1, Math.min(150, parseInt(env('BEWERBUNG_MAX_PRO_TAG', '100'), 10) || 100));
const ORT = env('BEWERBUNG_ORT', 'Frankfurt am Main');
const UMKREIS = parseInt(env('BEWERBUNG_UMKREIS_KM', '20'), 10) || 20;
const MIN_PASSUNG = 6;
const NACHFASS_NACH_TAGEN = 12;

// Angebotsart der BA: 1 = Arbeit, 4 = Ausbildung. Wunsch: Büro/Buchhaltung,
// Vollzeit mit festem Gehalt, am liebsten am Flughafen Frankfurt (liegt im 20-km-Radius).
const STANDARD_SUCHE = [
  'Flughafen Büro:job',
  'Flughafen Verwaltung:job',
  'Flughafen Sachbearbeiter:job',
  'Luftverkehrskaufmann:ausbildung',
  'Servicekaufmann Luftverkehr:ausbildung',
  'Flughafen Kaufmann:ausbildung',
  'Buchhaltung:job',
  'Finanzbuchhaltung:job',
  'Mitarbeiter Buchhaltung:job',
  'Bürokaufmann:job',
  'Bürokraft:job',
  'Bürohilfe:job',
  'Sachbearbeiter Büro:job',
  'Mitarbeiter Backoffice:job',
  'Steuerfachangestellte:ausbildung',
  'Kaufmann Büromanagement:ausbildung',
  'Industriekaufmann:ausbildung',
  'Verwaltungsfachangestellte:ausbildung',
  'Sozialversicherungsfachangestellte:ausbildung',
  'Kaufmann Spedition und Logistikdienstleistung:ausbildung',
].join(';');

const VERTRIEB = /vertrieb|au(ß|ss)endienst|verkäufer|verkauf\b|sales|akquise|akquisition|call ?center|telefonverkauf|outbound|provision|promoter|haustür|key ?account|kundenberater|neukunden|d2d|door to door|fundraising/i;
const ZEITARBEIT = /personaldienstleist|zeitarbeit|arbeitnehmerüberlassung|personalvermittlung/i;
// Nur Vollzeit mit festem Gehalt - keine Minijobs, Aushilfen, Honorar-/Provisionsmodelle.
const KEIN_FIXGEHALT = /minijob|aushilfe|werkstudent|praktikum|praktikant|freelance|freiberuf|selbstständig|selbständig|nebenjob|honorar|auf provisionsbasis|\b(520|538|556) ?(€|euro)/i;
const FLUGHAFEN = /flughafen|airport|fraport|lufthansa|condor|cargo ?city|luftverkehr|luftfracht|aviation|\b60549\b/i;

// Je höher, desto früher wird beworben: Flughafen > Buchhaltung > Rest.
function attraktivitaet(st) {
  const kopf = `${st.titel} ${st.beruf || ''} ${st.arbeitgeber || ''} ${st.arbeitsort?.plz || ''} ${st.arbeitsort?.ort || ''}`;
  return (FLUGHAFEN.test(kopf) ? 3 : 0) + (/buchhalt|finanz|rechnungswesen|kreditor|debitor/i.test(kopf) ? 2 : 0) + (/büro|verwaltung|sachbearbeit|backoffice/i.test(kopf) ? 1 : 0);
}

function extras(text) {
  return [
    FLUGHAFEN.test(text) && '🛫 Flughafen',
    /firmenwagen|dienstwagen|firmenfahrzeug|dienstfahrzeug/i.test(text) && '🚗 Firmenwagen',
    /tarif|tvöd|tv-l|13\. ?(monats)?gehalt|weihnachtsgeld|urlaubsgeld/i.test(text) && '💰 Tarif/Extras',
    /jobticket|deutschlandticket/i.test(text) && '🎫 Jobticket',
  ].filter(Boolean);
}

function suchListe() {
  return env('BEWERBUNG_SUCHBEGRIFFE', STANDARD_SUCHE)
    .split(';').map((s) => s.trim()).filter(Boolean)
    .map((s) => { const [was, art = 'job'] = s.split(':'); return { was: was.trim(), angebotsart: art.trim() === 'ausbildung' ? 4 : 1 }; });
}

async function holeJson(url) {
  const res = await fetch(url, { headers: API_HEADERS });
  if (!res.ok) throw new Error(`BA-Jobbörse ${res.status} für ${url}`);
  return res.json();
}

async function sucheStellen({ was, angebotsart }) {
  const q = new URLSearchParams({ was, wo: ORT, umkreis: String(UMKREIS), angebotsart: String(angebotsart), veroeffentlichtseit: '60', size: '100' });
  if (angebotsart === 1) q.set('arbeitszeit', 'vz');
  const alle = [];
  for (let seite = 1; seite <= 3; seite++) {
    q.set('page', String(seite));
    const data = await holeJson(`${API}/pc/v4/jobs?${q}`);
    const treffer = data.stellenangebote || [];
    alle.push(...treffer.map((s) => ({ ...s, angebotsart, suchbegriff: was })));
    if (treffer.length < 100) break;
  }
  return alle;
}

// Detailtext holen: erst API, sonst die öffentliche Detailseite (HTML).
async function holeDetails(refnr) {
  const b64 = Buffer.from(refnr).toString('base64');
  for (const url of [`${API}/pc/v4/jobdetails/${b64}`, `${API}/pc/v2/jobdetails/${b64}`]) {
    try {
      const d = await holeJson(url);
      const text = [d.stellenangebotsBeschreibung, d.stellenbeschreibung, JSON.stringify(d.arbeitgeberAdresse || ''), JSON.stringify(d.ansprechpartner || ''), d.kontaktdaten && JSON.stringify(d.kontaktdaten)].filter(Boolean).join('\n');
      if (text.length > 80) return { text, externeUrl: d.allianzpartnerUrl || d.externeUrl || '' };
    } catch { /* nächste Quelle */ }
  }
  try {
    const res = await fetch(`https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(refnr)}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) {
      const html = await res.text();
      const text = html.replace(/\\u003C|\\u003E/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#64;|&#x40;|\\u0040/g, '@').replace(/\s+/g, ' ');
      return { text: text.slice(0, 20000), externeUrl: '' };
    }
  } catch { /* egal */ }
  return { text: '', externeUrl: '' };
}

export function findeEmail(text) {
  const treffer = (text.replace(/\s*(\[at\]|\(at\)| at )\s*/gi, '@').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])
    .map((e) => e.toLowerCase().replace(/[.,;]+$/, ''))
    .filter((e) => !/arbeitsagentur|noreply|no-reply|donotreply|example\.|datenschutz|privacy|\.(png|jpg|gif)$/.test(e));
  return treffer.find((e) => /bewerb|karriere|career|jobs?@|personal|hr@|ausbildung|recruit/.test(e)) || treffer[0] || '';
}

async function schreibeBewerbung(stelle, beschreibung) {
  const art = stelle.angebotsart === 4 ? 'Ausbildungsplatz' : 'Stelle';
  const prompt = `PROFIL DES BEWERBERS (nur diese Fakten verwenden, nichts erfinden):
${profil()}

STELLENANZEIGE (${art}):
Titel: ${stelle.titel}
Firma: ${stelle.arbeitgeber}
Ort: ${stelle.arbeitsort?.ort || ''}
Text: ${beschreibung.slice(0, 3500)}

WUNSCH DES BEWERBERS: Büro oder Buchhaltung, Vollzeit, festes Gehalt (keine Provision), am liebsten am Flughafen Frankfurt. Passt die Stelle dazu, darf das Anschreiben diese Begeisterung (z. B. für den Flughafen oder für Zahlen/Buchhaltung) konkret zeigen.

AUFGABE:
1. Bewerte ehrlich, ob der Bewerber realistische Chancen hat (0-10). Unter 6, wenn: abgeschlossene Ausbildung/Studium/Berufserfahrung zwingend verlangt, Realschulabschluss/Abitur zwingend verlangt, Führerschein zwingend, oder es eigentlich Vertrieb/Verkauf ist.
2. Wenn >= 6: Schreibe ein Anschreiben (E-Mail-Text, deutsch, 170-260 Wörter, Sie-Form). Erster Satz: ein starker, konkreter Aufhänger zur Firma/Stelle (KEIN "mit großem Interesse habe ich..."). Dann: was aus dem Profil genau zu den Aufgaben der Anzeige passt (Praktika, Excel/Word, Sprachen), Eintritt ab sofort möglich. Ansprechpartner aus der Anzeige verwenden falls genannt, sonst "Sehr geehrte Damen und Herren,". Letzter Satz: Bitte um ein persönliches Kennenlernen, Lebenslauf im Anhang. KEINE Platzhalter in eckigen Klammern, KEINE Grußformel und KEINEN Namen am Ende (wird automatisch angehängt). Keine erfundenen Noten, Zertifikate oder Erfahrungen.

Antworte NUR mit JSON: {"passung": Zahl, "grund": "1 Satz", "betreff": "Bewerbung als ... – ${BEWERBER()}", "anschreiben": "..."}`;
  const antwort = await askKI(prompt, { maxTokens: 1400, system: 'Du bist ein erfahrener Bewerbungscoach in Deutschland. Du antwortest ausschließlich mit gültigem JSON.' });
  return parseJsonFromText(antwort, {});
}

function anschreibenOk(t) {
  if (typeof t !== 'string') return false;
  const w = t.trim().split(/\s+/).length;
  return w >= 120 && w <= 400 && !/\[[^\]]{2,}\]|\{\{|lorem|XXX/i.test(t);
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Nachfassen: eine Mail im selben Thread, wenn nach X Tagen nichts kam.
async function nachfassen(state, postfach, transport, user, cv) {
  const raus = [];
  for (const [refnr, b] of Object.entries(state.beworben)) {
    if (raus.length >= 5) break;
    if (b.nachfass || ['einladung', 'absage', 'rueckfrage', 'weiterleitung'].includes(postfach.antworten[refnr]?.typ) || tageSeit(b.datum) < NACHFASS_NACH_TAGEN || !b.messageId) continue;
    const text = `${b.ansprechpartner || 'Sehr geehrte Damen und Herren'},\n\nvor knapp zwei Wochen habe ich mich bei Ihnen als ${b.titel} beworben. Ich möchte mich kurz erkundigen, ob meine Unterlagen gut angekommen sind und wie der aktuelle Stand ist.\n\nIch bin nach wie vor sehr motiviert, bei ${b.firma} anzufangen, und kann kurzfristig starten. Für Rückfragen bin ich jederzeit erreichbar. Meinen Lebenslauf hänge ich der Einfachheit halber noch einmal an.\n${signatur()}`;
    await transport.sendMail({
      from: `${BEWERBER()} <${user}>`, to: b.email, subject: `Re: ${b.betreff}`, text,
      inReplyTo: b.messageId, references: [b.messageId], attachments: [cvAnhang(cv)],
    });
    b.nachfass = heute();
    raus.push(`🔁 Nachgefasst: ${b.titel} – ${b.firma}`);
    await pause(15000);
  }
  return raus;
}

async function main() {
  const { user } = gmailZugang();
  profil();
  const state = ladeGeheim(STATE_BOT, { beworben: {}, emails: {}, uebersprungen: {} });
  const postfach = ladeGeheim(STATE_POSTFACH, { antworten: {}, zusatzEmails: {} });

  const cv = await holeLebenslauf();
  const transport = gmailTransport();
  await transport.verify();

  const nachfassBericht = LIVE ? await nachfassen(state, postfach, transport, user, cv) : [];
  speichereGeheim(STATE_BOT, state);

  const alle = new Map();
  for (const s of suchListe()) {
    try { for (const st of await sucheStellen(s)) if (st.refnr && !alle.has(st.refnr)) alle.set(st.refnr, st); }
    catch (e) { console.log(`[bewerbungs-bot] Suche "${s.was}" fehlgeschlagen: ${e.message}`); }
  }
  console.log(`[bewerbungs-bot] ${alle.size} Stellen gefunden.`);

  const gesendet = [];
  const manuell = [];
  let geprueft = 0;

  const reihenfolge = [...alle.values()].sort((a, b) => attraktivitaet(b) - attraktivitaet(a));
  for (const stelle of reihenfolge) {
    if (gesendet.length >= MAX_PRO_TAG || geprueft >= MAX_PRO_TAG * 3) break;
    const { refnr } = stelle;
    if (state.beworben[refnr] || state.uebersprungen[refnr]) continue;
    const kopf = `${stelle.titel} ${stelle.beruf || ''} ${stelle.arbeitgeber || ''}`;
    if (VERTRIEB.test(kopf) || ZEITARBEIT.test(kopf)) { state.uebersprungen[refnr] = 'vertrieb/zeitarbeit'; continue; }
    if (KEIN_FIXGEHALT.test(kopf)) { state.uebersprungen[refnr] = 'kein Vollzeit-Fixgehalt'; continue; }

    const { text, externeUrl } = await holeDetails(refnr);
    if (VERTRIEB.test(text.slice(0, 3000)) && /vertrieb|au(ß|ss)endienst|akquise|provision/i.test(text)) { state.uebersprungen[refnr] = 'vertrieb (Text)'; continue; }
    const email = findeEmail(text);
    const link = externeUrl || stelle.externeUrl || `https://www.arbeitsagentur.de/jobsuche/jobdetail/${refnr}`;
    if (!emailOk(email)) {
      state.uebersprungen[refnr] = 'keine E-Mail';
      if (manuell.length < 10) manuell.push(`• ${stelle.titel} – ${stelle.arbeitgeber}\n  ${link}`);
      continue;
    }
    if (state.emails[email] || postfach.zusatzEmails[email]) { state.uebersprungen[refnr] = 'Firma schon angeschrieben'; continue; }

    geprueft++;
    let b;
    try { b = await schreibeBewerbung(stelle, text || kopf); }
    catch (e) { if (e.uebersprungen) throw e; console.log(`[bewerbungs-bot] KI-Fehler ${refnr}: ${e.message}`); continue; }
    if (!(Number(b.passung) >= MIN_PASSUNG)) { state.uebersprungen[refnr] = `passt nicht (${b.passung})`; continue; }
    if (!anschreibenOk(b.anschreiben)) { console.log(`[bewerbungs-bot] Anschreiben für ${refnr} unbrauchbar - übersprungen.`); continue; }

    const betreff = String(b.betreff || `Bewerbung als ${stelle.titel} – ${BEWERBER()}`).slice(0, 150);
    const anschreiben = b.anschreiben.trim();
    const brief = await anschreibenAnhang({ firma: stelle.arbeitgeber, ort: stelle.arbeitsort?.ort || '', betreff, anschreiben });
    const info = await transport.sendMail({
      from: `${BEWERBER()} <${user}>`,
      to: LIVE ? email : user,
      subject: LIVE ? betreff : `[TEST → ${email}] ${betreff}`,
      text: `${anschreiben}\n${signatur()}`,
      attachments: [brief, cvAnhang(cv)],
    });
    if (LIVE) {
      const anrede = anschreiben.split('\n')[0].replace(/,\s*$/, '');
      state.beworben[refnr] = {
        datum: heute(), firma: stelle.arbeitgeber, email, titel: stelle.titel, betreff, anschreiben,
        messageId: info?.messageId || '', ansprechpartner: /^Sehr geehrte/.test(anrede) ? anrede : '',
      };
      state.emails[email] = heute();
      speichereGeheim(STATE_BOT, state); // sofort sichern: bricht der Lauf ab, wird niemand doppelt angeschrieben
    }
    const plus = extras(`${kopf} ${text}`);
    gesendet.push(`✅ ${stelle.titel} – ${stelle.arbeitgeber} (${stelle.arbeitsort?.ort || '?'}) · ${b.passung}/10${plus.length ? `  ${plus.join(' ')}` : ''}`);
    console.log(`[bewerbungs-bot] ${LIVE ? 'Gesendet' : 'TEST gesendet'}: ${refnr}`);
    await pause(8000); // Gmail nicht fluten
  }

  speichereGeheim(STATE_BOT, state);

  const gesamt = Object.keys(state.beworben).length;
  const bericht = [
    `📨 Bewerbungs-Bot ${LIVE ? '' : '(TESTMODUS – alles ging an dich selbst)'}`,
    `Heute ${gesendet.length} neue Bewerbung(en) · insgesamt ${gesamt} raus`,
    ...gesendet,
    ...nachfassBericht,
    manuell.length ? `\n👉 Ohne E-Mail (bitte selbst über den Link bewerben):\n${manuell.join('\n')}` : '',
    LIVE ? '' : '\nZum Scharfschalten: Secret BEWERBUNG_LIVE=ja setzen.',
  ].filter(Boolean).join('\n');
  console.log(bericht);
  await meldeMir(`📨 Bewerbungs-Bot: ${gesendet.length} neue Bewerbung(en) heute`, bericht, transport);
}

if (process.argv[1]?.endsWith('106-bewerbungs-bot.mjs')) {
  main().catch((err) => {
    console.error('[bewerbungs-bot]', err.message);
    process.exit(err.uebersprungen ? 0 : 1);
  });
}
