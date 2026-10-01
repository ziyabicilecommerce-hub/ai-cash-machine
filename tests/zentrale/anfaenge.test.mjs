// 3 Anfaenge pro Video: Auswahl nach echten Zahlen, Rotation je Kanal, Ablage der Dateien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { anfaengeEinbauen, anfaengeAblegen, varianteFuer } from '../../automations/lib/anfaenge.mjs';

const skript = () => ({ hook: 'Labor-Hook', szenen: ['Ohne Band ist der Klimmzug schwer.', 'Das PowerBand hilft.', 'Link in der Bio.'].map((text) => ({ text })) });
const ki = [
  { typ: 'frage', satz: 'Warum schaffst du keinen Klimmzug?', hook: 'Kein Klimmzug?' },
  { typ: 'warnung', satz: 'Hör auf, so Klimmzüge zu üben.', hook: 'Stopp!' },
  { typ: 'widerspruch', satz: 'Mehr Kraft brauchst du gar nicht.', hook: 'Kraft ist egal' },
  { typ: 'quatsch', satz: 'wird ignoriert, falscher Typ' },
];

test('ohne echte Zahlen bleibt der Labor-Hook vorne, zwei Typen laufen als Varianten', () => {
  const s = anfaengeEinbauen(skript(), ki, { lernstand: { hookTyp: {} } });
  assert.equal(s.hook, 'Labor-Hook');
  assert.equal(s.szenen[0].text, 'Ohne Band ist der Klimmzug schwer.');
  assert.equal(s.hookTyp, 'original');
  assert.equal(s.anfaenge.length, 2);
  assert.ok(s.anfaenge.every((a) => ['frage', 'warnung', 'widerspruch'].includes(a.typ)));
});

test('mit echten Zahlen wird der staerkste Typ das Hauptvideo', () => {
  const lernstand = { hookTyp: { frage: { n: 20, punkte: -0.3 }, warnung: { n: 20, punkte: 0.6 }, widerspruch: { n: 20, punkte: 0.1 } } };
  const s = anfaengeEinbauen(skript(), ki, { lernstand });
  assert.equal(s.hookTyp, 'warnung');
  assert.equal(s.szenen[0].text, 'Hör auf, so Klimmzüge zu üben.');
  assert.equal(JSON.stringify(s.anfaenge.map((a) => a.typ)), '["frage","widerspruch"]');
  assert.equal(anfaengeEinbauen(skript(), [ki[0]], { lernstand }).anfaenge, undefined, 'unter 2 Anfaengen keine Varianten');
});

test('varianteFuer verteilt die Anfaenge reihum auf Kanaele und Tage', () => {
  const m = { datei: 'v.mp4', hookTyp: 'original', varianten: [{ datei: 'v-frage.mp4', hookTyp: 'frage' }, { datei: 'v-warnung.mp4', hookTyp: 'warnung' }] };
  assert.equal(JSON.stringify([0, 1, 2].map((k) => varianteFuer(m, k, 0).datei)), '["v.mp4","v-frage.mp4","v-warnung.mp4"]');
  assert.equal(varianteFuer(m, 0, 1).datei, 'v-frage.mp4', 'ein Kanal sieht am naechsten Tag den naechsten Anfang');
  assert.equal(varianteFuer({ datei: 'x.mp4' }, 5, 3).datei, 'x.mp4', 'ohne Varianten immer das Hauptvideo');
});

test('anfaengeAblegen kopiert nur vorhandene Varianten neben das Hauptvideo', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anf-'));
  writeFileSync(join(dir, 'a.mp4'), 'x');
  const r = anfaengeAblegen({ varianten: [{ pfad: join(dir, 'a.mp4'), typ: 'frage', hook: 'H' }, { pfad: join(dir, 'fehlt.mp4'), typ: 'warnung' }] }, '2026-10-02-1-band', dir);
  assert.equal(JSON.stringify(r), '{"varianten":[{"datei":"2026-10-02-1-band-frage.mp4","hookTyp":"frage","hook":"H"}]}');
  assert.ok(existsSync(join(dir, '2026-10-02-1-band-frage.mp4')));
  assert.equal(JSON.stringify(anfaengeAblegen({}, 'b', dir)), '{}');
});
