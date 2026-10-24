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
  assert.equal(shotsPlanen('idee', 'fpv', 99).length, 18, 'bis 60 s');
  assert.ok(s.every((x) => x.bewegung.includes('background is alive')), 'Hintergrund bewegt sich');
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
  const gemischt = { spaces: [{ space: 'z/a', typ: 'wan', endpoint: '/g', gpu: 'zero-a10g' }, { space: 'e/b', typ: 'wan', endpoint: '/g', gpu: 'a10g-small' }] };
  assert.equal(poolModelle(gemischt)[0], 'pool:e/b:wan:/g', 'eigene GPU vor ZeroGPU');
});

import { geschichteZuShots, geschichtePlanen, geschichtePrompt, stilVon, STILE } from '../../automations/lib/ziyaGeschichte.mjs';
test('Ziya Studio: Geschichten-Modus (Kurzfilm mit eigenen Figuren)', async () => {
  assert.match(geschichtePrompt('a fox finds a lost star', 6), /6 scenes[\s\S]*ORIGINAL characters/);
  const d = { figuren: 'a small orange fox with a blue scarf', szenen: [
    { bild: 'fox in a snowy forest at night', bewegung: 'camera follows the fox running', satz: 'Ein kleiner Fuchs sieht einen Stern fallen.' },
    { bild: '', bewegung: 'x', satz: 'leer' },
    { bild: 'fox climbs a glowing mountain', bewegung: 'crane up', satz: 'Er klettert los.' },
  ] };
  const s = geschichteZuShots(d, { idee: 'a fox finds a lost star', preset: 'dolly-in', n: 6, stil: 'cartoon' });
  assert.equal(s.length, 2, 'leere Szenen fliegen raus');
  assert.deepEqual(s.map((x) => x.nr), [1, 2]);
  assert.ok(s.every((x) => x.bild.includes('blue scarf') && x.bild.includes(STILE.cartoon)), 'gleiche Figur, Cartoon-Stil');
  assert.ok(s.every((x) => x.bewegung.includes('background is alive')));
  assert.equal(s[0].satz, 'Ein kleiner Fuchs sieht einen Stern fallen.');
  assert.equal(stilVon('CARTOON'), 'cartoon');
  assert.equal(stilVon('quatsch'), 'kino');
  const ersatz = () => ['ersatz'];
  assert.deepEqual(await geschichtePlanen('x', { preset: 'orbit', n: 6, stil: 'kino', kiJson: async () => { throw new Error('429'); }, ersatz }), ['ersatz']);
  assert.equal((await geschichtePlanen('x', { preset: 'orbit', n: 3, kiJson: async () => ({ szenen: [{ bild: 'a' }, { bild: 'b' }, { bild: 'c' }] }), ersatz })).length, 3);
});

import { auffuellen } from '../../automations/lib/ziyaGeschichte.mjs';
test('Geschichte: zu wenige Szenen werden aufgefüllt, zweiter KI-Versuch', async () => {
  const a = auffuellen([{ nr: 1, bild: 'a', satz: 'x' }, { nr: 2, bild: 'b', satz: 'y' }, { nr: 3, bild: 'c', satz: 'z' }], 6);
  assert.deepEqual(a.map((s) => s.nr), [1, 2, 3, 4, 5, 6]);
  assert.match(a[3].bild, /^a, extreme close-up/);
  assert.equal(a[3].satz, '', 'Erzähler wiederholt sich nicht');
  let aufrufe = 0;
  const kiJson = async () => (++aufrufe === 1 ? { szenen: [{ bild: 'a' }, { bild: 'b' }, { bild: 'c' }] } : { szenen: [1, 2, 3, 4, 5, 6].map((i) => ({ bild: `s${i}` })) });
  const s = await geschichtePlanen('x', { preset: 'grusel', n: 6, kiJson, ersatz: () => [] });
  assert.equal(aufrufe, 3, 'zwei Planungsversuche + Regie-Bot');
  assert.equal(s.length, 6);
  assert.match(s[5].bild, /^s6/);
});

