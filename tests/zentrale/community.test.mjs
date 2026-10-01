// Community-Agent: Wochenplan, 80/20-Regel, Umfragen (Telegram + Discord), echte Ergebnisse am Sonntag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beitrag, WOCHENPLAN, KANAELE, CHALLENGES } from '../../automations/lib/community.mjs';

const tag = (iso) => new Date(`${iso}T16:05:00Z`);
const PRODUKTE = [{ name: 'Purivelle RelaxRoll', shop: 'Purivelle', url: 'https://purivelle.store/products/r' }, { name: 'DeskRebel PushPro', shop: 'DeskRebel', url: 'https://www.deskrebel.store/products/p' }];

test('jeder Wochentag hat seine Beitragsart, Montag startet eine Challenge, Freitag fragt nach derselben', () => {
  const woche = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].map((d) => beitrag(tag(d), { produkte: PRODUKTE }));
  assert.deepEqual(woche.map((b) => b.art), WOCHENPLAN);
  const ch = CHALLENGES.find((c) => woche[1].text.includes(c.titel));
  assert.ok(ch && woche[5].text.includes(ch.titel), 'Fortschritts-Freitag gehoert zur Montags-Challenge');
  assert.ok(woche[3].umfrage.optionen.length >= 2);
});

test('80/20: hoechstens ein Beitrag pro Woche nennt ein Produkt (nur mit eigenem Shop-Link)', () => {
  for (const start of ['2026-10-04', '2026-11-01', '2026-12-06']) {
    const woche = Array.from({ length: 7 }, (_, i) => beitrag(new Date(tag(start).getTime() + i * 864e5), { produkte: PRODUKTE }));
    const mitLink = woche.filter((b) => /https?:\/\//.test(b.text));
    assert.ok(mitLink.length <= 1, start);
    for (const b of mitLink) assert.match(b.text, /purivelle\.store|deskrebel\.store/);
  }
});

test('Sonntag zeigt das echte Umfrage-Ergebnis in Prozent', () => {
  const b = beitrag(tag('2026-10-04'), { ergebnis: { frage: 'Wann bewegst du dich am liebsten?', gesamt: 4, optionen: [{ text: 'Morgens', stimmen: 3 }, { text: 'Abends', stimmen: 1 }] } });
  assert.match(b.text, /Morgens: 75 %/);
  assert.match(b.text, /Abends: 25 %/);
  assert.doesNotMatch(beitrag(tag('2026-10-04')).text, /%/);
});

test('Telegram: Umfrage per sendPoll (anonym), Ergebnis per stopPoll; Discord: native Umfrage', async () => {
  process.env.TELEGRAM_BOT_TOKEN = 't'; process.env.TELEGRAM_KANAL_ID = '@kanal'; process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1/x';
  const anfragen = [];
  const laden = async (url, o) => { anfragen.push({ url, body: JSON.parse(o.body) }); return new Response(JSON.stringify(url.includes('stopPoll') ? { ok: true, result: { question: 'F?', total_voter_count: 2, options: [{ text: 'A', voter_count: 2 }] } } : { ok: true, result: { message_id: 42 }, id: '9' })); };
  const u = beitrag(tag('2026-10-07'));
  assert.deepEqual(await KANAELE.Telegram.senden(u, laden), { id: 42 });
  assert.match(anfragen[0].url, /sendPoll$/);
  assert.equal(anfragen[0].body.is_anonymous, true);
  assert.equal(anfragen[0].body.chat_id, '@kanal');
  await KANAELE.Discord.senden(u, laden);
  assert.equal(anfragen[1].body.poll.answers.length, u.umfrage.optionen.length);
  assert.equal((await KANAELE.Telegram.ergebnis(42, laden)).gesamt, 2);
  await KANAELE.Discord.senden(beitrag(tag('2026-10-06')), laden);
  assert.match(anfragen.at(-1).body.content, /Tipp der Woche/);
  for (const k of ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_KANAL_ID', 'DISCORD_WEBHOOK_URL']) delete process.env[k];
});
