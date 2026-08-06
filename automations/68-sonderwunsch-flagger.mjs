// Sonderwunsch-Flagger - liest die ECHTEN Bestellnotizen (order.note, das
// Feld, in das Kunden im Checkout "Anmerkungen zur Bestellung" schreiben
// können) und erkennt konkrete Sonderwünsche (Geschenkverpackung, Express-
// Versand, Kärtchen-Text, Größen-/Farbwunsch bei Rückfragen), die sonst im
// normalen Bestellablauf leicht übersehen werden. Meldet sie gebündelt,
// damit beim Verpacken niemand vergessen wird. Neu, kein n8n-Workflow ·
// Zeitplan: alle 2 Stunden.
//
// Unterscheidet sich von #55 Fulfillment & Supplier Hub (Verzug/Zustellungs-
// probleme) und #46 Großbestellung-Radar (Bestellwert/-menge) - schaut auf
// den reinen TEXT-Inhalt der Notiz, unabhängig von Wert oder Status. Rein
// meldend, verändert nichts an der Bestellung.
import { config } from './lib/config.mjs';
import { getOrdersSince } from './lib/shopify.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { chunkZeilen } from './lib/whatsappChunk.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '68-sonderwunsch-flagger';
const MAX_HISTORIE = 3000;
const TELEGRAM_MAX_CHARS = 3500;
const LOOKBACK_TAGE = 7;

async function main() {
  const seit = new Date();
  seit.setDate(seit.getDate() - LOOKBACK_TAGE);
  const orders = (await getOrdersSince(seit)).filter((o) => !o.cancelled_at && o.note && o.note.trim());

  const state = loadState(STATE_KEY);
  state.gemeldet = state.gemeldet || [];
  const bereitsGemeldet = new Set(state.gemeldet);

  const neueOrders = orders.filter((o) => !bereitsGemeldet.has(o.id));
  if (!neueOrders.length) {
    console.log('[68-sonderwunsch-flagger] Keine neuen Bestellnotizen.');
    return;
  }

  const zeilen = neueOrders.map((o) => `- #${o.order_number || o.id} · ${o.email || 'kein Kunde'}:${NL}  "${o.note.trim().slice(0, 300)}"`);
  const chunks = chunkZeilen(zeilen, TELEGRAM_MAX_CHARS);
  let gemeldetInsgesamt = 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      const kopf = chunks.length > 1
        ? `📝 Sonderwünsche in Bestellungen (Teil ${i + 1}/${chunks.length}):`
        : `📝 Sonderwünsche in Bestellungen:`;
      await notifyTelegram(`${kopf}${NL}${NL}${chunks[i].join(NL)}`);

      // Erst NACH erfolgreicher Meldung als "gemeldet" markieren - schlägt
      // ein Chunk fehl, sollen dessen Bestellungen beim nächsten Lauf erneut
      // gemeldet werden, statt für immer unbemerkt zu bleiben.
      const chunkIndexInNeue = chunks.slice(0, i).reduce((sum, c) => sum + c.length, 0);
      const dieserChunk = neueOrders.slice(chunkIndexInNeue, chunkIndexInNeue + chunks[i].length);
      for (const o of dieserChunk) state.gemeldet.push(o.id);
      if (state.gemeldet.length > MAX_HISTORIE) state.gemeldet = state.gemeldet.slice(-MAX_HISTORIE);
      saveState(STATE_KEY, state);
      gemeldetInsgesamt += dieserChunk.length;
    } catch (err) {
      console.error(`[68-sonderwunsch-flagger] Meldung Teil ${i + 1} fehlgeschlagen, wird beim nächsten Lauf erneut versucht:`, err.message || err);
    }
  }

  console.log(`[68-sonderwunsch-flagger] ${gemeldetInsgesamt}/${neueOrders.length} Bestellung(en) mit Sonderwunsch gemeldet.`);
}

main().catch((err) => {
  console.error('[68-sonderwunsch-flagger] Fehler:', err);
  process.exit(1);
});
