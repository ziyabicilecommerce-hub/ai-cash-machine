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
    assert.ok(['quiz', 'mythos', 'waswaere'].includes(e.typ), e.id);
    if (e.typ === 'waswaere') e.erklaerung = e.schritte;
    assert.ok(e.titel.length > 5 && e.titel.length <= 60, `${e.id} Titel`);
    assert.ok(e.erklaerung.length >= 1 && e.erklaerung.every((t) => t.length > 10), `${e.id} Erklärung`);
    assert.ok(e.bilder.length >= 3 && e.bilder.every((b) => /no people/.test(b)), `${e.id} Bilder ohne Personen`);
    assert.match(e.caption, /#\w+/, `${e.id} Hashtags`);
    if (e.typ === 'quiz') {
      assert.equal(e.optionen.length, 3, e.id);
      assert.equal(new Set(e.optionen).size, 3, `${e.id} Optionen verschieden`);
      assert.ok(e.richtig >= 0 && e.richtig <= 2, e.id);
      assert.ok(e.frage.endsWith('?'), e.id);
    } else if (e.typ === 'waswaere') {
      assert.match(e.frage, /^Was (passiert|passierte|wäre)\b.*\?$/, e.id);
      assert.equal(e.schritte.length, 3, `${e.id} genau 3 Schritte`);
      assert.ok(e.schritte.every((t) => t.length <= 160), `${e.id} Schritte kurz`);
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

test('Was wäre wenn: alte ids bleiben stabil, ohne Mythen kommt nie ein Mythos', () => {
  assert.equal(BANK.find((e) => e.id === 'b127').typ, 'mythos', 'letzter alter Eintrag unverändert');
  assert.equal(BANK.find((e) => e.id === 'b128').typ, 'waswaere');
  const alle = BANK.filter((e) => e.typ !== 'waswaere').map((e) => e.id);
  assert.equal(bankNaechster(alle, ['Weltall'], 'waswaere').typ, 'waswaere');
  for (const kats of [['Weltall'], ['Natur', 'Tiere'], ['Körper', 'Essen', 'Geld', 'Tiere', 'Natur']]) {
    assert.equal(bankNaechster([], kats, 'waswaere', { ohne: ['mythos'] }).typ, 'waswaere', kats.join());
    const benutzt = [];
    for (let n = 0; n < 200; n++) { const e = bankNaechster(benutzt, kats, 'waswaere', { ohne: ['mythos'] }); if (!e) break; assert.notEqual(e.typ, 'mythos'); benutzt.push(e.id); }
  }
});

test('Grusel-Oktober: nur im Oktober, dann zuerst; danach nie', async () => {
  const { saisonHeute } = await import('../../automations/lib/faktenBank.mjs');
  assert.equal(saisonHeute(new Date('2026-10-15T12:00:00Z')), 'halloween');
  assert.equal(saisonHeute(new Date('2026-11-01T12:00:00Z')), null);
  assert.equal(saisonHeute(new Date('2026-10-31T23:30:00Z')), null, '00:30 am 1.11. in Deutschland');
  const okt = bankNaechster([], ['Natur', 'Tiere'], 'waswaere', { ohne: ['mythos'], saison: 'halloween' });
  assert.equal(okt.saison, 'halloween');
  const benutzt = [];
  for (let n = 0; n < 300; n++) { const e = bankNaechster(benutzt, ['Weltall'], 'waswaere', { ohne: ['mythos'] }); if (!e) break; assert.ok(!e.saison, 'außerhalb der Saison kein Grusel'); benutzt.push(e.id); }
  assert.ok(BANK.filter((e) => e.saison === 'halloween').every((e) => /Antworte in einem Wort/.test(e.caption)));
});

test('Aktuelles Ereignis (Orioniden) nur im Zeitfenster und dann zuerst', () => {
  const e = bankNaechster([], ['Weltall'], 'waswaere', { ohne: ['mythos'], saison: 'halloween', heute: '10-16' });
  assert.match(e.titel, /Orioniden/);
  const spaeter = bankNaechster([], ['Weltall'], 'waswaere', { ohne: ['mythos'], saison: 'halloween', heute: '10-25' });
  assert.doesNotMatch(spaeter.titel, /Orioniden/);
  assert.equal(BANK.filter((x) => x.aktuell).every((x) => /^\d\d-\d\d$/.test(x.aktuell[0])), true);
});
