// Bewerbungs-Postfach - liest alle 30 Min das Gmail-Postfach, erkennt Antworten
// auf Bewerbungen von #106 und reagiert sofort:
//  🔥 Einladung   → Alarm-Mail an dich + KI-Spickzettel fürs Gespräch + fertiger
//                   Zusage-Entwurf in Gmail-Entwürfen (nur noch "Senden" drücken)
//  ❓ Rückfrage   → Antwort-Entwurf in Gmail-Entwürfen + Mail an dich
//  ↪️ Weiterleitung ("bitte an karriere@... senden") → Bewerbung geht automatisch
//                   an die neue Adresse (nur bei BEWERBUNG_LIVE=ja)
//  ❌ Absage      → wird gezählt, damit #106 nicht nachfasst
// Gleiche Secrets wie #106 (GMAIL_USER/GMAIL_APP_PASSWORD reichen für IMAP).
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { askKI, parseJsonFromText } from './lib/ki.mjs';
import {
  LIVE, BEWERBER, emailOk, heute, gmailZugang, profil, ladeGeheim, speichereGeheim,
  gmailTransport, holeLebenslauf, cvAnhang, signatur, firmenDomain, meldeMir, anschreibenAnhang,
} from './lib/bewerbung.mjs';
import { STATE_BOT, STATE_POSTFACH } from './106-bewerbungs-bot.mjs';

const MAX_MAILS_PRO_LAUF = 60;
const RANG = { sonstiges: 0, eingangsbestaetigung: 0, weiterleitung: 1, rueckfrage: 2, unzustellbar: 3, einladung: 3, absage: 3 };
// Rückläufer vom Mailserver: Adresse aus der Anzeige gibt es nicht (mehr).
const RUECKLAEUFER_VON = /mailer-daemon|postmaster|mail delivery/i;
const RUECKLAEUFER_BETREFF = /delivery status notification|undeliver|unzustellbar|nicht zugestellt|address not found|adresse nicht gefunden|zustellung fehlgeschlagen|delivery has failed|returned mail|failure notice/i;

function baueIndex(beworben) {
  const perMsgId = new Map(); const perEmail = new Map(); const perDomain = new Map();
  for (const [refnr, b] of Object.entries(beworben)) {
    if (b.messageId) perMsgId.set(b.messageId, refnr);
    perEmail.set(b.email, refnr);
    const d = firmenDomain(b.email);
    if (d) perDomain.set(d, refnr);
  }
  return { perMsgId, perEmail, perDomain };
}

function ordneZu(mail, index) {
  const ids = [mail.inReplyTo, ...(Array.isArray(mail.references) ? mail.references : [mail.references])].filter(Boolean);
  for (const id of ids) if (index.perMsgId.has(id)) return index.perMsgId.get(id);
  const von = mail.from?.value?.[0]?.address?.toLowerCase() || '';
  if (index.perEmail.has(von)) return index.perEmail.get(von);
  const d = firmenDomain(von);
  // Auch Subdomains (bewerbung@jobs.firma.de ↔ karriere@firma.de) zuordnen.
  for (const [dom, refnr] of index.perDomain) if (d && (d === dom || d.endsWith(`.${dom}`) || dom.endsWith(`.${d}`))) return refnr;
  return null;
}

async function klassifiziere(b, mail, text) {
  const prompt = `Ein Bewerber (${BEWERBER()}) hat sich bei "${b.firma}" als "${b.titel}" beworben. Das ist die Antwort-Mail:
Von: ${mail.from?.text || ''}
Betreff: ${mail.subject || ''}
Text: ${text.slice(0, 4000)}

Ordne ein. typ ist genau eins von: "einladung" (Vorstellungsgespräch/Probearbeiten/Einstellungstest/Telefoninterview), "absage", "rueckfrage" (sie wollen etwas wissen oder Unterlagen), "weiterleitung" (Bewerbung bitte an andere Adresse/Portal schicken), "eingangsbestaetigung", "sonstiges".
Antworte NUR mit JSON: {"typ": "...", "zusammenfassung": "1 Satz deutsch", "termin": "Datum/Uhrzeit/Ort falls genannt, sonst leer", "neueEmail": "neue Bewerbungsadresse falls genannt, sonst leer", "portalLink": "Link falls sie ein Bewerbungsportal nennen, sonst leer", "antwortEntwurf": "bei einladung: kurze freundliche Zusage des Termins; bei rueckfrage: Antwort NUR mit Fakten aus dem Profil, fehlende Infos als ehrliche Rückfrage formulieren; sonst leer. Ohne Grußformel/Namen am Ende."}
PROFIL: ${profil()}`;
  return parseJsonFromText(await askKI(prompt, { maxTokens: 900, system: 'Du sortierst Bewerbungs-Antworten. Nur gültiges JSON.' }), {});
}

