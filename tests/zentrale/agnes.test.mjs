import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findeUrl, clipAuftrag, agnesClips, agnesBild, agnesBereit } from '../../automations/lib/agnes.mjs';

const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json' } });

test('Agnes: Ergebnis-Link finden (Video in remixed_from_video_id, Bild in data[0].url)', () => {
  assert.equal(findeUrl({ status: 'completed', remixed_from_video_id: 'https://storage.googleapis.com/a/v.mp4' }), 'https://storage.googleapis.com/a/v.mp4');
  assert.equal(findeUrl({ data: [{ url: 'https://x/b.png' }] }), 'https://x/b.png');
  assert.equal(findeUrl({ status: 'queued', remixed_from_video_id: null }), '');
});

test('Agnes: Clip-Auftrag hochkant, 5 Sekunden, Startbild als Link', () => {
  const a = clipAuftrag('slow push-in', 'https://x/s1.jpg');
  assert.equal(a.model, 'agnes-video-v2.0');
  assert.equal(a.width, 720);
  assert.equal(a.height, 1280);
  assert.equal(a.num_frames / a.frame_rate > 5, true);
  assert.equal(a.image, 'https://x/s1.jpg');
  assert.ok(!('image' in clipAuftrag('nur Text')));
  assert.ok(agnesBereit({ AGNES_API_KEY: 'k' }) && !agnesBereit({}));
});

test('Agnes: Clips anlegen (Minuten-Limit 429 -> warten), abfragen, laden', async () => {
  process.env.AGNES_API_KEY = 'test';
  const dir = mkdtempSync(join(tmpdir(), 'agnes-'));
  const posts = [];
  let limit = true;
  const laden = async (url, opt = {}) => {
    if (opt.method === 'POST') {
      if (limit) { limit = false; return json({ error: 'rate limit' }, 429); }
      posts.push(JSON.parse(opt.body));
      return json({ video_id: `v${posts.length}`, status: 'queued' });
    }
    if (url.includes('/agnesapi?video_id=v1')) return json({ status: 'completed', size: '720x1280', seconds: '5.0', remixed_from_video_id: 'https://cdn/v1.mp4' });
    if (url.includes('/agnesapi?video_id=v2')) return json({ status: 'failed', error: { message: 'nope' } });
    if (url === 'https://cdn/v1.mp4') return new Response(Buffer.from('MP4'));
    return json({}, 404);
  };
  const log = [];
  const fertig = await agnesClips([
    { nr: 1, prompt: 'p1', bild: 'https://x/1.jpg', ziel: join(dir, 's1.mp4') },
    { nr: 2, prompt: 'p2', bild: 'https://x/2.jpg', ziel: join(dir, 's2.mp4') },
  ], { laden, takt: 0, warten: 0, log: (z) => log.push(z) });
  assert.equal(posts.length, 2);
  assert.deepEqual([...fertig.keys()], [1]);
  assert.equal(readFileSync(join(dir, 's1.mp4'), 'utf8'), 'MP4');
  assert.ok(log.some((z) => z.includes('Szene 2: fehlgeschlagen')));
});

test('Agnes: Szenenbild mit Figurenblatt - extra_body, bei 400 zweite Schreibweise', async () => {
  process.env.AGNES_API_KEY = 'test';
  const dir = mkdtempSync(join(tmpdir(), 'agnes-'));
  const blatt = join(dir, 'blatt.jpg');
  writeFileSync(blatt, 'JPG');
  const bodies = [];
  const laden = async (url, opt = {}) => {
    if (opt.method === 'POST') {
      const b = JSON.parse(opt.body);
      bodies.push(b);
      return b.extra_body ? json({ error: 'bad' }, 400) : json({ data: [{ url: 'https://cdn/b.png' }] });
    }
    return new Response(Buffer.from('PNG'));
  };
  const r = await agnesBild('{MAMA} smiles', [blatt], join(dir, 's1.jpg'), { laden });
  assert.equal(r.url, 'https://cdn/b.png');
  assert.equal(bodies[0].extra_body.image[0].startsWith('data:image/jpeg;base64,'), true);
  assert.equal(bodies[1].image.length, 1);
  assert.equal(bodies[0].size, '720x1280');
  assert.equal(readFileSync(join(dir, 's1.jpg'), 'utf8'), 'PNG');
});
