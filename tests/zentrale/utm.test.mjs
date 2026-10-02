// Verkaufs-Messung: UTM nur an eigenen Shop-Links, je Plattform, ohne Satzzeichen zu verschlucken.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mitUtm, textMitUtm } from '../../automations/lib/utm.mjs';
import { beitrag } from '../../automations/lib/community.mjs';
import '../../zentrale/js/captions.js';

test('mitUtm: nur eigene Shops, bestehende UTM bleibt, Kampagne sauber', () => {
  assert.equal(mitUtm('https://www.deskrebel.store/products/powerband', 'TikTok', '2026-10-01-1-PowerBand.mp4'), 'https://www.deskrebel.store/products/powerband?utm_source=tiktok&utm_medium=social&utm_campaign=2026-10-01-1-powerband');
  assert.equal(mitUtm('https://fremd.example/x', 'tiktok'), 'https://fremd.example/x');
  assert.equal(mitUtm('https://purivelle.store/products/a?utm_source=bio', 'tiktok'), 'https://purivelle.store/products/a?utm_source=bio');
  assert.equal(mitUtm('', 'tiktok'), '');
});

test('textMitUtm: alle eigenen Links im Text, Satzzeichen bleiben draussen', () => {
  const t = textMitUtm('Hier: https://purivelle.store/products/roll. Und https://andere.de/x!', 'telegram');
  assert.match(t, /products\/roll\?utm_source=telegram&utm_medium=social\. Und https:\/\/andere\.de\/x!/);
});

test('Community-Routine und Heute-posten-Texte tragen die Quelle', () => {
  const b = beitrag(new Date('2026-10-10T16:05:00Z'), { produkte: [{ name: 'P', shop: 'DeskRebel', url: 'https://www.deskrebel.store/products/p' }, { name: 'Q', shop: 'Purivelle', url: 'https://purivelle.store/products/q' }] });
  assert.match(b.text, /utm_source=community/);
  const yt = ZCaptions.fuerPlattform({ titel: 'X', caption: 'T 👉 https://www.deskrebel.store/products/powerband', datei: 'a.mp4' }, 'youtube');
  assert.match(yt.text, /utm_source=youtube/);
});
