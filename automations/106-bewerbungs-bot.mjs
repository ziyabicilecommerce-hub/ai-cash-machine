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
import { vorlageAnschreiben, vorlagePasst, nurAnzeige } from './lib/anschreibenVorlage.mjs';
import {
  env, LIVE, BEWERBER, emailOk, heute, tageSeit, gmailZugang, profil, ladeGeheim, speichereGeheim,
  gmailTransport, holeLebenslauf, cvAnhang, signatur, meldeMir, anschreibenAnhang, wohnort,
} from './lib/bewerbung.mjs';
import { config } from './lib/config.mjs';

// 100 Bewerbungen/Tag brauchen mehr als das geteilte KI-Tageslimit - nur für diesen Lauf aufheben.
config.POLLINATIONS_MAX_TOKENS_PRO_TAG = '0';

export const STATE_BOT = 'bewerbungs-bot';
export const STATE_POSTFACH = 'bewerbungs-postfach';
const API = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service';
const API_HEADERS = { 'X-API-Key': 'jobboerse-jobsuche', 'User-Agent': 'Jobsuche/2.9.2 (de.arbeitsagentur.jobboerse)' };
const MAX_LIVE = Math.max(1, Math.min(150, parseInt(env('BEWERBUNG_MAX_PRO_TAG', '100'), 10) || 100));
// Testmodus: nur ein paar Probe-Bewerbungen an dich selbst, damit du sie in Ruhe anschauen kannst.
const MAX_PRO_TAG = LIVE ? MAX_LIVE : Math.min(MAX_LIVE, parseInt(env('BEWERBUNG_TEST_MAX', '5'), 10) || 5);
const ORT = wohnort();
const UMKREIS = parseInt(env('BEWERBUNG_UMKREIS_KM', '25'), 10) || 25;
const MIN_PASSUNG = 6;
// Unter diesem Monatsbrutto wird nicht beworben (nur wenn die Anzeige ein Gehalt nennt). ~3.000 € ≈ 2.050 € netto (Stkl. 1).
const MIN_BRUTTO = parseInt(env('BEWERBUNG_MIN_BRUTTO', '3000'), 10) || 3000;
// Personalvermittler/Zeitarbeit nur, wenn die Anzeige mindestens so viel Monatsbrutto nennt (dann lohnt es sich).
const ZEITARBEIT_AB = parseInt(env('BEWERBUNG_ZEITARBEIT_AB', '3500'), 10) || 3500;
// Wird nur genannt, wenn die Anzeige ausdrücklich nach einer Gehaltsvorstellung fragt.
const GEHALTSWUNSCH = env('BEWERBUNG_GEHALTSWUNSCH', '36.000');
const NACHFASS_NACH_TAGEN = 12;

// Angebotsart der BA: 1 = Arbeit, 4 = Ausbildung. Wunsch: Büro/Buchhaltung,
// Vollzeit mit festem Gehalt, am liebsten am Flughafen Frankfurt (liegt im 20-km-Radius).
const STANDARD_SUCHE = [
  // Lieblingsbereiche: Zoll, Export, Luftfracht, Leitstelle - werden zuerst beworben.
  'Sachbearbeiter Luftfracht:job',
  'Luftfracht Import:job',
  'Luftfracht Export:job',
  'Air Cargo:job',
  'Tracing Luftfracht:job',
  'Zollabwicklung:job',
  'Zollsachbearbeiter:job',
  'Zolldeklarant:job',
  'Export Sachbearbeiter:job',
  'Exportabwicklung:job',
  'Mitarbeiter Leitstelle:job',
  'Sicherheitsleitstelle:job',
  'Leitstand:job',
  'Einsatzzentrale:job',
  'Notrufzentrale:job',
  'Notruf- und Serviceleitstelle:job',
  // Weiteres Büro mit Tempo
  'Flughafen Operations:job',
  'Disponent Quereinsteiger:job',
  'Sachbearbeiter Disposition:job',
  'Logistik Koordinator:job',
  'Einsatzplaner:job',
  'Customer Service Operations:job',
  // Mehr Geld: Bank-Service, Schichtbetrieb mit Zuschlägen
  'Kundenservice Bank:job',
  'Sachbearbeiter Bank:job',
  'Leitstelle Schichtdienst:job',
  'Zahlungsverkehr:job',
  // Flughafen ohne Erfahrung, gut bezahlt dank Schicht-/Flughafenzulagen
  'Bodenverkehrsdienste:job',
  'Luftsicherheitsassistent:job',
  'Check-in Flughafen:job',
  'Passagierabfertigung:job',
  'Flughafen Kundenservice:job',
  'Luftfracht Schicht:job',
  'Quereinsteiger Büro:job',
  'Quereinsteiger Verwaltung:job',
  'Quereinsteiger Buchhaltung:job',
  'Quereinsteiger Flughafen:job',
  'ohne Berufserfahrung Büro:job',
  'Bürokraft Einarbeitung:job',
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
  // IT & Cybersecurity: am PC, wenig Telefon - Einstieg über Quereinstieg oder Ausbildung
  'IT Quereinsteiger:job',
  'IT-Support Berufseinsteiger:job',
  'Datenerfassung:job',
  'Fachinformatiker Systemintegration:ausbildung',
  'Fachinformatiker Daten- und Prozessanalyse:ausbildung',
  'Kaufmann IT-System-Management:ausbildung',
  'IT-Sicherheit:ausbildung',
].join(';');

