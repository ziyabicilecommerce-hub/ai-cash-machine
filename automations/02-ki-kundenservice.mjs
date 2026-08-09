// KI-Kundenservice (= "Customer Support AI") - liest neue Kunden-E-Mails per
// IMAP, gleicht die ECHTE Bestellung des Kunden ab (Shopify, per E-Mail-
// Adresse), lässt Claude mit echten Fakten antworten, und eskaliert
// Sonderfälle sowohl per Telegram als auch als echtes GitHub-Issue-Ticket.
// Original: n8n Workflow "02_KI_Kundenservice" · Trigger: neue IMAP-E-Mail (hier: alle 10 Min gepollt)
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { config, isTestMode, ueberspringenWerfen } from './lib/config.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { getOrders } from './lib/shopify.mjs';
import { erstelleTicket } from './lib/githubIssues.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '02-ki-kundenservice';

// Markiert NUR die Kandidaten-UIDs, die diese Automation überhaupt schon
// einmal gesehen hat (verhindert, dass dieselbe E-Mail bei jedem 10-Minuten-
// Lauf neu heruntergeladen wird) - NICHT, dass sie bereits beantwortet wurde.
// Das eigentliche "beantwortet"-Tracking passiert in main(), erst NACH
// erfolgreicher Verarbeitung - sonst würde eine E-Mail, deren Verarbeitung
// mitten im Lauf fehlschlägt (Claude-/Resend-Ausfall), fälschlich als erledigt
// markiert und nie beantwortet, obwohl sie schon als "gesehen" abgespeichert wäre.
// Ohne diese Prüfung schlägt ein fehlendes IMAP_HOST-Secret erst tief in der
// TCP-Verbindung fehl ("ECONNREFUSED 127.0.0.1:993" - ImapFlow verbindet sich
// mit localhost, wenn host undefined ist) statt mit einem klaren Hinweis.
function pruefeImapConfig() {
  if (!process.env.IMAP_HOST || !process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
    ueberspringenWerfen('IMAP_HOST/IMAP_USER/IMAP_PASSWORD-Secret ist nicht gesetzt - bitte in GitHub → Settings → Secrets and variables → Actions eintragen (siehe setup/ App oder automations/README.md).');
  }
}

async function fetchNewEmails(state) {
  pruefeImapConfig();
  const client = new ImapFlow({
    host: process.env.IMAP_HOST,
    port: Number(process.env.IMAP_PORT || 993),
    secure: true,
    auth: { user: process.env.IMAP_USER, pass: process.env.IMAP_PASSWORD },
    logger: false,
  });

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
    }
  } finally {
    lock.release();
  }
  await client.logout();

  return neu;
}

// Sucht die letzte Bestellung des Kunden per E-Mail-Adresse - damit Claude
// mit ECHTEN Fakten antworten kann (Status, Artikel, Tracking) statt nur
// generischer Versand-/Retoure-Policy.
export async function findeLetzteBestellung(kundeEmail) {
  if (!kundeEmail) return null;
  try {
    const orders = await getOrders({ email: kundeEmail, limit: '5', status: 'any' });
    if (!orders.length) return null;
    const letzte = orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const fulfillment = (letzte.fulfillments || [])[0];
    return {
      bestellnummer: letzte.order_number || letzte.id,
      status: letzte.fulfillment_status || 'unfulfilled',
      artikel: (letzte.line_items || []).map((li) => `${li.quantity}x ${li.title}`).join(', '),
      trackingNummer: fulfillment ? fulfillment.tracking_number : null,
      trackingUrl: fulfillment ? fulfillment.tracking_url : null,
      bestelltAm: letzte.created_at,
    };
  } catch (err) {
    console.error('[02-ki-kundenservice] Bestellabgleich fehlgeschlagen:', err.message);
    return null;
  }
}

