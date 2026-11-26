import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pruefen, plan, promptBauen, figurenIn } from '../../automations/schatten/storyFabrik.mjs';

const ep = JSON.parse(readFileSync('automations/schatten/folgen/mutterwaerme-1.json', 'utf8'));

test('Story-Fabrik: Mutterwärme Teil 1 erfüllt das Format (Hook zuerst, 10-16 Schnitte, Cliffhanger)', () => {
  assert.deepEqual(pruefen(ep), []);
});

test('Story-Fabrik: Format-Verstöße werden erkannt', () => {
  const kaputt = { ...ep, szenen: ep.szenen.slice(0, 5).map((s, i) => (i === 4 ? { text: 'Ende.' } : s)) };
  const f = pruefen(kaputt);
  assert.ok(f.some((x) => x.includes('Einstellungen')));
  assert.ok(f.some((x) => x.includes('Cliffhanger')));
  assert.ok(f.some((x) => x.includes('weder Bild')));
});

test('Story-Fabrik: Plan gibt Figurenblatt als Referenz mit, Clips nur für fertige Bilder', () => {
  const p = plan(ep);
  assert.equal(p.blaetter.length, 1);
  assert.equal(p.blaetter[0].figur, 'MADAME');
  const tuer = p.bilder.find((b) => b.index === 4);
  assert.deepEqual(tuer.wartetAuf, ['MADAME']);
  assert.equal(tuer.params.medias.length, 1);  // Mama + Sohn teilen ein Figurenblatt -> nur einmal
  assert.ok(p.clips.every((c) => c.params.medias[0].role === 'start_image'));
  assert.ok(!p.clips.some((c) => c.index === 3));  // Szene 3 hat schon einen Clip
  assert.deepEqual(figurenIn('{MAMA} und {SOHN}', ep.figuren), ['MAMA', 'SOHN']);
  assert.ok(promptBauen('{SOHN} eats', ep.figuren).includes('from the reference image'));
});
