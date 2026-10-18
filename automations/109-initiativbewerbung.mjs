// Initiativbewerbung - Firmen in den Lieblingsbereichen (Luftfracht, Zoll, Export, Leitstelle,
// Flughafen, Spedition), die gerade irgendwen suchen und eine Bewerbungs-Mail in der Anzeige nennen,
// bekommen eine Initiativbewerbung für den Einstieg - auch wenn die Anzeige selbst Erfahrung verlangt.
// Gleicher State wie #106: keine Firma doppelt, #107 erkennt die Antworten, Nachfassen läuft mit.
// Optional: BEWERBUNG_INITIATIV_MAX (Standard 25 pro Lauf).
import {
  env, LIVE, BEWERBER, emailOk, heute, gmailZugang, profil, ladeGeheim, speichereGeheim, firmenDomain,
  gmailTransport, holeLebenslauf, cvAnhang, signatur, meldeMir, anschreibenAnhang,
} from './lib/bewerbung.mjs';
import { initiativAnschreiben } from './lib/anschreibenVorlage.mjs';
import {
  STATE_BOT, STATE_POSTFACH, VERTRIEB, ZEITARBEIT, ortPasst, sucheStellen, holeDetails, findeEmail, parallel,
} from './106-bewerbungs-bot.mjs';

const MAX = LIVE ? Math.max(1, Math.min(60, parseInt(env('BEWERBUNG_INITIATIV_MAX', '25'), 10) || 25)) : 3;
const SUCHE = ['Luftfracht', 'Air Cargo', 'Zoll', 'Zollabwicklung', 'Export', 'Import Export', 'Außenhandel',
  'Spedition', 'Speditionskaufmann', 'Leitstelle', 'Disposition', 'Flughafen', 'Cargo', 'Logistik Sachbearbeiter'];
const BEREICHE = [
  [/luftfracht|air ?cargo|airfreight|cargo/i, 'Luftfracht'],
  [/zoll/i, 'Zoll'],
  [/export|import|außenhandel/i, 'Export und Import'],
  [/leitstelle|leitstand|einsatzzentrale|notruf/i, 'Leitstelle'],
  [/flughafen|airport|fraport|aviation/i, 'Flughafen'],
  [/disposition|disponent/i, 'Disposition'],
];
// Nur Anzeigen, die wirklich im Wunschbereich sind (die Suche liefert auch Deloitte-Berater & Co.).
const RELEVANT = /luftfracht|air ?cargo|airfreight|cargo|fracht|freight|zoll|export|import|außenhandel|leitstelle|leitstand|einsatzzentrale|flughafen|airport|disposition|disponent|spedition|logistik/i;
// Personalvermittler tarnen sich oft ohne Zeitarbeits-Flag - eine Initiativbewerbung dort bringt nichts.
const VERMITTLER = /personal|zeitarbeit|staffing|impact gmbh|aide gmbh|bankpower|spp direkt|attentus/i;
// Fahrer-, Handwerks-, Verkaufs- und Chefposten zeigen nicht auf ein Büro im Wunschbereich.
const FREMD = /verkauf|geschäftsführ|ausbilder|mechatron|elektron|mechaniker|lokführer|fahrer|berater|leiter/i;
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
  for (const was of SUCHE) {
    try {
      for (const st of await sucheStellen({ was, angebotsart: 1 })) {
        const key = firmaKey(st.arbeitgeber);
        if (!key || firmen.has(key) || proFirma.has(key) || !ortPasst(st)) continue;
        if (st.zeitarbeit || ZEITARBEIT.test(st.arbeitgeber) || VERMITTLER.test(st.arbeitgeber) || VERTRIEB.test(st.titel) || FREMD.test(st.titel) || !RELEVANT.test(st.titel)) continue;
        proFirma.set(key, st);
      }
    } catch (e) { console.log(`[initiativ] Suche "${was}" fehlgeschlagen: ${e.message}`); }
  }
  const auswahl = [...proFirma.entries()].slice(0, 300);
  console.log(`[initiativ] ${auswahl.length} neue Firmen im Wunschbereich.`);
  await parallel(auswahl, 6, async ([, st]) => {
    const { text, flags } = await holeDetails(st.refnr);
    st.vermittler = !!(flags.istArbeitnehmerUeberlassung || flags.istPrivateArbeitsvermittlung);
    st.email = findeEmail(text);
  });

  const cv = await holeLebenslauf();
  const transport = gmailTransport();
  const gesendet = [];
  for (const [key, st] of auswahl) {
    if (gesendet.length >= MAX) break;
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
    gesendet.push(`✅ ${st.arbeitgeber} (${st.arbeitsort?.ort || '?'}) · ${bereich} · an ${email}`);
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