import { KRASS } from '../../automations/lib/ziyaStudio.mjs';
test('Krass-Modus: Impact-Schnitte, Wackler, Bass und Herzschlag bei Grusel', () => {
  assert.deepEqual(schnittArt('dolly-in', { krass: true }), { uebergang: 'fadewhite', blende: 0.2 });
  assert.deepEqual(schnittArt('dolly-in'), { uebergang: 'fade', blende: 0.4 });
  assert.match(nachbearbeitung('dolly-in', { krass: true }), /if\(lt\(t,0\.4\)/);
  const t = tonFormel([3, 3, 3], 'grusel', { blende: 0.2, krass: true });
  assert.equal((t.match(/3150/g) || []).length, 2, 'Treffer an beiden Schnitten');
  assert.match(t, /mod\(t,0\.83\)/, 'Herzschlag');
  assert.ok(!tonFormel([3, 3], 'orbit', { krass: true }).includes('mod(t,0.83)'), 'Herzschlag nur bei Grusel');
  assert.match(KRASS, /high-energy/);
});

import { regiePrompt } from '../../automations/lib/ziyaGeschichte.mjs';
test('Regie-Bot: überarbeitet den Plan, verliert aber keine Szenen', async () => {
  assert.match(regiePrompt({ szenen: [{ bild: 'a' }] }), /hook[\s\S]*German narration[\s\S]*"bild":"a"/);
  const plan = { szenen: [1, 2, 3].map((i) => ({ bild: `b${i}`, satz: `s${i}` })) };
  let n = 0;
  const besser = { szenen: [1, 2, 3].map((i) => ({ bild: `besser${i}`, satz: `Satz ${i}` })) };
  const s = await geschichtePlanen('x', { preset: 'grusel', n: 3, kiJson: async () => (++n === 1 ? plan : besser), ersatz: () => [] });
  assert.match(s[0].bild, /^besser1/);
  n = 0;
  const kaputt = { szenen: [{ bild: 'nur eins', satz: 'x' }] };
  const t = await geschichtePlanen('x', { preset: 'grusel', n: 3, kiJson: async () => (++n === 1 ? plan : kaputt), ersatz: () => [] });
  assert.match(t[0].bild, /^b1/, 'schlechtere Überarbeitung wird verworfen');
});

import { LEBENDIG } from '../../automations/lib/ziyaStudio.mjs';
test('Kamerafahrt lebt: pulsierendes Licht und bewegte Körnung', () => {
  assert.ok(kamerafahrt('grusel').includes(LEBENDIG));
  assert.match(LEBENDIG, /eval=frame/);
  assert.match(LEBENDIG, /noise=alls=\d+:allf=t/);
});

import { hookFilter, hookUmbrechen } from '../../automations/lib/ziyaStudio.mjs';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
test('Hook: großer Text am Anfang, umgebrochen und echt eingeblendet', (t) => {
  assert.equal(hookUmbrechen('WER GEWINNT DIESEN KAMPF?'), 'WER GEWINNT\nDIESEN KAMPF?');
  assert.equal(hookUmbrechen('a b c d e f g h i j k l m n o p q r s t u v w x y z aa bb cc dd ee ff gg', 4).split('\n').length, 3);
  const schrift = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  if (!existsSync(schrift)) return t.skip('keine Schrift');
  const ordner = mkdtempSync(join(tmpdir(), 'hook-'));
  writeFileSync(join(ordner, 'hook.txt'), 'WER GEWINNT?');
  const bild = execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=540x960:d=0.2', '-vf', hookFilter(join(ordner, 'hook.txt'), schrift), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1']);
  assert.ok(bild.some((x) => x > 200), 'weißer Text sichtbar');
});

test('Abspann: "Fortsetzung folgt" erst in den letzten Sekunden', (t) => {
  const schrift = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
  if (!existsSync(schrift)) return t.skip('keine Schrift');
  const ordner = mkdtempSync(join(tmpdir(), 'ende-'));
  writeFileSync(join(ordner, 'ende.txt'), hookUmbrechen('FORTSETZUNG FOLGT...'));
  const filter = hookFilter(join(ordner, 'ende.txt'), schrift, { ab: '5.50' });
  const bild = (s) => execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=540x960:d=8', '-vf', filter, '-ss', String(s), '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1']);
  assert.ok(!bild(3).some((x) => x > 200), 'vorher kein Text');
  assert.ok(bild(7.5).some((x) => x > 200), 'am Ende Text');
});
