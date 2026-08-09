// DSGVO-Anfragen-Wächter - liest dasselbe Postfach wie #02 KI-Kundenservice
// (eigener, unabhängiger Lese-/Dedup-Zustand - stört #02 nicht), aber mit
// EINEM einzigen Fokus: fristkritische Datenschutz-Anfragen (Auskunft nach
// Art. 15 DSGVO, Löschung, Widerspruch/Widerruf) erkennen und SOFORT
// eskalieren, mit klarem Frist-Hinweis. Diese Anfragen haben eine gesetzliche
// Antwortfrist (i.d.R. 1 Monat) und dürfen nicht in einer allgemeinen
// Support-Inbox untergehen. Neu, kein n8n-Workflow · Zeitplan: alle 2 Stunden.
//
// WICHTIG: beantwortet oder löscht NICHTS automatisch - reine Erkennung +
// Eskalation mit Frist. Die eigentliche Bearbeitung bleibt bewusst
// Menschenwerk (bei DSGVO-Anfragen zu automatisieren wäre fahrlässig).
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { config, ueberspringenWerfen } from './lib/config.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { erstelleTicket } from './lib/githubIssues.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '69-dsgvo-anfragen-waechter';

// Ohne diese Prüfung schlägt ein fehlendes IMAP_HOST-Secret erst tief in der
// TCP-Verbindung fehl ("ECONNREFUSED 127.0.0.1:993" - ImapFlow verbindet sich
// mit localhost, wenn host undefined ist) statt mit einem klaren Hinweis.
function pruefeImapConfig() {
  if (!process.env.IMAP_HOST || !process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
    ueberspringenWerfen('IMAP_HOST/IMAP_USER/IMAP_PASSWORD-Secret ist nicht gesetzt - bitte in GitHub → Settings → Secrets and variables → Actions eintragen (siehe setup/ App oder automations/README.md).');
  }
}

async function fetchUngeleseneMails(seenUids) {
  pruefeImapConfig();
  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT || 993),
    secure: true,
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
    logger: false,
  });

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
        text: (parsed.text || parsed.html || '').toString().slice(0, 3000),
      });
    }
  } finally {
    lock.release();
  }
  await client.logout();
  return neu;
}

async function main() {
  const fristTage = parseInt(config.DSGVO_FRIST_TAGE || '30', 10);
  const state = loadState(STATE_KEY);
  state.gesehen = state.gesehen || [];
  const seenSet = new Set(state.gesehen);

  const mails = await fetchUngeleseneMails(seenSet);
  if (!mails.length) {
    console.log('[69-dsgvo-anfragen-waechter] Keine neuen E-Mails.');
    return;
  }

  const liste = mails
    .map((m, i) => `${i + 1}. Von: ${m.from}${NL}Betreff: ${m.subject}${NL}Text: ${m.text.slice(0, 500)}`)
    .join(`${NL}${NL}`);

  const prompt = `Du prüfst eingehende E-Mails an den Kundenservice von "${config.SHOP_NAME}" NUR auf eine Sache: ist es eine Datenschutz-/DSGVO-Anfrage (Auskunft über gespeicherte Daten, Löschung der Daten, Widerspruch gegen Verarbeitung, Widerruf einer Einwilligung)? Normale Bestell-/Produktfragen sind KEINE DSGVO-Anfrage, auch wenn sie das Wort "Daten" enthalten (z.B. "meine Lieferdaten").${NL}${NL}${liste}${NL}${NL}Antworte NUR mit validem JSON, ohne Markdown, in der Reihenfolge der Liste oben:${NL}{"bewertungen": [{"ist_dsgvo": true oder false, "kategorie": "auskunft|loeschung|widerspruch|sonstiges", "zusammenfassung": "ein Satz"}]}`;

  const antwort = await askClaude(prompt, { maxTokens: 2000 });
  const bewertungen = parseJsonFromText(antwort, {}).bewertungen || null;

  let dsgvoFaelle = 0;
  for (let i = 0; i < mails.length; i++) {
    const mail = mails[i];
    const bewertung = Array.isArray(bewertungen) ? bewertungen[i] : null;

    if (bewertung?.ist_dsgvo) {
      dsgvoFaelle++;
      const frist = new Date();
      frist.setDate(frist.getDate() + fristTage);
      const fristStr = frist.toLocaleDateString('de-DE');

      const text = `⚖️ DSGVO-ANFRAGE ERKANNT - Frist: ${fristStr}${NL}${NL}Von: ${mail.from}${NL}Betreff: ${mail.subject}${NL}Kategorie: ${bewertung.kategorie}${NL}${bewertung.zusammenfassung}${NL}${NL}Bitte innerhalb der gesetzlichen Frist persönlich bearbeiten - keine automatische Antwort/Löschung.`;
      await notifyTelegram(text);

      await erstelleTicket({
        title: `[DSGVO] ${bewertung.kategorie} - Frist ${fristStr}`,
        body: `**Von:** ${mail.from}\n**Betreff:** ${mail.subject}\n**Frist:** ${fristStr} (${fristTage} Tage ab jetzt)\n**Kategorie:** ${bewertung.kategorie}\n**Zusammenfassung:** ${bewertung.zusammenfassung}\n\n**Original-Text (Auszug):**\n${mail.text.slice(0, 1000)}\n\n_Diese Anfrage braucht eine persönliche, fristgerechte Bearbeitung - keine Automatisierung._`,
        labels: ['dsgvo', 'dringend'],
      });
    }

    // Jede E-Mail (DSGVO oder nicht) als gesehen markieren, sobald die
    // Batch-Bewertung oben erfolgreich war - sonst würde dieselbe Mail bei
    // jedem 2-Stunden-Lauf erneut komplett neu bewertet.
    seenSet.add(mail.uid);
  }

  state.gesehen = Array.from(seenSet).slice(-2000);
  saveState(STATE_KEY, state);

  console.log(`[69-dsgvo-anfragen-waechter] ${mails.length} E-Mail(s) geprüft, ${dsgvoFaelle} DSGVO-Fall/Fälle eskaliert.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[69-dsgvo-anfragen-waechter] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[69-dsgvo-anfragen-waechter] Fehler:', err);
  process.exit(1);
});
