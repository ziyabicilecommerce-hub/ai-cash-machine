// Refund-Concierge-Agent - übernimmt die lästige Mehrschritt-Arbeit einer
// echten Shopify-Erstattung (berechnen, dann buchen), aber NUR für
// Bestellungen, die ein MENSCH bereits im Shopify-Adminbereich mit dem Tag
// "erstattung-genehmigt" markiert hat (z.B. nach Prüfung einer Retoure) UND
// die unter REFUND_MAX_BETRAG liegen. Neu, kein n8n-Workflow · Zeitplan:
// alle 2 Stunden.
//
// BEWUSST kein vollautomatischer "Kunde beschwert sich -> Geld weg"-Agent -
// das wäre bei einem False Positive ein echter finanzieller Schaden. Der
// Mensch entscheidet WAS erstattet wird (durch das Tag), der Agent
// übernimmt nur die mechanische Ausführung, und selbst das erst nach
// explizitem AUTO_ERSTATTUNG_GENEHMIGEN=ja. Erstattet immer den VOLLEN
// Betrag der Bestellung (Artikel + Versand) - keine Teil-Erstattungen, um
// die Logik einfach und nachvollziehbar zu halten.
import { config } from './lib/config.mjs';
import { getOrders, berechneErstattung, buucheErstattung, updateOrder } from './lib/shopify.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { loadState, saveState } from './lib/state.mjs';

const NL = '\n';
const STATE_KEY = '74-refund-concierge-agent';
const GENEHMIGT_TAG = 'erstattung-genehmigt';
const ERLEDIGT_TAG = 'erstattung-erledigt';
const MAX_HISTORIE = 3000;

async function main() {
  const maxBetrag = parseFloat(config.REFUND_MAX_BETRAG || '30');
  const autoAn = config.AUTO_ERSTATTUNG_GENEHMIGEN === 'ja';

  const vor30Tagen = new Date();
  vor30Tagen.setDate(vor30Tagen.getDate() - 30);
  const orders = (await getOrders({ status: 'any', created_at_min: encodeURIComponent(vor30Tagen.toISOString()) }))
    .filter((o) => !o.cancelled_at && (o.tags || '').includes(GENEHMIGT_TAG) && !(o.tags || '').includes(ERLEDIGT_TAG));

  const state = loadState(STATE_KEY);
  state.bereitsErstattet = state.bereitsErstattet || [];
  const bereitsErstattet = new Set(state.bereitsErstattet);

  const kandidaten = orders.filter((o) => !bereitsErstattet.has(o.id));
  if (!kandidaten.length) {
    console.log('[74-refund-concierge-agent] Keine genehmigten, offenen Erstattungen.');
    return;
  }

  let ausgefuehrt = 0;
  const zeilen = [];

  for (const o of kandidaten) {
    const betrag = parseFloat(o.total_price || '0');
    if (betrag > maxBetrag) {
      zeilen.push(`- #${o.order_number || o.id}: ${betrag.toFixed(2)} EUR liegt über der Obergrenze (${maxBetrag} EUR) - bitte MANUELL im Shopify-Adminbereich erstatten.`);
      continue;
    }

    try {
      const refundLineItems = (o.line_items || []).map((li) => ({
        line_item_id: li.id,
        quantity: li.quantity,
        restock_type: 'no_restock', // Lagerbestand bewusst NICHT automatisch angepasst - Ware ist ggf. noch unterwegs/nicht zurück
      }));
      const berechnung = await berechneErstattung(o.id, refundLineItems);

      if (autoAn) {
        await buucheErstattung(o.id, berechnung, `Automatisch erstattet vom Refund-Concierge-Agent (Tag "${GENEHMIGT_TAG}")`);
        const neueTags = (o.tags || '').split(',').map((t) => t.trim()).filter((t) => t && t !== GENEHMIGT_TAG);
        neueTags.push(ERLEDIGT_TAG);
        await updateOrder(o.id, { tags: neueTags.join(', ') });
        zeilen.push(`- #${o.order_number || o.id}: ${betrag.toFixed(2)} EUR erstattet.`);
      } else {
        zeilen.push(`- #${o.order_number || o.id}: ${betrag.toFixed(2)} EUR bereit zur Erstattung (AUTO_ERSTATTUNG_GENEHMIGEN=nein, nur Vorschau berechnet, nichts gebucht).`);
      }

      // Erst NACH erfolgreicher Verarbeitung (berechnet, ggf. gebucht) als
      // erledigt markieren und sofort speichern - schlägt eine spätere
      // Bestellung im selben Lauf fehl, geht dieser Erfolg nicht verloren.
      if (autoAn) {
        state.bereitsErstattet.push(o.id);
        if (state.bereitsErstattet.length > MAX_HISTORIE) state.bereitsErstattet = state.bereitsErstattet.slice(-MAX_HISTORIE);
        saveState(STATE_KEY, state);
        ausgefuehrt++;
      }
    } catch (err) {
      console.error(`[74-refund-concierge-agent] Fehler bei Bestellung ${o.id}:`, err.message || err);
      zeilen.push(`- #${o.order_number || o.id}: Fehler bei der Erstattung (${err.message || err}) - bitte manuell prüfen.`);
    }
  }

  const kopf = `💸 REFUND-CONCIERGE-AGENT - ${config.SHOP_NAME}${NL}--------------------${NL}${autoAn ? 'AUTO_ERSTATTUNG_GENEHMIGEN ist AN: genehmigte Erstattungen werden automatisch gebucht.' : 'AUTO_ERSTATTUNG_GENEHMIGEN steht auf nein - nur Vorschau, es wird nichts gebucht.'}`;
  await notifyTelegram(`${kopf}${NL}${NL}${zeilen.join(NL)}`);

  console.log(`[74-refund-concierge-agent] ${kandidaten.length} Kandidat(en), ${ausgefuehrt} Erstattung(en) gebucht.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[74-refund-concierge-agent] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[74-refund-concierge-agent] Fehler:', err);
  process.exit(1);
});
