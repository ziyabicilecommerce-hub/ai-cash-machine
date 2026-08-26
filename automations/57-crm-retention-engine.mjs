// CRM & Retention Engine - segmentiert den GESAMTEN Kundenstamm (VIP, at-risk,
// treu-aktiv, neu, einmalig, ruhend) und schickt den wertvollsten gefährdeten
// Kunden (hoher Umsatz, aber lange inaktiv) ein PERSONALISIERTES Angebot
// statt eines pauschalen Rabattcodes für alle. Neu, kein n8n-Workflow ·
// Zeitplan: wöchentlich.
//
// Unterscheidet sich bewusst von #05 Winback-Maschine (schickt ALLEN
// Inaktiven denselben Rabattcode, ohne nach Kundenwert zu unterscheiden):
// CRM & Retention Engine schaut auf den GANZEN Kundenstamm, priorisiert nach
// Customer-Lifetime-Value, und personalisiert das Angebot pro Kunde. Für die
// wertvollsten At-Risk-Kunden geht zusätzlich eine SMS raus (optional, Twilio)
// - die erste SMS-Fähigkeit in der Suite, bewusst nur für die wichtigsten
// Fälle reserviert, nicht für Massenversand.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config, isTestMode } from './lib/config.mjs';
import { getCustomers, getOrdersSince } from './lib/shopify.mjs';
import { askKI, parseJsonFromText } from './lib/ki.mjs';
import { sendEmail } from './lib/email.mjs';
import { sendeSms } from './lib/sms.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { loadState, saveState } from './lib/state.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMAND_DIR = join(__dirname, '..', 'command');

const STATE_NAME = 'crm-retention-state';
const KONTAKT_ABSTAND_TAGE = 90;

function tageSeit(datumStr) {
  if (!datumStr) return Infinity;
  return (Date.now() - new Date(datumStr).getTime()) / (1000 * 3600 * 24);
}

// LOOKBACK_TAGE deutlich größer als jede sinnvolle at-risk-Schwelle - Kunden
// ohne Bestellung innerhalb dieses Fensters gelten automatisch als inaktiv,
// ohne pro Kunde einzeln nachfragen zu müssen (N+1-API-Calls vermeiden).
const LOOKBACK_TAGE = 400;

async function ermittleLetzteBestellDaten() {
  const seit = new Date();
  seit.setDate(seit.getDate() - LOOKBACK_TAGE);
  const orders = (await getOrdersSince(seit)).filter((o) => !o.cancelled_at && o.email);

  const letzteProKunde = {};
  for (const o of orders) {
    const bisher = letzteProKunde[o.email];
    if (!bisher || new Date(o.created_at) > new Date(bisher)) {
      letzteProKunde[o.email] = o.created_at;
    }
  }
  return letzteProKunde;
}

function segmentiere(kunden, letzteBestellDaten, atRiskTage, vipUmsatzSchwelle) {
  const segmente = { vip: [], atRisk: [], treuAktiv: [], neu: [], einmalig: [], ruhend: [] };
  for (const k of kunden) {
    const umsatz = parseFloat(k.total_spent || 0);
    const bestellungen = parseInt(k.orders_count || 0, 10);
    if (bestellungen === 0) continue;

    // Keine Bestellung innerhalb der letzten LOOKBACK_TAGE gefunden -> gilt als inaktiv
    const letzteBestellung = letzteBestellDaten[k.email];
    const tageSeitLetzterBestellung = tageSeit(letzteBestellung);

    const istWertvoll = umsatz >= vipUmsatzSchwelle;
    const istInaktiv = tageSeitLetzterBestellung >= atRiskTage;

    if (istWertvoll && istInaktiv) segmente.atRisk.push(k);
    else if (istWertvoll) segmente.vip.push(k);
    else if (bestellungen === 1 && !istInaktiv) segmente.neu.push(k);
    else if (bestellungen === 1 && istInaktiv) segmente.einmalig.push(k);
    else if (istInaktiv) segmente.ruhend.push(k);
    else segmente.treuAktiv.push(k);
  }
  return segmente;
}

