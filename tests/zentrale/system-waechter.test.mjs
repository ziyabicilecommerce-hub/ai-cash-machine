// System-Waechter: nur main, Abstuerze und haengende Agenten, einmalige Selbstheilung, keine Fehlalarme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auswerten, neuStarten, schluessel } from '../../automations/lib/systemWaechter.mjs';

const jetzt = Date.parse('2026-10-02T12:00:00Z');
const lauf = (name, stundenAlt, conclusion, x = {}) => ({ id: Math.random(), name, head_branch: 'main', status: 'completed', conclusion, run_attempt: 1, html_url: `https://x/${name}`, created_at: new Date(jetzt - stundenAlt * 36e5).toISOString(), ...x });

test('erkennt Absturz, haengenden Agenten und ignoriert Arbeits-Branches', () => {
  const l = [
    lauf('Werbe-Labor', 2, 'failure'), lauf('Werbe-Labor', 26, 'success'),
    lauf('99 · Direkt-Poster', 20, 'success'),
    lauf('Deploy to Production', 1, 'failure', { head_branch: 'claude/x' }),
    lauf('Shop-Doktor + Produkt-Feeds', 3, 'success'),
  ];
  const r = auswerten(l, { jetzt, letzte: { '94 · Video-Fabrik': new Date(jetzt - 50 * 36e5).toISOString() } });
  const p = r.probleme.map((x) => `${x.art}:${x.name}`).sort();
  assert.equal(JSON.stringify(p), JSON.stringify(['absturz:Werbe-Labor', 'haengt:94 · Video-Fabrik', 'haengt:99 · Direkt-Poster']));
  assert.ok(!r.workflows.some((w) => w.name === 'Deploy to Production'));
  assert.ok(!r.probleme.some((x) => x.name === 'Kommentar-Agent'), 'neuer Agent ohne Lauf ist kein Problem');
});

test('Selbstheilung nur fuer wichtige Agenten, nur erster Versuch, nur frisch', () => {
  const r = auswerten([
    lauf('Werbe-Labor', 2, 'failure'), lauf('94 · Video-Fabrik', 2, 'failure', { run_attempt: 2 }),
    lauf('08 · Trend-Scout', 2, 'failure'), lauf('Shop-Doktor + Produkt-Feeds', 20, 'failure'),
  ], { jetzt });
  assert.equal(JSON.stringify(neuStarten(r.workflows, { jetzt }).map((w) => w.name)), '["Werbe-Labor"]');
  assert.equal(schluessel({ art: 'absturz', name: 'A' }), 'absturz|A');
});

test('verpasste Zeitplaene wichtiger Agenten werden nachgeholt, andere nicht', async () => {
  const { nachholen } = await import('../../automations/lib/systemWaechter.mjs');
  const r = nachholen([{ art: 'haengt', name: 'Werbe-Labor' }, { art: 'haengt', name: 'Werbe-Labor' }, { art: 'absturz', name: 'Shop-Doktor + Produkt-Feeds' }, { art: 'haengt', name: 'Irgendwas' }]);
  assert.deepEqual(r, [{ name: 'Werbe-Labor', datei: 'werbe-labor.yml' }]);
});
