import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verteilen, postText, postInput, hashtagsAus, zeitplan, tiktokTitel } from '../../automations/lib/bufferPoster.mjs';

test('verteilen: je Kanal ein anderes Video, nie mehr Posts als Kanaele', () => {
  const v = ['a', 'b', 'c', 'd', 'e', 'f'].map((datei) => ({ datei }));
  const plan = verteilen(v, ['k1', 'k2', 'k3'], 1);
  assert.equal(plan.length, 3);
  assert.equal(new Set(plan.map((p) => p.kanal)).size, 3);
  assert.equal(new Set(plan.map((p) => p.video.datei)).size, 3);
  assert.equal(verteilen(v.slice(0, 2), ['k1', 'k2', 'k3']).length, 2);
});

test('postText: Frage zuerst, kuratierte Hashtags (max. 6), KI-Kennzeichnung genau einmal, max. 2200 Zeichen', () => {
  const t = postText({ caption: 'Welcher Planet ist der heißeste? #Weltall #Venus #Planeten #Quiz #Wissen #Extra #KIgeneriert' });
  assert.ok(t.startsWith('Welcher Planet ist der heißeste?'));
  assert.match(t, /#KIgeneriert$/);
  assert.equal(t.match(/#KIgeneriert/gi).length, 1);
  assert.ok(t.includes('#wusstestdu') && t.includes('#lernenmittiktok'));
  assert.equal(hashtagsAus('#a #b #c #d #e #f #g').length, 6);
  assert.ok(postText({ caption: 'x'.repeat(5000) }).length <= 2200);
});

test('zeitplan und TikTok-Titel: erstes Video sofort, dann im Abstand; Titel ohne Serien-Nummer', () => {
  const z = zeitplan(3, new Date('2026-10-08T09:00:00Z'), 40);
  assert.deepEqual(z, [null, '2026-10-08T09:40:00.000Z', '2026-10-08T10:20:00.000Z']);
  assert.equal(tiktokTitel({ titel: '#24: Der heißeste Planet' }), 'Der heißeste Planet');
  const geplant = postInput('c1', 't', 'https://github.com/x.mp4', { dueAt: z[1], titel: 'T' });
  assert.equal(geplant.mode, 'customScheduled');
  assert.equal(geplant.dueAt, z[1]);
  assert.equal(geplant.metadata.tiktok.title, 'T');
});

test('postInput: sofort, automatisch, Video-URL, TikTok-KI-Kennzeichnung', () => {
  const i = postInput('c1', 't', 'https://github.com/x.mp4');
  assert.equal(i.mode, 'shareNow');
  assert.equal(i.schedulingType, 'automatic');
  assert.deepEqual(i.assets, [{ video: { url: 'https://github.com/x.mp4' } }]);
  assert.equal(i.metadata.tiktok.isAiGenerated, true);
});

import { kontoFuer, zuordnen, nischenAus, nischeFuer } from '../../automations/lib/faktenKonten.mjs';
import { BANK, bankNaechster } from '../../automations/lib/faktenBank.mjs';

test('kontoFuer: erste Videos auf die TikTok-Konten (alle verschieden), danach die weiteren; dreht täglich', () => {
  const t = ['@a', '@b', '@c'];
  const w = ['@x', '@y', '@z'];
  for (const tag of [0, 1, 2, 5]) {
    assert.equal(new Set([0, 1, 2].map((i) => kontoFuer(i, tag, t, w))).size, 3);
    assert.ok(w.includes(kontoFuer(3, tag, t, w)));
  }
  assert.notEqual(kontoFuer(0, 0, t, w), kontoFuer(0, 1, t, w));
});

test('zuordnen: Video kommt auf den Kanal, dessen Name im Video steht', () => {
  const kanaele = [{ id: '1', name: 'zyx_7851' }, { id: '2', name: 'futureflowxx' }, { id: '3', name: 'futureflowx3' }];
  const v = [{ datei: 'a', konto: '@futureflowx3' }, { datei: 'b', konto: '@zyx_7851' }, { datei: 'c', konto: '@futureflowxx' }, { datei: 'd', konto: '@desk.rebel' }];
  const plan = zuordnen(v, kanaele);
  assert.equal(plan.length, 3);
  assert.equal(plan.find((p) => p.video.datei === 'a').kanal.id, '3');
  assert.equal(plan.find((p) => p.video.datei === 'b').kanal.id, '1');
  assert.equal(plan.find((p) => p.video.datei === 'c').kanal.id, '2');
});

test('Nischen: jedes TikTok-Konto bekommt Fakten aus seinem Thema, sonst irgendeinen', () => {
  const n = nischenAus();
  assert.deepEqual(nischeFuer('@zyx_7851', n), ['Weltall', 'Geld']);
  assert.deepEqual(nischeFuer('@unbekannt', n), []);
  for (const kats of Object.values(n)) {
    assert.ok(BANK.filter((e) => kats.includes(e.kat)).length >= 15, `genug Fakten für ${kats}`);
    assert.ok(kats.includes(bankNaechster([], kats).kat));
  }
  const alle = BANK.map((e) => e.id);
  assert.equal(bankNaechster(alle.slice(0, -1), ['GibtEsNicht']).id, alle.at(-1), 'Rückfall auf irgendeinen');
});

import { typAus, auswerten } from '../../automations/lib/tiktokLernen.mjs';

test('TikTok-Lernen: erkennt Format, bevorzugt erst bei genug Daten und klarem Vorsprung', () => {
  assert.equal(typAus('Honig verdirbt nie. Wahr oder Mythos? Schreib es...'), 'mythos');
  assert.equal(typAus('Welcher Planet ist der heißeste?'), 'quiz');
  const post = (text, sek, views = 100, kom = 0) => ({ text, metrics: [{ type: 'views', value: views }, { type: 'averageTimeWatched', value: sek }, { type: 'comments', value: kom }] });
  const quiz = Array.from({ length: 4 }, () => post('Frage?', 9));
  const mythos = Array.from({ length: 4 }, () => post('X. Wahr oder Mythos?', 5));
  assert.equal(auswerten([...quiz, ...mythos]).bevorzugt, 'quiz');
  assert.equal(auswerten([...quiz.slice(0, 2), ...mythos]).bevorzugt, null, 'zu wenig Daten');
  assert.equal(auswerten([...quiz, ...Array.from({ length: 4 }, () => post('Wahr oder Mythos?', 8.8))]).bevorzugt, null, 'kein klarer Vorsprung');
  assert.equal(auswerten([{ text: 'x', metrics: [] }]).quiz.n, 0, 'Posts ohne Zahlen zählen nicht');
});

test('bankNaechster: gelerntes Format zuerst innerhalb der Nische', () => {
  const e = bankNaechster([], ['Weltall'], 'mythos');
  assert.equal(e.kat, 'Weltall');
  assert.equal(e.typ, 'mythos');
  assert.equal(bankNaechster([], ['Weltall'], null).kat, 'Weltall');
});

import { serienHook } from '../../automations/lib/faktenKonten.mjs';

test('serienHook: Serie pro Thema und Format, kurz genug für das Video', () => {
  assert.equal(serienHook('Weltall', 'quiz', 7), "WELTALL-QUIZ #7: Schaffst du's?");
  assert.equal(serienHook('Körper', 'mythos', 3), 'KÖRPER #3: Mythos oder Wahrheit?');
  assert.equal(serienHook('Unbekannt', 'quiz', 1), "FAKTEN-QUIZ #1: Schaffst du's?");
  assert.ok(serienHook('Weltall', 'mythos', 999).length <= 40);
});

import { streakTag, querverweis } from '../../automations/lib/faktenKonten.mjs';

test('Streak und Querverweis: Tag zählt ab Start, Verweis nie aufs eigene Konto', () => {
  assert.equal(streakTag(Date.parse('2026-10-07T12:00:00Z')), 1);
  assert.equal(streakTag(Date.parse('2026-10-18T09:00:00Z')), 12);
  const t = ['@zyx_7851', '@futureflowxx', '@futureflowx3'];
  const n = nischenAus();
  for (const tag of [0, 1, 2, 3]) for (const k of t) {
    const q = querverweis(k, t, n, tag);
    assert.ok(!q.includes(k), q);
    assert.match(q, /^Mehr \S+-Fakten: @/);
  }
  assert.equal(querverweis('@zyx_7851', t, n, 0), 'Mehr Körper-Fakten: @futureflowxx');
});

import { naechsteZeiten, berlinZeitpunkt } from '../../automations/lib/bufferPoster.mjs';

test('naechsteZeiten: feste deutsche Uhrzeiten, Sommer-/Winterzeit, belegte Zeiten werden ausgelassen', () => {
  assert.equal(new Date(berlinZeitpunkt('2026-10-08', '19:00')).toISOString(), '2026-10-08T17:00:00.000Z');
  assert.equal(new Date(berlinZeitpunkt('2026-12-08', '19:00')).toISOString(), '2026-12-08T18:00:00.000Z');
  const jetzt = Date.parse('2026-10-08T09:50:00Z');
  assert.deepEqual(naechsteZeiten(3, { jetzt }), ['2026-10-08T10:30:00.000Z', '2026-10-08T11:30:00.000Z', '2026-10-08T16:00:00.000Z']);
  assert.deepEqual(naechsteZeiten(2, { jetzt, belegt: ['2026-10-08T10:35:00Z'] }), ['2026-10-08T11:30:00.000Z', '2026-10-08T16:00:00.000Z']);
  // Spät in der Nacht: es geht am nächsten Tag weiter
  assert.equal(naechsteZeiten(1, { jetzt: Date.parse('2026-10-08T22:00:00Z') })[0], '2026-10-09T09:30:00.000Z');
});
