import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import '../../zentrale/js/labor.js';
import { laborWinkel } from '../../automations/lib/laborWinkel.mjs';
import { auswahl, schluessel, produktListe } from '../../automations/werbe-labor.mjs';

const { ZLabor } = globalThis;
const produkt = { title: 'LED-Lichtleiste', body_html: '<p>App-Steuerung, 16 Mio. Farben, kürzbar</p>', variants: [{ price: '29.99', compare_at_price: '39.99' }], handle: 'led', shopUrl: 'https://shop.test' };

test('hooksLesen säubert, entfernt Dubletten und zu kurze Hooks', () => {
  const h = ZLabor.hooksLesen({ hooks: ['1. „Dein Zimmer um 22 Uhr“', 'Dein Zimmer um 22 Uhr', 'kurz', '  Warum zeigt dir das keiner?  '] });
  assert.equal(JSON.stringify(h), JSON.stringify(['Dein Zimmer um 22 Uhr', 'Warum zeigt dir das keiner?']));
});

test('hooksLesen behält Preise am Anfang, entfernt nur Aufzählungen', () => {
  const h = ZLabor.hooksLesen({ hooks: ['26,99 € für sanfte Entspannung', '1. Dein Rücken sagt danke', '- Nie wieder Nackenschmerzen', '10 Minuten statt Fitnessstudio'] });
  assert.equal(JSON.stringify(h), JSON.stringify(['26,99 € für sanfte Entspannung', 'Dein Rücken sagt danke', 'Nie wieder Nackenschmerzen', '10 Minuten statt Fitnessstudio']));
});

test('auswerten: gewichtete Kaufabsicht, Käufer von 100 und Einwand des größten Nicht-Käufers', () => {
  const hooks = ['A', 'B'];
  const werte = ZLabor.JURY.map((j, t) => (t === 0 ? [3, 9] : [8, 5]));
  const einwaende = ZLabor.JURY.map((j, t) => `Einwand ${t}`);
  const a = ZLabor.auswerten(hooks, { werte, einwaende }, null);
  const g0 = ZLabor.JURY[0].gewicht, rest = 100 - g0;
  assert.equal(a.gewinner.hook, 'A');
  assert.equal(a.gewinner.punkte, Math.round(((3 * g0 + 8 * rest) / 100) * 10) / 10);
  assert.equal(a.gewinner.kaeufer, rest);
  assert.equal(a.einwand.text, 'Einwand 0');
  assert.equal(a.gewinner.quelle, 'Jury');
});

test('auswerten fällt ohne gültige Jury auf Werberegeln zurück', () => {
  const a = ZLabor.auswerten(['Warum zeigt dir das niemand?', 'Das beste revolutionäre unglaubliche Produkt der ganzen Welt für alle Menschen'], { werte: [[1]] }, null);
  assert.equal(a.gewinner.quelle, 'Regeln');
  assert.equal(a.gewinner.hook, 'Warum zeigt dir das niemand?');
  assert.equal(a.einwand, null);
});

test('labor: kompletter Durchlauf mit nachgebauter KI schärft den Gewinner nach', async () => {
  const prompts = [];
  const ki = async (prompt) => {
    prompts.push(prompt);
    if (prompt.includes('Schreibe genau')) return { hooks: ZLabor.WINKEL.map((w, i) => `Hook Nummer ${i + 1} für dich`) };
    if (prompt.includes('Simuliere')) return { werte: ZLabor.JURY.map((j, t) => ZLabor.WINKEL.map((w, i) => (i === 2 ? (t === 0 ? 5 : 8) : 4))), einwaende: ZLabor.JURY.map(() => 'Zu teuer für eine Lichtleiste') };
    return { hook: 'Für 29,99 € statt 39,99 € dein Zimmer neu', antwort: 'Kürzbar und per App steuerbar.', schlagzeile: 'Zimmer neu für 29,99 €' };
  };
  const e = await ZLabor.labor(produkt, ki);
  assert.equal(prompts.length, 3);
  assert.match(prompts[0], /Vorher: 39\.99 EUR/);
  assert.match(prompts[0], /keine erfundenen Kunden oder Bewertungen/);
  assert.equal(e.gewinner.hook, 'Hook Nummer 3 für dich');
  assert.equal(e.final.hook, 'Für 29,99 € statt 39,99 € dein Zimmer neu');
  assert.ok(ZLabor.fabrikWinkel(e).includes(e.final.hook));
});

