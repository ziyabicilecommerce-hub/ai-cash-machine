// Post-Purchase-Sofort-Upsell - schlägt frischen Käufern stündlich ein passendes Zusatzprodukt vor
// Original: n8n Workflow "41_Post_Purchase_Sofort_Upsell" · Zeitplan: stündlich
import { config, isTestMode } from './lib/config.mjs';
import { getOrders, getProducts } from './lib/shopify.mjs';
import { askKI, parseJsonFromText } from './lib/ki.mjs';
import { sendEmail } from './lib/email.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '41-post-purchase-sofort-upsell';

async function main() {
  const produkte = await getProducts({ limit: '100', fields: 'id,title,handle,variants,product_type' });
  const katalog = produkte
    .map((p) => {
      const preis = (p.variants || [])[0]?.price || '?';
      return `- ${p.title} (${config.SHOP_URL}/products/${p.handle}, ${preis})`;
    })
    .slice(0, 40)
    .join(NL);

  const vor2Stunden = new Date();
  vor2Stunden.setHours(vor2Stunden.getHours() - 2);
  const orders = (
    await getOrders({ limit: '100', created_at_min: encodeURIComponent(vor2Stunden.toISOString()) })
  ).filter((o) => !o.cancelled_at && o.email);

  const state = loadState(STATE_KEY);
  state.upsell = state.upsell || [];
  let verarbeitet = 0;

  for (const o of orders) {
    if (state.upsell.includes(o.id)) continue;

    try {
      const vorname = (o.customer && o.customer.first_name) || '';
      const gekauft = (o.line_items || []).map((li) => li.title).join(', ');

      const prompt = `Du bist der Gründer vom Onlineshop "${config.SHOP_NAME}".${NL}Ein Kunde hat GERADE EBEN bestellt: ${gekauft}.${NL}${NL}PRODUKTKATALOG:${NL}${katalog}${NL}${NL}Schreibe eine kurze Post-Purchase-Upsell-Mail auf Deutsch (Du-Form), max 120 Wörter:${NL}- Vorname: ${vorname || 'unbekannt (neutral anreden)'}${NL}- Zuerst: kurz für den Kauf bedanken, Vorfreude machen${NL}- Dann: EIN einziges perfekt ergänzendes Produkt aus dem Katalog empfehlen (das logisch zum Gekauften passt), mit Link${NL}- Einmaliges Angebot: Code ${config.UPSELL_RABATT_CODE} (${config.RABATT_PROZENT}%), nur die nächsten 24h gültig, kann noch zur Bestellung ergänzt werden${NL}- Ehrlich und hilfreich, kein aufdringlicher Verkauf${NL}- Schlichtes HTML mit einem klaren CTA-Button${NL}Antworte NUR mit validem JSON, ohne Markdown: {"betreff": "...", "html": "..."}`;

      const antwort = await askKI(prompt, { maxTokens: 1500 });
      const daten = parseJsonFromText(antwort, { betreff: 'Noch eine Kleinigkeit dazu?', html: antwort });

      const empfaenger = isTestMode() ? config.OWNER_EMAIL : o.email;
      await sendEmail({ to: empfaenger, subject: daten.betreff, html: daten.html });

      // Erst NACH erfolgreichem Versand als "upsell" markieren und sofort
      // speichern - schlägt eine spätere Bestellung im selben Lauf fehl, geht
      // dieser Erfolg nicht verloren (sonst würde der nächste Lauf denselben
      // Kunden nochmal anschreiben).
      state.upsell.push(o.id);
      if (state.upsell.length > 8000) state.upsell = state.upsell.slice(-8000);
      saveState(STATE_KEY, state);
      verarbeitet++;
    } catch (err) {
      console.error(`[41-post-purchase-sofort-upsell] Bestellung ${o.id} fehlgeschlagen, wird beim nächsten Lauf erneut versucht:`, err.message || err);
    }
  }

  console.log(`[41-post-purchase-sofort-upsell] ${verarbeitet}/${orders.length} Upsell-Mail(s) versendet`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[41-post-purchase-sofort-upsell] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[41-post-purchase-sofort-upsell] Fehler:', err);
  process.exit(1);
});
