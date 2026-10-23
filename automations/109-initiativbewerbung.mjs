// Initiativbewerbung - Firmen in den Lieblingsbereichen (Luftfracht, Zoll, Export, Leitstelle,
// Flughafen, Spedition, IT/Cyber, Büro), die gerade irgendwen suchen und eine Bewerbungs-Mail in der Anzeige nennen,
// bekommen eine Initiativbewerbung für den Einstieg - auch wenn die Anzeige selbst Erfahrung verlangt.
// Gleicher State wie #106: keine Firma doppelt, #107 erkennt die Antworten, Nachfassen läuft mit.
// Optional: BEWERBUNG_INITIATIV_MAX (Standard 50 pro Lauf).
import {
  env, LIVE, BEWERBER, emailOk, heute, gmailZugang, profil, ladeGeheim, speichereGeheim, firmenDomain,
  gmailTransport, holeLebenslauf, cvAnhang, signatur, meldeMir, anschreibenAnhang,
} from './lib/bewerbung.mjs';
import { initiativAnschreiben } from './lib/anschreibenVorlage.mjs';
import { websiteDomain, emailVonWebsite } from './lib/firmenWebsite.mjs';
import {
  STATE_BOT, STATE_POSTFACH, VERTRIEB, ZEITARBEIT, ortPasst, sucheStellen, holeDetails, findeEmail, parallel,
} from './106-bewerbungs-bot.mjs';

const MAX = LIVE ? Math.max(1, Math.min(60, parseInt(env('BEWERBUNG_INITIATIV_MAX', '50'), 10) || 50)) : 3;
const SUCHE = ['Luftfracht', 'Air Cargo', 'Zoll', 'Zollabwicklung', 'Export', 'Import Export', 'Außenhandel',
  'Spedition', 'Speditionskaufmann', 'Leitstelle', 'Disposition', 'Flughafen', 'Cargo', 'Logistik Sachbearbeiter',
  'SOC Analyst', 'Cyber Security', 'IT-Security', 'IT-Sicherheit', 'Informationssicherheit', 'Penetration Tester', 'Security Analyst',
  'Security Engineer', 'Cloud Security', 'Netzwerksicherheit', 'IT-Forensik', 'Security Operations', 'Cyber Defense', 'Vulnerability', 'Identity Access Management', 'Firewall', 'IT-Security Consultant', 'Datenschutz',
  'IT-Support', 'IT Helpdesk', 'Service Desk', '1st Level Support', 'IT-Administrator', 'Systemadministrator', 'IT-Techniker', 'Rechenzentrum', 'Netzwerk',
  'Sachbearbeiter', 'Kaufmännischer Mitarbeiter', 'Bürokaufmann', 'Büroassistenz', 'Teamassistenz', 'Empfang', 'Kundenservice', 'Verwaltung', 'Backoffice', 'Datenerfassung'];
