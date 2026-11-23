import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { istVideo, gueltigeSzenen } from '../../automations/schatten/higgsSchnitt.mjs';

test('Higgsfield-Schnitt: Clips erkannt, Szenen ohne Bild/Clip übersprungen', () => {
  assert.ok(istVideo('https://x/a.mp4') && !istVideo('https://x/a.png'));
  const f = { szenen: [{ text: 'a', bild: 'https://x/1.png' }, { text: 'b', bild: '' }, { text: 'c', clip: 'https://x/3.mp4' }, { text: '', bild: 'https://x/4.png' }] };
  assert.deepEqual(gueltigeSzenen(f).map((s) => s.text), ['a', 'c']);
  const k = JSON.parse(readFileSync('automations/schatten/folgen/kerzenmutter-1.json', 'utf8'));
  assert.equal(k.szenen.length, 8);
  assert.ok(gueltigeSzenen(k).length >= 1);
});