const VERTRIEB = /vertrieb|au(ß|ss)endienst|verkäufer|verkauf\b|sales|akquise|akquisition|call ?center|telefonverkauf|outbound|provision|promoter|haustür|key\)? ?account|account manager|kundenberater|neukunden|d2d|door to door|fundraising/i;
const ZEITARBEIT = /personaldienstleist|zeitarbeit|arbeitnehmerüberlassung|personalvermittlung|personalberatung|recruitment|recruiting agency|headhunt|\b(dis ag|tempworkers|randstad|adecco|manpower|hays|orizon|amadeus fire|ferchau|gulp|brunel|persona service|jobactive|piening|timepartner|startpeople|tempton|akkodis|allianz personal)\b|\bpersonal (gmbh|service|partner)/i;
// Führungsjobs sind ohne Erfahrung sinnlos.
const FUEHRUNG = /geschäftsführ|leiter(in)?\b|leitung\b|head of|senior|teamlead|team lead|director|direktor/i;
// Nur Vollzeit mit festem Gehalt - keine Minijobs, Aushilfen, Honorar-/Provisionsmodelle.
const KEIN_FIXGEHALT = /minijob|aushilfe|werkstudent|praktikum|praktikant|freelance|freiberuf|selbstständig|selbständig|nebenjob|honorar|auf provisionsbasis|\b(520|538|556) ?(€|euro)/i;
const FLUGHAFEN = /flughafen|airport|fraport|luftsicherheit|bodenverkehr|passagier|check-in|lufthansa|condor|cargo ?city|luftverkehr|luftfracht|aviation|\b60549\b/i;

// Nur diese Orte (Arbeitsort der Stelle). Griesheim bei Darmstadt (PLZ 64347) ist nicht gemeint.
const ORTE = new RegExp(env('BEWERBUNG_ORTE', 'frankfurt|kriftel|hofheim|hattersheim|eddersheim|sindlingen|griesheim|wiesbaden|mainz|kastel'), 'i');
const ortPasst = (st) => ORTE.test(`${st.arbeitsort?.ort || ''} ${st.arbeitsort?.region || ''}`) && st.arbeitsort?.plz !== '64347';
const QUEREINSTEIGER = /quereinst|ohne (berufs)?erfahrung|keine (berufs)?erfahrung (nötig|erforderlich|notwendig)|einarbeitung|wir arbeiten (sie|dich) ein|berufseinsteiger|berufsanfänger/i;

// Lieblingsbereiche (höchste Priorität) und weiteres Büro mit Tempo.
const FAVORIT = /zoll|export|luftfracht|air ?cargo|airfreight|leitstelle|leitstand|einsatzzentrale|notrufzentrale/i;
const ACTION = /luftfracht|air ?cargo|cargo|operations|disposition|disponent|logistik|zoll|export|import|leitstelle|leitstand|einsatzplan|tracing|ground handling|station/i;