// Veröffentlicht NUR Aggregate + Vorname (kein voller Kundendatensatz) fürs
// Command-Dashboard - echte LTV-Segmentierung sichtbar machen, ohne mehr
// Kundendaten öffentlich preiszugeben als für "wer/wie viele/wie wertvoll"
// nötig ist. Segment-Reihenfolge nach Wichtigkeit fürs Geschäft.
function veroeffentlicheSegmente(segmente, atRiskTage, vipUmsatzSchwelle, angeschrieben) {
  function fasseZusammen(kunden, topN = 8) {
    const gesamtUmsatz = kunden.reduce((s, k) => s + parseFloat(k.total_spent || 0), 0);
    const top = [...kunden]
      .sort((a, b) => parseFloat(b.total_spent || 0) - parseFloat(a.total_spent || 0))
      .slice(0, topN)
      .map((k) => ({
        vorname: k.first_name || 'Kunde',
        umsatz: Number(parseFloat(k.total_spent || 0).toFixed(2)),
        bestellungen: parseInt(k.orders_count || 0, 10),
      }));
    return { anzahl: kunden.length, gesamtUmsatz: Number(gesamtUmsatz.toFixed(2)), top };
  }

  if (!existsSync(COMMAND_DIR)) mkdirSync(COMMAND_DIR, { recursive: true });
  writeFileSync(
    join(COMMAND_DIR, 'customer-segmente.json'),
    JSON.stringify({
      updatedAt: new Date().toISOString(),
      atRiskTageSchwelle: atRiskTage,
      vipUmsatzSchwelle,
      diesenLaufKontaktiert: angeschrieben,
      segmente: {
        vip: fasseZusammen(segmente.vip),
        atRisk: fasseZusammen(segmente.atRisk),
        treuAktiv: fasseZusammen(segmente.treuAktiv, 0),
        neu: fasseZusammen(segmente.neu, 0),
        einmalig: fasseZusammen(segmente.einmalig, 0),
        ruhend: fasseZusammen(segmente.ruhend, 0),
      },
    }, null, 2)
  );
}

