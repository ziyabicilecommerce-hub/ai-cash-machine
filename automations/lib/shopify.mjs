import { config, ueberspringenWerfen } from './config.mjs';

const API_VERSION = '2024-10';

function baseUrl() {
  return `https://${config.SHOP}.myshopify.com/admin/api/${API_VERSION}`;
}

// Ohne diese Prüfung schlägt ein fehlendes SHOP/SHOPIFY_TOKEN-Secret erst
// tief in der DNS-Auflösung fehl ("getaddrinfo ENOTFOUND .myshopify.com")
// oder mit einem generischen Shopify-401 - beides in den Actions-Logs kaum
// verständlich. Diese Prüfung macht sofort klar, welches Secret fehlt.
function pruefeShopifyConfig() {
  if (!config.SHOP) {
    ueberspringenWerfen('SHOP-Secret ist nicht gesetzt - bitte in GitHub → Settings → Secrets and variables → Actions eintragen (siehe setup/ App oder automations/README.md).');
  }
  if (!config.SHOPIFY_TOKEN) {
    ueberspringenWerfen('SHOPIFY_TOKEN-Secret ist nicht gesetzt - bitte in GitHub → Settings → Secrets and variables → Actions eintragen (siehe setup/ App oder automations/README.md).');
  }
}

async function shopifyRequest(path, { method = 'GET', body } = {}) {
  pruefeShopifyConfig();
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      'X-Shopify-Access-Token': config.SHOPIFY_TOKEN,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API Fehler ${res.status}: ${text}`);
  }
  return res.json();
}

// GraphQL statt REST - nur für Felder, die die REST-API nicht liefert (z.B.
// Produkt-VIDEOS für #18: die REST-/products.json-Endpoint kennt nur images,
// Video-Media gibt es dort in der Admin-API ausschließlich über GraphQL.
async function shopifyGraphQL(query, variables = {}) {
  pruefeShopifyConfig();
  const res = await fetch(`${baseUrl()}/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': config.SHOPIFY_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify GraphQL Fehler ${res.status}: ${text}`);
  }
  const data = await res.json();
  if (data.errors) throw new Error(`Shopify GraphQL Fehler: ${JSON.stringify(data.errors)}`);
  return data.data;
}

