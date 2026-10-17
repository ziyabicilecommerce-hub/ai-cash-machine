import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, PRESET_STANDARD, presetVon, shotsPlanen, modellReihe, nachbearbeitung, kamerafahrt, ueberblendung, tonFormel } from '../../automations/lib/ziyaStudio.mjs';

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
  assert.ok(s.every((x) => x.bild.includes('black hole') && x.bewegung.startsWith(PRESETS[x.preset].kamera)));
  // Bewegungs-Prompt: genau ein Kamerabefehl, Licht und Tempo des Presets.
  assert.ok(s.every((x) => x.bewegung.includes(PRESETS[x.preset].tempo) && x.bewegung.includes(PRESETS[x.preset].licht)));
  assert.ok(s.every((x) => Object.values(PRESETS).filter((p) => x.bewegung.includes(p.kamera)).length === 1));
  assert.match(s[0].bild, /24mm lens/);
  assert.equal(new Set(s.map((x) => x.bild)).size, 3, 'verschiedene Einstellungen');
  assert.equal(shotsPlanen('x y z', 'orbit', 1)[0].preset, 'orbit');
  assert.equal(shotsPlanen('idee', 'fpv', 99).length, 5);
  assert.equal(shotsPlanen('idee\nmit Umbruch', 'fpv', 0).length, 3);
  assert.ok(!shotsPlanen('idee\nmit Umbruch')[0].bild.includes('\n'));
  assert.throws(() => shotsPlanen('  '), /Keine Idee/);
});

test('Ziya Studio: Modell-Router überspringt erschöpfte Modelle', () => {
  assert.deepEqual(modellReihe(), ['wan14', 'ltx23', 'wan', 'real', 'ltx']);
  assert.deepEqual(modellReihe(new Set(['wan14', 'ltx23', 'wan']), { zhipu: true }), ['real', 'ltx', 'zhipu']);
  assert.deepEqual(modellReihe(new Set(['wan14', 'ltx23', 'wan', 'real', 'ltx'])), []);
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

test('Ziya Studio: Tonspur mit Boom und Whoosh an den Schnitten', () => {
  const t = tonFormel([3.5, 3.5, 3.5], 'grusel', { blende: 0.4 });
  assert.match(t, /46\.2/, 'Grusel-Drone');
  assert.equal((t.match(/between\(t,/g) || []).length, 2, 'zwei Schnitte');
  assert.match(t, /between\(t,2\.60,3\.50\)/);
  assert.match(t, /between\(t,5\.70,6\.60\)/);
  assert.ok(!/random\([1-9]/.test(t), 'random nur mit gültigem Index');
  assert.ok(!tonFormel([4], 'fpv').includes('between'), 'ein Shot = kein Whoosh');
  assert.ok(Object.values(PRESETS).every((p) => p.tempo && p.licht && p.umgebung && p.ton));
});
