// Fulfillment & Supplier Hub - nutzt AUSSCHLIESSLICH die bereits vorhandene
// Shopify-Verbindung (keine zusätzliche Dropshipping-/Fulfillment-API nötig):
// erkennt verspätet unbearbeitete Bestellungen, gescheiterte Zustellungen
// (Shopify trackt shipment_status pro Sendung automatisch für viele Carrier)
// und rankt Lieferanten (Produkt-Feld "vendor") nach Problemhäufigkeit.
// Neu, kein n8n-Workflow · Zeitplan: täglich.
//
// Lagerbestand-Warnungen gibt es bereits separat in #20 Lager-Wächter -
// hier bewusst nicht dupliziert. Ohne konkreten Dropshipping-Supplier-API-
// Zugang (z.B. CJ Dropshipping, Zendrop) ist das die ehrliche Grenze dessen,
// was automatisierbar ist - bei Bedarf mit echtem Supplier-API-Key erweiterbar.
import { config } from './lib/config.mjs';
import { getOrders } from './lib/shopify.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { chunkZeilen } from './lib/whatsappChunk.mjs';
import { loadState, saveState } from './lib/state.mjs';

const STATE_NAME = 'fulfillment-hub-state';
const MAX_HISTORIE = 2000;
const WHATSAPP_MAX_CHARS = 3500;

function alterInStunden(datumStr) {
  return (Date.now() - new Date(datumStr).getTime()) / 3600000;
}

async function main() {
  const verzugStunden = parseFloat(config.FULFILLMENT_VERZUG_STUNDEN || '48');
  const vor30Tagen = new Date();
  vor30Tagen.setDate(vor30Tagen.getDate() - 30);

  const orders = (await getOrders({ status: 'open', created_at_min: encodeURIComponent(vor30Tagen.toISOString()) }))
    .filter((o) => !o.cancelled_at);

  const state = loadState(STATE_NAME);
  const bereitsGemeldet = new Set(state.gemeldet || []);
  const neueMeldungen = [];

  const verzoegert = [];
  const zustellungsProbleme = [];
  const lieferantenProbleme = {};

  for (const o of orders) {
    const alterH = alterInStunden(o.created_at);
    const key = `${o.id}`;

    // 1. Verzögerungs-Radar: noch nicht (voll) bearbeitet, obwohl älter als die Schwelle
    if (o.fulfillment_status !== 'fulfilled' && alterH >= verzugStunden) {
      const meldungKey = `verzug-${key}`;
      if (!bereitsGemeldet.has(meldungKey)) {
        verzoegert.push(`#${o.order_number || o.id} · ${o.email || 'kein Kunde'} · seit ${(alterH / 24).toFixed(1)} Tagen unbearbeitet (Status: ${o.fulfillment_status || 'unfulfilled'})`);
        neueMeldungen.push(meldungKey);
        for (const li of o.line_items || []) {
          const vendor = li.vendor || 'unbekannt';
          lieferantenProbleme[vendor] = (lieferantenProbleme[vendor] || 0) + 1;
        }
      }
    }

    // 2. Zustellungs-Probleme: Shopify trackt shipment_status pro Sendung automatisch
    for (const f of o.fulfillments || []) {
      if (f.shipment_status === 'failure' || f.shipment_status === 'delivery_failed') {
        const meldungKey = `zustellung-${f.id}`;
        if (!bereitsGemeldet.has(meldungKey)) {
          zustellungsProbleme.push(`#${o.order_number || o.id} · Sendung ${f.tracking_number || f.id} (${f.tracking_company || 'unbekannter Versanddienst'}) · Status: ${f.shipment_status}`);
          neueMeldungen.push(meldungKey);
        }
      }
    }
  }

  if (!verzoegert.length && !zustellungsProbleme.length) {
    console.log('[55-fulfillment-supplier-hub] Keine neuen Verzögerungen oder Zustellungsprobleme.');
    return;
  }

  const zeilen = [];
  if (verzoegert.length) {
    zeilen.push(`⏱️ *Verzögerte Bestellungen (${verzoegert.length}):*\n${verzoegert.join('\n')}`);
  }
  if (zustellungsProbleme.length) {
    zeilen.push(`📦 *Zustellungsprobleme (${zustellungsProbleme.length}):*\n${zustellungsProbleme.join('\n')}`);
  }
  const lieferantenRanking = Object.entries(lieferantenProbleme).sort((a, b) => b[1] - a[1]);
  if (lieferantenRanking.length) {
    zeilen.push(
      `📊 *Lieferanten mit den meisten Verzögerungen:*\n${lieferantenRanking.map(([v, n]) => `${v}: ${n}x`).join('\n')}`,
    );
  }

  const chunks = chunkZeilen(zeilen, WHATSAPP_MAX_CHARS);
  for (let i = 0; i < chunks.length; i++) {
    const kopf = chunks.length > 1
      ? `📦 Fulfillment & Supplier Hub (Teil ${i + 1}/${chunks.length}):`
      : `📦 Fulfillment & Supplier Hub:`;
    await notifyWhatsapp(`${kopf}\n\n${chunks[i].join('\n\n')}`);
  }

  // Erst NACH erfolgreichem Versand als "gemeldet" markieren - sonst würde
  // ein Netzwerkfehler beim Senden ein Problem für immer stumm schalten,
  // ohne dass es je tatsächlich kommuniziert wurde.
  const historie = [...bereitsGemeldet, ...neueMeldungen].slice(-MAX_HISTORIE);
  saveState(STATE_NAME, { gemeldet: historie });

  console.log(`[55-fulfillment-supplier-hub] ${verzoegert.length} Verzögerung(en), ${zustellungsProbleme.length} Zustellungsproblem(e) gemeldet.`);
}

main().catch((err) => {
  console.error('[55-fulfillment-supplier-hub] Fehler:', err);
  process.exit(1);
});
