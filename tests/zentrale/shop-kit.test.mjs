import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BOTS, bauen, pruefen, botYml, runnerYml } from '../../scripts/shop-kit-bauen.mjs';

test('Shop-Kit: alle 10 Bots samt Hilfsdateien, Workflows und Anleitung - ohne persönliche Daten', () => {
  const ziel = join(mkdtempSync(join(tmpdir(), 'kit-')), 'kit');
  const { ordner, dateien } = bauen(ziel);
  assert.equal(BOTS.length, 10);
  for (const b of BOTS) {
    assert.ok(existsSync(join(ordner, `automations/${b.datei}.mjs`)), b.datei);
    assert.ok(existsSync(join(ordner, `.github/workflows/${b.datei}.yml`)), b.datei);
  }
  assert.ok(dateien.includes('automations/lib/shopify.mjs'));
  assert.ok(readFileSync(join(ordner, 'ANLEITUNG.md'), 'utf8').includes('TEST_MODE'));
  assert.ok(!readFileSync(join(ordner, 'automations/lib/shopify.mjs'), 'utf8').includes('setup/ App'));
  assert.deepEqual(pruefen(dateien.map((f) => join(ordner, f))), []);
});

test('Shop-Kit: Sperre gegen persönliche Daten und gültige Workflows', () => {
  assert.deepEqual(pruefen(['a', 'b'], (f) => (f === 'a' ? 'kontakt: max@gmail.com' : 'nichts')), ['a']);
  assert.match(botYml(BOTS[0]), /cron: '0 \* \* \* \*'/);
  assert.match(runnerYml(), /SHOPIFY_TOKEN: \$\{\{ secrets\.SHOPIFY_TOKEN \}\}/);
});
