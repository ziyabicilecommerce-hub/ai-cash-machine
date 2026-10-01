// Notfall-Skript ohne KI: nur echte Saetze aus dem Shop-Text, Preis, CTA - Video faellt nicht mehr aus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saetzeAus, notfallSkript } from '../../automations/lib/ohneKi.mjs';
import { skriptMitFormat } from '../../automations/lib/formate.mjs';

const HTML = '<p><strong>Dein Klimmzug-Upgrade – überall, jederzeit.</strong></p><p>Das PowerBand ist ein endloses Latex-Loopband für Klimmzug-Unterstützung, Stretching und Krafttraining.</p>' +
  '<h3>Warum du es willst</h3><ul><li>Unterstützt dich bei Klimmzügen, bis du sie allein schaffst</li><li>Acht Stärken von Warm-up bis Profi</li><li>Maße: 208 cm x 4,5 mm</li><li>Kostenloser Versand ab 30 Euro</li></ul>' +
  '<p>Hinweis: Sportartikel, kein Medizinprodukt.</p>';
const P = { title: 'DeskRebel PowerBand – Klimmzugband', handle: 'powerband', shopName: 'DeskRebel', body_html: HTML, variants: [{ price: '12.99' }], images: [{ src: 'a' }, { src: 'b' }] };

test('saetzeAus nimmt nur sprechbare, echte Saetze - ohne Ueberschriften, Masse, Versand, Hinweis', () => {
  const s = saetzeAus(HTML);
  assert.deepEqual(s, [
    'Dein Klimmzug-Upgrade – überall, jederzeit.',
    'Das PowerBand ist ein endloses Latex-Loopband für Klimmzug-Unterstützung, Stretching und Krafttraining.',
    'Unterstützt dich bei Klimmzügen, bis du sie allein schaffst.',
    'Acht Stärken von Warm-up bis Profi.',
  ]);
  assert.deepEqual(saetzeAus('Warum du es willst Unterstützt dich jeden Tag beim Training. Hinweis: kein Medizinprodukt.'), ['Unterstützt dich jeden Tag beim Training.']);
});

test('notfallSkript: Shop-Saetze + Preis + Link in der Bio, Fotos reihum', () => {
  const d = notfallSkript(P, { tags: ['#klimmzugband', '#training'] });
  const texte = d.szenen.map((x) => x.text);
  assert.equal(texte[0], 'Dein Klimmzug-Upgrade – überall, jederzeit.');
  assert.ok(texte.includes('Gerade für 12,99 Euro im DeskRebel.'));
  assert.match(texte.at(-1), /Link in der Bio/);
  assert.deepEqual(d.szenen.map((x) => x.foto), [0, 1, 0, 1, 0, 1]);
  assert.match(d.caption, /#klimmzugband #training #DeskRebel/);
  assert.equal(d.hook, texte[0]);
});

test('notfallSkript ohne brauchbaren Text liefert keine Szenen (dann springt ein Ersatzprodukt ein)', () => {
  assert.deepEqual(notfallSkript({ ...P, body_html: '<p>Kurz.</p>' }, { tags: [] }).szenen, []);
});

test('Notfall-Videos verfaelschen das Lernen nicht (kein Format/Winkel zugeordnet)', async () => {
  const s = await skriptMitFormat({ handle: 'x' }, 'Kauf-Psychologie: Neugier. ', async () => ({ szenen: [], ohneKi: true }));
  assert.equal(s.formatName, '');
  assert.equal(s.winkelName, '');
});
