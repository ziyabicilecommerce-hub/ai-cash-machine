import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auftragUrl, ideeAusIssue, statusAus } from '../../nachtwerk/ultimativ.js';
import { auftragAusIssue, auftragVerfeinern, HOOKS } from '../../automations/lib/nachtwerkBots.mjs';

const { bots } = JSON.parse(readFileSync(new URL('../../nachtwerk/bots.json', import.meta.url), 'utf8'));

test('ULTIMATIV: Bestellung aus der Seite wird vom Workflow mit allem verstanden', () => {
  const bot = bots.find((b) => b.id === 'grusel');
  const url = new URL(auftragUrl({ bot, idee: 'a mummy chases the night guard through the museum', shots: 14, sekunden: 4, englisch: true, serie: true }, 'x/y'));
  assert.equal(url.searchParams.get('labels'), 'video-bot');
  const a = auftragAusIssue(url.searchParams.get('body'), bots);
  assert.equal(a.ultimativ, true);
  assert.equal(a.geschichte, true);
  assert.equal(a.krass, true);
  assert.equal(a.englisch, true);
  assert.equal(a.ende, 'Fortsetzung folgt...');
  assert.equal(a.shots, '14');
  const normal = auftragAusIssue(JSON.stringify({ bot: 'anime', idee: 'two ninjas clash' }), bots);
  assert.equal(normal.ultimativ, false);
  assert.equal(normal.englisch, false);
  assert.equal(normal.ende, '');
});

test('ULTIMATIV: Teil-2-Idee und Ampel aus den Issues', () => {
  assert.equal(ideeAusIssue('**Folge:** 1\n\n**Idee:** a sky castle is attacked'), 'a sky castle is attacked');
  assert.equal(ideeAusIssue('```json\n{"idee":"fox vs golem"}\n```'), 'fox vs golem');
  assert.equal(ideeAusIssue('nichts'), '');
  assert.deepEqual(statusAus({ state: 'open' }, []), ['laeuft', '⏳ wird gebaut …']);
  assert.equal(statusAus({}, [{ body: '🩺 **Fehler-Radar:**\n- 🟡 **Titelbild fast weiß** – x' }])[0], 'gelb');
  assert.equal(statusAus({}, [{ body: '🩺 **Fehler-Radar:** 🟢 alles in Ordnung' }])[0], 'gruen');
});

test('ULTIMATIV: KI schreibt Hook + TikTok-Texte, sonst Rückfall', async () => {
  const bot = bots.find((b) => b.id === 'drache');
  const gut = await auftragVerfeinern(bot, 'a dragon', async () => ({ hook: 'Er ist erwacht! 🔥', beschreibung: 'Krass #drache', beschreibung_en: 'Insane #dragon' }));
  assert.deepEqual(gut, { hook: 'Er ist erwacht!', beschreibung: 'Krass #drache #KI', beschreibungEn: 'Insane #dragon #AI' });
  const weg = await auftragVerfeinern(bot, 'a dragon', async () => { throw new Error('x'); });
  assert.equal(weg.hook, HOOKS.drache);
});

test('ULTIMATIV: gewählter viraler Effekt landet im Auftrag', () => {
  const bot = bots.find((b) => b.id === 'welt');
  const url = new URL(auftragUrl({ bot, idee: 'a giant whale flies over the city', shots: 8, sekunden: 3.5, englisch: false, serie: false, preset: 'erde-zoom' }, 'x/y'));
  assert.equal(auftragAusIssue(url.searchParams.get('body'), bots).preset, 'erde-zoom');
  const ohne = new URL(auftragUrl({ bot, idee: 'a giant whale flies over the city', shots: 8, sekunden: 3.5, englisch: false, serie: false }, 'x/y'));
  assert.equal(auftragAusIssue(ohne.searchParams.get('body'), bots).preset, bot.preset);
});