// Je höher, desto früher wird beworben: Flughafen > Action-Büro > Quereinsteiger > Buchhaltung > Rest.
function attraktivitaet(st) {
  const kopf = `${st.titel} ${st.beruf || ''} ${st.arbeitgeber || ''} ${st.arbeitsort?.plz || ''} ${st.arbeitsort?.ort || ''}`;
  return (FAVORIT.test(kopf) ? 5 : 0) + (FLUGHAFEN.test(kopf) ? 3 : 0) + (ACTION.test(kopf) ? 2 : 0) + (st.quereinstieg || QUEREINSTEIGER.test(kopf) ? 2 : 0) + (/buchhalt|finanz|rechnungswesen|kreditor|debitor/i.test(kopf) ? 2 : 0) + (/büro|verwaltung|sachbearbeit|backoffice/i.test(kopf) ? 1 : 0);
}

const NUR_PORTAL = /ausschließlich (über|online|per (unser|das))|nur (über|online|per) (unser|das|den)?\s*(online|karriere|bewerber|stellen)|bewerbungs?formular|(online|karriere|bewerber)[- ]?(portal|plattform)|bewerben sie sich (bitte )?(direkt |gerne )?(online|über (unser|den|die))|keine bewerbungen? per (e-?mail|post)|apply (online|via|through)/i;
const BEWERBUNGS_POSTFACH = /bewerb|karriere|career|jobs?@|personal|^hr@|ausbildung|recruit|talent/i;

// Gehaltsspanne aus den Details auf Monatsbrutto umrechnen (Stundenlohn × 173 h, Jahresgehalt ÷ 12).
function monatsBrutto(d = {}) {
  let von = parseFloat(String(d.gehaltsspanneVon ?? '').replace(',', '.'));
  let bis = parseFloat(String(d.gehaltsspanneBis ?? '').replace(',', '.'));
  if (!(von > 0)) return null;
  if (!(bis >= von)) bis = von;
  const faktor = von < 100 ? 173 : von > 15000 ? 1 / 12 : 1;
  return { von: von * faktor, bis: bis * faktor };
}
const gehaltsBonus = (b) => (!b ? 0 : b.bis >= 4500 ? 6 : b.bis >= 3800 ? 4 : b.bis >= 3300 ? 3 : b.bis >= 2900 ? 2 : 1);
// Nacht-/Sonn-/Feiertagszuschläge sind steuerfrei (§ 3b EStG) - landen fast komplett netto auf dem Konto.
const SCHICHT = /schichtdienst|schichtarbeit|\bschicht|nachtdienst|nachtschicht|24\/7|rund um die uhr|sonn- und feiertag|(nacht|schicht|sonntags)zuschl|wechseldienst/i;
// Nur Anzeigentext + offizielles Feld prüfen - der restliche JSON-Text enthält Feldnamen wie "arbeitszeitSchichtNachtWochenende".
const hatSchicht = (d) => d?.flags?.arbeitszeitSchichtNachtWochenende === true || SCHICHT.test(d?.flags?.stellenangebotsBeschreibung || '');

async function parallel(liste, anzahl, arbeit) {
  let i = 0;
  await Promise.all(Array.from({ length: anzahl }, async () => { while (i < liste.length) await arbeit(liste[i++]); }));
}

