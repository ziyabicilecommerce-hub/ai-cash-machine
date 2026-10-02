// Anime-Produktvideos: Anteil, Umstellung aller Bild-Prompts, echtes Produktfoto bleibt Vorlage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { animeHeute, animeStil } from '../../automations/lib/animeStil.mjs';
import { notfallSkript } from '../../automations/lib/ohneKi.mjs';

test('etwa jedes 4. Produktvideo ist Anime, abschaltbar', () => {
  const tage = Array.from({ length: 400 }, (_, t) => animeHeute({ handle: 'powerband' }, { tag: t, anteil: 0.25 }));
  const anteil = tage.filter(Boolean).length / tage.length;
  assert.ok(anteil > 0.2 && anteil < 0.3, `Anteil ${anteil}`);
  assert.equal(animeHeute({ handle: 'x' }, { anteil: 0 }), false);
});

test('animeStil stellt Kulisse, Beispiel-Szene und Ohne/Mit um - Original bleibt unveraendert', () => {
  const s = { titel: 'X', caption: 'Text #fitness\n\n👉 https://www.deskrebel.store/products/x', hintergrund: { prompt: 'clean minimal room', seed: 1 }, szenen: [{ text: 'a' }, { text: 'b', anwendung: { prompt: 'realistic smartphone photo, one adult person using this', ref: 'https://cdn/x.jpg', schritte: ['realistic smartphone photo, start', 'realistic smartphone photo, end'] } }, { text: 'c', vergleich: { ohne: 'photo of tired person', mit: 'photo of person with product', ref: 'r' } }] };
  const a = animeStil(s);
  assert.equal(a.stilName, 'anime');
  assert.match(a.hintergrund.prompt, /^anime style illustration.*clean minimal room/);
  assert.match(a.szenen[1].anwendung.prompt, /^anime style illustration.*one adult person using this/);
  assert.doesNotMatch(a.szenen[1].anwendung.prompt, /realistic smartphone photo/);
  assert.equal(a.szenen[1].anwendung.ref, 'https://cdn/x.jpg', 'echtes Produktfoto bleibt Vorlage');
  assert.ok(a.szenen[1].anwendung.schritte.every((x) => x.startsWith('anime style')));
  assert.match(a.szenen[2].vergleich.mit, /anime style illustration.*illustration of person with product/);
  assert.match(a.caption, /#fitness #anime\n\n👉/);
  assert.equal(s.hintergrund.prompt, 'clean minimal room', 'Original unveraendert');
  assert.ok(animeStil({ titel: 'X', szenen: [] }));
});