// Sucht ein ECHTES Produktvideo (vom Shop selbst in Shopify hochgeladen,
// z.B. über "Media" im Produkt-Editor) - erfindet nie eins. Liefert null,
// wenn kein aktives Produkt ein Video hat (sehr viele Shops haben keins -
// das ist der normale, ehrliche Fall, kein Fehler).
export async function getProductVideoUrl(bestsellerTitel) {
  const query = `
    query VideosGesuchtProdukte($cursor: String) {
      products(first: 50, after: $cursor, query: "status:active") {
        pageInfo { hasNextPage endCursor }
        nodes {
          title
          media(first: 10) {
            nodes {
              ... on Video {
                sources { url mimeType }
              }
            }
          }
        }
      }
    }`;
  let cursor = null;
  const treffer = [];
  // Bounded auf max. 3 Seiten (150 Produkte) - reicht für praktisch jeden
  // Shop und verhindert, dass ein sehr großer Katalog den Lauf ewig blockiert.
  for (let seite = 0; seite < 3; seite++) {
    const data = await shopifyGraphQL(query, { cursor });
    for (const p of data.products.nodes) {
      const video = ((p.media && p.media.nodes) || [])
        .flatMap((m) => m.sources || [])
        .find((s) => s.mimeType === 'video/mp4');
      if (video) treffer.push({ titel: p.title, url: video.url });
    }
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  if (!treffer.length) return null;
  const bestseller = treffer.find((t) => bestsellerTitel.includes(t.titel));
  return bestseller || treffer[0];
}

export async function getOrders(params = {}) {
  const qs = new URLSearchParams({ status: 'any', limit: '250', ...params }).toString();
  const data = await shopifyRequest(`/orders.json?${qs}`);
  return data.orders || [];
}

export async function getOrdersSince(date) {
  return getOrders({ created_at_min: encodeURIComponent(date.toISOString()) });
}

export async function getCustomers(params = {}) {
  const qs = new URLSearchParams({ limit: '250', ...params }).toString();
  const data = await shopifyRequest(`/customers.json?${qs}`);
  return data.customers || [];
}

export async function getCheckouts(params = {}) {
  const qs = new URLSearchParams({ limit: '100', status: 'open', ...params }).toString();
  const data = await shopifyRequest(`/checkouts.json?${qs}`);
  return data.checkouts || [];
}

export async function getProducts(params = {}) {
  const qs = new URLSearchParams({ limit: '250', ...params }).toString();
  const data = await shopifyRequest(`/products.json?${qs}`);
  return data.products || [];
}

export async function getInventoryLevels(inventoryItemIds) {
  const qs = new URLSearchParams({
    inventory_item_ids: inventoryItemIds.join(','),
  }).toString();
  const data = await shopifyRequest(`/inventory_levels.json?${qs}`);
  return data.inventory_levels || [];
}

export async function createDiscountCode({ title, code, valueType, value, usageLimit }) {
  const priceRule = await shopifyRequest('/price_rules.json', {
    method: 'POST',
    body: {
      price_rule: {
        title,
        target_type: 'line_item',
        target_selection: 'all',
        allocation_method: 'across',
        value_type: valueType, // 'percentage' or 'fixed_amount'
        value: valueType === 'percentage' ? `-${value}` : `-${value}`,
        customer_selection: 'all',
        starts_at: new Date().toISOString(),
        usage_limit: usageLimit || undefined,
      },
    },
  });
  const rule = priceRule.price_rule;
  const discount = await shopifyRequest(`/price_rules/${rule.id}/discount_codes.json`, {
    method: 'POST',
    body: { discount_code: { code } },
  });
  return discount.discount_code;
}

// Legt ein Produkt IMMER als Entwurf an (status: 'draft') - erscheint nicht
// automatisch im Shop, der Gründer muss es bewusst selbst veröffentlichen.
export async function createProduct({ title, bodyHtml, productType, tags, seoTitle, seoDescription, price }) {
  const data = await shopifyRequest('/products.json', {
    method: 'POST',
    body: {
      product: {
        title,
        body_html: bodyHtml,
        product_type: productType || '',
        tags: tags || '',
        status: 'draft',
        metafields_global_title_tag: seoTitle || undefined,
        metafields_global_description_tag: seoDescription || undefined,
        variants: price ? [{ price: String(price) }] : undefined,
      },
    },
  });
  return data.product;
}

// Generische Varianten-Aktualisierung - genutzt für echte Preisänderungen
// (Pricing-Agent) und Überverkaufs-Schutz (Inventory-Guardian-Agent, setzt
// inventory_policy auf 'deny').
export async function updateVariant(variantId, fields) {
  const data = await shopifyRequest(`/variants/${variantId}.json`, {
    method: 'PUT',
    body: { variant: { id: variantId, ...fields } },
  });
  return data.variant;
}

// Einkaufspreis eines Artikels, falls im Shopify-Lagerartikel hinterlegt -
// für den Pricing-Agent, um eine echte Preisuntergrenze zu berechnen statt
// nur mit dem geschätzten PRODUKTKOSTEN_PROZENT zu arbeiten.
export async function getInventoryItem(inventoryItemId) {
  const data = await shopifyRequest(`/inventory_items/${inventoryItemId}.json`);
  return data.inventory_item;
}

// Generische Bestell-Aktualisierung - genutzt vom Risk-Guard-Agent, um
// verdächtige Bestellungen mit einem echten Shopify-Tag zu markieren
// (nicht-destruktiv, jederzeit vom Gründer entfernbar).
export async function updateOrder(orderId, fields) {
  const data = await shopifyRequest(`/orders/${orderId}.json`, {
    method: 'PUT',
    body: { order: { id: orderId, ...fields } },
  });
  return data.order;
}

// Echter Shopify-Gutschein (anderes Instrument als ein Rabattcode - direkt
// als Guthaben einlösbar, nicht an einen Bestellwert-Prozentsatz gekoppelt).
// Für den Gift-Card-Kompensations-Agent.
export async function createGiftCard({ initialValue, note, recipientEmail }) {
  const data = await shopifyRequest('/gift_cards.json', {
    method: 'POST',
    body: {
      gift_card: {
        initial_value: String(initialValue),
        note: note || undefined,
        recipient_attributes: recipientEmail ? { email: recipientEmail } : undefined,
      },
    },
  });
  return data.gift_card;
}

// Zweistufige Shopify-Erstattung: erst /calculate (liefert die exakten
// Transaktions-Beträge, die Shopify selbst berechnet - NIE selbst
// nachrechnen), dann die echte Erstattungs-Buchung. Für den
// Refund-Concierge-Agent.
export async function berechneErstattung(orderId, refundLineItems) {
  const data = await shopifyRequest(`/orders/${orderId}/refunds/calculate.json`, {
    method: 'POST',
    body: { refund: { refund_line_items: refundLineItems, shipping: { full_refund: true } } },
  });
  return data.refund;
}

export async function buucheErstattung(orderId, berechneteErstattung, note) {
  const data = await shopifyRequest(`/orders/${orderId}/refunds.json`, {
    method: 'POST',
    body: {
      refund: {
        ...berechneteErstattung,
        note: note || berechneteErstattung.note,
        notify: true,
      },
    },
  });
  return data.refund;
}

export async function getShopifyReviews() {
  // Shopify hat keine native Review-API - siehe judgeme.mjs für Judge.me Integration
  return [];
}
