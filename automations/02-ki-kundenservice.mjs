// KI-Kundenservice - liest neue Kunden-E-Mails per IMAP, lässt Claude antworten,
// eskaliert Sonderfälle per Telegram an dich.
// Original: n8n Workflow "02_KI_Kundenservice" · Trigger: neue IMAP-E-Mail (hier: alle 10 Min gepollt)
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { config, isTestMode } from './lib/config.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '02-ki-kundenservice';

async function fetchNewEmails() {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT || 993),
    secure: true,
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
    logger: false,
  });

  const state = loadState(STATE_KEY);
  const seenUids = new Set(state.seenUids || []);
  const neu = [];

  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    const uids = await client.search({ seen: false });
    for (const uid of uids) {
      if (seenUids.has(uid)) continue;
      const msg = await client.fetchOne(uid, { source: true });
      const parsed = await simpleParser(msg.source);
      neu.push({
        uid,
        from: parsed.from?.text || '',
        subject: parsed.subject || '(kein Betreff)',
        textPlain: parsed.text || parsed.html || '',
      });
      seenUids.add(uid);
    }
  } finally {
    lock.release();
  }
  await client.logout();

  state.seenUids = Array.from(seenUids).slice(-2000);
  saveState(STATE_KEY, state);
  return neu;
}

function buildPrompt(mail) {
  const von = mail.from || '';
  const betreff = mail.subject;
  const text = (mail.textPlain || '').toString().slice(0, 4000);
  const m = von.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  const kundeEmail = m ? m[0] : '';

  const prompt = `Du bist der Kundenservice des Onlineshops "${config.SHOP_NAME}". ${
    config.ANSPRACHE === 'du' ? 'Duze den Kunden.' : 'Sieze den Kunden.'
  }${NL}${NL}Shop-Infos:${NL}- Versandzeit: ${config.VERSANDZEIT}${NL}- Rückgaberecht: ${config.RETOURE_TAGE} Tage${NL}${NL}Eingegangene Kunden-E-Mail:${NL}Von: ${von}${NL}Betreff: ${betreff}${NL}${NL}${text}${NL}${NL}Aufgaben:${NL}1. Klassifiziere die E-Mail: versand | retoure | produktfrage | beschwerde | sonstiges${NL}2. Entscheide, ob ein Mensch übernehmen muss (braucht_mensch = "ja" bei: Rechtsthemen, Drohungen, Rückbuchungen/Chargebacks, sehr wütenden Kunden, individuellen Sonderfällen, oder wenn du Bestelldaten bräuchtest die du nicht hast). Standardfragen (Versandzeit, Retoure-Ablauf, allgemeine Produktfragen) beantwortest du selbst.${NL}3. Schreibe eine freundliche, hilfreiche Antwort-E-Mail auf Deutsch als sauberes HTML (Inline-CSS, kurz und klar). Erfinde KEINE Fakten, keine Tracking-Nummern, keine Bestelldetails.${NL}${NL}Antworte NUR mit validem JSON, ohne Markdown:${NL}{"kategorie": "...", "braucht_mensch": "ja|nein", "betreff": "Re: ...", "antwort_html": "..."}`;

  return { prompt, kundeEmail, betreff, text: text.slice(0, 800) };
}

async function main() {
  const mails = await fetchNewEmails();
  console.log(`[02-ki-kundenservice] ${mails.length} neue E-Mail(s)`);

  for (const mail of mails) {
    const { prompt, kundeEmail, betreff, text } = buildPrompt(mail);
    const antwort = await askClaude(prompt, { maxTokens: 2500 });
    const daten = parseJsonFromText(antwort, {
      kategorie: 'sonstiges',
      braucht_mensch: 'ja',
      betreff: 'Re: Ihre Anfrage',
      antwort_html: antwort,
    });

    const nurText = (daten.antwort_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1200);
    const telegramText = `KUNDENSERVICE - Mensch gebraucht!${NL}${NL}Von: ${kundeEmail}${NL}Kategorie: ${daten.kategorie}${NL}Betreff: ${betreff}${NL}${NL}Nachricht:${NL}${text}${NL}${NL}--- Claude-Entwurf (nicht gesendet) ---${NL}${nurText}`;

    const empfaenger = isTestMode() ? config.OWNER_EMAIL : kundeEmail;
    const finalBetreff = daten.betreff || `Re: ${betreff}`;

    if (daten.braucht_mensch === 'ja') {
      await notifyTelegram(telegramText);
    } else {
      await sendEmail({ to: empfaenger, subject: finalBetreff, html: daten.antwort_html || '' });
    }
  }
}

main().catch((err) => {
  console.error('[02-ki-kundenservice] Fehler:', err);
  process.exit(1);
});
