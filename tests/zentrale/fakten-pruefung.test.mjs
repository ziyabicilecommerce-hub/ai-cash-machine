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

test('echo: abgeschriebene Anweisungen als Titel werden erkannt', async () => {
  const { echo } = await import('../../automations/lib/faktenPruefung.mjs');
  assert.ok(echo({ titel: 'Fakt #11: 5-6 Szenen mit je 1 kurzer gesprochener Satz' }));
  assert.ok(echo({ titel: '#10: Genau ein Thema?' }));
  assert.ok(echo({ titel: 'Blitze', caption: '2 Saetze + Frage + 4-6 Hashtags' }));
  assert.ok(!echo({ titel: 'Ein Oktopus hat drei Herzen', hook: 'Stimmt das wirklich?', caption: 'Wusstest du das? #Natur #Tiere' }));
});

test('doppelt: dasselbe Thema wie ein bekannter Fakt wird erkannt', async () => {
  const { doppelt } = await import('../../automations/lib/faktenPruefung.mjs');
  const bekannt = ['Ein Oktopus hat drei Herzen', 'Olympus Mons ist ca. 22 km hoch'];
  assert.ok(doppelt({ titel: 'Oktopus: Drei Herzen', fakt: 'Der Oktopus besitzt drei Herzen' }, bekannt));
  assert.ok(doppelt({ titel: 'Olympus Mons', fakt: 'Der Olympus Mons ist riesig' }, bekannt));
  assert.ok(!doppelt({ titel: 'Honig wird nie schlecht', fakt: 'Honig verdirbt nicht, weil er kaum Wasser enthält' }, bekannt));
  assert.ok(!doppelt({ titel: 'Honig', fakt: 'Honig' }, []));
});

test('echo: abgeschriebene Platzhalter ("max. 60 Zeichen", "...") werden erkannt', async () => {
  const { echo } = await import('../../automations/lib/faktenPruefung.mjs');
  assert.ok(echo({ titel: 'Fakt #13: max. 60 Zeichen' }));
  assert.ok(echo({ titel: '...', caption: 'Wusstest du das?' }));
  assert.ok(!echo({ titel: 'Honig verdirbt nie', hook: 'Wirklich nie?', caption: 'Honig ist uralt. Wusstest du das? #Honig #Natur' }));
});
