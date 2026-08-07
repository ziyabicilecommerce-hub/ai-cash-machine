// PayPal-Beleg-Agent - erstellt für jede per PayPal bezahlte Shopify-
// Bestellung einen druckbaren, dauerhaft abrufbaren Nachweis (Kunde/
// Lieferadresse, Artikel, Zahlungsstatus, Versand-Tracking) - für den Fall,
// dass PayPal bei einer Reklamation oder Kontoprüfung Belege für echte
// Lieferungen verlangt und man die sonst mühsam einzeln zusammensuchen
// müsste. Neu, kein n8n-Workflow · Zeitplan: täglich.
//
// Rein dokumentierend - ändert nichts an Bestellungen, sendet nichts an
// PayPal. Die Belege liegen als eigenständige HTML-Seiten (nicht öffentlich
// verlinkt, nur per direktem Link erreichbar) bereit, um sie bei Bedarf
// direkt herzuzeigen oder als PDF auszudrucken.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { getOrders } from './lib/shopify.mjs';
import { notifyTelegram } from './lib/telegram.mjs';
import { chunkZeilen } from './lib/whatsappChunk.mjs';
import { loadState, saveState } from './lib/state.mjs';
import { buildBelegHtml, slugifyBeleg } from './lib/paypalBeleg.mjs';

const STATE_KEY = '78-paypal-beleg-agent';
const PAGES_BASE_URL = 'https://ziyabicilecommerce-hub.github.io/ai-cash-machine';
const TELEGRAM_MAX_CHARS = 3500;
const MAX_HISTORIE = 3000;
const NL = '\n';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BELEG_DIR = join(__dirname, '..', 'paypal-belege');

function istPaypalBezahlt(order) {
  return Array.isArray(order.payment_gateway_names)
    && order.payment_gateway_names.some((g) => String(g).toLowerCase().includes('paypal'));
}

function baueBeleg(order) {
  const adresse = order.shipping_address || order.billing_address || {};
  const adresseZeilen = [
    adresse.name,
    adresse.address1,
    adresse.address2,
    [adresse.zip, adresse.city].filter(Boolean).join(' '),
    adresse.country,
  ].filter(Boolean);

  const sendungen = (order.fulfillments || []).map((f) => ({
    carrier: f.tracking_company || 'unbekannt',
    trackingNummer: f.tracking_number || null,
    trackingUrl: f.tracking_url || null,
    versendetAm: f.created_at,
    status: f.shipment_status || f.status || 'unbekannt',
  }));

  return {
    orderName: order.name,
    orderId: order.id,
    erstelltAm: new Date().toISOString(),
    bestelltAm: order.created_at,
    waehrung: order.currency,
    gesamtBetrag: order.total_price,
    zahlungsstatus: order.financial_status || 'unbekannt',
    versandstatus: order.fulfillment_status || 'nicht versendet',
    kunde: { adresseZeilen, email: order.email || order.contact_email || '' },
    artikel: (order.line_items || []).map((li) => ({ titel: li.title, menge: li.quantity, preis: li.price })),
    sendungen,
  };
}

function schreibeManifest(state) {
  writeFileSync(join(BELEG_DIR, 'manifest.json'), JSON.stringify({ updatedAt: new Date().toISOString(), belege: state.belege }, null, 2));
}

async function main() {
  const lookbackTage = parseInt(config.PAYPAL_BELEG_LOOKBACK_TAGE || '14', 10);
  const maxProLauf = parseInt(config.PAYPAL_BELEG_MAX_PRO_LAUF || '30', 10);
  const seit = new Date(Date.now() - lookbackTage * 24 * 60 * 60 * 1000);

  const orders = await getOrders({ status: 'any', created_at_min: encodeURIComponent(seit.toISOString()) });
  const paypalOrders = orders.filter(istPaypalBezahlt);

  const state = loadState(STATE_KEY);
  state.belege = state.belege || [];
  const bereitsErstellt = new Set(state.belege.map((b) => b.orderId));

  const neueOrders = paypalOrders.filter((o) => !bereitsErstellt.has(o.id)).slice(0, maxProLauf);
  if (!neueOrders.length) {
    console.log('[78-paypal-beleg-agent] Keine neuen PayPal-Bestellungen ohne Beleg.');
    return;
  }

  if (!existsSync(BELEG_DIR)) mkdirSync(BELEG_DIR, { recursive: true });

  const erstellteLinks = [];
  for (const order of neueOrders) {
    try {
      const beleg = baueBeleg(order);
      const slug = slugifyBeleg(order.name, order.id);
      writeFileSync(join(BELEG_DIR, `${slug}.html`), buildBelegHtml(beleg));
      const url = `${PAGES_BASE_URL}/paypal-belege/${slug}.html`;

      state.belege.unshift({
        orderId: order.id,
        orderName: order.name,
        url,
        bestelltAm: order.created_at,
        betrag: order.total_price,
        waehrung: order.currency,
        versandstatus: order.fulfillment_status || 'nicht versendet',
      });
      if (state.belege.length > MAX_HISTORIE) state.belege = state.belege.slice(0, MAX_HISTORIE);
      saveState(STATE_KEY, state);
      schreibeManifest(state);

      erstellteLinks.push(`${order.name}: ${url}`);
    } catch (err) {
      console.error(`[78-paypal-beleg-agent] Fehler bei Bestellung ${order.name}:`, err.message || err);
    }
  }

  if (erstellteLinks.length) {
    const zeilen = erstellteLinks.map((l) => `- ${l}`);
    const chunks = chunkZeilen(zeilen, TELEGRAM_MAX_CHARS);
    for (let i = 0; i < chunks.length; i++) {
      const kopf = chunks.length > 1
        ? `🧾 PayPal-Beleg-Agent (Teil ${i + 1}/${chunks.length}):`
        : `🧾 PayPal-Beleg-Agent: ${erstellteLinks.length} neue(r) Beleg(e) erstellt`;
      try {
        await notifyTelegram(`${kopf}${NL}${NL}${chunks[i].join(NL)}`);
      } catch (err) {
        console.error(`[78-paypal-beleg-agent] Telegram-Meldung Teil ${i + 1} fehlgeschlagen:`, err.message || err);
      }
    }
  }

  console.log(`[78-paypal-beleg-agent] ${erstellteLinks.length}/${neueOrders.length} Beleg(e) erstellt.`);
}

main().catch((err) => {
  console.error('[78-paypal-beleg-agent] Fehler:', err);
  process.exit(1);
});
