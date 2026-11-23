import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findeVideoUrl, findeId, fehlgeschlagen, erschoepft } from '../../automations/lib/freeAiVideo.mjs';
import { modelleFuer } from '../../automations/lib/kiVideo.mjs';

test('free.ai-Antworten: Video-URL und Auftrags-ID werden in verschiedenen Formen gefunden', () => {
  assert.equal(findeVideoUrl({ data: { output: [{ url: 'https://cdn.example/x/clip.mp4?sig=1' }] } }), 'https://cdn.example/x/clip.mp4?sig=1');
  assert.equal(findeVideoUrl({ status: 'queued', id: 'abc' }), '');
  assert.equal(findeId({ job_id: 'j1' }), 'j1');
  assert.equal(findeId({ data: { task_id: 't9' } }), 't9');
  assert.equal(fehlgeschlagen({ status: 'failed' }), true);
  assert.equal(fehlgeschlagen({ status: 'processing' }), false);
});

test('free.ai: kein Guthaben/Limit gilt als erschöpft', () => {
  assert.equal(erschoepft(402, {}), true);
  assert.equal(erschoepft(400, { error: 'Insufficient tokens' }), true);
  assert.equal(erschoepft(500, { error: 'boom' }), false);
});

test('free.ai nur mit Schlüssel und nur für die Hook-Szene zuerst', () => {
  assert.equal(modelleFuer(0, new Set(), { freeai: true, zhipu: false })[0], 'freeai');
  assert.ok(!modelleFuer(1, new Set(), { freeai: true, zhipu: false }).includes('freeai'));
  assert.ok(!modelleFuer(0, new Set(), { freeai: false, zhipu: false }).includes('freeai'));
});
