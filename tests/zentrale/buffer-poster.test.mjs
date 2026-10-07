import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verteilen, postText, postInput } from '../../automations/lib/bufferPoster.mjs';

test('verteilen: je Kanal ein anderes Video, nie mehr Posts als Kanaele', () => {
  const v = ['a', 'b', 'c', 'd', 'e', 'f'].map((datei) => ({ datei }));
  const plan = verteilen(v, ['k1', 'k2', 'k3'], 1);
  assert.equal(plan.length, 3);
  assert.equal(new Set(plan.map((p) => p.kanal)).size, 3);
  assert.equal(new Set(plan.map((p) => p.video.datei)).size, 3);
  assert.equal(verteilen(v.slice(0, 2), ['k1', 'k2', 'k3']).length, 2);
});

test('postText: KI-Kennzeichnung dabei, nie doppelt, maximal 2200 Zeichen', () => {
  assert.match(postText({ caption: 'Frage? #fakten' }), /#KIgeneriert$/);
  assert.equal(postText({ caption: 'Frage? #KIgeneriert' }), 'Frage? #KIgeneriert');
  assert.ok(postText({ caption: 'x'.repeat(5000) }).length <= 2200);
});

test('postInput: sofort, automatisch, Video-URL, TikTok-KI-Kennzeichnung', () => {
  const i = postInput('c1', 't', 'https://github.com/x.mp4');
  assert.equal(i.mode, 'shareNow');
  assert.equal(i.schedulingType, 'automatic');
  assert.deepEqual(i.assets, [{ video: { url: 'https://github.com/x.mp4' } }]);
  assert.equal(i.metadata.tiktok.isAiGenerated, true);
});
