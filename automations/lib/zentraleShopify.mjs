// Übersetzt Shopify-REST-Daten ins Datenformat der Zentrale. Bewusst ohne E-Mails/Namen:
// Kunden werden nur über ihre Shopify-ID geführt, damit nichts Persönliches entsteht.

const KANAL_MUSTER = [
  ['tiktok', /tiktok/i], ['instagram', /instagram|ig\b/i], ['facebook', /facebook|fb\b|meta/i], ['google', /google|gclid/i],
  ['youtube', /youtube|youtu\.be/i], ['pinterest', /pinterest/i], ['email', /mail|klaviyo|newsletter|omnisend/i], ['bing', /bing/i],
];

export function kanalAus(order) {
  const landing = String(order.landing_site || '');
  const utm = landing.match(/[?&]utm_source=([^&#]+)/i);
  const quelle = utm ? decodeURIComponent(utm[1]) : String(order.referring_site || '');
  for (const [name, re] of KANAL_MUSTER) if (re.test(quelle) || (!utm && re.test(landing))) return name;
  if (utm) return utm[1].toLowerCase().slice(0, 20);
  return quelle ? 'sonstige' : 'direkt';
}

export function bestellungenAus(orders) {
  return orders
    .filter((o) => !o.cancelled_at && !o.test && o.financial_status !== 'voided')
    .map((o) => {
      const artikel = (o.line_items || []).filter((l) => l.quantity > 0).map((l) => {
        const rabatt = (l.discount_allocations || []).reduce((s, d) => s + Number(d.amount || 0), 0);
        const preis = Math.max(0, Number(l.price || 0) - rabatt / l.quantity);
        return { p: l.product_id ? 'p' + l.product_id : 'x' + (l.sku || l.title), menge: l.quantity, preis: Math.round(preis * 100) / 100, name: l.title };
      });
      const kanal = kanalAus(o);
      return {
        id: 'S' + o.id,
        datum: String(o.created_at).slice(0, 10),
        kunde: o.customer && o.customer.id ? 'K-' + o.customer.id : 'Gast-' + o.id,
        kanal, pfad: [kanal], artikel,
      };
    })
    .filter((b) => b.artikel.length);
}

export function produkteAus(products, kostenNachItem, bestellungen) {
  const liste = products.map((p) => {
    const v = (p.variants || [])[0] || {};
    return { id: 'p' + p.id, name: p.title, preis: Number(v.price || 0), kosten: Number(kostenNachItem[v.inventory_item_id] || 0), kategorie: p.product_type || 'Shop' };
  });
  const bekannt = new Set(liste.map((p) => p.id));
  for (const b of bestellungen) for (const a of b.artikel) {
    if (!bekannt.has(a.p)) { liste.push({ id: a.p, name: a.name, preis: a.preis, kosten: 0, kategorie: 'Gelöscht' }); bekannt.add(a.p); }
  }
  for (const b of bestellungen) for (const a of b.artikel) delete a.name;
  return liste;
}

export function naechsteSeite(linkHeader) {
  const m = String(linkHeader || '').match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return m ? m[1] : null;
}
