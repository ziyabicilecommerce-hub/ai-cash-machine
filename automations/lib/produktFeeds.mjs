// Produkt-Feeds aus den oeffentlichen Shop-Daten: Google Merchant Center (XML), Meta-Katalog fuer
// Facebook/Instagram Shopping (CSV) und Pinterest (CSV). Je Variante ein Eintrag, gruppiert per
// item_group_id. Preise und Verfuegbarkeit 1:1 aus dem Shop - kein Streichpreis, keine erfundenen Angaben.

const xml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const csv = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
const text = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// Ein Eintrag je Variante mit allem, was die Plattformen verlangen.
export function feedEintraege(produkte, { waehrung = 'EUR' } = {}) {
  const out = [];
  for (const p of produkte) {
    const basis = String(p.shopUrl || '').replace(/\/$/, '');
    const bilder = (p.images || []).map((b) => b.src).filter(Boolean);
    if (!basis || !bilder.length) continue;
    const varianten = p.variants?.length ? p.variants : [];
    for (const v of varianten) {
      const preis = Number(v.price);
      if (!(preis > 0)) continue;
      const optionen = [v.option1, v.option2, v.option3].filter((o) => o && o !== 'Default Title');
      const bild = v.featured_image?.src || bilder[0];
      out.push({
        id: `${p.id}-${v.id}`,
        gruppe: String(p.id),
        titel: `${p.title}${optionen.length ? ` - ${optionen.join(' / ')}` : ''}`.slice(0, 150),
        beschreibung: (text(p.body_html) || p.title).slice(0, 5000),
        link: `${basis}/products/${p.handle}${varianten.length > 1 ? `?variant=${v.id}` : ''}`,
        bild,
        weitereBilder: bilder.filter((b) => b !== bild).slice(0, 10),
        verfuegbar: v.available !== false,
        preis: `${preis.toFixed(2)} ${waehrung}`,
        marke: p.vendor || p.shopName || '',
        gtin: /^\d{8,14}$/.test(String(v.barcode || '')) ? String(v.barcode) : '',
        sku: v.sku || '',
        art: p.product_type || '',
      });
    }
  }
  return out;
}

export function googleXml(eintraege, { titel = 'Produkte', link = '' } = {}) {
  const items = eintraege.map((e) => [
    '<item>',
    `<g:id>${xml(e.id)}</g:id>`, `<g:item_group_id>${xml(e.gruppe)}</g:item_group_id>`,
    `<g:title>${xml(e.titel)}</g:title>`, `<g:description>${xml(e.beschreibung)}</g:description>`,
    `<g:link>${xml(e.link)}</g:link>`, `<g:image_link>${xml(e.bild)}</g:image_link>`,
    ...e.weitereBilder.map((b) => `<g:additional_image_link>${xml(b)}</g:additional_image_link>`),
    `<g:availability>${e.verfuegbar ? 'in_stock' : 'out_of_stock'}</g:availability>`,
    `<g:price>${xml(e.preis)}</g:price>`, '<g:condition>new</g:condition>',
    `<g:brand>${xml(e.marke)}</g:brand>`,
    e.gtin ? `<g:gtin>${e.gtin}</g:gtin>` : '<g:identifier_exists>no</g:identifier_exists>',
    e.sku ? `<g:mpn>${xml(e.sku)}</g:mpn>` : '',
    e.art ? `<g:product_type>${xml(e.art)}</g:product_type>` : '',
    '</item>',
  ].filter(Boolean).join(''));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${xml(titel)}</title><link>${xml(link)}</link><description>Automatisch aus dem Shop erzeugt</description>\n${items.join('\n')}\n</channel></rss>\n`;
}

// Meta (Facebook/Instagram) und Pinterest nutzen dieselben Spaltennamen.
export function katalogCsv(eintraege) {
  const kopf = ['id', 'item_group_id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'additional_image_link', 'brand', 'gtin', 'mpn', 'product_type'];
  const zeilen = eintraege.map((e) => [e.id, e.gruppe, e.titel, e.beschreibung, e.verfuegbar ? 'in stock' : 'out of stock', 'new', e.preis, e.link, e.bild, e.weitereBilder.join(','), e.marke, e.gtin, e.sku, e.art].map(csv).join(','));
  return `${kopf.join(',')}\n${zeilen.join('\n')}\n`;
}
