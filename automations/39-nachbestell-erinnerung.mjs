// Nachbestell-Erinnerung - erinnert Kunden nach X Tagen freundlich an eine Nachbestellung
// Original: n8n Workflow "39_Nachbestell_Erinnerung" · Zeitplan: täglich 09:45
import { config, isTestMode } from './lib/config.mjs';
import { getOrders } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '39-nachbestell-erinnerung';

async function main() {
  const tage = parseInt(config.NACHBESTELL_TAGE || '30');
  const von = new Date();
  von.setDate(von.getDate() - (tage + 2));
  von.setHours(0, 0, 0, 0);
  const bis = new Date();
  bis.setDate(bis.getDate() - tage);
  bis.setHours(23, 59, 59, 999);

  const orders = (
    await getOrders({
      created_at_min: encodeURIComponent(von.toISOString()),
      created_at_max: encodeURIComponent(bis.toISOString()),
    })
  ).filter((o) => !o.cancelled_at && o.email);

  const state = loadState(STATE_KEY);
  state.erinnert = state.erinnert || [];
  let verarbeitet = 0;

  for (const o of orders) {
    if (state.erinnert.includes(o.id)) continue;

    try {
      const vorname = (o.customer && o.customer.first_name) || '';
      const artikel = (o.line_items || []).map((li) => li.title).slice(0, 3).join(', ');

      const prompt = `Du schreibst im Namen des Onlineshops "${config.SHOP_NAME}".${NL}Dieser Kunde hat vor ${tage} Tagen gekauft: ${artikel || 'diverses'}. Bei Verbrauchsprodukten ist jetzt ein guter Moment für Nachschub.${NL}${NL}Schreibe eine hilfreiche Nachbestell-Erinnerung auf Deutsch (Du-Form), max 110 Wörter:${NL}- Vorname: ${vorname || 'unbekannt (neutral anreden)'}${NL}- Freundlich erinnern, dass der Vorrat langsam zur Neige gehen könnte (nur wenn es ein Verbrauchsprodukt ist - sonst locker als "Zeit für Nachschub/Ergänzung")${NL}- Bequemlichkeit betonen (nie wieder ausgehen, schnell nachbestellt)${NL}- Kleiner Anreiz: Code ${config.NACHBESTELL_RABATT_CODE}${NL}- Schlichtes, freundliches HTML${NL}Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}`;

      const antwort = await askClaude(prompt, { maxTokens: 1200 });
      const daten = parseJsonFromText(antwort, { betreff: 'Zeit für Nachschub?', html: antwort });

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
      console.error(`[39-nachbestell-erinnerung] Bestellung ${o.id} fehlgeschlagen, wird beim nächsten Lauf erneut versucht:`, err.message || err);
    }
  }

  console.log(`[39-nachbestell-erinnerung] ${verarbeitet}/${orders.length} Erinnerung(en) versendet`);
}

main().catch((err) => {
  console.error('[39-nachbestell-erinnerung] Fehler:', err);
  process.exit(1);
});
