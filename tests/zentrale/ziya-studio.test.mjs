import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, PRESET_STANDARD, presetVon, shotsPlanen, modellReihe, nachbearbeitung, kamerafahrt, ueberblendung } from '../../automations/lib/ziyaStudio.mjs';

test('Ziya Studio: Presets und Rückfall auf Standard', () => {
  assert.ok(Object.keys(PRESETS).length >= 10);
  assert.equal(presetVon('CRASH-ZOOM'), 'crash-zoom');
  assert.equal(presetVon('gibtsnicht'), PRESET_STANDARD);
  assert.equal(presetVon(''), PRESET_STANDARD);
});

test('Ziya Studio: Shot-Planung', () => {
  const s = shotsPlanen('a black hole swallowing a star', 'grusel', 3);
  assert.equal(s.length, 3);
  assert.deepEqual(s.map((x) => x.nr), [1, 2, 3]);
  assert.equal(s[0].preset, 'grusel');
  assert.ok(s.every((x) => x.bild.includes('black hole') && x.bewegung.includes(PRESETS[x.preset].kamera)));
  assert.equal(new Set(s.map((x) => x.bild)).size, 3, 'verschiedene Einstellungen');
  assert.equal(shotsPlanen('x y z', 'orbit', 1)[0].preset, 'orbit');
  assert.equal(shotsPlanen('idee', 'fpv', 99).length, 5);
  assert.equal(shotsPlanen('idee\nmit Umbruch', 'fpv', 0).length, 3);
  assert.ok(!shotsPlanen('idee\nmit Umbruch')[0].bild.includes('\n'));
  assert.throws(() => shotsPlanen('  '), /Keine Idee/);
});

test('Ziya Studio: Modell-Router überspringt erschöpfte Modelle', () => {
  assert.deepEqual(modellReihe(), ['wan', 'ltx']);
  assert.deepEqual(modellReihe(new Set(['wan']), { zhipu: true }), ['ltx', 'zhipu']);
  assert.deepEqual(modellReihe(new Set(['wan', 'ltx'])), []);
});

test('Ziya Studio: Filterketten', () => {
  const roh = nachbearbeitung('grusel');
  assert.match(roh, /^minterpolate=fps=30/);
  assert.match(roh, /scale=1080:1920.*lanczos/);
  assert.match(roh, /saturation=0\.7/);
  assert.ok(!nachbearbeitung('orbit', { roh: false }).includes('minterpolate'));
  assert.match(kamerafahrt('crash-zoom', { sekunden: 4 }), /zoompan=.*d=120:s=1080x1920:fps=30/);
  assert.match(kamerafahrt('orbit'), /x='\(iw-iw\/zoom\)/);
});

test('Ziya Studio: Überblendung', () => {
  assert.deepEqual(ueberblendung([3]), { filter: '[0:v]null[v]', laenge: 3 });
  const u = ueberblendung([3, 3, 3], { blende: 0.5 });
  assert.equal(u.laenge, 8);
  assert.match(u.filter, /\[0:v\]\[1:v\]xfade=transition=fade:duration=0\.5:offset=2\.500\[x1\]/);
  assert.match(u.filter, /\[x1\]\[2:v\]xfade=.*offset=5\.000\[v\]$/);
});
