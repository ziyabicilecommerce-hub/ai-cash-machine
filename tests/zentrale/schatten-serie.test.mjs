import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { serienText, serienTitel } from '../../automations/schatten/posten.mjs';

const ORDNER = new URL('../../automations/schatten/serien/', import.meta.url);
const folgen = readdirSync(ORDNER).filter((f) => f.endsWith('.json')).map((f) => ({ f, d: JSON.parse(readFileSync(new URL(f, ORDNER), 'utf8')) }));

test('Schatten-Serien: drei Serien mit je Teil 2 bis 12', () => {
  for (const serie of ['reihe-13', 'mach-nicht-auf', 'geh-nicht-tiefer']) {
    const teile = folgen.filter(({ f }) => f.startsWith(`${serie}-teil-`)).map(({ f }) => Number(f.match(/teil-(\d+)/)[1])).sort((a, b) => a - b);
    assert.deepEqual(teile, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], serie);
  }
});

test('Schatten-Serien: jede Folge hat Hook, Jumpscare, Ende und ein gelbes Wort, das im Text steht', () => {
  for (const { f, d } of folgen) {
    assert.equal(d.szenen[0].art, 'blitz', `${f}: Hook zuerst`);
    assert.ok(d.szenen.some((s) => s.art === 'fratze'), `${f}: Jumpscare`);
    assert.equal(d.szenen.at(-1).art, 'teil2', `${f}: Abschluss-Karte`);
    assert.ok(d.caption && /👇/.test(d.caption), `${f}: Frage an die Zuschauer`);
    for (const s of d.szenen.filter((s) => s.gelb)) {
      assert.ok(s.text.split(' ').map((w) => w.replace(/^["]+|[".,:!?]+$/g, '')).includes(s.gelb), `${f}: "${s.gelb}" fehlt in "${s.text}"`);
    }
  }
});

test('serienText: Hook, Teil-Nummer, Hashtags und KI-Hinweis', () => {
  const t = serienText({ titel: 'Passagier 41 – Teil 5', caption: 'Teil fünf. Hook. Frage? 👇' });
  assert.match(t, /^Teil fünf\. Hook\. Frage\? 👇 \(Teil 5\/12\)/);
  assert.match(t, /#horror/);
  assert.match(t, /#teil5/);
  assert.match(t, /KI-generiert/);
  assert.equal(serienTitel({ titel: 'x'.repeat(200) }).length, 90);
});
