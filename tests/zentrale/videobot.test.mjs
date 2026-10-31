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

test('Autopilot: jedes Konto eigene Geschichten, keine Teil-2-Versprechen', async () => {
  const { autopilotListe, slug } = await import('../../automations/schatten/videobot.mjs');
  const listen = [0, 1, 2].map((i) => autopilotListe(SK.skripte, i));
  const alle = listen.flat().map((x) => x.slug);
  assert.equal(new Set(alle).size, SK.skripte.length, 'keine Geschichte doppelt');
  for (const l of listen) {
    assert.ok(l.length >= 6);
    for (const { skript } of l) {
      const ende = baueFolge(skript).szenen.at(-1);
      assert.equal(ende.cta, skript.wahl ? 'KOMMENTIER 1 ODER 2' : 'FOLG MIR FÜR MEHR');
      assert.ok(!/TEIL/.test(ende.text), ende.text);
      if (skript.wahl) assert.ok(ende.wahl.length === 2 && ende.sprich.includes('Zahl'), ende.sprich);
    }
  }
  assert.equal(slug('Zwei Zahnbürsten'), 'zwei-zahnbuersten');
  assert.ok(pruefen({ hook: 'x', saetze: ['a', 'b', 'c'], ende: 'e', wahl: ['nur eins'] }).some((f) => f.includes('wahl')));
  assert.ok(pruefen({ hook: 'x', saetze: ['a', 'b', 'c'], ende: 'e', wahl: ['viel zu lange Antwort hier', 'b'] }).some((f) => f.includes('wahl')));
});
