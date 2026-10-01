// Shop-Doktor und Produkt-Feeds: echte Pruefregeln, kein Shopify-Schluessel noetig.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { produktPruefen, seitePruefen, shopPruefen, punktzahl, doppelteTitel } from '../../automations/lib/shopDoktor.mjs';
import { feedEintraege, googleXml, katalogCsv } from '../../automations/lib/produktFeeds.mjs';

const produkt = (x = {}) => ({
  id: 1, title: 'DeskRebel PowerBand – Klimmzugband', handle: 'powerband', vendor: 'DeskRebel', product_type: 'Fitness', tags: ['band'],
  body_html: `<p>${'Starkes Band für Klimmzüge und Training zuhause. '.repeat(20)}</p>`,
  images: [{ src: 'https://cdn.shopify.com/a.png', alt: 'Band' }, { src: 'https://cdn.shopify.com/b.png', alt: 'x' }, { src: 'https://cdn.shopify.com/c.png', alt: 'y' }],
  variants: [{ id: 11, price: '19.99', compare_at_price: null, available: true, option1: 'Default Title', barcode: '', sku: 'PB-1' }],
  shopUrl: 'https://www.deskrebel.store', shopName: 'DeskRebel', ...x,
});
const was = (b) => b.map((x) => x.was).join(' | ');

test('gutes Produkt hat keine Befunde', () => assert.equal(produktPruefen(produkt()).length, 0));

test('Produkt-Regeln finden echte Probleme', () => {
  const b = produktPruefen(produkt({ images: [], body_html: '', variants: [{ id: 1, price: '0', available: false, compare_at_price: '0' }] }));
  assert.match(was(b), /Kein Produktbild/);
  assert.match(was(b), /Keine Produktbeschreibung/);
  assert.match(was(b), /Preis 0/);
  assert.match(was(b), /Ausverkauft/);
  assert.match(was(produktPruefen(produkt({ variants: [{ id: 1, price: '20', compare_at_price: '15', available: true }] }))), /Streichpreis ist nicht höher/);
  assert.match(was(produktPruefen(produkt({ variants: [{ id: 1, price: '20', compare_at_price: '30', available: true }] }))), /Preisangabenverordnung/);
  assert.match(was(produktPruefen(produkt({ body_html: 'Dieser Roller heilt Rückenschmerzen. '.repeat(30) }))), /Riskante Werbeaussage: "heilt/);
  assert.match(was(produktPruefen(produkt({ body_html: 'kurz' }))), /sehr kurz/);
});

test('Seiten-Regeln: Status, Ladezeit, Meta, JSON-LD', () => {
  assert.equal(seitePruefen({ status: 404, ms: 100, html: '' })[0].stufe, 'kritisch');
  const gut = '<title>PowerBand</title><meta name="description" content="Klimmzugband mit 4 Stärken für zuhause und Gym"><meta property="og:image" content="x"><script type="application/ld+json">{"@type":"Product","offers":{}}</script>';
  assert.equal(seitePruefen({ status: 200, ms: 800, html: gut }).length, 0);
  const b = seitePruefen({ status: 200, ms: 4200, html: '<html></html>' });
  assert.match(was(b), /langsam.*Seitentitel.*Meta-Beschreibung.*og:image.*JSON-LD/);
});

test('Shop-Regeln: Pflichtseiten fehlen = kritisch', () => {
  const b = shopPruefen({ start: { status: 200, ms: 900, url: 'https://x' }, robots: true, sitemap: false, pflicht: [['Impressum', false], ['AGB', true]] });
  assert.match(was(b), /Impressum fehlt/);
  assert.match(was(b), /sitemap/);
  assert.equal(punktzahl(b), 100 - 15 - 5);
  assert.equal(doppelteTitel([{ id: 1, title: 'A b' }, { id: 2, title: 'a  B' }, { id: 3, title: 'C' }]).size, 2);
});

test('Feeds: je Variante ein Eintrag mit echtem Preis, gueltiges Google-XML und CSV', () => {
  const p = produkt({ variants: [{ id: 11, price: '19.99', available: true, option1: 'Gelb', barcode: '4006381333931', sku: 'G' }, { id: 12, price: '24.99', available: false, option1: 'Rot' }, { id: 13, price: '0', available: true }] });
  const e = feedEintraege([p, produkt({ id: 2, images: [] })]);
  assert.equal(e.length, 2, 'Preis 0 und Produkt ohne Bild fliegen raus');
  assert.equal(JSON.stringify([e[0].titel, e[0].preis, e[0].verfuegbar, e[0].gtin, e[1].verfuegbar]), '["DeskRebel PowerBand – Klimmzugband - Gelb","19.99 EUR",true,"4006381333931",false]');
  assert.match(e[0].link, /\/products\/powerband\?variant=11$/);
  const x = googleXml(e, { titel: 'DeskRebel' });
  assert.match(x, /^<\?xml/);
  assert.equal((x.match(/<item>/g) || []).length, 2);
  assert.match(x, /<g:gtin>4006381333931<\/g:gtin>/);
  assert.match(x, /<g:identifier_exists>no<\/g:identifier_exists>/);
  assert.match(x, /out_of_stock/);
  assert.ok(!/sale_price/.test(x), 'kein Streichpreis im Feed');
  const c = katalogCsv(e).trim().split('\n');
  assert.equal(c.length, 3);
  assert.match(c[0], /^id,item_group_id,title/);
});
