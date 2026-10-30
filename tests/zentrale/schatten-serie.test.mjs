import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { serienText, serienTitel, serienTag } from '../../automations/schatten/posten.mjs';

const ORDNER = new URL('../../automations/schatten/serien/', import.meta.url);
const folgen = readdirSync(ORDNER).filter((f) => f.endsWith('.json')).map((f) => ({ f, d: JSON.parse(readFileSync(new URL(f, ORDNER), 'utf8')) }));

const nummern = (serie) => folgen.filter(({ f }) => f.startsWith(`${serie}-teil-`)).map(({ f }) => Number(f.match(/teil-(\d+)/)[1])).sort((a, b) => a - b);
const bis = (von, n) => Array.from({ length: n - von + 1 }, (_, i) => von + i);

test('Schatten-Serien: alte Serien Teil 2 bis 12, neue Serien Teil 1 bis 8 - lueckenlos', () => {
  for (const serie of ['reihe-13', 'mach-nicht-auf', 'geh-nicht-tiefer']) assert.deepEqual(nummern(serie), bis(2, 12), serie);
  for (const serie of ['letzte-bahn', 'etage-0', 'babyphone']) assert.deepEqual(nummern(serie), bis(1, 8), serie);
});

test('Schatten-Serien: jede Folge kennt ihre Gesamtzahl an Teilen', () => {
  for (const { f, d } of folgen) assert.ok([8, 12].includes(d.teile), f);
});

test('Schatten-Serien: jede Folge hat Hook, Jumpscare, Ende und ein gelbes Wort, das im Text steht', () => {
  for (const { f, d } of folgen) {
    assert.equal(d.szenen[0].art, 'blitz', `${f}: Hook zuerst`);
    assert.ok(d.szenen.some((s) => s.art === 'fratze'), `${f}: Jumpscare`);
    assert.equal(d.szenen.at(-1).art, 'teil2', `${f}: Abschluss-Karte`);
    assert.ok(d.caption && /👇/.test(d.caption), `${f}: Frage an die Zuschauer`);
    assert.doesNotMatch(d.szenen[0].sprich, /^(Teil \S+|Finale)\./, `${f}: Hook beginnt sofort mit Spannung`);
    if (Number(f.match(/teil-(\d+)/)[1]) < d.teile) assert.match(d.szenen.at(-1).cta || '', /FOLG MIR/, `${f}: Folgen-Aufruf`);
    for (const s of d.szenen.filter((s) => s.gelb)) {
      assert.ok(s.text.split(' ').map((w) => w.replace(/^["]+|[".,:!?]+$/g, '')).includes(s.gelb), `${f}: "${s.gelb}" fehlt in "${s.text}"`);
    }
  }
});

test('serienText: Hook, Teil-Nummer, Hashtags und KI-Hinweis', () => {
  const t = serienText({ titel: 'Passagier 41 – Teil 5', caption: 'Teil fünf. Hook. Frage? 👇', teile: 12 });
  assert.match(t, /^Teil fünf\. Hook\. Frage\? 👇 \(Teil 5\/12\)/);
  assert.match(serienText({ titel: 'Etage 0 – Teil 3', caption: 'x', teile: 8 }), /\(Teil 3\/8\)/);
  assert.match(t, /#horror/);
  assert.match(t, /#teil5/);
  assert.match(t, /KI-generiert/);
  assert.equal(serienTitel({ titel: 'x'.repeat(200) }).length, 90);
  assert.equal(serienTag({ titel: 'Passagier 41 – Teil 5' }), '#passagier41');
  assert.match(t, /#passagier41/);
  assert.match(t, /Teil 6 kommt bald/);
  assert.doesNotMatch(serienText({ titel: 'Etage 0 – Teil 8', caption: 'x', teile: 8 }), /kommt bald/, 'kein Teil 9 versprechen');
  assert.doesNotMatch(t, /#fyp/);
});
