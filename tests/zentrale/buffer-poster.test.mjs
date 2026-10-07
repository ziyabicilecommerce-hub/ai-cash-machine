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

import { kontoFuer, zuordnen } from '../../automations/lib/faktenKonten.mjs';

test('kontoFuer: erste Videos auf die TikTok-Konten (alle verschieden), danach die weiteren; dreht täglich', () => {
  const t = ['@a', '@b', '@c'];
  const w = ['@x', '@y', '@z'];
  for (const tag of [0, 1, 2, 5]) {
    assert.equal(new Set([0, 1, 2].map((i) => kontoFuer(i, tag, t, w))).size, 3);
    assert.ok(w.includes(kontoFuer(3, tag, t, w)));
  }
  assert.notEqual(kontoFuer(0, 0, t, w), kontoFuer(0, 1, t, w));
});

test('zuordnen: Video kommt auf den Kanal, dessen Name im Video steht', () => {
  const kanaele = [{ id: '1', name: 'zyx_7851' }, { id: '2', name: 'futureflowxx' }, { id: '3', name: 'futureflowx3' }];
  const v = [{ datei: 'a', konto: '@futureflowx3' }, { datei: 'b', konto: '@zyx_7851' }, { datei: 'c', konto: '@futureflowxx' }, { datei: 'd', konto: '@desk.rebel' }];
  const plan = zuordnen(v, kanaele);
  assert.equal(plan.length, 3);
  assert.equal(plan.find((p) => p.video.datei === 'a').kanal.id, '3');
  assert.equal(plan.find((p) => p.video.datei === 'b').kanal.id, '1');
  assert.equal(plan.find((p) => p.video.datei === 'c').kanal.id, '2');
});
