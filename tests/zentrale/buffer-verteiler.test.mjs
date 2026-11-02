import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KANAELE, passend, naechstes, postenJetzt, beitrag, heuteBerlin, zaehlen } from '../../automations/lib/bufferVerteiler.mjs';

const VIDEOS = JSON.parse(readFileSync(new URL('../../video-feed/videos.json', import.meta.url), 'utf8')).videos;

test('keine Shop-Werbung, jeder Kanal etwas anderes', () => {
  assert.deepEqual(KANAELE.map((k) => k.quelle), ['horror', 'fakten', 'anime']);
  const fakten = passend(VIDEOS, 'fakten', 'purivelle.785'), anime = passend(VIDEOS, 'anime');
  assert.ok(fakten.length >= 20 && anime.length >= 5);
  for (const v of [...fakten, ...anime]) assert.ok(!/deskrebel\.store|purivelle\.store|#deskrebel|#purivelle/i.test(`${v.caption}${v.url}${v.titel}`), `Werbung: ${v.titel}`);
  assert.ok(fakten.every((v) => v.kanal === 'fakten' && v.konto !== '@desk.rebel'), 'nur Fakten, nie die eines anderen Instagram-Kontos');
  assert.equal(fakten[0].konto, '@purivelle.785', 'eigene Fakten-Videos zuerst');
  assert.ok(anime.every((v) => v.format === 'hoch' && (v.dauer || 0) <= 180), 'YouTube: nur Shorts');
  const fa = new Set(fakten.map((v) => v.datei));
  assert.ok(!anime.some((v) => fa.has(v.datei)), 'nichts doppelt');
});

test('Horror-Generator: KI-Text wird streng geprüft', async () => {
  const { saeubern, prompt, BEISPIEL } = await import('../../automations/schatten/horrorKi.mjs');
  assert.ok(saeubern(BEISPIEL), 'Beispiel ist gültig');
  assert.equal(saeubern({ ...BEISPIEL, ende: 'Überall ist Blut.' }), null, 'kein Blut');
  assert.equal(saeubern({ ...BEISPIEL, hook: 'x'.repeat(120) }), null, 'Hook zu lang');
  assert.equal(saeubern({ ...BEISPIEL, wahl: ['nur eins'] }), null);
  assert.equal(saeubern({ ...BEISPIEL, frage: 'Keine Frage' }), null);
  assert.equal(saeubern({ ...BEISPIEL, ort: 'mond' }).ort, 'haus', 'unbekannter Ort -> Haus');
  assert.equal(saeubern('kaputt'), null);
  assert.match(prompt(['zwei-zahnbuersten'], () => 0), /zwei-zahnbuersten/);
});

test('nächstes Video: erst neue (neueste zuerst), dann das am längsten nicht gepostete', () => {
  const v = [{ datei: 'a', erstellt: '2026-10-01' }, { datei: 'b', erstellt: '2026-10-03' }, { datei: 'c', erstellt: '2026-10-02' }];
  assert.equal(naechstes(v, {}).datei, 'b');
  assert.equal(naechstes(v, { b: '2026-11-01T10:00:00Z' }).datei, 'c');
  assert.equal(naechstes(v, { a: '2026-11-01T09:00:00Z', b: '2026-11-01T08:00:00Z', c: '2026-11-01T10:00:00Z' }).datei, 'b');
  assert.equal(naechstes([], {}), null);
});

test('posten nur mit Abstand und höchstens 6 am Tag', () => {
  const jetzt = Date.parse('2026-11-02T12:00:00Z');
  assert.equal(postenJetzt(0, null, jetzt), true);
  assert.equal(postenJetzt(3, '2026-11-02T11:00:00Z', jetzt), false, '60 Min. zu kurz');
  assert.equal(postenJetzt(3, '2026-11-02T10:00:00Z', jetzt), true);
  assert.equal(postenJetzt(6, '2026-11-02T08:00:00Z', jetzt), false);
});

test('Texte: KI-Hinweis immer, Instagram als Reel ohne Link, YouTube mit Titel und Kategorie', () => {
  const ig = beitrag({ caption: 'Honig verdirbt nie. Wahr?\n\nTag 26 von 100 🔥 Folge @futureflowx3! #wissen', titel: 'T' }, 'instagram');
  assert.match(ig.text, /KI-generiert/); assert.ok(!/Folge @|Tag 26/.test(ig.text), ig.text);
  const h = beitrag({ caption: 'Ich wohne allein. 1️⃣ Ins Bad oder 2️⃣ Raus hier? Zahl in die Kommentare 👇 #horrortok', titel: 'Z' }, 'instagram', 'horror');
  assert.equal(h.metadata.instagram.firstComment, 'Was machst du? 1️⃣ Ins Bad oder 2️⃣ Raus hier - schreib nur die Zahl 👇');
  assert.match(h.text, /#gruselgeschichte/); assert.ok(!/#horrortok/.test(h.text), 'nur Nischen-Tags');
  const f = beitrag({ caption: 'Fakt #12: Oktopus hat drei Herzen #tiere', titel: 'F' }, 'instagram', 'fakten');
  assert.match(f.text, /^Fakt #12: Oktopus/); assert.match(f.metadata.instagram.firstComment, /Wusstest du/);
  assert.deepEqual(ig.metadata.instagram, { type: 'reel', shouldShareToFeed: true, isAiGenerated: true });
  const nurTags = beitrag({ caption: '#wissen #honig', titel: 'Honig verdirbt nie' }, 'instagram');
  assert.match(nurTags.text, /^Honig verdirbt nie\n\n#wissen/);
  const yt = beitrag({ titel: 'Kage no Shiro – Folge 30 (Teaser)', caption: 'Die ganze Folge jetzt auf YouTube!\n\nDie Ninja kehren zurück.' }, 'youtube');
  assert.ok(!/jetzt auf YouTube/.test(yt.text)); assert.match(yt.text, /^Die Ninja/);
  assert.match(yt.text, /KI-generiert/);
  assert.ok(yt.metadata.youtube.title.length <= 100 && yt.metadata.youtube.categoryId && yt.metadata.youtube.isAiGenerated);
});

test('Zählen und Tagesbeginn Berlin', () => {
  assert.equal(heuteBerlin(new Date('2026-11-02T12:00:00Z')), '2026-11-01T23:00:00.000Z');
  assert.equal(heuteBerlin(new Date('2026-07-02T12:00:00Z')), '2026-07-01T22:00:00.000Z');
  const z = zaehlen([{ channelId: 'k', status: 'sent', sentAt: '2026-11-02T08:00:00Z' }, { channelId: 'k', status: 'error', dueAt: '2026-11-02T09:00:00Z' }, { channelId: 'x', status: 'sent', sentAt: '2026-11-02T10:00:00Z' }], 'k');
  assert.deepEqual(z, { heute: 1, letzter: '2026-11-02T08:00:00Z' });
});

test('Hook-Wettbewerb: stärkster gültiger KI-Hook gewinnt, schwache fliegen raus', async () => {
  const { neueGeschichte, hookPunkte, BEISPIEL } = await import('../../automations/schatten/horrorKi.mjs');
  assert.ok(hookPunkte('Um 3:12 Uhr klingelt mein Handy. Der Anrufer bin ich.') >= 5);
  assert.ok(hookPunkte('Es war einmal ein Wald?') <= 2);
  const antworten = [{ ...BEISPIEL, titel: 'Schwach', hook: 'Es war dunkel im Wald und kalt.' }, { ...BEISPIEL, titel: 'Stark', hook: 'Um 3 Uhr nachts schreibt mir mein Handy: Ich bin allein.' }];
  let i = 0;
  const s = await neueGeschichte(async () => antworten[i++ % 2], []);
  assert.equal(s.titel, 'Stark');
  assert.equal(await neueGeschichte(async () => ({ ...BEISPIEL, hook: 'Es war dunkel und kalt im Wald.' }), []), null, 'nur schwache Hooks -> Vorrat');
});
