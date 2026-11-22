import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagNummer, folgeFuer, beitragFuer, KANAELE, FOLGEN, ZIEL_TAGE } from '../../automations/lib/serieFolgen.mjs';
import { KANAELE as LABOR } from '../../automations/lib/ideenLabor.mjs';
import { KANAELE as VERTEILER } from '../../automations/lib/bufferVerteiler.mjs';

test('Serie: Tag 1 = 22.11.2026, gezählt nach deutscher Zeit', () => {
  assert.equal(tagNummer(new Date('2026-11-22T10:00:00Z')), 1);
  assert.equal(tagNummer(new Date('2026-11-22T23:30:00Z')), 2);  // 00:30 Uhr in Berlin = schon Tag 2
  assert.equal(tagNummer(new Date('2026-11-28T17:00:00Z')), 7);
  assert.equal(tagNummer(new Date('2027-03-01T12:00:00Z')), 100);  // über Sommerzeit-Wechsel hinweg nicht verrutscht
});

test('Serie: Folgen setzen echte Zahlen ein und haben Hook, Szenen, Stimme', () => {
  const f = folgeFuer(2, { bots: 134, deals: 17 });
  assert.equal(f.hook.length, 2);
  assert.ok(f.szenen.some((s) => s.titel === '17 Deals gefunden'));
  assert.match(f.stimme, /17 Deals/);
  assert.match(f.caption, /^Tag 2 von 100: /);
  assert.deepEqual(f.ende, ['TAG 2', 'VON 100', 'Folg mir für morgen.']);
  for (const [n, roh] of Object.entries(FOLGEN)) {
    const g = folgeFuer(Number(n), { bots: 1, deals: 1 });
    assert.ok(!/\{\w+\}/.test(JSON.stringify(g)), `Tag ${n}: Platzhalter übrig`);
    assert.ok(roh.szenen.every((s) => s.seite || s.liste), `Tag ${n}: jede Szene braucht Seite oder Liste`);
  }
});

test('Serie: ohne festen Eintrag gibt es eine Standard-Folge', () => {
  const f = folgeFuer(42, { bots: 140, deals: 3 });
  assert.equal(f.hook[0], 'TAG 42.');
  assert.match(f.stimme, /Noch 58 Tage/);
  assert.ok(ZIEL_TAGE === 100);
});

test('Serie: Buffer-Eingabe für TikTok und YouTube', () => {
  const f = folgeFuer(3, { bots: 134 });
  const [tt, yt] = KANAELE.map((k) => beitragFuer(f, k, 'https://github.com/x/y/releases/download/a/b.mp4', '2026-11-24T17:30:00Z'));
  assert.equal(tt.mode, 'customScheduled');
  assert.equal(tt.metadata.tiktok.title.length <= 90, true);
  assert.match(tt.text, /Tag 4/);
  assert.equal(yt.metadata.youtube.categoryId, '28');
  assert.ok(yt.metadata.youtube.title.endsWith('#shorts') && yt.metadata.youtube.title.length <= 100);
  assert.equal(beitragFuer(f, KANAELE[0], 'https://x/y.mp4', null).mode, 'shareNow');
});

test('Serie: YouTube bekommt Englisch, TikTok Deutsch', () => {
  assert.deepEqual(KANAELE.map((k) => k.sprache), ['de', 'en']);
  for (const n of [...Object.keys(FOLGEN).map(Number), 30]) {
    const en = folgeFuer(n, { bots: 134, deals: 4 }, 'en');
    const de = folgeFuer(n, { bots: 134, deals: 4 }, 'de');
    assert.equal(en.szenen.length, de.szenen.length, `Tag ${n}: gleiche Szenen`);
    assert.ok(!/\{\w+\}/.test(JSON.stringify(en)), `Tag ${n}: Platzhalter übrig`);
    assert.match(en.caption, new RegExp(`^Day ${n} of 100: (?!Day)`));
    assert.match(de.caption, new RegExp(`^Tag ${n} von 100: (?!Tag)`));
    assert.ok(en.szenen.every((s, i) => s.seite === de.szenen[i].seite), `Tag ${n}: gleiche Bildschirmfotos`);
  }
  assert.ok(folgeFuer(4, {}, 'en').szenen[0].liste.every((z) => !/[äöüß]/.test(z)), 'englische Ideen-Liste');
  const yt = beitragFuer(folgeFuer(2, { bots: 134, deals: 9 }, 'en'), KANAELE[1], 'https://x/y.mp4', null);
  assert.match(yt.text, /#buildinpublic/);
  assert.match(yt.metadata.youtube.title, /^Day 2 of 100: THIS BOT WORKS/);
});

test('Serie-Kanäle laufen in keinem Horror-Bot mehr', () => {
  assert.ok(!LABOR.includes('futureflowx3') && !LABOR.includes('giyuuu sama'));
  assert.ok(!VERTEILER.some((k) => KANAELE.some((s) => s.id === k.id)));
});