// Ersatz, wenn die Gratis-KI leer ist: grob über Stichwörter einordnen - lieber einmal zu oft Alarm als eine Einladung verpassen.
function klassifiziereOhneKI(mail, text) {
  const t = `${mail.subject || ''}\n${text}`.slice(0, 6000);
  const betreff = `„${mail.subject || '(ohne Betreff)'}“ – bitte selbst lesen (KI war überlastet)`;
  const neueEmail = (t.match(/(?:an|unter|über)\s+([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i) || [])[1] || '';
  const typ = /leider|absage|nicht (weiter )?berücksichtig|anderen? (bewerber|kandidat)|nicht in die engere|anderweitig besetzt|nicht für sie entschieden/i.test(t) ? 'absage'
    : /einladung|einladen|vorstellungsgespräch|bewerbungsgespräch|kennenlern|telefoninterview|video(call|gespräch|interview)|probearbeit|probetag|einstellungstest|termin/i.test(t) ? 'einladung'
      : /unterlagen|zeugnis|nachreichen|rückfrage|bitte (senden|schicken|teilen) sie|können sie uns|wann (können|könnten) sie/i.test(t) ? 'rueckfrage'
        : neueEmail && /bitte|senden|richten|schicken/i.test(t) ? 'weiterleitung'
          : /eingang|eingegangen|erhalten|vielen dank für ihre bewerbung/i.test(t) ? 'eingangsbestaetigung' : 'sonstiges';
  return { typ, zusammenfassung: betreff, termin: '', neueEmail, portalLink: '', antwortEntwurf: '', ohneKI: true };
}

async function spickzettel(b, k, text) {
  return askKI(`Erstelle einen knackigen Spickzettel (max. 1800 Zeichen, deutsch, Du-Form, mit Emojis als Gliederung) für ein Vorstellungsgespräch.
Firma: ${b.firma} · Stelle: ${b.titel} · Termin: ${k.termin || 'siehe Mail'}
Einladungs-Mail: ${text.slice(0, 1500)}
Profil: ${profil()}
Inhalt: 1) Was die Firma macht (nur Allgemeines, nichts erfinden) 2) Die 5 wahrscheinlichsten Fragen + jeweils eine kurze, ehrliche Antwort aus dem Profil (inkl. "Warum Ausbildung bei uns?", "Stärken/Schwächen", "Warum kein Realschulabschluss?" souverän beantworten) 3) 3 kluge Fragen, die er selbst stellen kann 4) Mitbringen + Outfit + 10 Min früher da sein.`, { maxTokens: 1100 });
}

async function legeEntwurfAn(client, user, mail, b, text) {
  const ordner = (await client.list()).find((m) => m.specialUse === '\\Drafts')?.path || '[Gmail]/Drafts';
  const roh = await new MailComposer({
    from: `${BEWERBER()} <${user}>`, to: mail.from?.value?.[0]?.address, subject: /^re:/i.test(mail.subject || '') ? mail.subject : `Re: ${mail.subject || b.betreff}`,
    text: `${text.trim()}\n${signatur()}`, inReplyTo: mail.messageId, references: [mail.messageId].filter(Boolean),
  }).compile().build();
  await client.append(ordner, roh, ['\\Draft']);
}

async function main() {
  const { user, pass } = gmailZugang();
  const bot = ladeGeheim(STATE_BOT, { beworben: {} });
  const st = ladeGeheim(STATE_POSTFACH, { antworten: {}, zusatzEmails: {}, verarbeitet: [], letzterCheck: '' });
  if (!Object.keys(bot.beworben).length) { console.log('[bewerbungs-postfach] Noch keine echten Bewerbungen raus - nichts zu prüfen.'); return; }

  const index = baueIndex(bot.beworben);
  const verarbeitet = new Set(st.verarbeitet);
  const seit = st.letzterCheck ? new Date(new Date(st.letzterCheck).getTime() - 864e5) : new Date(Date.now() - 21 * 864e5);
  const meldungen = [];
  let transport = null; let cv = null;

  const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass }, logger: false });
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    let mails = [];
    try {
      const uids = (await client.search({ since: seit }, { uid: true })) || [];
      for await (const m of client.fetch(uids.slice(-MAX_MAILS_PRO_LAUF), { source: true }, { uid: true })) mails.push(await simpleParser(m.source));
    } finally { lock.release(); }

    for (const mail of mails) {
      const id = mail.messageId || `${mail.date?.toISOString()}|${mail.subject}`;
      const text = mail.text || String(mail.html || '').replace(/<[^>]+>/g, ' ');
      // Rückläufer auch prüfen, wenn die Mail schon gesehen wurde (idempotent über den Typ).
      const absender = mail.from?.value?.[0]?.address?.toLowerCase() || '';
      if (RUECKLAEUFER_VON.test(`${absender} ${mail.from?.text || ''}`) || RUECKLAEUFER_BETREFF.test(mail.subject || '')) {
        const klein = text.toLowerCase();
        const treffer = Object.entries(bot.beworben).find(([, x]) => x.email && klein.includes(x.email));
        if (treffer && st.antworten[treffer[0]]?.typ !== 'unzustellbar') {
          const [nr, x] = treffer;
          st.antworten[nr] = { typ: 'unzustellbar', datum: heute(), zusammenfassung: `${x.email} existiert nicht` };
          meldungen.push(`📭 Kam nicht an: ${x.titel} – ${x.firma}\n${x.email} gibt es nicht (mehr).\n👉 Selbst bewerben: https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(nr)}`);
        }
        continue;
      }
      if (verarbeitet.has(id)) continue;
      verarbeitet.add(id);
      const von = mail.from?.value?.[0]?.address?.toLowerCase() || '';
      if (von === user.toLowerCase()) continue;

      const refnr = ordneZu(mail, index);
      if (!refnr) continue;
      const b = bot.beworben[refnr];

      let k;
      try { k = await klassifiziere(b, mail, text); } catch { k = klassifiziereOhneKI(mail, text); }
      if (!k?.typ) k = klassifiziereOhneKI(mail, text);
      const typ = String(k.typ || 'sonstiges');
      // Schwächere Signale (Eingangsbestätigung, Weiterleitung) überschreiben nie eine Einladung/Absage.
      if ((RANG[typ] ?? 0) >= (RANG[st.antworten[refnr]?.typ] ?? -1)) {
        st.antworten[refnr] = { typ, datum: heute(), zusammenfassung: k.zusammenfassung || '' };
      }
      const kopf = `${b.titel} – ${b.firma}`;

      if (typ === 'einladung') {
        if (k.antwortEntwurf) await legeEntwurfAn(client, user, mail, b, k.antwortEntwurf);
        let zettel = '';
        try { zettel = await spickzettel(b, k, text); } catch { /* Alarm ist wichtiger als der Zettel */ }
        meldungen.push(`🔥🔥 EINLADUNG! ${kopf}\n📅 ${k.termin || 'Termin siehe Mail'}\n${k.zusammenfassung || ''}\n✉️ Zusage liegt fertig in deinen Gmail-Entwürfen – nur noch Senden drücken!\n\n${zettel}`.slice(0, 4000));
      } else if (typ === 'rueckfrage') {
        if (k.antwortEntwurf) await legeEntwurfAn(client, user, mail, b, k.antwortEntwurf);
        meldungen.push(`❓ Rückfrage von ${kopf}\n${k.zusammenfassung || ''}\n✉️ Antwort-Entwurf liegt in Gmail – kurz checken & senden.`);
      } else if (typ === 'weiterleitung') {
        const neu = String(k.neueEmail || '').toLowerCase().trim();
        if (LIVE && !k.ohneKI && emailOk(neu) && neu !== b.email && !st.zusatzEmails[neu]) {
          transport ||= gmailTransport(); cv ||= await holeLebenslauf();
          await transport.sendMail({ from: `${BEWERBER()} <${user}>`, to: neu, subject: b.betreff, text: `${b.anschreiben}\n${signatur()}`, attachments: [await anschreibenAnhang({ firma: b.firma, ort: '', betreff: b.betreff, anschreiben: b.anschreiben }), cvAnhang(cv)] });
          st.zusatzEmails[neu] = heute();
          index.perEmail.set(neu, refnr);
          meldungen.push(`↪️ ${kopf}: wollte die Bewerbung an ${neu} – automatisch nachgeschickt ✅`);
        } else {
          meldungen.push(`↪️ ${kopf}: ${k.zusammenfassung || 'bitte über andere Adresse/Portal bewerben'}${k.portalLink ? `\n${k.portalLink}` : ''}`);
        }
      } else if (typ === 'absage') {
        meldungen.push(`❌ Absage: ${kopf} – abgehakt, weiter geht's.`);
      } else if (k.ohneKI && typ === 'sonstiges') {
        meldungen.push(`📩 Neue Mail von ${kopf}\n${k.zusammenfassung}`);
      }
    }
  } finally {
    await client.logout().catch(() => {});
  }

  st.verarbeitet = [...verarbeitet].slice(-1500);
  st.letzterCheck = new Date().toISOString();
  speichereGeheim(STATE_POSTFACH, st);

  if (meldungen.length) {
    const typen = Object.values(st.antworten).map((a) => a.typ);
    const z = (t) => typen.filter((x) => x === t).length;
    const offen = Object.keys(bot.beworben).length - z('einladung') - z('absage') - z('unzustellbar');
    const bilanz = `\n📊 Bilanz: ${z('einladung')} Einladungen · ${z('absage')} Absagen · ${z('unzustellbar')} nicht zugestellt · ${offen} noch offen`;
    transport ||= gmailTransport();
    const einladung = meldungen.some((m) => m.includes('EINLADUNG'));
    await meldeMir(einladung ? '🔥🔥 EINLADUNG ZUM GESPRÄCH – sofort lesen!' : `📬 ${meldungen.length} neue Antwort(en) auf deine Bewerbungen`, `${meldungen.join('\n\n────────\n\n')}\n${bilanz}`, transport);
  }
  console.log(`[bewerbungs-postfach] ${meldungen.length} relevante Antwort(en).`);
}

main().catch((err) => {
  console.error('[bewerbungs-postfach]', err.message);
  process.exit(err.uebersprungen ? 0 : 1);
});