async function main() {
  const atRiskTage = parseInt(config.CRM_AT_RISK_TAGE, 10) || 45;
  const vipUmsatzSchwelle = parseFloat(config.VIP_UMSATZ_SCHWELLE || '150');
  const smsTopN = parseInt(config.CRM_SMS_TOP_N, 10) || 3;
  const maxProLauf = parseInt(config.CRM_MAX_PRO_LAUF, 10) || 10;

  const kunden = await getCustomers({ limit: '250' });
  const letzteBestellDaten = await ermittleLetzteBestellDaten();
  const segmente = segmentiere(kunden, letzteBestellDaten, atRiskTage, vipUmsatzSchwelle);

  const state = loadState(STATE_NAME);
  const letzterKontakt = state.letzterKontakt || {};
  const jetzt = Date.now();

  const behandelbar = segmente.atRisk
    .filter((k) => tageSeit(letzterKontakt[k.id]) >= KONTAKT_ABSTAND_TAGE)
    .sort((a, b) => parseFloat(b.total_spent || 0) - parseFloat(a.total_spent || 0))
    .slice(0, maxProLauf);

  let angeschrieben = 0;
  let perSms = 0;

  // Einträge, die viel länger als KONTAKT_ABSTAND_TAGE zurückliegen, sperren
  // ohnehin nichts mehr (siehe Filter oben) - ohne Aufräumen würde der State
  // für längst inaktive/gelöschte Kunden unbegrenzt weiterwachsen.
  const AUFRAEUM_SCHWELLE_TAGE = KONTAKT_ABSTAND_TAGE * 4;
  for (const kundenId of Object.keys(letzterKontakt)) {
    if (tageSeit(letzterKontakt[kundenId]) > AUFRAEUM_SCHWELLE_TAGE) delete letzterKontakt[kundenId];
  }

  for (let i = 0; i < behandelbar.length; i++) {
    const k = behandelbar[i];
    try {
      const umsatz = parseFloat(k.total_spent || 0);
      const bestellungen = parseInt(k.orders_count || 0, 10);
      const vorname = k.first_name || '';

      const prompt = `Du bist CRM-/Retention-Stratege für den Onlineshop "${config.SHOP_NAME}". Dieser Kunde ist SEHR wertvoll (Gesamtumsatz bisher: ${umsatz.toFixed(2)} EUR, ${bestellungen} Bestellungen), hat aber seit über ${atRiskTage} Tagen nichts mehr gekauft - besonders schade, ihn zu verlieren.

Vorname: ${vorname || 'unbekannt (neutral anreden)'}
Bisheriger Gesamtumsatz: ${umsatz.toFixed(2)} EUR

Schreibe ein PERSÖNLICHES Rückgewinnungs-Angebot auf Deutsch (Du-Form), das seinen Wert als Kunde explizit würdigt (nicht generisch wie an jeden Erstkäufer) - max 120 Wörter, HTML mit Inline-CSS, EIN Rabattcode-Vorschlag (großzügiger als ein Standard-Winback-Code, da High-Value-Kunde), EIN Button zum Shop.

Antworte NUR mit validem JSON, ohne Markdown:
{"betreff": "...", "html": "...", "sms_text": "kurze SMS-Version, max 300 Zeichen inkl. Rabattcode, ohne HTML"}`;

      const antwort = await askKI(prompt, { maxTokens: 2000 });
      const daten = parseJsonFromText(antwort, null);
      if (!daten || !daten.html) continue;

      const empfaenger = isTestMode() ? config.OWNER_EMAIL : k.email;
      await sendEmail({ to: empfaenger, subject: daten.betreff || 'Ein persönliches Angebot für dich', html: daten.html });
      angeschrieben++;

      if (i < smsTopN && k.phone && daten.sms_text) {
        await sendeSms(k.phone, daten.sms_text);
        perSms++;
      }

      // Erst NACH erfolgreichem Versand als kontaktiert markieren und sofort
      // speichern - schlägt ein späterer Kunde im selben Lauf fehl, geht
      // dieser Erfolg nicht verloren (sonst würde der nächste Lauf denselben
      // High-Value-Kunden nochmal anschreiben).
      letzterKontakt[k.id] = new Date(jetzt).toISOString();
      state.letzterKontakt = letzterKontakt;
      saveState(STATE_NAME, state);
    } catch (err) {
      console.error(`[57-crm-retention-engine] Kunde ${k.id} fehlgeschlagen, wird beim nächsten Lauf erneut versucht:`, err.message || err);
    }
  }

  veroeffentlicheSegmente(segmente, atRiskTage, vipUmsatzSchwelle, angeschrieben);

  const digest = [
    `❤️ *CRM & Retention Engine* - wöchentlicher Kundenstamm-Überblick`,
    `VIP (aktiv): ${segmente.vip.length} · At-Risk (wertvoll, inaktiv): ${segmente.atRisk.length} · Treu & aktiv: ${segmente.treuAktiv.length}`,
    `Neu: ${segmente.neu.length} · Einmalig (inaktiv): ${segmente.einmalig.length} · Ruhend: ${segmente.ruhend.length}`,
    `Diesen Lauf: ${angeschrieben} personalisierte At-Risk-Angebote versendet${perSms ? `, davon ${perSms} zusätzlich per SMS` : ''}.`,
  ].join('\n');
  await notifyWhatsapp(digest);

  console.log(`[57-crm-retention-engine] ${angeschrieben} At-Risk-Kunde(n) kontaktiert (${perSms} per SMS).`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[57-crm-retention-engine] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[57-crm-retention-engine] Fehler:', err);
  process.exit(1);
});
