// Hook-Overlay der ersten Sekunden: nie mitten im Satz oder auf einem Fuellwort enden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kurzHook } from '../../automations/lib/shopProdukte.mjs';

test('kurzHook nimmt den ersten ganzen Satz statt mitten im Satz zu schneiden', () => {
  assert.equal(kurzHook('Ohne Band: Klimmzug ist schwer. Mit Band schaffst du ihn.'), 'Ohne Band: Klimmzug ist schwer');
  assert.equal(kurzHook('Du denkst, das reicht?'), 'Du denkst, das reicht?');
  assert.equal(kurzHook('Hör auf, so zu trainieren! Wirklich.'), 'Hör auf, so zu trainieren!');
});

test('kurzHook endet nicht auf haengenden Fuellwoertern', () => {
  assert.equal(kurzHook('Rücken-Revolution mit BackEase für dein Büro und zuhause'), 'Rücken-Revolution mit BackEase');
  assert.ok(kurzHook('#PowerBand "Klimmzug" leicht').length <= 42);
});
