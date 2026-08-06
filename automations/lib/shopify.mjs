import { config } from './config.mjs';

const API_VERSION = '2024-10';

function baseUrl() {
  return `https://${config.SHOP}.myshopify.com/admin/api/${API_VERSION}`;
}

async function shopifyRequest(path, { method = 'GET', body } = {}) {
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

export async function getShopifyReviews() {
  // Shopify hat keine native Review-API - siehe judgeme.mjs für Judge.me Integration
  return [];
}
