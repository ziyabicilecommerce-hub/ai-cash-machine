// Echte Video-Clips (Pexels) für den Fakten-Kanal: Suchbegriff, Clip-Auswahl, Zuschnitt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { suchbegriff, clipAuswaehlen, clipAnpassen, stockHolen } from '../../automations/lib/stockVideo.mjs';

test('suchbegriff: nur das Motiv, ohne Stil-Wörter, max. 5 Wörter', () => {
  assert.equal(suchbegriff('planet Venus with thick glowing clouds in space, cinematic, photorealistic, dramatic light, no text, no people'), 'planet Venus with thick clouds');
  assert.equal(suchbegriff('golden honey dripping from a wooden dipper, close-up detail, cinematic, no text, no people'), 'golden honey dripping from a');
  assert.equal(suchbegriff(''), '');
});

test('clipAuswaehlen: Hochformat, mind. 1280 hoch, mind. 4 s, nahe 1920, nichts doppelt', () => {
  const antwort = { videos: [
    { id: 1, duration: 10, video_files: [{ link: 'https://x/1.mp4', file_type: 'video/mp4', width: 1920, height: 1080 }] },
    { id: 2, duration: 2, video_files: [{ link: 'https://x/2.mp4', file_type: 'video/mp4', width: 1080, height: 1920 }] },
    { id: 3, duration: 12, video_files: [
      { link: 'https://x/3a.mp4', file_type: 'video/mp4', width: 2160, height: 3840 },
      { link: 'https://x/3b.mp4', file_type: 'video/mp4', width: 1080, height: 1920 },
      { link: 'http://x/3c.mp4', file_type: 'video/mp4', width: 1080, height: 1920 }] },
  ] };
  assert.deepEqual(clipAuswaehlen(antwort), { id: 3, link: 'https://x/3b.mp4', dauer: 12 });
  assert.equal(clipAuswaehlen(antwort, new Set([3])), null);
  assert.equal(clipAuswaehlen({}), null);
});

test('stockHolen: ohne Schlüssel kein Netz, leeres Ergebnis', async () => {
  assert.equal(await stockHolen('planet venus', '/tmp/x.mp4', { schluessel: '' }), '');
});

test('clipAnpassen: kurzer Querformat-Clip wird Hochformat in Szenenlänge', () => {
  const d = mkdtempSync(join(tmpdir(), 'stock-'));
  const quelle = join(d, 'q.mp4');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=1', '-pix_fmt', 'yuv420p', quelle]);
  const ziel = clipAnpassen(quelle, join(d, 'z.mp4'), 2.5, { breite: 540, hoehe: 960 });
  assert.ok(ziel);
  const info = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', ziel]).toString();
  const j = JSON.parse(info);
  assert.equal(j.streams[0].width, 540);
  assert.equal(j.streams[0].height, 960);
  assert.ok(Math.abs(Number(j.format.duration) - 2.5) < 0.15);
});
