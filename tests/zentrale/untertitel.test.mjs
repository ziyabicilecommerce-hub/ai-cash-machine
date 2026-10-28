import { test } from 'node:test';
import assert from 'node:assert/strict';
import { srtCues, schluessel, dialogZeile, assGross } from '../../automations/lib/untertitel.mjs';

const SRT = `1
00:00:00,000 --> 00:00:01,600
Du bist allein am Bahnsteig.

2
00:00:01,600 --> 00:00:03,200
Steig nicht aus!`;

test('Große Untertitel: SRT lesen, Schlüsselwort, Gelb-Tag, ASS-Aufbau', () => {
  const cues = srtCues(SRT);
  assert.equal(cues.length, 2);
  assert.ok(Math.abs(cues[0].start - 0) < 0.01 && Math.abs(cues[0].ende - 1.6) < 0.01);
  assert.equal(schluessel('DU BIST ALLEIN AM BAHNSTEIG.'.split(' ')), 'BAHNSTEIG.');
  assert.equal(schluessel(['DER', 'UND', 'MIT']), '', 'nur Stoppwörter -> keins');
  const z = dialogZeile(cues[0]);
  assert.match(z, /^Dialogue: 0,0:00:00\.00,0:00:01\.60,Gross/);
  assert.match(z, /\{\\c&H0022FFFF&\}BAHNSTEIG\.\{\\c&H00FFFFFF&\}/);
  const sichtbar = z.split(',,')[1].replace(/\{[^}]*}/g, '');
  assert.equal(sichtbar, sichtbar.toUpperCase(), 'sichtbarer Text in Großbuchstaben');
  const ass = assGross(SRT, { breite: 1080, hoehe: 1920 });
  assert.match(ass, /PlayResX: 1080/);
  assert.match(ass, /Style: Gross,DejaVu Sans,96,/);
  assert.equal((ass.match(/^Dialogue:/gm) || []).length, 2);
});
