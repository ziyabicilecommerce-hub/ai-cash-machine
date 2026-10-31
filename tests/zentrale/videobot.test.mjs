import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baueFolge, pruefen, skriptAus, KONTEN } from '../../automations/schatten/videobot.mjs';

const SK = JSON.parse(readFileSync(new URL('../../automations-dashboard/tiktok/skripte.json', import.meta.url), 'utf8'));

test('alle fertigen Skripte aus der App ergeben eine gültige Folge', () => {
  assert.ok(SK.skripte.length >= 6);
  for (const s of SK.skripte) {
    assert.deepEqual(pruefen(s), [], s.titel);
    const f = baueFolge(s);
    assert.equal(f.szenen[0].art, 'blitz');
    assert.ok(!/^TEIL/.test(f.szenen[0].text), 'Hook ohne "Teil"');
    assert.deepEqual(f.szenen.slice(-3).map((x) => x.art), ['fratze', 'ende', 'teil2']);
    assert.ok(f.szenen.some((x) => x.art === 'dunkel'));
    if (s.nachricht) assert.equal(f.szenen.find((x) => x.art === 'nachricht').nachricht, s.nachricht);
    assert.ok(f.szenen.slice(1).every((x) => !x.text || x.text.length <= 44), 'Bildschirmtext kurz');
    assert.ok(!f.szenen[0].text.endsWith('…'), `Hook ganz: ${f.szenen[0].text}`);
  }
});

test('Videobot lehnt kaputte oder gefährliche Skripte ab', () => {
  assert.ok(pruefen({ hook: 'x', saetze: ['a'], ende: 'e' }).some((f) => f.includes('mindestens 3')));
  assert.ok(pruefen({ hook: 'x', saetze: ['a', 'b', 'c'], ende: 'e', ort: 'mond' }).some((f) => f.includes('ort')));
  assert.ok(pruefen({ hook: 'x', saetze: ['a', 'b', 'c'], ende: 'e', posten: 'fremd' }).some((f) => f.includes('posten')));
  assert.throws(() => baueFolge({}));
  const f = baueFolge({ hook: 'Hallo `$(echo boese)` <script>', saetze: ['a', 'b', 'c'], ende: 'e' });
  assert.ok(!/[`$<>]/.test(JSON.stringify(f.szenen[0])));
  assert.deepEqual(skriptAus('Text\n```json\n{"hook":"h"}\n```'), { hook: 'h' });
  assert.throws(() => skriptAus('kein block'));
  assert.equal(Object.keys(KONTEN).length, 3);
});
