import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auftragAusIssue } from '../../automations/lib/nachtwerkBots.mjs';
import { nachtwerkProjekt, datenUrl } from '../../automations/lib/nachtwerkProjekt.mjs';
import { validateProject } from '../../nachtwerk/core.js';

const { bots } = JSON.parse(readFileSync(new URL('../../nachtwerk/bots.json', import.meta.url), 'utf8'));

test('NACHTWERK-Bots: Auftrag aus dem Issue lesen und begrenzen', () => {
  const body = 'Text davor\n```json\n{"bot":"grusel","idee":"a mummy\\nchases me","shots":99,"sekunden":1,"preset":"rm -rf","stil":"anime","text":"Hallo"}\n```';
  const a = auftragAusIssue(body, bots);
  assert.equal(a.bot, 'grusel');
  assert.equal(a.idee, 'a mummy chases me', 'keine Zeilenumbrüche (GITHUB_OUTPUT)');
  assert.equal(a.shots, '18');
  assert.equal(a.sekunden, '2');
  assert.equal(a.preset, 'grusel', 'unbekanntes Preset -> Bot-Standard');
  assert.equal(a.stil, 'anime');
  assert.equal(a.geschichte, true);
  assert.equal(a.durchgehend, false);
  assert.equal(a.krass, true, 'Krass standardmäßig an');
  assert.equal(auftragAusIssue('```json\n{"bot":"gibtsnicht","idee":"epic volcano"}\n```', bots).bot, bots[0].id);
  assert.throws(() => auftragAusIssue('kein json', bots), /Auftrag/);
  assert.throws(() => auftragAusIssue('```json\n{"idee":"x"}\n```', bots), /Idee/);
});

test('NACHTWERK-Bots: Bot-Liste vollständig', () => {
  for (const b of bots) for (const k of ['id', 'emoji', 'name', 'text', 'beispiel', 'preset', 'stil', 'shots']) assert.ok(b[k] !== undefined, `${b.id}.${k}`);
});

test('Ziya -> NACHTWERK: Projektdatei ist in NACHTWERK ladbar', () => {
  const clip = datenUrl(Buffer.from('fake-mp4'), 'video/mp4');
  const p = nachtwerkProjekt({ idee: 'a mummy', genre: 'horror', audio: datenUrl(Buffer.from('mp3'), 'audio/mpeg'),
    shots: [{ nr: 1, satz: 'Es war Nacht.', bild: 'tomb', dauer: 3.43, zoom: 'raus', daten: clip }, { nr: 2, dauer: 1, zoom: 'quatsch' }] });
  const v = validateProject(p);
  assert.equal(v.scenes.length, 2);
  assert.equal(v.scenes[0].camera, 'pull');
  assert.equal(v.scenes[0].media.type, 'video');
  assert.equal(v.scenes[1].duration, 2, 'mindestens 2 s');
  assert.equal(v.format, 'portrait');
  assert.equal(v.audio.type, 'audio');
});

import { modalBereit, modalAuftrag } from '../../automations/lib/modalTurbo.mjs';
test('Modal-Turbo: nur mit beiden Schlüsseln, 720p-Auftrag', () => {
  assert.equal(modalBereit({}), false);
  assert.equal(modalBereit({ MODAL_TOKEN_ID: 'ak-1' }), false);
  assert.equal(modalBereit({ MODAL_TOKEN_ID: 'ak-1', MODAL_TOKEN_SECRET: 'as-2' }), true);
  const a = modalAuftrag([{ nr: 1, bildUrl: 'u', bildB64: 'eA==', bewegung: 'mummy walks' }], { sekunden: 3.5, maxMinuten: 60 });
  assert.equal(a.breite, 704);
  assert.equal(a.hoehe, 1280);
  assert.equal(a.zeit_min, 50);
  assert.equal(a.shots[0].bild_b64, 'eA==');
  assert.equal(a.shots[0].prompt, 'mummy walks');
});

import { tagesBot, tagesIdee } from '../../automations/lib/nachtwerkBots.mjs';
test('Tages-Bot: reihum ein Bot pro Tag, Idee von der KI oder aus der Liste', async () => {
  const a = tagesBot(bots, new Date(Date.UTC(2026, 9, 23)));
  const b = tagesBot(bots, new Date(Date.UTC(2026, 9, 24)));
  assert.notEqual(a.bot.id, b.bot.id, 'jeden Tag ein anderer Bot');
  assert.equal(tagesBot(bots, new Date(Date.UTC(2026, 9, 23 + bots.length))).bot.id, a.bot.id);
  assert.ok(bots.every((x) => x.ideen?.length >= 3));
  const ki = await tagesIdee(bots[0], 1, async () => ({ idee: 'a glowing jellyfish swarm rises through a flooded subway tunnel' }));
  assert.equal(ki.quelle, 'ki');
  const rueck = await tagesIdee(bots[0], 1, async () => { throw new Error('429'); });
  assert.equal(rueck.quelle, 'liste');
  assert.equal(rueck.idee, bots[0].ideen[1]);
});

test('NACHTWERK-Bots: sieben Bots, jeder mit eigenen Ideen und gültigen Einstellungen', () => {
  assert.equal(bots.length, 7);
  assert.equal(new Set(bots.map((b) => b.id)).size, 7);
  for (const b of bots) {
    assert.ok(b.ideen.length >= 6, b.id);
    assert.deepEqual(auftragAusIssue(JSON.stringify({ bot: b.id, idee: b.ideen[0] }), bots).bot, b.id);
  }
});

import { HOOKS } from '../../automations/lib/nachtwerkBots.mjs';
test('Tagesbot: Hook von der KI (ohne Emojis), sonst fester Hook je Bot', async () => {
  const anime = bots.find((b) => b.id === 'anime');
  const ki = await tagesIdee(anime, 0, async () => ({ idee: 'two rival sky pirates clash on a flying airship', hook: 'Wer gewinnt? 🔥 #anime' }));
  assert.equal(ki.hook, 'Wer gewinnt?');
  const rueck = await tagesIdee(anime, 0, async () => { throw new Error('weg'); });
  assert.equal(rueck.hook, HOOKS.anime);
  for (const b of bots) assert.ok(HOOKS[b.id], b.id);
  assert.equal(auftragAusIssue(JSON.stringify({ bot: 'anime', idee: 'test idee hier', hook: 'Wer\ngewinnt?' }), bots).hook, 'Wer gewinnt?');
});
