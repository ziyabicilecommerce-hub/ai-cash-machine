// Zahlungs-Retter - freundliche Erinnerung bei offener Zahlung (Vorkasse/Überweisung), kein Mahn-Ton
// Original: n8n Workflow "29_Zahlungs_Retter" · Zeitplan: täglich 14:00
import { config, isTestMode } from './lib/config.mjs';
import { getOrders } from './lib/shopify.mjs';
import { askKI, parseJsonFromText } from './lib/ki.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '29-zahlungs-retter';

async function main() {
  const vor14Tagen = new Date();
  vor14Tagen.setDate(vor14Tagen.getDate() - 14);

  const alleOrders = await getOrders({
    status: 'open',
    financial_status: 'pending',
    created_at_min: encodeURIComponent(vor14Tagen.toISOString()),
  });

  const jetzt = Date.now();
  const orders = alleOrders.filter((o) => {
    if (o.cancelled_at || !o.email) return false;
    const alterTage = (jetzt - new Date(o.created_at).getTime()) / 86400000;
    return alterTage >= 2 && alterTage <= 12;
  });

  const state = loadState(STATE_KEY);
  state.erinnert = state.erinnert || [];
  let verarbeitet = 0;

  for (const o of orders) {
    if (state.erinnert.includes(o.id)) continue;

    try {
      const vorname = o.customer?.first_name || '';
      const summe = parseFloat(o.total_price || 0).toFixed(2);
      const waehrung = o.currency || 'EUR';
      const artikel = (o.line_items || []).map((li) => li.title).slice(0, 3).join(', ');
      const bestellnr = o.name || `#${o.order_number}`;

      const prompt = `Du bist freundlicher Kundenservice des Onlineshops "${config.SHOP_NAME}".${NL}Diese Bestellung wurde aufgegeben, aber die Zahlung ist noch offen/ausstehend (z.B. Vorkasse/Überweisung noch nicht eingegangen).${NL}Bestellung: ${bestellnr}, Betrag: ${summe} ${waehrung}, Artikel: ${artikel || 'diverses'}.${NL}${NL}Schreibe eine hilfsbereite, KEINE-Mahnung-Erinnerungs-Mail auf Deutsch (Du-Form), max 110 Wörter:${NL}- Vorname: ${vorname || 'unbekannt (neutral anreden)'}${NL}- Freundlich daran erinnern, dass die Zahlung noch aussteht und die Artikel reserviert sind${NL}- Hilfe anbieten, falls bei der Zahlung etwas hakte (einfach auf diese Mail antworten)${NL}- Kein Druck, kein Mahn-Ton - der Kunde WILL ja kaufen${NL}- Schlichtes, freundliches HTML${NL}Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}`;

      const antwort = await askKI(prompt, { maxTokens: 1200 });
      const daten = parseJsonFromText(antwort, { betreff: 'Kurze Erinnerung zu deiner Bestellung', html: antwort });

      const empfaenger = isTestMode() ? config.OWNER_EMAIL : o.email;
      await sendEmail({ to: empfaenger, subject: daten.betreff, html: daten.html });

      // Erst NACH erfolgreichem Versand als "erinnert" markieren und sofort
      // speichern - schlägt eine spätere Bestellung im selben Lauf fehl, geht
      // dieser Erfolg nicht verloren (sonst würde der nächste Lauf denselben
      // Kunden nochmal anschreiben).
      state.erinnert.push(o.id);
      if (state.erinnert.length > 8000) state.erinnert = state.erinnert.slice(-8000);
      saveState(STATE_KEY, state);
      verarbeitet++;
    } catch (err) {
      console.error(`[29-zahlungs-retter] Bestellung ${o.id} fehlgeschlagen, wird beim nächsten Lauf erneut versucht:`, err.message || err);
    }
  }

  console.log(`[29-zahlungs-retter] ${verarbeitet}/${orders.length} Erinnerung(en) versendet`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[29-zahlungs-retter] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[29-zahlungs-retter] Fehler:', err);
  process.exit(1);
});