test('labor: ohne erreichbare KI trotzdem ein Ergebnis', async () => {
  const e = await ZLabor.labor(produkt, async () => { throw new Error('offline'); });
  assert.ok(e.ergebnisse.length >= 3);
  assert.equal(e.gewinner.quelle, 'Regeln');
  assert.ok(e.final.hook.length > 5);
  assert.equal(e.ersatz, true);
  assert.equal(ZLabor.fabrikWinkel(e), '', 'Ersatz-Hooks gehen nie an die Fabrik');
});

test('kurzName macht gesprochene Hooks kurz', () => {
  assert.equal(ZLabor.kurzName('DeskRebel PowerBand – Klimmzugband & Widerstandsband'), 'DeskRebel PowerBand');
  assert.equal(ZLabor.kurzName('Mini Beamer HD Pro Max Ultra'), 'Mini Beamer HD');
  assert.equal(ZLabor.kurzName(''), 'das hier');
});

test('laborWinkel nutzt nur frische Ergebnisse für die Fabrik', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'labor-'));
  const pfad = join(dir, 'werbe-labor.json');
  const offline = await ZLabor.labor(produkt, async () => { throw new Error('offline'); });
  const e = { ...offline, ersatz: false, gewinner: { ...offline.gewinner, quelle: 'Jury' } };
  writeFileSync(pfad, JSON.stringify({ produkte: { [schluessel(produkt)]: e } }));
  assert.ok(laborWinkel(produkt, { pfad }).includes(e.final.hook));
  assert.equal(laborWinkel(produkt, { pfad, jetzt: Date.now() + 15 * 864e5 }), '');
  assert.equal(laborWinkel({ ...produkt, handle: 'anders' }, { pfad }), '');
  assert.equal(laborWinkel(produkt, { pfad: join(dir, 'fehlt.json') }), '');
  writeFileSync(pfad, JSON.stringify({ produkte: { [schluessel(produkt)]: { ...e, gewinner: { ...e.gewinner, quelle: 'Regeln' } } } }));
  assert.equal(laborWinkel(produkt, { pfad }), '', 'nur Jury-Gewinner gehen an die Fabrik');
});

test('auswahl: erst ungetestete, dann älteste, frische bleiben liegen', () => {
  const jetzt = Date.parse('2026-10-10T00:00:00Z');
  const p = (h) => ({ handle: h, shopUrl: 'https://s' });
  const stand = { produkte: { [schluessel(p('alt'))]: { erstellt: '2026-09-01T00:00:00Z' }, [schluessel(p('frisch'))]: { erstellt: '2026-10-09T00:00:00Z' } } };
  const r = auswahl([p('frisch'), p('alt'), p('neu')], stand, 5, jetzt).map((x) => x.handle);
  assert.equal(JSON.stringify(r), JSON.stringify(['neu', 'alt']));
});

test('produktListe: günstigste Variante, echter Streichpreis, IDs passend zum Shopify-Anschluss', () => {
  const [p] = produktListe([{ id: 42, title: 'PowerBand', handle: 'powerband', shopUrl: 'https://www.deskrebel.store', shopName: 'DeskRebel', body_html: '<p>Reißfest</p>', images: [{ src: 'https://cdn/x.jpg' }], variants: [{ price: '19.99', compare_at_price: '24.99' }, { price: '12.99' }] }]);
  assert.equal(p.id, 'p42');
  assert.equal(p.preis, 12.99);
  assert.equal(p.vergleich, 24.99);
  assert.equal(p.url, 'https://www.deskrebel.store/products/powerband');
  assert.equal(p.bild, 'https://cdn/x.jpg');
  assert.equal(p.info, 'Reißfest');
});
