// Einzelbewerbung - schickt gezielte Bewerbungen mit eigenem Anschreiben (manueller Start).
// Auftrag kommt als JSON über AUTOMATION_AUFTRAG: {"email","firma","titel","anschreiben","betreff"?}
// oder als Liste solcher Aufträge (Sammel-Modus, max. 25 pro Lauf).
// Gleiche Absender-Daten, PDFs und State wie #106, damit #107 Antworten darauf erkennt.
import {
  env, LIVE, BEWERBER, emailOk, heute, gmailZugang, ladeGeheim, speichereGeheim, firmenDomain,
  gmailTransport, holeLebenslauf, cvAnhang, signatur, meldeMir, anschreibenAnhang,
} from './lib/bewerbung.mjs';
import { STATE_BOT } from './106-bewerbungs-bot.mjs';

const MAX_AUFTRAEGE = 25;

function pruefeAuftrag(a = {}) {
  const email = String(a.email || '').trim().toLowerCase();
  const firma = String(a.firma || '').trim().slice(0, 120);
  const titel = String(a.titel || '').trim().slice(0, 150);
  const anschreiben = String(a.anschreiben || '').replace(/\r/g, '').trim();
  if (!emailOk(email)) throw new Error(`Ungültige E-Mail: ${email || '(leer)'}`);
  if (!firma || !titel) throw new Error('firma und titel sind Pflicht.');
  const woerter = anschreiben.split(/\s+/).filter(Boolean).length;
  if (woerter < 80 || woerter > 450) throw new Error(`Anschreiben hat ${woerter} Wörter - erwartet 80 bis 450.`);
  const betreff = String(a.betreff || `Bewerbung als ${titel} – ${BEWERBER()}`).slice(0, 150);
  return { email, firma, titel, anschreiben, betreff };
}

function leseAuftraege() {
  let a;
  try { a = JSON.parse(env('AUTOMATION_AUFTRAG') || '{}'); } catch { throw new Error('Auftrag ist kein gültiges JSON.'); }
  if (!Array.isArray(a)) return [pruefeAuftrag(a)];
  if (a.length > MAX_AUFTRAEGE) throw new Error(`Höchstens ${MAX_AUFTRAEGE} Aufträge pro Lauf (bekommen: ${a.length}).`);
  // Im Sammel-Modus wird ein kaputter Auftrag übersprungen statt den ganzen Lauf abzubrechen.
  return a.flatMap((x, i) => {
    try { return [pruefeAuftrag(x)]; } catch (e) { console.log(`[einzelbewerbung] Auftrag ${i + 1} übersprungen: ${e.message}`); return []; }
  });
}

// Schon angeschrieben - per Adresse oder über eine andere Adresse derselben Firmen-Domain (z.B. info@ statt bewerbung@)?
function schonAngeschrieben(state, email) {
  if (state.emails[email]) return `${email} wurde am ${state.emails[email]}`;
  const domain = firmenDomain(email);
  const frueher = domain && Object.keys(state.emails).find((e) => firmenDomain(e) === domain);
  return frueher ? `${domain} wurde am ${state.emails[frueher]}` : '';
}

async function main() {
  const { user } = gmailZugang();
  const auftraege = leseAuftraege();
  const state = ladeGeheim(STATE_BOT, { beworben: {}, emails: {}, uebersprungen: {} });
  const offen = auftraege.filter((a) => {
    const grund = LIVE && schonAngeschrieben(state, a.email);
    if (grund) console.log(`[einzelbewerbung] ${grund} schon angeschrieben - nicht doppelt.`);
    return !grund;
  });
  if (!offen.length) return;

  const transport = gmailTransport();
  const cv = await holeLebenslauf();
  const gesendet = [];
  for (const auftrag of offen) {
    if (LIVE && schonAngeschrieben(state, auftrag.email)) continue; // zwei Aufträge an dieselbe Firma in einer Liste
    const brief = await anschreibenAnhang({ firma: auftrag.firma, ort: '', betreff: auftrag.betreff, anschreiben: auftrag.anschreiben });
    const info = await transport.sendMail({
      from: `${BEWERBER()} <${user}>`,
      to: LIVE ? auftrag.email : user,
      subject: LIVE ? auftrag.betreff : `[TEST → ${auftrag.email}] ${auftrag.betreff}`,
      text: `${auftrag.anschreiben}\n${signatur()}`,
      attachments: [brief, cvAnhang(cv)],
    });

    if (LIVE) {
      const refnr = `manuell-${Date.now()}`;
      const anrede = auftrag.anschreiben.split('\n')[0].replace(/,\s*$/, '');
      state.beworben[refnr] = {
        datum: heute(), firma: auftrag.firma, email: auftrag.email, titel: auftrag.titel, betreff: auftrag.betreff,
        anschreiben: auftrag.anschreiben, messageId: info?.messageId || '', ansprechpartner: /^Sehr geehrte/.test(anrede) ? anrede : '',
      };
      state.emails[auftrag.email] = heute();
      speichereGeheim(STATE_BOT, state); // sofort sichern: bricht der Lauf ab, wird niemand doppelt angeschrieben
    }
    console.log(`[einzelbewerbung] ${LIVE ? 'Gesendet' : 'TEST gesendet'}: ${auftrag.titel} – ${auftrag.firma}`);
    gesendet.push(`✅ ${auftrag.titel} – ${auftrag.firma} (an ${auftrag.email})`);
    if (offen.length > 1) await new Promise((r) => setTimeout(r, 8000)); // Gmail nicht fluten
  }
  if (gesendet.length) {
    await meldeMir(`✉️ Einzelbewerbung ${LIVE ? 'raus' : '(TEST)'}: ${gesendet.length}`, gesendet.join('\n'), transport);
  }
}

main().catch((err) => {
  console.error('[einzelbewerbung]', err.message);
  process.exit(err.uebersprungen ? 0 : 1);
});
