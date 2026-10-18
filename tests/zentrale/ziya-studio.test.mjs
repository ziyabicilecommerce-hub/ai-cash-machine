import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, PRESET_STANDARD, presetVon, shotsPlanen, modellReihe, poolModelle, nachbearbeitung, kamerafahrt, ueberblendung, tonFormel, schnittArt } from '../../automations/lib/ziyaStudio.mjs';

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
  assert.deepEqual(modellReihe(), ['turbo', 'wan14', 'ltx23', 'ltx25', 'wan', 'real', 'ltx']);
  assert.deepEqual(modellReihe(new Set(['turbo', 'wan14', 'ltx23', 'ltx25', 'wan']), { zhipu: true }), ['real', 'ltx', 'zhipu']);
  assert.deepEqual(modellReihe(new Set(['turbo', 'wan14', 'ltx23', 'ltx25', 'wan', 'real', 'ltx'])), []);
  assert.deepEqual(modellReihe(new Set(), { seedance: true })[0], 'seedance', 'Seedance zuerst, wenn Schlüssel da');
  assert.deepEqual(modellReihe(new Set(['seedance']), { seedance: true })[0], 'turbo', 'Kontingent leer -> Gratis-Modelle');
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

import { seedanceAuftrag, SEEDANCE_STANDARD } from '../../automations/lib/seedance.mjs';
test('Seedance: Auftrag für BytePlus ModelArk', () => {
  const a = seedanceAuftrag('QUJD', 'slow dolly push in.\n a star', { sekunden: 4 });
  assert.equal(a.model, SEEDANCE_STANDARD);
  assert.equal(a.content[0].type, 'text');
  assert.match(a.content[0].text, /^slow dolly push in\. a star --ratio adaptive --duration 4 --resolution 720p --watermark false$/);
  assert.deepEqual(a.content[1], { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QUJD' } });
  assert.match(seedanceAuftrag('x', 'p', { sekunden: 99 }).content[0].text, /--duration 10 /);
  assert.equal(seedanceAuftrag('x', 'p', { modell: 'seedance-2-0' }).model, 'seedance-2-0');
});

test('Ziya Studio: Anime-Kampf-Modus', () => {
  const s = shotsPlanen('a swordsman with a water blade fights a demon with fire fists', 'anime-kampf', 4);
  assert.ok(s.every((x) => x.preset === 'anime-kampf' && /anime key visual/.test(x.bild) && !/photorealistic/.test(x.bild)));
  assert.equal(new Set(s.map((x) => x.bild)).size, 4, 'vier verschiedene Anime-Einstellungen');
  assert.deepEqual(modellReihe(new Set(), { anime: true }).slice(0, 3), ['animegen', 'anisora', 'k6']);
  assert.ok(!modellReihe().includes('anisora'), 'Anime-Modelle nur im Anime-Modus');
  const n = nachbearbeitung('anime-kampf');
  assert.match(n, /saturation=1\.35/);
  assert.match(n, /blend=all_mode=screen/);
  assert.match(n, /if\(lt\(t,0\.4\)/, 'Impact-Wackler');
  assert.ok(!nachbearbeitung('dolly-in').includes('lt(t,0.4)'), 'kein Wackler außerhalb von Anime');
  assert.deepEqual(schnittArt('anime-kampf'), { uebergang: 'fadewhite', blende: 0.2 });
  assert.match(ueberblendung([3, 3], schnittArt('anime-kampf')).filter, /fadewhite:duration=0\.2:offset=2\.800/);
  const t = tonFormel([3, 3, 3], 'anime-kampf', schnittArt('anime-kampf'));
  assert.equal((t.match(/3150/g) || []).length, 2, 'Schwertklang an beiden Schnitten');
  assert.ok(!tonFormel([3, 3], 'dolly-in').includes('3150'));
});

test('Ziya Studio: Space-Pool als Rückfall', () => {
  const pool = { spaces: [
    { space: 'a/wan-x', typ: 'wan', endpoint: '/generate_video' },
    { space: 'Upsampler/wan-2-2-14b-image-to-video', typ: 'wan', endpoint: '/generate_video' },
    { space: 'b/anime', typ: 'animegen', endpoint: '/generate_video' },
    { space: 'c/ltx', typ: 'ltx25', endpoint: '/run' },
    { space: 'd/boese', typ: 'wan', endpoint: '/x;rm -rf' },
    { space: 'e/unbekannt', typ: 'sonstwas', endpoint: '/run' },
  ] };
  assert.deepEqual(poolModelle(pool), ['pool:a/wan-x:wan:/generate_video', 'pool:b/anime:animegen:/generate_video', 'pool:c/ltx:ltx25:/run']);
  assert.equal(poolModelle(pool, new Set(), { anime: true })[0], 'pool:b/anime:animegen:/generate_video');
  assert.deepEqual(poolModelle(pool, new Set(['pool:a/wan-x:wan:/generate_video']), { max: 1 }), ['pool:b/anime:animegen:/generate_video']);
  assert.deepEqual(poolModelle({}), []);
  assert.deepEqual(poolModelle(null), []);
});
