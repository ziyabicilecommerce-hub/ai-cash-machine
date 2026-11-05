import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verlaufMischen, bericht } from '../../automations/lib/wochenbericht.mjs';

const JETZT = Date.parse('2026-11-15T12:00:00Z');
const vor = (tage, extra = {}) => ({ zeit: new Date(JETZT - tage * 864e5).toISOString(), konto: '@desk.rebel', format: 'horror', aufrufe: 100, sehdauer: 4, text: 'x', ...extra });

test('Verlauf: neue Zahlen überschreiben alte, nichts doppelt, älter als 30 Tage fliegt raus', () => {
  const alt = [vor(2, { link: 'L1', aufrufe: 5 }), vor(40, { link: 'L0' })];
  const v = verlaufMischen(alt, [vor(2, { link: 'L1', aufrufe: 300 }), vor(1, { link: 'L2' })], JETZT);
  assert.deepEqual(v.map((p) => p.link), ['L1', 'L2']);
  assert.equal(v[0].aufrufe, 300);
});

test('Bericht: Woche gegen Vorwoche, frische Posts ohne Zahlen zählen nicht, Schritte ehrlich aus den Zahlen', () => {
  const v = [vor(0.2, { aufrufe: 0 }), vor(2, { aufrufe: 400 }), vor(3, { aufrufe: 200 }), vor(10, { aufrufe: 50 }),
    ...[2, 3, 4, 5, 6].map((t) => vor(t, { konto: '@zyx_7851', aufrufe: 2, sehdauer: 1 }))];
  const b = bericht(v, JETZT, (p) => (p.aufrufe === 400 ? 'anruf' : p.aufrufe === 200 ? 'anruf' : ''));
  assert.equal(b.gesamt.posts, 7, 'der Post von vor 5 Std. hat noch keine Zahlen');
  assert.equal(b.konten['@desk.rebel'].schnitt, 300); assert.equal(b.konten['@desk.rebel'].vorher, 50);
  assert.equal(b.top[0].aufrufe, 400);
  assert.ok(b.schritte.some((s) => s.includes('@desk.rebel läuft am besten')));
  assert.ok(b.schritte.some((s) => s.includes('@zyx_7851')));
  assert.ok(b.schritte.some((s) => s.includes('„anruf“')));
  assert.deepEqual(bericht([], JETZT).schritte, []);
});
