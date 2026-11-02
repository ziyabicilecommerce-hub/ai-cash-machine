import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KANAELE, passend, naechstes, postenJetzt, beitrag, heuteBerlin, zaehlen } from '../../automations/lib/bufferVerteiler.mjs';

const VIDEOS = JSON.parse(readFileSync(new URL('../../video-feed/videos.json', import.meta.url), 'utf8')).videos;

test('jeder Kanal bekommt eigene Inhalte - nichts doppelt zwischen den Kanälen', () => {
  const listen = KANAELE.map((k) => passend(VIDEOS, k.quelle));
  for (const [i, l] of listen.entries()) assert.ok(l.length >= 5, `${KANAELE[i].name}: genug Videos für einen Tag`);
  const alle = listen.flat().map((v) => v.datei);
  assert.equal(new Set(alle).size, alle.length, 'kein Video auf zwei Kanälen');
  assert.ok(listen[0].every((v) => /deskrebel/i.test(`${v.caption}${v.url}${v.thema}`)));
  assert.ok(listen[1].every((v) => /purivelle/i.test(`${v.caption}${v.url}${v.thema}`)));
  assert.ok(listen[2].every((v) => v.format === 'hoch' && (v.dauer || 0) <= 180), 'YouTube: nur Shorts');
  assert.ok(listen.flat().every((v) => !v.kanal), 'nie Fakten-Videos');
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
  const ig = beitrag({ caption: 'Tolles Teil #DeskRebel\n\n👉 https://www.deskrebel.store/products/x', titel: 'T' }, 'instagram');
  assert.match(ig.text, /KI-generiert/); assert.ok(!/https?:/.test(ig.text)); assert.match(ig.text, /Link in Bio/);
  assert.deepEqual(ig.metadata.instagram, { type: 'reel', shouldShareToFeed: true, isAiGenerated: true });
  const nurTags = beitrag({ caption: '#Purivelle #Massage', titel: 'Top 5 von Purivelle' }, 'instagram');
  assert.match(nurTags.text, /^Top 5 von Purivelle\n\n#Purivelle/);
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
