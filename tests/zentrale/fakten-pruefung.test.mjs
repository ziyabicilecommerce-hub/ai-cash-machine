// Fakten-Kanal: strittige Rekord-Fakten werden verworfen, unstrittige bleiben.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { umstritten } from '../../automations/lib/faktenPruefung.mjs';

const s = (titel, ...texte) => ({ titel, fakt: titel, szenen: texte.map((text) => ({ text })) });

test('umstritten: Rekord-Fragen mit uneinigen Quellen werden erkannt', () => {
  assert.ok(umstritten(s('Der längste Fluss?', 'Welcher Fluss ist der längste der Welt?')));
  assert.ok(umstritten(s('Rekord', 'Der Amazonas ist der längste Fluss der Erde.')));
  assert.ok(umstritten(s('Rekord', 'Der Nil ist der laengste Fluss.')));
  assert.ok(umstritten(s('Berge', 'Der höchste Berg der Welt ist ...')));
  assert.ok(umstritten(s('Tiere', 'Das größte Tier der Erde.')));
});

test('umstritten: unstrittige Fakten bleiben erlaubt', () => {
  assert.ok(!umstritten(s('Ein Oktopus hat drei Herzen', 'Zwei pumpen Blut durch die Kiemen.', 'Eines versorgt den Körper.')));
  assert.ok(!umstritten(s('Blitze', 'Ein Blitz ist heißer als die Sonnenoberfläche.')));
  assert.ok(!umstritten({}));
});
