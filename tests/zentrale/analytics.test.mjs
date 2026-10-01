import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ console });
for (const f of ['analytics', 'store', 'agenten']) {
  vm.runInContext(readFileSync(new URL(`../../zentrale/js/${f}.js`, import.meta.url), 'utf8'), ctx);
}
const { ZA, ZS, ZAgenten } = ctx;

const b = (id, datum, kunde, artikel, pfad = ['direkt']) => ({ id, datum, kunde, artikel, pfad, kanal: pfad[pfad.length - 1] });
const produkte = [
  { id: 'a', name: 'A', preis: 10, kosten: 4 },
  { id: 'b', name: 'B', preis: 20, kosten: 5 },
  { id: 'c', name: 'C', preis: 5, kosten: 1 },
];

test('kennzahlen: Umsatz, Marge, Wiederkauf', () => {
  const k = ZA.kennzahlen([
    b('1', '2026-01-01', 'x', [{ p: 'a', menge: 2, preis: 10 }]),
    b('2', '2026-01-05', 'x', [{ p: 'b', menge: 1, preis: 20 }]),
    b('3', '2026-01-06', 'y', [{ p: 'c', menge: 1, preis: 5 }]),
  ], produkte);
  assert.equal(k.umsatz, 45);
  assert.equal(k.rohertrag, 45 - 8 - 5 - 1);
  assert.equal(k.kunden, 2);
  assert.equal(k.wiederkaufRate, 50);
  assert.equal(k.warenkorb, 15);
});

test('wochenReihe füllt Lücken mit 0 und beginnt am Montag', () => {
  const r = ZA.wochenReihe([
    b('1', '2026-01-07', 'x', [{ p: 'a', menge: 1, preis: 10 }]),
    b('2', '2026-01-22', 'x', [{ p: 'a', menge: 1, preis: 10 }]),
  ]);
  assert.equal(JSON.stringify(r.map((x) => x.woche)), JSON.stringify(['2026-01-05', '2026-01-12', '2026-01-19']));
  assert.equal(JSON.stringify(r.map((x) => x.umsatz)), JSON.stringify([10, 0, 10]));
});

test('regression trifft eine exakte Gerade', () => {
  const m = ZA.regression([0, 1, 2, 3], [1, 3, 5, 7]);
  assert.ok(Math.abs(m.b - 2) < 1e-9 && Math.abs(m.a - 1) < 1e-9);
  assert.ok(m.r2 > 0.999);
});

test('koKaeufe berechnet Lift und Empfehlungen', () => {
  const best = [
    b('1', '2026-01-01', 'x', [{ p: 'a', menge: 1, preis: 10 }, { p: 'b', menge: 1, preis: 20 }]),
    b('2', '2026-01-02', 'y', [{ p: 'a', menge: 1, preis: 10 }, { p: 'b', menge: 1, preis: 20 }]),
    b('3', '2026-01-03', 'z', [{ p: 'c', menge: 1, preis: 5 }]),
    b('4', '2026-01-04', 'w', [{ p: 'c', menge: 1, preis: 5 }]),
  ];
  const an = ZA.koKaeufe(best);
  const ab = an.paare.find((p) => p.a === 'a' && p.b === 'b');
  assert.equal(ab.anzahl, 2);
  assert.equal(ab.lift, 2);
  assert.equal(ab.konfAB, 1);
  assert.equal(ZA.empfehlungenFuer('a', an)[0].produkt, 'b');
});

test('attribution: jedes Modell verteilt genau den Gesamtumsatz', () => {
  const best = [
    b('1', '2026-01-01', 'x', [{ p: 'a', menge: 1, preis: 100 }], ['tiktok', 'instagram', 'email']),
    b('2', '2026-02-01', 'y', [{ p: 'a', menge: 1, preis: 50 }], ['google']),
  ];
  for (const m of Object.keys(ZA.MODELLE)) {
    const r = ZA.attribution(best, m, {});
    assert.ok(Math.abs(ZA.summe(r.map((k) => k.umsatz)) - 150) < 0.02, m);
  }
  const erst = ZA.attribution(best, 'erster', {});
  assert.equal(erst.find((k) => k.kanal === 'tiktok').umsatz, 100);
  const pos = ZA.attribution(best, 'position', { instagram: 10 });
  assert.equal(pos.find((k) => k.kanal === 'instagram').umsatz, 20);
  assert.ok(pos.find((k) => k.kanal === 'instagram').roas > 0);
});

test('preisEmpfehlung folgt der Formel p* = k·e/(1+e) innerhalb der Grenzen', () => {
  const r = ZA.preisEmpfehlung({ preis: 22, kosten: 10 }, -2);
  assert.equal(r.optimal, 20.99);
  assert.equal(ZA.preisEmpfehlung({ preis: 30, kosten: 10 }, -2).optimal, 24.99, 'max. 20 % Senkung pro Schritt');
  assert.ok(r.gewinnAenderung > 0);
  assert.equal(ZA.preisEmpfehlung({ preis: 30, kosten: 10 }, -0.5).optimal, null);
});

test('kundenAnalyse erkennt gefährdete Stammkunden', () => {
  const best = [];
  for (let i = 0; i < 5; i++) best.push(b('s' + i, ZA.datumAus(ZA.tagZahl('2026-01-01') + i * 10), 'stamm', [{ p: 'a', menge: 1, preis: 10 }]));
  for (let i = 0; i < 12; i++) best.push(b('n' + i, '2026-06-0' + ((i % 9) + 1), 'neu' + i, [{ p: 'a', menge: 1, preis: 10 }]));
  for (let i = 0; i < 3; i++) best.push(b('t' + i, '2026-06-0' + (i + 1), 'treu', [{ p: 'a', menge: 1, preis: 10 }]));
  const ka = ZA.kundenAnalyse(best, '2026-06-10');
  const stamm = ka.kunden.find((k) => k.kunde === 'stamm');
  assert.equal(stamm.segment, 'Gefährdet');
  assert.ok(stamm.risiko > 3);
});

test('CSV-Import gruppiert Zeilen zu Bestellungen und legt Produkte an', () => {
  const z = ZS.leer();
  const r = ZS.bestellungenImportieren(z, 'datum;kunde;produkt;menge;preis;kanal\n01.03.2026;anna;Tasse;2;"12,50";tiktok\n01.03.2026;anna;Teller;1;8;tiktok\n02.03.2026;ben;Tasse;1;12,50;email\nkaputt;;;;;');
  assert.equal(r.importiert, 2);
  assert.equal(r.fehler.length, 1);
  assert.equal(z.produkte.length, 2);
  assert.equal(ZA.bestellWert(z.bestellungen[0]), 33);
  assert.equal(z.bestellungen[0].datum, '2026-03-01');
});

test('Beispieldaten sind deterministisch und alle Agenten liefern Ergebnisse', () => {
  const z1 = ZS.beispielDaten('2026-09-30'), z2 = ZS.beispielDaten('2026-09-30');
  assert.equal(JSON.stringify(z1), JSON.stringify(z2));
  assert.ok(z1.bestellungen.length > 500);
  const r = ZAgenten.alleLaufen(z1);
  for (const ber of r.berichte) {
    assert.ok(ber.funde.length > 0, ber.name);
    assert.ok(!ber.funde.some((f) => f.titel === 'Konnte nicht rechnen'), ber.name);
  }
  assert.ok(r.ctx.bundles.length > 0);
  assert.ok(ZA.elastizitaetSchaetzen(z1.bestellungen, 'led'), 'LED-Preistest sollte eine Elastizität ergeben');
});
