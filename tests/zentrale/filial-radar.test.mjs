import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bbox, dmFilialen, dmProdukte, dmBestand, neuImBestand, filialMeldungen } from '../../automations/lib/filialRadar.mjs';

const FIL = [
  { storeNumber: '1001', address: { street: 'Hauptstr. 1', zip: '65795', city: 'Hattersheim' }, location: { lat: 50.07, lon: 8.49 } },
  { storeNumber: '1002', address: { street: 'Zeil 10', zip: '60313', city: 'Frankfurt' }, location: { lat: 50.114, lon: 8.68 } },
  { storeNumber: '9999', address: { city: 'München' }, location: { lat: 48.14, lon: 11.58 } },
];

test('dm-Filialen: nur im 50-km-Umkreis, nächste zuerst, Adresse sauber', () => {
  assert.match(bbox(), /^50\.5\d+,7\.7\d+,49\.6\d+,9\.1\d+$/);
  const f = dmFilialen({ stores: FIL });
  assert.deepEqual(f.map((x) => x.nummer), ['1001', '1002']);
  assert.equal(f[0].adresse, 'Hauptstr. 1, 65795 Hattersheim');
  assert.equal(f[0].name, 'dm Hattersheim');
});

test('dm-Produkte: DAN, Preis, Bild, Link - zu teure raus', () => {
  const p = dmProdukte({ items: [
    { dan: '123', brandName: 'LEGO', title: 'Adventskalender', price: { value: 29.95 }, imageUrlTemplates: ['https://media.dm-static.com/images/{transformations}/v1/x'], relativeProductUrl: '/lego-p123.html' },
    { dan: '456', title: 'Luxus', price: { value: 199 } },
  ] }, 'adventskalender');
  assert.equal(p.length, 1);
  assert.equal(p[0].name, 'LEGO Adventskalender');
  assert.equal(p[0].link, 'https://www.dm.de/lego-p123.html');
  assert.match(p[0].bild, /f_auto/);
});

test('dm-Bestand: Prüffehler = unbekannt, Meldung nur bei echtem Wechsel auf "da"', () => {
  const b = dmBestand({ storeAvailabilities: {
    123: [{ store: { storeNumber: '1001' }, inStock: true, stockLevel: 4 }, { store: { storeNumber: '1002' }, inStock: false, stockLevel: 0, checkStatus: { status: 'ERROR' } }],
  } });
  assert.deepEqual(b, { '123|1001': { da: true, menge: 4 }, '123|1002': null });
  assert.deepEqual(neuImBestand({}, b, true), [], 'erster Lauf meldet nichts');
  assert.deepEqual(neuImBestand({ '123|1001': true }, b), []);
  const neu = neuImBestand({ '123|1001': false }, b);
  assert.deepEqual(neu, ['123|1001']);
  const m = filialMeldungen(neu, [{ dan: '123', name: 'LEGO Adventskalender', preis: 29.95, bild: 'https://b', link: 'https://www.dm.de/x' }], dmFilialen({ stores: FIL }), b);
  assert.equal(m.length, 1);
  assert.equal(m[0].titel, '🟢 NEU im Bestand: LEGO Adventskalender');
  assert.match(m[0].text, /29,95 € · dm Hattersheim .* · 4 Stück\nHauptstr\. 1, 65795 Hattersheim\nIm Umkreis in 1 Filiale/);
  assert.match(m[0].link, /google\.com\/maps\/dir/);
  assert.equal(m[0].shop, 'https://www.dm.de/x');
});

test('dm v2 tiles: Stückzahl aus dem Text, "nicht verfügbar" = leer', async () => {
  const { dmTiles } = await import('../../automations/lib/filialRadar.mjs');
  const b = dmTiles({ 123: { a11yLabel: 'In der Filiale verfügbar (3)' }, 456: { a11yLabel: 'In der Filiale nicht verfügbar' }, 789: { inStock: true } }, '1001');
  assert.deepEqual(b['123|1001'], { da: true, menge: 3 });
  assert.equal(b['456|1001'].da, false);
  assert.equal(b['789|1001'].da, true);
});
