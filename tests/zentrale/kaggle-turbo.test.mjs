import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { kernelMeta, skriptBauen, auftragBauen, kaggleBereit, KERNEL_NAME } from '../../automations/lib/kaggleTurbo.mjs';

test('Kaggle-Turbo: Kernel privat, mit GPU und Internet', () => {
  const m = kernelMeta('ziya');
  assert.equal(m.id, `ziya/${KERNEL_NAME}`);
  assert.equal(m.is_private, true);
  assert.equal(m.enable_gpu, true);
  assert.equal(m.enable_internet, true);
  assert.equal(m.code_file, 'turbo.py');
});

test('Kaggle-Turbo: Auftrag (Wan braucht 4n+1 Bilder, Kino = mehr Schritte)', () => {
  const a = auftragBauen([{ nr: 1, bildUrl: 'https://x/1.jpg', bewegung: 'slow push in' }], { sekunden: 3.5, negativ: 'blurry' });
  assert.equal((a.frames - 1) % 4, 0);
  assert.equal(a.frames, 85);
  assert.equal(a.schritte, 40);
  assert.equal(auftragBauen([], { qualitaet: 'schnell' }).schritte, 25);
  assert.equal(auftragBauen([], { sekunden: 99 }).frames, 121);
  assert.deepEqual(a.shots, [{ nr: 1, bild_url: 'https://x/1.jpg', prompt: 'slow push in' }]);
});

test('Kaggle-Turbo: Notebook-Skript ist gültiges Python mit eingesetztem Auftrag', () => {
  const job = auftragBauen([{ nr: 2, bildUrl: 'https://x/"a".jpg', bewegung: "it's true, null" }], { negativ: 'x' });
  job.test = true;
  const py = skriptBauen(readFileSync('scripts/kaggle/turbo.py', 'utf8'), job);
  assert.ok(!py.includes('__JOB__'));
  const datei = '/tmp/kaggle-turbo-test.py';
  writeFileSync(datei, py);
  execFileSync('python3', ['-c', `import ast; ast.parse(open('${datei}').read())`]);
  // Der eingesetzte Auftrag kommt in Python unverändert wieder heraus (auch Anführungszeichen, true/null im Text).
  const zeile = py.split('\n').find((z) => z.startsWith('JOB = '));
  const zurueck = JSON.parse(execFileSync('python3', ['-c', `import json\n${zeile}\nprint(json.dumps(JOB))`]).toString());
  assert.deepEqual(zurueck, job);
  assert.throws(() => skriptBauen('ohne platzhalter', job), /__JOB__/);
});

test('Kaggle-Turbo: ohne Secrets aus', () => {
  const alt = { u: process.env.KAGGLE_USERNAME, k: process.env.KAGGLE_KEY };
  delete process.env.KAGGLE_USERNAME; delete process.env.KAGGLE_KEY;
  assert.equal(kaggleBereit(), false);
  if (alt.u) process.env.KAGGLE_USERNAME = alt.u;
  if (alt.k) process.env.KAGGLE_KEY = alt.k;
});

import { kaggleEnv } from '../../automations/lib/kaggleTurbo.mjs';
test('Kaggle: neuer API-Token wird als KAGGLE_API_TOKEN durchgereicht', () => {
  assert.equal(kaggleEnv({ KAGGLE_KEY: 'KGAT_abc' }).KAGGLE_API_TOKEN, 'KGAT_abc');
  assert.equal(kaggleEnv({ KAGGLE_KEY: '0123abcd' }).KAGGLE_API_TOKEN, undefined);
});
