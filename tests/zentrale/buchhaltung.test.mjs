// Buchhaltungs-Bot (#105): Rechnen, Monatsfenster, CSV und Mails ohne Kundendaten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestellungBuchen, zaehlt, summieren, csvBauen, bestellMail, monatsMail, vormonat, kennung } from '../../automations/lib/buchhaltung.mjs';

const order = {
  id: 5551, name: '#1001', created_at: '2026-10-14T19:05:00+02:00', financial_status: 'paid', currency: 'EUR',
  total_price: '59.90', total_tax: '9.56', total_discounts: '5.00', taxes_included: true,
  shipping_lines: [{ price: '4.90' }], tax_lines: [{ rate: 0.19, price: '9.56' }], payment_gateway_names: ['paypal'],
  shipping_address: { country_code: 'DE', name: 'Max Muster', address1: 'Geheimweg 1' }, email: 'kunde@example.com',
  customer: { first_name: 'Max', last_name: 'Muster' },
  line_items: [{ title: 'Schreibtisch-Organizer', quantity: 1, price: '55.00' }],
  refunds: [{ transactions: [{ kind: 'refund', status: 'success', amount: '10.00' }] }],
};
const annahmen = { produktkostenProzent: 40, gebuehrProzent: 2.5, gebuehrFixCent: 25 };

test('Bestellung buchen: brutto, netto, MwSt., Erstattung, geschätzter Gewinn', () => {
  const b = bestellungBuchen(order, annahmen);
  assert.equal(b.brutto, 59.9);
  assert.equal(b.netto, 50.34);
  assert.equal(b.mwst, 9.56);
  assert.equal(b.versand, 4.9);
  assert.equal(b.erstattet, 10);
  assert.deepEqual(b.saetze, [19]);
  assert.equal(b.gebuehren, 1.75);
  assert.equal(b.ware, 18.18);
  assert.equal(b.gewinn, 20.41);
  assert.equal(b.land, 'DE');
});

test('nur echte bezahlte Bestellungen zählen', () => {
  assert.equal(zaehlt(order), true);
  assert.equal(zaehlt({ ...order, test: true }), false);
  assert.equal(zaehlt({ ...order, cancelled_at: '2026-10-15' }), false);
  assert.equal(zaehlt({ ...order, financial_status: 'pending' }), false);
});

test('Summen, CSV und Mails enthalten keine Kundendaten', () => {
  const b = bestellungBuchen(order, annahmen);
  const s = summieren([b, b]);
  assert.equal(s.anzahl, 2);
  assert.equal(s.brutto, 119.8);
  assert.equal(s.mwstNachSatz['19 %'], 19.12);
  const csv = csvBauen([b]);
  assert.match(csv, /Datum;Bestellnummer/);
  assert.match(csv, /2026-10-14;#1001;paid;EUR;59,90;50,34;9,56;19/);
  const m1 = bestellMail(b, { shop: 'DeskRebel', monat: s });
  const m2 = monatsMail(s, { shop: 'DeskRebel', monat: '2026-10' });
  for (const t of [csv, m1.html, m2.html, m1.betreff]) {
    assert.doesNotMatch(t, /Muster|Geheimweg|kunde@example/);
  }
  assert.match(m1.betreff, /#1001/);
  assert.match(m2.betreff, /Monatsabrechnung 2026-10/);
});

test('Vormonat und gehashte IDs', () => {
  assert.equal(vormonat(new Date('2026-11-01T08:00:00Z')).name, '2026-10');
  assert.equal(vormonat(new Date('2026-01-01T08:00:00Z')).name, '2025-12');
  assert.equal(vormonat(new Date('2026-10-31T23:30:00Z')).name, '2026-10', '00:30 deutsche Zeit am 1.11.');
  assert.equal(kennung(5551).length, 16);
  assert.notEqual(kennung(5551), '5551');
});
