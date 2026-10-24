// Cyber-Firmen-Radar - Security-Firmen, Rechenzentren, Banken und IT-Dienstleister in Rhein-Main bekommen eine
// Initiativbewerbung für den Einstieg in die IT-Sicherheit, auch ohne offene Stellenanzeige.
// Die Adresse kommt von der Firmen-Website (bewerbung@/karriere@ zuerst). Gleicher State wie #106/#109:
// keine Firma doppelt, #107 erkennt die Antworten. Optional: BEWERBUNG_CYBER_MAX (Standard 25 pro Lauf).
import {
  env, LIVE, BEWERBER, emailOk, heute, gmailZugang, profil, ladeGeheim, speichereGeheim, firmenDomain,
  gmailTransport, holeLebenslauf, cvAnhang, signatur, meldeMir, anschreibenAnhang,
} from './lib/bewerbung.mjs';
import { initiativAnschreiben } from './lib/anschreibenVorlage.mjs';
import { emailVonWebsite } from './lib/firmenWebsite.mjs';
import { STATE_BOT, STATE_POSTFACH } from './106-bewerbungs-bot.mjs';

const MAX = LIVE ? Math.max(1, Math.min(40, parseInt(env('BEWERBUNG_CYBER_MAX', '25'), 10) || 25)) : 3;
const BEREICH = 'IT-Sicherheit';
const firmaKey = (name = '') => name.toLowerCase().replace(/\b(gmbh|ag|kg|se|co|mbh|& ?co\.?)\b|[^a-zäöü0-9]/g, '');

// Von Hand geprüft: Standort in Rhein-Main und eigene IT-Sicherheit/Rechenzentrum.
const FIRMEN = [
  { firma: 'usd AG', domain: 'usd.de', ort: 'Neu-Isenburg' },
  { firma: 'Controlware GmbH', domain: 'controlware.de', ort: 'Dietzenbach' },
  { firma: 'SVA System Vertrieb Alexander GmbH', domain: 'sva.de', ort: 'Wiesbaden' },
  { firma: 'r-tec IT Security GmbH', domain: 'r-tec.net', ort: 'Wiesbaden' },
  { firma: 'NVISO Germany GmbH', domain: 'nviso.eu', ort: 'Frankfurt am Main' },
  { firma: 'Claranet GmbH', domain: 'claranet.de', ort: 'Frankfurt am Main' },
  { firma: 'Axians Deutschland', domain: 'axians.de', ort: 'Frankfurt am Main' },
  { firma: 'Software AG', domain: 'softwareag.com', ort: 'Darmstadt' },
  { firma: 'ekom21 – KGRZ Hessen', domain: 'ekom21.de', ort: 'Darmstadt' },
  { firma: 'CyrusOne Frankfurt', domain: 'cyrusone.com', ort: 'Frankfurt am Main' },
  { firma: 'Deutsche Bundesbank', domain: 'bundesbank.de', ort: 'Frankfurt am Main' },
  { firma: 'Deutsche Börse Group', domain: 'deutsche-boerse.com', ort: 'Eschborn' },
  { firma: 'DZ BANK AG', domain: 'dzbank.de', ort: 'Frankfurt am Main' },
  { firma: 'KfW Bankengruppe', domain: 'kfw.de', ort: 'Frankfurt am Main' },
  { firma: 'B. Metzler seel. Sohn & Co.', domain: 'metzler.com', ort: 'Frankfurt am Main' },
  { firma: 'Mainova AG', domain: 'mainova.de', ort: 'Frankfurt am Main' },
  { firma: 'ENTEGA AG', domain: 'entega.ag', ort: 'Darmstadt' },
  { firma: 'Infraserv Höchst', domain: 'infraserv.com', ort: 'Frankfurt-Höchst' },
  { firma: 'VGF Verkehrsgesellschaft Frankfurt', domain: 'vgf-ffm.de', ort: 'Frankfurt am Main' },
  { firma: 'Mainzer Stadtwerke AG', domain: 'mainzer-stadtwerke.de', ort: 'Mainz' },
  { firma: 'Lufthansa Systems GmbH & Co. KG', domain: 'lhsystems.com', ort: 'Raunheim' },
  { firma: 'WIVERTIS GmbH', domain: 'wivertis.de', ort: 'Wiesbaden' },
  { firma: 'Seibert Group GmbH', domain: 'seibert.group', ort: 'Wiesbaden' },
  { firma: 'adesso SE Frankfurt', domain: 'adesso.de', ort: 'Frankfurt am Main' },
  { firma: 'Frankfurter Volksbank Rhein/Main eG', domain: 'frankfurter-volksbank.de', ort: 'Frankfurt am Main' },
  { firma: 'Nassauische Sparkasse (Naspa)', domain: 'naspa.de', ort: 'Wiesbaden' },
  { firma: 'Wiesbadener Volksbank eG', domain: 'wvb.de', ort: 'Wiesbaden' },
  { firma: 'Alte Leipziger – Hallesche', domain: 'alte-leipziger.de', ort: 'Oberursel' },
  { firma: 'PROFI Engineering Systems AG', domain: 'profi-ag.de', ort: 'Darmstadt' },
  { firma: 'INFOMOTION GmbH', domain: 'infomotion.de', ort: 'Frankfurt am Main' },
  { firma: 'Hauck Aufhäuser Lampe Privatbank AG', domain: 'hal-privatbank.com', ort: 'Frankfurt am Main' },
  { firma: 'Kreissparkasse Groß-Gerau', domain: 'kskgg.de', ort: 'Groß-Gerau' },
  { firma: 'Sparkasse Hanau', domain: 'sparkasse-hanau.de', ort: 'Hanau' },
  { firma: 'Sparkasse Oberhessen', domain: 'sparkasse-oberhessen.de', ort: 'Friedberg' },
  { firma: 'Volksbank Darmstadt-Südhessen eG', domain: 'volksbanking.de', ort: 'Darmstadt' },
  { firma: 'Wissenschaftsstadt Darmstadt', domain: 'darmstadt.de', ort: 'Darmstadt' },
  { firma: 'Stadt Eschborn', domain: 'eschborn.de', ort: 'Eschborn' },
  { firma: 'Stadt Kelsterbach', domain: 'kelsterbach.de', ort: 'Kelsterbach' },
];

