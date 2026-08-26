// Bewertungs-Magnet - fragt Kunden X Tage nach Erhalt der Ware nach einer Bewertung.
// Original: n8n Workflow "04_Bewertungs_Magnet" · Zeitplan: täglich 10:00
import { config, isTestMode } from './lib/config.mjs';
import { getOrders } from './lib/shopify.mjs';
import { askKI, parseJsonFromText } from './lib/ki.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '04-bewertungs-magnet';

async function main() {
  const tage = parseInt(config.TAGE_NACH_BESTELLUNG || '7');
  // Fenster [heute-tage, heute-tage+1) - erfasst Bestellungen, die GENAU vor
  // "tage" Tagen versandt wurden (gleiche Konvention wie 10-vip-radar.mjs).
  const vonTag = new Date();
  vonTag.setDate(vonTag.getDate() - tage);
  vonTag.setHours(0, 0, 0, 0);
  const bisTag = new Date();
  bisTag.setDate(bisTag.getDate() - (tage - 1));
  bisTag.setHours(0, 0, 0, 0);

  const orders = (
    await getOrders({
      fulfillment_status: 'shipped',
      created_at_min: encodeURIComponent(vonTag.toISOString()),
      created_at_max: encodeURIComponent(bisTag.toISOString()),
    })
  ).filter((o) => !o.cancelled_at && o.email);

  const state = loadState(STATE_KEY);
  state.angefragt = state.angefragt || [];

  let verarbeitet = 0;
  for (const o of orders) {
    if (state.angefragt.includes(o.id)) continue;
    try {
      const vorname = o.customer?.first_name || '';
      const artikel = (o.line_items || []).map((li) => li.title).slice(0, 3).join(', ');

      const prompt = `Du bist E-Mail-Marketing-Profi für den Onlineshop "${config.SHOP_NAME}".${NL}Der Kunde hat vor ${tage} Tagen bestellt und die Ware erhalten. Schreibe eine kurze, herzliche Bewertungs-Anfrage auf Deutsch (Du-Form), max 100 Wörter.${NL}Vorname: ${vorname || 'unbekannt (neutral anreden)'}${NL}Gekaufte Artikel: ${artikel}${NL}Bewertungs-Link: ${config.BEWERTUNG_LINK}${NL}${NL}Anforderungen: ehrlich fragen wie zufrieden er ist, EIN klarer Button (als a-Tag mit Inline-Button-Styling) zum Bewertungs-Link, erwähne dass es nur 60 Sekunden dauert. Extra: bitte ihn, ein Foto/Video mit dem Produkt zu posten und den Shop zu markieren. Kein Betteln, kein Spam-Ton. Mobiltaugliches HTML mit Inline-CSS.${NL}Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}`;

      const antwort = await askKI(prompt, { maxTokens: 2000 });
      const daten = parseJsonFromText(antwort, { betreff: 'Wie zufrieden bist du?', html: antwort });

      const empfaenger = isTestMode() ? config.OWNER_EMAIL : o.email;
      await sendEmail({ to: empfaenger, subject: daten.betreff, html: daten.html });

      // Erst NACH erfolgreichem Versand als "angefragt" markieren und sofort
      // speichern - schlägt eine spätere Bestellung im selben Lauf fehl, geht
      // dieser Erfolg nicht verloren (sonst würde der nächste Lauf denselben
      // Kunden nochmal anschreiben).
      state.angefragt.push(o.id);
      if (state.angefragt.length > 2000) state.angefragt = state.angefragt.slice(-2000);
      saveState(STATE_KEY, state);
      verarbeitet++;
    } catch (err) {
      console.error(`[04-bewertungs-magnet] Bestellung ${o.id} fehlgeschlagen, wird beim nächsten Lauf erneut versucht:`, err.message || err);
    }
  }

  console.log(`[04-bewertungs-magnet] ${verarbeitet}/${orders.length} Bestellung(en) verarbeitet`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[04-bewertungs-magnet] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[04-bewertungs-magnet] Fehler:', err);
  process.exit(1);
});
