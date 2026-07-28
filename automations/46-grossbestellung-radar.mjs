// Großbestellung-Radar - meldet stündlich ungewöhnlich große/wertvolle Bestellungen sofort
// Original: n8n Workflow "46_Großbestellung_Radar" · Zeitplan: stündlich
import { config } from './lib/config.mjs';
import { getOrders } from './lib/shopify.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '46-grossbestellung-radar';

async function main() {
  const schwelleWert = parseFloat(config.GROSS_SCHWELLE_WERT || '150');
  const schwelleMenge = parseInt(config.GROSS_SCHWELLE_MENGE || '5');

  const vor2Stunden = new Date();
  vor2Stunden.setHours(vor2Stunden.getHours() - 2);
  const orders = (
    await getOrders({ limit: '100', created_at_min: encodeURIComponent(vor2Stunden.toISOString()) })
  ).filter((o) => !o.cancelled_at);

  const state = loadState(STATE_KEY);
  state.gemeldet = state.gemeldet || [];
  let gemeldetAnzahl = 0;

  for (const o of orders) {
    if (state.gemeldet.includes(o.id)) continue;
    const wert = parseFloat(o.total_price || 0);
    const menge = (o.line_items || []).reduce((s, li) => s + (li.quantity || 0), 0);
    const istGross = wert >= schwelleWert || menge >= schwelleMenge;
    if (!istGross) continue;
    state.gemeldet.push(o.id);
    gemeldetAnzahl++;

    const name = `${(o.customer && o.customer.first_name) || ''} ${(o.customer && o.customer.last_name) || ''}`.trim();
    const ordersCount = (o.customer && o.customer.orders_count) || 1;
    const artikel = (o.line_items || []).map((li) => `${li.quantity}x ${li.title}`).join(', ');

    const text = `GROSSBESTELLUNG! - ${config.SHOP_NAME}${NL}--------------------${NL}Bestellung: ${o.name || `#${o.order_number}`}${NL}Wert: ${wert.toFixed(2)} ${o.currency || ''} | Menge: ${menge} Artikel${NL}Kunde: ${name} (${o.email || 'keine Mail'})${NL}Bestellungen bisher: ${ordersCount}${NL}Artikel: ${artikel}${NL}${NL}TIPP: Persönlich anschreiben, bedanken, nach Großbedarf/Wiederbestellung fragen (B2B/Abo/Rabatt für Menge).`;

    await notifyTelegram(text);
  }

  if (state.gemeldet.length > 8000) state.gemeldet = state.gemeldet.slice(-8000);
  saveState(STATE_KEY, state);

  console.log(`[46-grossbestellung-radar] ${gemeldetAnzahl} Großbestellung(en) gemeldet`);
}

main().catch((err) => {
  console.error('[46-grossbestellung-radar] Fehler:', err);
  process.exit(1);
});
