// KI-Antworten robust lesen: abgeschnittenes JSON und andere Schluesselnamen kleiner KIs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonAusText, abgeschnittenSchliessen, szenenAus } from '../../automations/lib/kiJson.mjs';

test('abgeschnittenes JSON: fertige Szenen bleiben erhalten', () => {
  const roh = 'Hier dein Skript: {"szenen":[{"text":"Kennst du das?","foto":0},{"text":"Sanftes Klopfen.","foto":1},{"text":"Leicht und hand';
  const d = jsonAusText(roh);
  assert.equal(d.szenen.length, 2);
  assert.equal(d.szenen[1].text, 'Sanftes Klopfen.');
  assert.deepEqual(JSON.parse(abgeschnittenSchliessen('{"a":"x, y","b":[1,2')), { a: 'x, y', b: [1] }, 'unfertiges letztes Element faellt weg');
  assert.deepEqual(jsonAusText('{"a":1} danach Text'), { a: 1 });
});

test('szenenAus versteht andere Namen und reine Texte', () => {
  assert.equal(szenenAus({ scenes: [{ text: 'a' }] })[0].text, 'a');
  assert.equal(szenenAus({ skript: { szenen: ['Satz eins.'] } })[0].text, 'Satz eins.');
  assert.equal(szenenAus({ szenen: [{ satz: 'Mit Satz.', foto: 1 }] })[0].foto, 1);
  assert.equal(szenenAus({ szenen: [{ satz: 'Mit Satz.' }] })[0].text, 'Mit Satz.');
  assert.deepEqual(szenenAus({ titel: 'x' }), []);
});
