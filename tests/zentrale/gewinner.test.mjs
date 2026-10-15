// Gewinner-Fortsetzung: ein Video, das deutlich besser läuft als der Schnitt, bekommt auf demselben Konto "Teil 2".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gewinnerFinden, fortsetzungFuer, FOLGEN } from '../../automations/lib/gewinner.mjs';
import { BANK } from '../../automations/lib/faktenBank.mjs';

const jetzt = Date.parse('2026-10-18T12:00:00Z');
const post = (konto, text, aufrufe, tageAlt = 1) => ({ konto, text, aufrufe, zeit: new Date(jetzt - tageAlt * 864e5).toISOString() });
const normal = (konto) => [post(konto, 'a', 300, 2), post(konto, 'b', 250, 3), post(konto, 'c', 280, 2)];

test('Gewinner: deutlich über dem Konto-Schnitt, frisch, nicht auf fremdem Konto', () => {
  const posts = [...normal('@zyx_7851'), post('@zyx_7851', '🚀 Echte NASA-Aufnahmen! Was passiert, wenn der Mond plötzlich verschwindet? 🤯', 2400)];
  assert.equal(gewinnerFinden(posts, '@zyx_7851', { jetzt }).length, 1);
  assert.equal(gewinnerFinden(posts, '@futureflowx3', { jetzt }).length, 0);
  assert.equal(gewinnerFinden([...normal('@zyx_7851'), post('@zyx_7851', 'x', 2400, 9)], '@zyx_7851', { jetzt }).length, 0, 'zu alt');
});

test('Fortsetzung: Folge-Szenario, nur einmal, nicht wenn schon benutzt', () => {
  const posts = [...normal('@zyx_7851'), post('@zyx_7851', '🚀 Echte NASA-Aufnahmen! Was passiert, wenn der Mond plötzlich verschwindet? 🤯 Welches Szenario', 2400)];
  const f = fortsetzungFuer('@zyx_7851', posts, BANK, { jetzt });
  assert.equal(f.vorbild.titel, 'Wenn der Mond verschwindet');
  assert.equal(f.eintrag.titel, 'Wenn die Sonne verschwindet');
  assert.equal(fortsetzungFuer('@zyx_7851', posts, BANK, { jetzt, fortgesetzt: [f.vorbild.id] }), null, 'nur einmal');
  assert.equal(fortsetzungFuer('@zyx_7851', posts, BANK, { jetzt, verwendet: [f.eintrag.id] }), null, 'Teil 2 schon gelaufen');
  assert.equal(fortsetzungFuer('@zyx_7851', posts, BANK, { jetzt, erlaubt: () => false }), null);
});

test('Alle Folge-Titel existieren in der Liste', () => {
  const titel = new Set(BANK.map((e) => e.titel));
  for (const [a, b] of Object.entries(FOLGEN)) { assert.ok(titel.has(a), a); assert.ok(titel.has(b), b); }
});
