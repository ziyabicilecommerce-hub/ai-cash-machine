// Anime-Edits (#104): Schnittplan auf den Beat, Prompts mit eigener Figur, Rendern ohne Netz.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schnittPlan, dropZeit, editPrompts, hookText, editRendern, TAKT } from '../../automations/lib/animeEdit.mjs';
import { postText } from '../../automations/lib/bufferPoster.mjs';

test('schnittPlan: Intro bis zum Drop, dann Schnitte im halben Takt, Endkarte, ~12 s', () => {
  const p = schnittPlan(12);
  const dauer = p.reduce((a, s) => a + s.dauer, 0);
  assert.ok(dauer > 11 && dauer <= 12.01, String(dauer));
  assert.ok(Math.abs(dropZeit(p) - TAKT * 3) < 1e-9);
  assert.ok(p.filter((s) => s.drop).every((s) => Math.abs(s.dauer - TAKT / 2) < 1e-9));
  assert.equal(p.at(-1).ende, true);
});

test('editPrompts und Hook: eigene Figur, Anime-Stil, keine fremden Serien', () => {
  const figur = { name: 'Ren Kurogane', geschlecht: 'm', aussehen: 'short dark hair with a silver streak' };
  const p = editPrompts(figur, 8, 3);
  assert.equal(p.length, 8);
  assert.equal(new Set(p).size, 8);
  assert.ok(p.every((x) => x.includes('silver streak') && /anime/.test(x) && /no text/.test(x)));
  assert.ok(!p.join(' ').match(/naruto|sasuke|goku|luffy/i));
  assert.match(hookText('Ren Kurogane', 0), /Ren/);
});

test('editRendern: baut ein Hochformat-Video mit Ton in Plan-Länge', () => {
  // Relativer Arbeitsordner wie im Runner (out/edit-0) - dort scheiterte der erste echte Lauf.
  const d = join('out', `test-edit-${process.pid}`);
  mkdirSync(d, { recursive: true });
  const bilder = ['red', 'blue', 'green'].map((farbe, i) => {
    const b = join(d, `b${i}.jpg`);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${farbe}:s=270x480`, '-frames:v', '1', b]);
    return b;
  });
  const plan = [{ dauer: 0.6, drop: false }, { dauer: 0.43, drop: true }, { dauer: 0.43, drop: true }, { dauer: 0.5, drop: false, ende: true }];
  const ziel = join(d, 'edit.mp4');
  const dauer = editRendern(bilder, plan, ziel, { ordner: d, hook: 'POV: Ren wird ernst', ende: 'Folge für Teil 2', konto: '@futureflowxx', breite: 270, hoehe: 480 });
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', ziel]).toString());
  assert.ok(info.streams.some((s) => s.codec_type === 'audio'));
  assert.equal(info.streams.find((s) => s.codec_type === 'video').height, 480);
  assert.ok(Math.abs(Number(info.format.duration) - dauer) < 0.2);
  rmSync(d, { recursive: true, force: true });
});

test('postText: Anime-Videos bekommen Anime-Hashtags statt Wissens-Hashtags', () => {
  const t = postText({ caption: 'POV: Ren wird ernst #ninja #edit', festeTags: ['#animeedit', '#anime'] });
  assert.ok(t.includes('#animeedit') && t.includes('#anime'));
  assert.ok(!t.includes('#wusstestdu'));
});

import { umbrechen } from '../../automations/lib/animeEdit.mjs';
import { videoPruefen } from '../../automations/lib/werbeCheck.mjs';

test('Hook-Umbruch und Werbe-Check: lange Hooks brechen um, Titel ohne "#1" geht durch', () => {
  const z = umbrechen('WENN SORA KEINE GNADE MEHR KENNT', 16).split('\n');
  assert.ok(z.length >= 2 && z.every((l) => l.length <= 16), z.join('|'));
  const v = { datei: 'x.mp4', titel: 'Sora - Anime Edit Teil 1', caption: 'Wenn Sora keine Gnade mehr kennt 🔥 Welche Figur ist dein Main? #animeedit #anime' };
  assert.equal(videoPruefen(v).ok, true);
  assert.equal(videoPruefen({ ...v, titel: 'Sora - Anime Edit #1' }).ok, false, 'so wurde der erste Edit blockiert');
});

test('editPrompts: immer dezent bekleidet, keine tiefen Kamerawinkel', () => {
  const p = editPrompts({ name: 'Sora', geschlecht: 'w', aussehen: 'long blonde hair' }, 10);
  assert.ok(p.every((x) => /fully clothed/.test(x) && /modest/.test(x) && !/low angle/.test(x)));
});