function extras(text) {
  return [
    FLUGHAFEN.test(text) && '🛫 Flughafen',
    FAVORIT.test(text.slice(0, 600)) ? '⭐ Lieblingsbereich' : ACTION.test(text.slice(0, 600)) && '⚡ Büro mit Action',
    /firmenwagen|dienstwagen|firmenfahrzeug|dienstfahrzeug/i.test(text) && '🚗 Firmenwagen',
    /tarif|tvöd|tv-l|13\. ?(monats)?gehalt|weihnachtsgeld|urlaubsgeld/i.test(text) && '💰 Tarif/Extras',
    /jobticket|deutschlandticket/i.test(text) && '🎫 Jobticket',
    QUEREINSTEIGER.test(text) && '🎓 Einarbeitung/Quereinstieg',
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

// Die BA hat /pc/v4/jobs abgeschaltet (403) - Suche läuft über v6, das Format wird hier
// auf die bisherigen Feldnamen gemappt. Die Details kommen weiter aus /pc/v4/jobdetails.
function ausV6(x, angebotsart, was) {
  const adr = x.stellenlokationen?.[0]?.adresse || {};
  return {
    refnr: x.referenznummer, titel: x.stellenangebotsTitel || '', arbeitgeber: x.firma || '', beruf: x.hauptberuf || '',
    arbeitsort: { ort: adr.ort || '', plz: adr.plz || '', region: adr.region || '' }, externeUrl: x.externeURL || '',
    vollzeit: x.arbeitszeitVollzeit !== false, minijob: !!x.istGeringfuegigeBeschaeftigung,
    zeitarbeit: !!x.istArbeitnehmerUeberlassung || !!x.istPrivateArbeitsvermittlung,
    quereinstieg: !!x.quereinstiegGeeignet, angebotsart, suchbegriff: was,
  };
}

async function sucheStellen({ was, angebotsart }) {
  const q = new URLSearchParams({ was, wo: ORT, umkreis: String(UMKREIS), angebotsart: String(angebotsart), veroeffentlichtseit: '60', size: '100' });
  if (angebotsart === 1) q.set('arbeitszeit', 'vz');
  const alle = [];
  for (let seite = 1; seite <= 3; seite++) {
    q.set('page', String(seite));
    const data = await holeJson(`${API}/pc/v6/jobs?${q}`);
    const treffer = data.ergebnisliste || [];
    alle.push(...treffer.filter((x) => x.referenznummer).map((x) => ausV6(x, angebotsart, was)));
    if (treffer.length < 100) break;
  }
  return alle;
}

// Detailtext holen: erst API, sonst die öffentliche Detailseite (HTML).
async function holeDetails(refnr) {
  const b64 = Buffer.from(refnr).toString('base64');
  try {
    const d = await holeJson(`${API}/pc/v4/jobdetails/${b64}`);
    // Ganze Antwort als Text, damit auch Kontakt-Mails in Nebenfeldern gefunden werden; "\n" aus JSON entschärfen.
    const text = `${d.stellenangebotsBeschreibung || ''}\n${JSON.stringify({ ...d, stellenangebotsBeschreibung: undefined })}`.replace(/\\n/g, ' ');
    const gehalt = d.gehaltsspanneVon ? `${d.gehaltsspanneVon}${d.gehaltsspanneBis ? `–${d.gehaltsspanneBis}` : ''} €` : '';
    if (text.length > 80) return { text, externeUrl: d.externeURL || d.allianzpartnerUrl || '', gehalt, flags: d };
  } catch { /* nächste Quelle */ }
  try {
    const res = await fetch(`https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(refnr)}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) {
      const html = await res.text();
      const text = html.replace(/\\u003C|\\u003E/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&#64;|&#x40;|\\u0040/g, '@').replace(/\s+/g, ' ');
      return { text: text.slice(0, 20000), externeUrl: '', gehalt: '', flags: {} };
    }
  } catch { /* egal */ }
  return { text: '', externeUrl: '', gehalt: '', flags: {} };
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
${stelle.brutto ? `Gehalt laut Anzeige: ca. ${Math.round(stelle.brutto.von)}–${Math.round(stelle.brutto.bis)} € brutto im Monat\n` : ''}
WUNSCH DES BEWERBERS: am liebsten Zoll, Export, Luftfracht oder Leitstelle - Büro mit Tempo, wo jeder Fall anders ist und der Tag schnell vergeht; sonst Disposition, Flughafen-Büro oder Buchhaltung. Bei solchen Stellen soll das Anschreiben echte Begeisterung für genau diesen Bereich zeigen (z. B. internationale Sendungen, Zeitdruck, schnelle Entscheidungen), Vollzeit, festes Gehalt (keine Provision), am liebsten am Flughafen Frankfurt. Er hat KEINE Berufserfahrung und ist Quereinsteiger - Stellen, die Quereinsteiger/Berufsanfänger ausdrücklich willkommen heißen oder eine Einarbeitung bieten, passen besonders gut (eher 7-9). Verlangt die Stelle mehrjährige Berufserfahrung, ist sie unter 6. Im Anschreiben die Lernbereitschaft und Motivation für die Einarbeitung betonen, nichts beschönigen. Passt die Stelle dazu, darf das Anschreiben diese Begeisterung (z. B. für den Flughafen oder für Zahlen/Buchhaltung) konkret zeigen.

AUFGABE:
1. Bewerte ehrlich, ob der Bewerber realistische Chancen hat (0-10). Unter 6, wenn: abgeschlossene Ausbildung/Studium/Berufserfahrung zwingend verlangt, Realschulabschluss/Abitur zwingend verlangt, Führerschein zwingend, oder es eigentlich Vertrieb/Verkauf ist.
2. Wenn >= 6: Schreibe ein Anschreiben (E-Mail-Text, deutsch, 170-260 Wörter, Sie-Form). Erster Satz: ein starker, konkreter Aufhänger zur Firma/Stelle (KEIN "mit großem Interesse habe ich..."). Dann: was aus dem Profil genau zu den Aufgaben der Anzeige passt (Praktika, Excel/Word, Sprachen), Eintritt ab sofort möglich. Ansprechpartner aus der Anzeige verwenden falls genannt, sonst "Sehr geehrte Damen und Herren,". Letzter Satz: Bitte um ein persönliches Kennenlernen, Lebenslauf im Anhang. KEINE Platzhalter in eckigen Klammern, KEINE Grußformel und KEINEN Namen am Ende (wird automatisch angehängt). Keine erfundenen Noten, Zertifikate oder Erfahrungen. Fragt die Anzeige ausdrücklich nach einer Gehaltsvorstellung, schreibe vor dem letzten Satz: "Meine Gehaltsvorstellung liegt bei ${GEHALTSWUNSCH} € brutto im Jahr." - sonst kein Gehalt erwähnen.
3. perMail: Darf man sich laut Anzeige per E-Mail bewerben? false NUR, wenn die Anzeige ausdrücklich NUR ein Online-Portal/Formular erlaubt; sonst true.

Antworte NUR mit JSON: {"passung": Zahl, "perMail": true/false, "grund": "1 Satz", "betreff": "Bewerbung als ... – ${BEWERBER()}", "anschreiben": "..."}`;
  const antwort = await askKI(prompt, { maxTokens: 1400, system: 'Du bist ein erfahrener Bewerbungscoach in Deutschland. Du antwortest ausschließlich mit gültigem JSON.' });
  return parseJsonFromText(antwort, {});
}

function anschreibenOk(t) {
  if (typeof t !== 'string') return false;
  const w = t.trim().split(/\s+/).length;
  return w >= 120 && w <= 400 && !/\[[^\]]{2,}\]|\{\{|lorem|XXX/i.test(t);
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Die kostenlose KI (Pollinations) erlaubt nur ~1 Antwort pro 30 s und IP, der Ersatz (LLM7)
// ist oft überlastet. Statt beim ersten "nicht verfügbar" den ganzen Lauf abzubrechen:
// warten und nochmal versuchen. Erst nach mehreren Fehlschlägen am Stück wird für heute aufgehört.
const KI_AUS = Symbol('ki-aus');
let kiFehlerInFolge = 0;
let letzterKiAufruf = 0;
async function mitKiGeduld(aufruf, refnr) {
  for (let versuch = 1; versuch <= 4; versuch++) {
    const warten = letzterKiAufruf + 31000 - Date.now();
    if (warten > 0) await pause(warten);
    letzterKiAufruf = Date.now();
    try {
      const ergebnis = await aufruf();
      kiFehlerInFolge = 0;
      return ergebnis;
    } catch (e) {
      console.log(`[bewerbungs-bot] KI-Versuch ${versuch} für ${refnr} fehlgeschlagen: ${String(e.message).slice(0, 160)}`);
      if (!e.uebersprungen) return null; // kaputte Antwort → diese Stelle überspringen
      await pause(35000 * versuch);
    }
  }
  return ++kiFehlerInFolge >= 1 ? KI_AUS : null; // nach 4 Fehlversuchen ist die Gratis-KI für heute durch
}

// Nachfassen: eine Mail im selben Thread, wenn nach X Tagen nichts kam.
async function nachfassen(state, postfach, transport, user, cv) {
  const raus = [];
  for (const [refnr, b] of Object.entries(state.beworben)) {
    if (raus.length >= 5) break;
    if (b.nachfass || ['einladung', 'absage', 'rueckfrage', 'weiterleitung', 'unzustellbar'].includes(postfach.antworten[refnr]?.typ) || tageSeit(b.datum) < NACHFASS_NACH_TAGEN || !b.messageId) continue;
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
  try { await transport.verify(); }
  catch (e) {
    if (e.code !== 'EAUTH') throw e;
    throw new Error(`Gmail lehnt den Login für ${user} ab. Das App-Passwort muss in GENAU diesem Konto erstellt sein (myaccount.google.com/apppasswords, oben rechts Konto prüfen) und als GMAIL_APP_PASSWORD eingetragen werden.`);
  }

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
  let kiAus = false;
  const heuteAngeschrieben = new Set(); // auch im Testmodus jede Firma nur einmal

  // Schritt 1: billige Filter ohne Netzwerk.
  const kandidaten = [];
  for (const stelle of alle.values()) {
    const { refnr } = stelle;
    if (state.beworben[refnr] || state.uebersprungen[refnr]) continue;
    const kopf = `${stelle.titel} ${stelle.beruf || ''} ${stelle.arbeitgeber || ''}`;
    if (VERTRIEB.test(kopf)) { state.uebersprungen[refnr] = 'vertrieb'; continue; }
    if (FUEHRUNG.test(stelle.titel)) { state.uebersprungen[refnr] = 'Führungsposition'; continue; }
    if (stelle.minijob || !stelle.vollzeit || KEIN_FIXGEHALT.test(kopf)) { state.uebersprungen[refnr] = 'kein Vollzeit-Fixgehalt'; continue; }
    // Vermittler/Zeitarbeit erst nach den Details entscheiden: nur wenn das Gehalt richtig gut ist.
    stelle.vermittler = stelle.zeitarbeit || ZEITARBEIT.test(kopf);
    if (!ortPasst(stelle)) { state.uebersprungen[refnr] = `Ort ${stelle.arbeitsort?.ort || '?'}`; continue; }
    kandidaten.push(stelle);
  }

  // Schritt 2: Details der besten Kandidaten parallel holen, damit das Gehalt in die Reihenfolge einfließt
  // (gut bezahlte Lieblingsjobs zuerst, schlecht bezahlte fliegen raus).
  kandidaten.sort((a, b) => attraktivitaet(b) - attraktivitaet(a));
  // Alle Kandidaten genau anschauen: nur ein kleiner Teil nennt überhaupt eine Bewerbungs-Mail.
  const auswahl = kandidaten.slice(0, 900);
  await parallel(auswahl, 6, async (st) => { st.details = await holeDetails(st.refnr); st.brutto = monatsBrutto(st.details.flags); });
  const geldScore = (x) => attraktivitaet(x) + gehaltsBonus(x.brutto) + (hatSchicht(x.details) ? 2 : 0);
  auswahl.sort((a, b) => geldScore(b) - geldScore(a));
  console.log(`[bewerbungs-bot] ${kandidaten.length} Kandidaten nach Filtern, ${auswahl.filter((x) => x.brutto).length} davon mit Gehaltsangabe.`);

  for (const stelle of auswahl) {
    if (gesendet.length >= MAX_PRO_TAG || geprueft >= MAX_PRO_TAG * 2) break;
    const { refnr } = stelle;
    const kopf = `${stelle.titel} ${stelle.beruf || ''} ${stelle.arbeitgeber || ''}`;
    const { text, externeUrl, flags } = stelle.details;
    const gehalt = stelle.brutto ? `~${Math.round(stelle.brutto.von)}–${Math.round(stelle.brutto.bis)} € brutto/Monat` : '';
    if (flags.istGeringfuegigeBeschaeftigung) { state.uebersprungen[refnr] = 'Minijob (Details)'; continue; }
    if ((stelle.vermittler || flags.istArbeitnehmerUeberlassung) && !(stelle.brutto?.bis >= ZEITARBEIT_AB)) { state.uebersprungen[refnr] = 'Zeitarbeit/Vermittler ohne Top-Gehalt'; continue; }
    if (VERTRIEB.test(text.slice(0, 3000)) && /vertrieb|au(ß|ss)endienst|akquise|provision/i.test(text)) { state.uebersprungen[refnr] = 'vertrieb (Text)'; continue; }
    if (stelle.brutto && stelle.brutto.bis < MIN_BRUTTO) { state.uebersprungen[refnr] = `zu wenig Gehalt (${gehalt})`; continue; }
    const email = findeEmail(text);
    // Nur echte Anzeigen-Links nehmen, keine reinen Startseiten ("http://www.arbeitsagentur.de").
    const link = [externeUrl, stelle.externeUrl].find((u) => /^https?:\/\/[^/]+\/.+/.test(u || '')) || `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(refnr)}`;
    const selbst = (grund) => { if (manuell.length < 15) manuell.push(`• ${stelle.titel} – ${stelle.arbeitgeber}${gehalt ? ` (${gehalt})` : ''} [${grund}]\n  ${link}`); };
    if (!emailOk(email)) { state.uebersprungen[refnr] = 'keine E-Mail'; selbst('keine E-Mail in der Anzeige'); continue; }
    // Steht "nur über unser Portal" in der Anzeige und ist die Adresse kein Bewerbungspostfach, wäre die Mail verschenkt.
    if (NUR_PORTAL.test(text) && !BEWERBUNGS_POSTFACH.test(email)) { state.uebersprungen[refnr] = 'nur Online-Portal'; selbst('nur Online-Bewerbung'); continue; }
    if (state.emails[email] || postfach.zusatzEmails[email] || heuteAngeschrieben.has(email)) { state.uebersprungen[refnr] = 'Firma schon angeschrieben'; continue; }

    geprueft++;
    let b = kiAus ? null : await mitKiGeduld(() => schreibeBewerbung(stelle, text || kopf), refnr);
    if (b === KI_AUS) { kiAus = true; b = null; }
    // KI überlastet → Profi-Vorlage aus deinen echten Daten statt gar keiner Bewerbung.
    if (!b) {
      if (!vorlagePasst(text, stelle.titel || '')) { state.uebersprungen[refnr] = 'verlangt Ausbildung/Erfahrung (Vorlage)'; continue; }
      b = { passung: MIN_PASSUNG, perMail: true, vorlage: true, anschreiben: vorlageAnschreiben({ titel: stelle.titel, firma: stelle.arbeitgeber, text }) };
    }
    if (b.perMail === false) { state.uebersprungen[refnr] = 'laut Anzeige nur Portal'; selbst('laut Anzeige nur online'); continue; }
    if (!(Number(b.passung) >= MIN_PASSUNG)) { state.uebersprungen[refnr] = `passt nicht (${b.passung})`; continue; }
    // KI-Text kaputt → Vorlage statt die Stelle zu verschenken.
    if (!anschreibenOk(b.anschreiben)) {
      if (!vorlagePasst(text, stelle.titel || '')) { console.log(`[bewerbungs-bot] Anschreiben für ${refnr} unbrauchbar - übersprungen.`); continue; }
      b = { ...b, vorlage: true, anschreiben: vorlageAnschreiben({ titel: stelle.titel, firma: stelle.arbeitgeber, text }) };
    }

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
    const plus = [...(hatSchicht(stelle.details) ? ['🌙 Schichtzulagen (steuerfrei)'] : []), ...extras(`${kopf} ${nurAnzeige(text)}`), ...(stelle.quereinstieg && !QUEREINSTEIGER.test(text) ? ['🎓 Quereinstieg geeignet'] : []), ...(gehalt ? [`💶 ${gehalt}`] : [])];
    gesendet.push(`✅ ${stelle.titel} – ${stelle.arbeitgeber} (${stelle.arbeitsort?.ort || '?'}) · ${b.vorlage ? '✍️ Vorlage' : `${b.passung}/10`}${plus.length ? `  ${plus.join(' ')}` : ''}`);
    heuteAngeschrieben.add(email);
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
    manuell.length ? `\n👉 Hier geht keine Mail – bitte selbst über den Link bewerben:\n${manuell.join('\n')}` : '',
    kiAus ? '\n⚠️ Die kostenlose KI war heute überlastet – die mit ✍️ markierten Anschreiben kommen aus deiner Profi-Vorlage.' : '',
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
