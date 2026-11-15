import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remakeKandidat, hitWoerter, hitBonus, zuletztRemake } from '../../automations/schatten/ytHits.mjs';

const TAG = 864e5, jetzt = Date.parse('2026-11-15T12:00:00Z');
const s = { titel: 'Anruf von mir', hook: 'Mein Handy klingelt. Der Anrufer bin ich selbst.', hook2: 'Wenn dich deine eigene Nummer anruft, geh nicht ran.' };
const post = (text, aufrufe, tage, konto = '@giyuuu sama') => ({ konto, text, aufrufe, zeit: new Date(jetzt - tage * TAG).toISOString() });

test('YouTube-Hit-Remake: alter Hit kommt einmal neu, mit getauschtem Anfangssatz', () => {
  const posts = [post(`${s.hook2} 🎧`, 911, 10), post('Irgendwas anderes', 2000, 10, '@desk.rebel')];
  const r = remakeKandidat(posts, [{ skripte: [s], sprache: 'de' }], {}, jetzt);
  assert.equal(r.schluessel, 'remake:anruf-von-mir');
  assert.equal(r.skript.hook, s.hook, 'lief mit Du-Hook -> jetzt Ich-Hook');
  assert.equal(remakeKandidat(posts, [{ skripte: [s], sprache: 'de' }], { 'horror:remake:anruf-von-mir': 'x' }, jetzt), null, 'nur einmal');
  assert.equal(remakeKandidat([post(s.hook2, 911, 2)], [{ skripte: [s], sprache: 'de' }], {}, jetzt), null, 'zu frisch');
  assert.equal(remakeKandidat([post(s.hook2, 120, 10)], [{ skripte: [s], sprache: 'de' }], {}, jetzt), null, 'kein Hit');
});

test('Hit-Wörter geben Bonus, abwechselnd Remake', () => {
  const w = hitWoerter([post('Never check your doorbell camera at 3:12 AM. 👀 His eyes are hidden', 1114, 9)]);
  assert.ok(w.has('doorbell') && !w.has('hidden'));
  assert.equal(hitBonus({ hook: 'My doorbell camera filmed me.' }, w), 2);
  assert.equal(zuletztRemake({ 'horror:a': '2026-11-14T10:00', 'horror:remake:b': '2026-11-14T20:00' }), true);
  assert.equal(zuletztRemake({ 'horror:remake:b': '2026-11-13T20:00', 'horror:c': '2026-11-14T20:00' }), false);
});