// Echte IT-Sicherheit - nicht Luftsicherheit oder Objektschutz.
const CYBER = /cyber|it-?secur|it-?sicherheit|informationssicherheit|\bisms\b|\bsoc\b|security (analyst|operations|engineer)|pentest|penetration|siem|forensi|cloud ?security|netzwerksicherheit|firewall|vulnerability|schwachstellen|identity|\biam\b|access management|datenschutz|security consultant|cyber ?defen/i;
// IT-Einstieg (Support, Helpdesk, Admin, Rechenzentrum) - die Tür Richtung IT-Sicherheit.
const IT = /it-?support|it support|helpdesk|help desk|service ?desk|1st[ -]?level|first level|2nd[ -]?level|second level|systemadmin|system ?administrator|it-?admin|netzwerk|network|rechenzentrum|data ?center|it-?techniker|it techniker|client ?management|it-?mitarbeiter|it-?service/i;
// Büro-Einstieg: Sachbearbeitung, Assistenz, Empfang, Kundenservice, Verwaltung.
const BUERO = /sachbearbeit|kaufm(ä|a)nn|büro|assistenz|empfang|rezeption|kundenservice|kundenbetreuung|customer service|verwaltung|backoffice|back office|datenerfassung|sekretär/i;
const BEREICHE = [
  [CYBER, 'IT-Sicherheit'],
  [IT, 'IT'],
  [/luftfracht|air ?cargo|airfreight|cargo/i, 'Luftfracht'],
  [/zoll/i, 'Zoll'],
  [/export|import|außenhandel/i, 'Export und Import'],
  [/leitstelle|leitstand|einsatzzentrale|notruf/i, 'Leitstelle'],
  [/flughafen|airport|fraport|aviation/i, 'Flughafen'],
  [/disposition|disponent/i, 'Disposition'],
  [BUERO, 'Büro und Sachbearbeitung'],
];
// Nur Anzeigen, die wirklich im Wunschbereich sind (die Suche liefert auch Deloitte-Berater & Co.).
const RELEVANT = /it-?support|it support|helpdesk|help desk|service ?desk|1st[ -]?level|first level|2nd[ -]?level|systemadmin|system ?administrator|it-?admin|netzwerk|network|rechenzentrum|data ?center|it-?techniker|it techniker|client ?management|it-?mitarbeiter|it-?service|cyber|it-?secur|it-?sicherheit|informationssicherheit|\bisms\b|\bsoc\b|security (analyst|operations|engineer)|pentest|penetration|siem|forensi|cloud ?security|netzwerksicherheit|firewall|vulnerability|schwachstellen|identity|\biam\b|access management|datenschutz|security consultant|cyber ?defen|luftfracht|air ?cargo|airfreight|cargo|fracht|freight|zoll|export|import|außenhandel|leitstelle|leitstand|einsatzzentrale|flughafen|airport|disposition|disponent|spedition|logistik/i;
// Personalvermittler tarnen sich oft ohne Zeitarbeits-Flag - eine Initiativbewerbung dort bringt nichts.
const VERMITTLER = /personal|zeitarbeit|staffing|recruit|hr consulting|impact gmbh|aide gmbh|bankpower|spp direkt|attentus/i;
// Fahrer-, Handwerks-, Verkaufs- und Chefposten zeigen nicht auf ein Büro im Wunschbereich.
const FREMD = /verkauf|pflege|arzt|ärzt|medizin|apothek|zahn|steuerfachang|bilanzbuchhalt|lohnbuchhalt|montage|monteur|handwerk|geschäftsführ|ausbilder|mechatron|elektron|mechaniker|lokführer|fahrer|berater|leiter|elektriker|objekttechniker|haustechn|senior|architekt|leitung|ingenieur|klima|lüftung/i;
// Zusätzlich das Umland mit vielen IT-, Cyber- und Cargo-Firmen (alles mit S-Bahn/Zug erreichbar).
// Zusätzlich Suchzentren im Umland, die außerhalb des Standard-Umkreises liegen (alles mit S-Bahn/Zug erreichbar).
const UMLAND = ['Darmstadt', 'Eschborn', 'Kelsterbach', 'Rüsselsheim', 'Bad Homburg', 'Offenbach am Main', 'Langen (Hessen)', 'Hanau', 'Bad Vilbel', 'Groß-Gerau', 'Neu-Isenburg'];
// Bundesweit: IT-/Cyber-Stellen, die laut Anzeige komplett im Homeoffice laufen.
const REMOTE_SUCHE = ['IT-Security', 'Cyber Security', 'IT-Sicherheit', 'SOC Analyst', 'IT-Support', 'IT Helpdesk', 'Service Desk', '1st Level Support', '2nd Level Support', 'Systemadministrator'];
const REMOTE = /100 ?% ?(remote|homeoffice|home-office|mobil)|vollständig (remote|im homeoffice|mobil)|komplett (remote|im homeoffice|aus dem homeoffice)|full[ -]remote|fully remote|ortsunabhängig|remote aus ganz deutschland|deutschlandweit remote/i;
const bereichVon = (st) => BEREICHE.find(([re]) => re.test(st.titel))?.[1] || 'Spedition und Logistik';
const firmaKey = (name = '') => name.toLowerCase().replace(/\b(gmbh|ag|kg|se|co|mbh|& ?co\.?)\b|[^a-zäöü0-9]/g, '');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { user } = gmailZugang();
  profil();
  const state = ladeGeheim(STATE_BOT, { beworben: {}, emails: {}, uebersprungen: {} });
  const postfach = ladeGeheim(STATE_POSTFACH, { antworten: {}, zusatzEmails: {} });
  state.initiativ ||= {};

  // Firmen, die schon Post von dir bekommen haben (per Adresse, Domain oder Name), fallen raus.
  const bekannt = [...Object.keys(state.emails), ...Object.keys(postfach.zusatzEmails)];
  const domains = new Set(bekannt.map(firmenDomain).filter(Boolean));
  const firmen = new Set([...Object.values(state.beworben).map((b) => firmaKey(b.firma)), ...Object.keys(state.initiativ)]);

  // Pro Firma eine aktuelle Anzeige im Wunschgebiet, keine Vermittler, kein Vertrieb.
  const proFirma = new Map();
  for (const wo of [undefined, ...UMLAND]) for (const was of SUCHE) {
    try {
      for (const st of await sucheStellen({ was, angebotsart: 1, wo, umkreis: wo ? 5 : undefined })) {
        const key = firmaKey(st.arbeitgeber);
        if (!key || firmen.has(key) || proFirma.has(key) || !ortPasst(st)) continue;
        if (st.zeitarbeit || ZEITARBEIT.test(st.arbeitgeber) || VERMITTLER.test(st.arbeitgeber) || VERTRIEB.test(st.titel) || FREMD.test(st.titel) || !(RELEVANT.test(st.titel) || BUERO.test(st.titel))) continue;
        proFirma.set(key, st);
      }
    } catch (e) { console.log(`[initiativ] Suche "${was}" ${wo || ''} fehlgeschlagen: ${e.message}`); }
  }
  for (const zusatz of ['remote', 'homeoffice']) for (const was of REMOTE_SUCHE) {
    try {
      for (const st of await sucheStellen({ was: `${was} ${zusatz}`, angebotsart: 1, wo: null })) {
        const key = firmaKey(st.arbeitgeber);
        if (!key || firmen.has(key) || proFirma.has(key) || ortPasst(st)) continue;
        if (st.zeitarbeit || ZEITARBEIT.test(st.arbeitgeber) || VERMITTLER.test(st.arbeitgeber) || VERTRIEB.test(st.titel) || FREMD.test(st.titel) || !(CYBER.test(st.titel) || IT.test(st.titel))) continue;
        st.nurRemote = true; // liegt außerhalb der Region - nur nehmen, wenn die Anzeige komplett Homeoffice bietet
        proFirma.set(key, st);
      }
    } catch (e) { console.log(`[initiativ] Remote-Suche "${was}" fehlgeschlagen: ${e.message}`); }
  }
  const auswahl = [...proFirma.entries()].slice(0, 700);
  console.log(`[initiativ] ${auswahl.length} neue Firmen im Wunschbereich.`);
  await parallel(auswahl, 6, async ([, st]) => {
    const { text, flags, externeUrl } = await holeDetails(st.refnr);
    st.vermittler = !!(flags.istArbeitnehmerUeberlassung || flags.istPrivateArbeitsvermittlung);
    st.email = st.nurRemote && !REMOTE.test(text) ? '' : findeEmail(text);
    if (!st.email && !st.nurRemote) st.website = websiteDomain(text, externeUrl, st.arbeitgeber);
  });

  const cv = await holeLebenslauf();
  const transport = gmailTransport();
  const gesendet = [];
  for (const [key, st] of auswahl) {
    if (gesendet.length >= MAX) break;
    // Keine Mail in der Anzeige: Bewerbungs-Adresse auf der Firmen-Website suchen (erst hier, damit nur so viele Seiten wie nötig geladen werden).
    if (!st.email && st.website && !st.vermittler && !domains.has(st.website)) st.email = await emailVonWebsite(st.website);
    const { email } = st;
    if (st.vermittler || VERMITTLER.test(email) || !emailOk(email) || state.emails[email] || postfach.zusatzEmails[email] || domains.has(firmenDomain(email))) continue;
    const bereich = bereichVon(st);
    const betreff = `Initiativbewerbung – Einstieg im Bereich ${bereich} – ${BEWERBER()}`;
    const anschreiben = initiativAnschreiben({ bereich, firma: st.arbeitgeber });
    const brief = await anschreibenAnhang({ firma: st.arbeitgeber, ort: st.arbeitsort?.ort || '', betreff, anschreiben });
    const info = await transport.sendMail({
      from: `${BEWERBER()} <${user}>`,
      to: LIVE ? email : user,
      subject: LIVE ? betreff : `[TEST → ${email}] ${betreff}`,
      text: `${anschreiben}\n${signatur()}`,
      attachments: [brief, cvAnhang(cv)],
    });
    if (LIVE) {
      state.beworben[`initiativ-${st.refnr}`] = {
        datum: heute(), firma: st.arbeitgeber, email, titel: `Quereinsteiger im Bereich ${bereich}`, betreff, anschreiben,
        messageId: info?.messageId || '', ansprechpartner: '', initiativ: true,
      };
      state.emails[email] = heute();
      state.initiativ[key] = heute();
      speichereGeheim(STATE_BOT, state); // sofort sichern: bricht der Lauf ab, wird niemand doppelt angeschrieben
    }
    domains.add(firmenDomain(email));
    gesendet.push(`✅ ${st.arbeitgeber} (${st.nurRemote ? '100 % Homeoffice' : st.arbeitsort?.ort || '?'}) · ${bereich} · an ${email}${st.website ? ' (von der Firmen-Website)' : ''}`);
    console.log(`[initiativ] ${LIVE ? 'Gesendet' : 'TEST gesendet'}: ${st.arbeitgeber}`);
    await pause(8000); // Gmail nicht fluten
  }

  const bericht = [
    `🚀 Initiativbewerbungen ${LIVE ? '' : '(TESTMODUS – alles ging an dich selbst)'}`,
    `Heute ${gesendet.length} Firma/Firmen in deinen Lieblingsbereichen angeschrieben · insgesamt ${Object.keys(state.beworben).length} Bewerbungen raus`,
    ...gesendet,
  ].join('\n');
  console.log(bericht);
  if (gesendet.length) await meldeMir(`🚀 Initiativbewerbungen: ${gesendet.length} raus`, bericht, transport);
}

main().catch((err) => {
  console.error('[initiativ]', err.message);
  process.exit(err.uebersprungen ? 0 : 1);
});
