// Geprüfte Faktenliste des Fakten-Kanals: vollständig, ohne Platzhalter, ohne strittige Rekorde, abwechselnd Quiz/Mythos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK, bankNaechster } from '../../automations/lib/faktenBank.mjs';
import { echo, umstritten } from '../../automations/lib/faktenPruefung.mjs';
import { pruefen } from '../../automations/lib/werbeCheck.mjs';

test('Faktenliste: jeder Eintrag ist vollständig und sauber', () => {
  assert.ok(BANK.length >= 25);
  const ids = new Set(BANK.map((e) => e.id));
  assert.equal(ids.size, BANK.length, 'ids eindeutig');
  for (const e of BANK) {
    assert.ok(['quiz', 'mythos'].includes(e.typ), e.id);
    assert.ok(e.titel.length > 5 && e.titel.length <= 60, `${e.id} Titel`);
    assert.ok(e.erklaerung.length >= 1 && e.erklaerung.every((t) => t.length > 10), `${e.id} Erklärung`);
    assert.ok(e.bilder.length >= 3 && e.bilder.every((b) => /no people/.test(b)), `${e.id} Bilder ohne Personen`);
    assert.match(e.caption, /#\w+/, `${e.id} Hashtags`);
    if (e.typ === 'quiz') {
      assert.equal(e.optionen.length, 3, e.id);
      assert.equal(new Set(e.optionen).size, 3, `${e.id} Optionen verschieden`);
      assert.ok(e.richtig >= 0 && e.richtig <= 2, e.id);
      assert.ok(e.frage.endsWith('?'), e.id);
    } else {
      assert.equal(typeof e.wahr, 'boolean', e.id);
      assert.ok(e.aussage.length > 15, e.id);
    }
    const skript = { titel: e.titel, hook: e.hook, caption: e.caption, fakt: e.frage || e.aussage, szenen: [...e.erklaerung, e.frage || e.aussage].map((text) => ({ text })) };
    assert.ok(!echo(skript), `${e.id} echo`);
    assert.ok(!umstritten(skript), `${e.id} strittig`);
    assert.deepEqual(pruefen([e.titel, e.caption, ...e.erklaerung, e.frage || e.aussage].join('\n')).filter((t) => t.stufe === 'block'), [], `${e.id} Werbe-Check`);
  }
});

test('Faktenliste: Quiz und Mythos wechseln sich ab, bankNaechster nimmt Unbenutztes', () => {
  assert.deepEqual(BANK.slice(0, 4).map((e) => e.typ), ['quiz', 'mythos', 'quiz', 'mythos']);
  assert.equal(bankNaechster([]).id, 'b1');
  assert.equal(bankNaechster(['b1', 'b2']).id, 'b3');
  assert.equal(bankNaechster(BANK.map((e) => e.id)), null, 'leer -> KI-Notnagel');
});