export function buildPrompt(mail, bestellung) {
  const von = mail.from || '';
  const betreff = mail.subject;
  const text = (mail.textPlain || '').toString().slice(0, 4000);
  const m = von.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  const kundeEmail = m ? m[0] : '';

  const bestellInfo = bestellung
    ? `${NL}${NL}ECHTE Bestelldaten dieses Kunden (nutze diese, keine anderen Zahlen erfinden):${NL}Bestellnummer: ${bestellung.bestellnummer}${NL}Status: ${bestellung.status}${NL}Artikel: ${bestellung.artikel}${NL}Tracking: ${bestellung.trackingNummer ? `${bestellung.trackingNummer} (${bestellung.trackingUrl || 'kein Link'})` : 'noch kein Tracking vorhanden'}${NL}Bestellt am: ${bestellung.bestelltAm}`
    : `${NL}${NL}Keine passende Bestellung zu dieser E-Mail-Adresse gefunden - erfinde KEINE Bestelldaten, frage im Zweifel nach der Bestellnummer.`;

  const prompt = `Du bist der Kundenservice des Onlineshops "${config.SHOP_NAME}". ${
    config.ANSPRACHE === 'du' ? 'Duze den Kunden.' : 'Sieze den Kunden.'
  }${NL}${NL}Shop-Infos:${NL}- Versandzeit: ${config.VERSANDZEIT}${NL}- Rückgaberecht: ${config.RETOURE_TAGE} Tage${bestellInfo}${NL}${NL}Eingegangene Kunden-E-Mail:${NL}Von: ${von}${NL}Betreff: ${betreff}${NL}${NL}${text}${NL}${NL}Aufgaben:${NL}1. Klassifiziere die E-Mail: versand | retoure | produktfrage | beschwerde | sonstiges${NL}2. Entscheide, ob ein Mensch übernehmen muss (braucht_mensch = "ja" bei: Rechtsthemen, Drohungen, Rückbuchungen/Chargebacks, sehr wütenden Kunden, individuellen Sonderfällen, oder wenn du Bestelldaten bräuchtest die du nicht hast). Standardfragen (Versandzeit, Retoure-Ablauf, allgemeine Produktfragen, Bestellstatus/Tracking WENN oben Bestelldaten vorhanden sind) beantwortest du selbst.${NL}3. Schreibe eine freundliche, hilfreiche Antwort-E-Mail auf Deutsch als sauberes HTML (Inline-CSS, kurz und klar). Nutze NUR die oben angegebenen echten Bestelldaten, erfinde KEINE Fakten, keine Tracking-Nummern, keine Bestelldetails.${NL}${NL}Antworte NUR mit validem JSON, ohne Markdown:${NL}{"kategorie": "...", "braucht_mensch": "ja|nein", "betreff": "Re: ...", "antwort_html": "..."}`;

  return { prompt, kundeEmail, betreff, text: text.slice(0, 800) };
}

async function main() {
  const state = loadState(STATE_KEY);
  state.seenUids = state.seenUids || [];
  const seenSet = new Set(state.seenUids);

  const mails = await fetchNewEmails(state);
  console.log(`[02-ki-kundenservice] ${mails.length} neue E-Mail(s)`);

  let erledigt = 0;
  let fehlgeschlagen = 0;

  for (const mail of mails) {
    try {
      const m = (mail.from || '').match(/[\w.+-]+@[\w-]+\.[\w.]+/);
      const bestellung = await findeLetzteBestellung(m ? m[0] : '');
      const { prompt, kundeEmail, betreff, text } = buildPrompt(mail, bestellung);
      const antwort = await askClaude(prompt, { maxTokens: 2500 });
      const daten = parseJsonFromText(antwort, {
        kategorie: 'sonstiges',
        braucht_mensch: 'ja',
        betreff: 'Re: Ihre Anfrage',
        antwort_html: antwort,
      });

      const nurText = (daten.antwort_html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1200);

      if (daten.braucht_mensch === 'ja') {
        const bestellZeile = bestellung
          ? `Bestellung #${bestellung.bestellnummer} (${bestellung.status}), Artikel: ${bestellung.artikel}`
          : 'Keine passende Bestellung gefunden';
        const telegramText = `KUNDENSERVICE - Mensch gebraucht!${NL}${NL}Von: ${kundeEmail}${NL}Kategorie: ${daten.kategorie}${NL}Betreff: ${betreff}${NL}${bestellZeile}${NL}${NL}Nachricht:${NL}${text}${NL}${NL}--- Claude-Entwurf (nicht gesendet) ---${NL}${nurText}`;
        await notifyTelegram(telegramText);

        await erstelleTicket({
          title: `[Kundenservice] ${daten.kategorie}: ${betreff}`,
          body: `**Von:** ${kundeEmail}\n**Kategorie:** ${daten.kategorie}\n**${bestellZeile}**\n\n**Nachricht:**\n${text}\n\n---\n**Claude-Entwurf (nicht automatisch gesendet, von einem Menschen prüfen):**\n${nurText}`,
          labels: ['kundenservice', daten.kategorie],
        });
      } else {
        const empfaenger = isTestMode() ? config.OWNER_EMAIL : kundeEmail;
        const finalBetreff = daten.betreff || `Re: ${betreff}`;
        await sendEmail({ to: empfaenger, subject: finalBetreff, html: daten.antwort_html || '' });
      }

      // Erst NACH erfolgreicher Beantwortung/Eskalation als "seen" markieren
      // und sofort speichern - damit eine spätere E-Mail im selben Batch,
      // die fehlschlägt, diesen Erfolg nicht rückgängig macht.
      seenSet.add(mail.uid);
      state.seenUids = Array.from(seenSet).slice(-2000);
      saveState(STATE_KEY, state);
      erledigt++;
    } catch (err) {
      // NICHT als seen markieren - wird beim nächsten Lauf (10 Min später)
      // automatisch erneut versucht. Andere E-Mails im selben Batch werden
      // trotzdem weiterverarbeitet, statt dass ein einzelner Fehler den
      // ganzen restlichen Batch blockiert.
      fehlgeschlagen++;
      console.error(`[02-ki-kundenservice] Verarbeitung von E-Mail (UID ${mail.uid}) fehlgeschlagen, wird beim nächsten Lauf erneut versucht:`, err.message || err);
    }
  }

  if (fehlgeschlagen > 0) {
    console.log(`[02-ki-kundenservice] ${erledigt} erledigt, ${fehlgeschlagen} fehlgeschlagen (Retry beim nächsten Lauf)`);
  }
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[02-ki-kundenservice] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[02-ki-kundenservice] Fehler:', err);
  process.exit(1);
});
