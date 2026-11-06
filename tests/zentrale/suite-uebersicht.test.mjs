import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appsAusBuild, appInfo, workflowName, workflowStatus, zaehlen } from '../../automations/lib/suiteUebersicht.mjs';

test('Apps kommen aus dem Pages-Build, Titel und Beschreibung aus dem Kopf der Seite', () => {
  const apps = appsAusBuild(readFileSync('.github/workflows/jarvis-pages.yml', 'utf8'));
  assert.ok(apps.includes('jarvis') && apps.includes('uebersicht') && !apps.includes('trading-bot-worker'));
  assert.deepEqual(appInfo('x', '<title>A &amp; B</title><meta name="description" content="Kurz.">'), { ordner: 'x', titel: 'A & B', text: 'Kurz.' });
  assert.equal(appInfo('leer', '').titel, 'leer');
  assert.equal(workflowName('a.yml', 'name: "96 · Welt-Bot"\non: push'), '96 · Welt-Bot');
  assert.equal(workflowName('b.yml', 'on: push'), 'b');
});

test('Ampel: rot = letzter Lauf gescheitert, gelb = Ausrutscher, abgebrochene zählen nicht, rot steht oben', () => {
  const wf = [{ datei: 'a.yml', name: 'A' }, { datei: 'b.yml', name: 'B' }, { datei: 'c.yml', name: 'C' }, { datei: 'd.yml', name: 'D' }];
  const l = (datei, conclusion, t) => ({ path: `.github/workflows/${datei}`, conclusion, created_at: `2026-11-0${t}T10:00:00Z`, html_url: 'https://github.com/x' });
  const s = workflowStatus(wf, [l('a.yml', 'failure', 6), l('a.yml', 'failure', 5), l('a.yml', 'success', 4), l('b.yml', 'failure', 6), l('b.yml', 'success', 5),
    l('c.yml', 'cancelled', 6), l('c.yml', 'success', 5)]);
  assert.deepEqual(s.map((w) => `${w.name}:${w.status}`), ['A:rot', 'B:gelb', 'C:gruen', 'D:ruhig']);
  assert.equal(s[0].rotSeit, '2026-11-04T10:00:00Z');
  assert.deepEqual(zaehlen(s), { gruen: 1, gelb: 1, rot: 1, ruhig: 1 });
});
