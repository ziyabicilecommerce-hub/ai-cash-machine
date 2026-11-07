import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KURZ_HORROR, naechsterKurzHorror, kurzHeuteSchon } from '../../automations/schatten/kurzHorror.mjs';
import { slug } from '../../automations/schatten/videobot.mjs';
import { storyEingabe } from '../../automations/lib/bufferVerteiler.mjs';

test('2-Satz-Horror: genug, eindeutig, vollständig', () => {
  assert.ok(KURZ_HORROR.length >= 40);
  assert.equal(new Set(KURZ_HORROR.map((g) => slug(g.titel))).size, KURZ_HORROR.length);
  for (const g of KURZ_HORROR) assert.ok(g.a && g.b && g.frage && g.b.length < 160, g.titel);
});

test('naechsterKurzHorror überspringt Gepostetes, null wenn alles weg', () => {
  const alle = KURZ_HORROR.map((g) => `kurz:${slug(g.titel)}`);
  assert.equal(naechsterKurzHorror(alle), null);
  const g = naechsterKurzHorror(alle.slice(1), () => 0);
  assert.equal(slug(g.titel), alle[0].slice(5));
  assert.ok(naechsterKurzHorror(['horror:die-puppe']));  // Video-Schlüssel zählen nicht
});

test('kurzHeuteSchon: nur Kurz-Schlüssel von heute', () => {
  const heute = '2026-11-07T00:00:00.000Z';
  assert.equal(kurzHeuteSchon({ 'kurz:a': '2026-11-06T20:00:00Z', 'horror:b': '2026-11-07T09:00:00Z' }, heute), false);
  assert.equal(kurzHeuteSchon({ 'kurz:a': '2026-11-07T09:00:00Z' }, heute), true);
});

test('storyEingabe nimmt eigenen Sticker, sonst den Reel-Hinweis', () => {
  assert.match(storyEingabe('x', 'https://a/b.jpg').metadata.instagram.stickerFields.text, /Neues Video/);
  const s = storyEingabe('x', 'https://a/b.jpg', false, 'Tippen für Satz 2 👀', 'Satz 1');
  assert.equal(s.metadata.instagram.stickerFields.text, 'Tippen für Satz 2 👀');
  assert.equal(s.assets[0].image.metadata.altText, 'Satz 1');
  assert.equal(s.text, '');  // zählt nicht als Post
});

test('storyEingabe: .mp4 wird zur Video-Story', () => {
  const s = storyEingabe('x', 'https://a/kachel2.mp4', false, 'Frage');
  assert.deepEqual(s.assets[0], { video: { url: 'https://a/kachel2.mp4' } });
  assert.equal(s.metadata.instagram.type, 'story');
});
