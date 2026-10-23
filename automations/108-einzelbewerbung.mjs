// Einzelbewerbung - schickt EINE gezielte Bewerbung mit eigenem Anschreiben (manueller Start).
// Auftrag kommt als JSON über AUTOMATION_AUFTRAG: {"email","firma","titel","anschreiben","betreff"?}.
// Gleiche Absender-Daten, PDFs und State wie #106, damit #107 Antworten darauf erkennt.
import {
  env, LIVE, BEWERBER, emailOk, heute, gmailZugang, ladeGeheim, speichereGeheim, firmenDomain,
  gmailTransport, holeLebenslauf, cvAnhang, signatur, meldeMir, anschreibenAnhang,
} from './lib/bewerbung.mjs';
import { STATE_BOT } from './106-bewerbungs-bot.mjs';

function leseAuftrag() {
  let a;
  try { a = JSON.parse(env('AUTOMATION_AUFTRAG') || '{}'); } catch { throw new Error('Auftrag ist kein gültiges JSON.'); }
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

async function main() {
  const { user } = gmailZugang();
  const auftrag = leseAuftrag();
  const state = ladeGeheim(STATE_BOT, { beworben: {}, emails: {}, uebersprungen: {} });
  if (LIVE && state.emails[auftrag.email]) {
    console.log(`[einzelbewerbung] ${auftrag.email} wurde am ${state.emails[auftrag.email]} schon angeschrieben - nicht doppelt.`);
    return;
  }
  // Gleiche Firma über eine andere Adresse (z.B. info@ statt bewerbung@) ebenfalls nicht doppelt anschreiben.
  const domain = firmenDomain(auftrag.email);
  const frueher = domain && Object.keys(state.emails).find((e) => firmenDomain(e) === domain);
  if (LIVE && frueher) {
    console.log(`[einzelbewerbung] ${domain} wurde am ${state.emails[frueher]} schon angeschrieben - nicht doppelt.`);
    return;
  }

  const transport = gmailTransport();
  const cv = await holeLebenslauf();
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
    speichereGeheim(STATE_BOT, state);
  }
  console.log(`[einzelbewerbung] ${LIVE ? 'Gesendet' : 'TEST gesendet'}: ${auftrag.titel} – ${auftrag.firma}`);
  await meldeMir(`✉️ Einzelbewerbung ${LIVE ? 'raus' : '(TEST)'}: ${auftrag.firma}`, `${auftrag.titel} – ${auftrag.firma}\nan: ${auftrag.email}\n\n${auftrag.anschreiben}`, transport);
}

main().catch((err) => {
  console.error('[einzelbewerbung]', err.message);
  process.exit(err.uebersprungen ? 0 : 1);
});
