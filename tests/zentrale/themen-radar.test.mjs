import { test } from 'node:test';
import assert from 'node:assert/strict';
import { anlassHeute, vollmond, wetterAufhaenger, themenDesTages, themenHinweis } from '../../automations/lib/themenRadar.mjs';
import { ideePrompt } from '../../automations/lib/nachtwerkBots.mjs';

test('Themen-Radar: Anlässe, Vollmond und Wetter ohne Internet', () => {
  assert.equal(anlassHeute(new Date(Date.UTC(2026, 9, 25))).name, 'Halloween');
  assert.equal(anlassHeute(new Date(Date.UTC(2026, 11, 31))).name, 'Silvester');
  assert.equal(anlassHeute(new Date(Date.UTC(2026, 6, 3))), null);
  assert.equal(vollmond(new Date(Date.UTC(2024, 0, 25, 17, 54))), true, 'Vollmond 25.1.2024');
  assert.equal(vollmond(new Date(Date.UTC(2024, 0, 11, 11, 57))), false, 'Neumond 11.1.2024');
  assert.match(wetterAufhaenger(95, 10), /thunderstorm/);
  assert.match(wetterAufhaenger(1, 70), /storm/);
  assert.equal(wetterAufhaenger(1, 10), '');
});

test('Themen-Radar: freie Quellen dürfen ausfallen, Hinweis landet im Ideen-Auftrag', async () => {
  const kaputt = async () => { throw new Error('offline'); };
  assert.deepEqual(await themenDesTages({ jetzt: new Date(Date.UTC(2026, 6, 3)), laden: kaputt }), []);
  const laden = async (url) => ({ ok: true, json: async () => (url.includes('nasa') ? { title: 'The Pillars of Creation' } : { current: { weather_code: 75, wind_speed_10m: 5 } }) });
  const themen = await themenDesTages({ jetzt: new Date(Date.UTC(2026, 9, 20)), laden });
  assert.equal(themen.length, 3);
  assert.match(themen[0], /Halloween/);
  assert.match(themen.join(' '), /snowing/);
  assert.match(themen.join(' '), /Pillars of Creation/);
  const bot = { name: 'Grusel-Bot', text: 'Horror', beispiel: 'a mummy' };
  assert.match(ideePrompt(bot, null, themen), /Optional inspiration.*Halloween/s);
  assert.doesNotMatch(ideePrompt(bot), /Optional inspiration/);
  assert.equal(themenHinweis([]), '');
});