async function main() {
  const { user } = gmailZugang();
  profil();
  const state = ladeGeheim(STATE_BOT, { beworben: {}, emails: {}, uebersprungen: {} });
  const postfach = ladeGeheim(STATE_POSTFACH, { antworten: {}, zusatzEmails: {} });
  state.initiativ ||= {};

  const bekannt = [...Object.keys(state.emails), ...Object.keys(postfach.zusatzEmails)];
  const domains = new Set(bekannt.map(firmenDomain).filter(Boolean));
  const firmen = new Set([...Object.values(state.beworben).map((b) => firmaKey(b.firma)), ...Object.keys(state.initiativ)]);

  const cv = await holeLebenslauf();
  const transport = gmailTransport();
  const gesendet = [];
  const ohne = [];
  for (const f of FIRMEN) {
    if (gesendet.length >= MAX) break;
    const key = firmaKey(f.firma);
    if (firmen.has(key) || domains.has(f.domain)) continue;
    const email = await emailVonWebsite(f.domain);
    if (!emailOk(email) || state.emails[email] || postfach.zusatzEmails[email] || domains.has(firmenDomain(email))) { ohne.push(f.firma); continue; }
    const betreff = `Initiativbewerbung – Einstieg im Bereich ${BEREICH} – ${BEWERBER()}`;
    const anschreiben = initiativAnschreiben({ bereich: BEREICH, firma: f.firma });
    const brief = await anschreibenAnhang({ firma: f.firma, ort: f.ort, betreff, anschreiben });
    const info = await transport.sendMail({
      from: `${BEWERBER()} <${user}>`,
      to: LIVE ? email : user,
      subject: LIVE ? betreff : `[TEST → ${email}] ${betreff}`,
      text: `${anschreiben}\n${signatur()}`,
      attachments: [brief, cvAnhang(cv)],
    });
    if (LIVE) {
      state.beworben[`cyber-${f.domain}`] = {
        datum: heute(), firma: f.firma, email, titel: `Quereinsteiger im Bereich ${BEREICH}`, betreff, anschreiben,
        messageId: info?.messageId || '', ansprechpartner: '', initiativ: true,
      };
      state.emails[email] = heute();
      state.initiativ[key] = heute();
      speichereGeheim(STATE_BOT, state); // sofort sichern: bricht der Lauf ab, wird niemand doppelt angeschrieben
    }
    domains.add(f.domain);
    gesendet.push(`✅ ${f.firma} (${f.ort}) · an ${email}`);
    console.log(`[cyber-radar] ${LIVE ? 'Gesendet' : 'TEST gesendet'}: ${f.firma}`);
    await new Promise((r) => setTimeout(r, 8000)); // Gmail nicht fluten
  }

  const bericht = [
    `🛡️ Cyber-Firmen-Radar ${LIVE ? '' : '(TESTMODUS – alles ging an dich selbst)'}`,
    `Heute ${gesendet.length} Security-/IT-Firma/Firmen angeschrieben · insgesamt ${Object.keys(state.beworben).length} Bewerbungen raus`,
    ...gesendet,
    ...(ohne.length ? [`Keine Bewerbungs-Mail gefunden (bitte über deren Karriereseite): ${ohne.join(', ')}`] : []),
  ].join('\n');
  console.log(bericht);
  if (gesendet.length) await meldeMir(`🛡️ Cyber-Radar: ${gesendet.length} raus`, bericht, transport);
}

main().catch((err) => {
  console.error('[cyber-radar]', err.message);
  process.exit(err.uebersprungen ? 0 : 1);
});
