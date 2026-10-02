// Feature-Paket 1: beste Posting-Zeiten, Doppel-Post-Schutz, Saison-Kalender, neue Formate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jetztPosten, berlinStunde, kuerzlichGepostet, produktSchluessel, fensterFuer } from '../../automations/lib/postZeiten.mjs';
import { saisonJetzt, saisonHinweis, anlaesse } from '../../automations/lib/saison.mjs';
import { FORMATE, formatWaehlen } from '../../automations/lib/formate.mjs';

test('Posting-Zeiten: in starken Stunden ja, sonst warten - abends wird aufgeholt', () => {
  assert.equal(jetztPosten('TikTok', 19), true);
  assert.equal(jetztPosten('TikTok', 9, { heute: 0, limit: 5 }), false, 'morgens wartet TikTok');
  assert.equal(jetztPosten('TikTok', 20, { heute: 0, limit: 5 }), true);
  assert.equal(jetztPosten('LinkedIn', 15, { heute: 0, limit: 5 }), true, 'nach 15 Uhr nur noch 1 starke Stunde -> aufholen');
  assert.equal(jetztPosten('Unbekannt', 3), true);
  assert.equal(berlinStunde(new Date('2026-07-01T10:30:00Z')), 12, 'Sommerzeit');
  assert.equal(berlinStunde(new Date('2026-12-01T10:30:00Z')), 11, 'Winterzeit');
  process.env.POST_ZEITEN_TIKTOK = '7,8';
  assert.deepEqual(fensterFuer('TikTok'), [7, 8]);
  delete process.env.POST_ZEITEN_TIKTOK;
  process.env.POST_ZEITEN = 'aus';
  assert.equal(jetztPosten('TikTok', 9), true);
  delete process.env.POST_ZEITEN;
});

test('Doppel-Post-Schutz: gleiches Produkt nicht zweimal in 24 h auf demselben Kanal', () => {
  const jetzt = Date.parse('2026-10-02T12:00:00Z');
  const posts = [{ plattform: 'Telegram', produkt: produktSchluessel('DeskRebel PowerBand – Klimmzugband'), gepostet: '2026-10-02T08:00:00Z' }];
  assert.equal(kuerzlichGepostet(posts, 'Telegram', 'DeskRebel PowerBand – Tu mejora para dominadas', { jetzt }), true, 'auch in anderer Sprache dasselbe Produkt');
  assert.equal(kuerzlichGepostet(posts, 'Bluesky', 'DeskRebel PowerBand – X', { jetzt }), false);
  assert.equal(kuerzlichGepostet(posts, 'Telegram', 'Purivelle LotusTap – X', { jetzt }), false);
  assert.equal(kuerzlichGepostet(posts, 'Telegram', 'DeskRebel PowerBand – X', { jetzt: jetzt + 25 * 36e5 }), false);
});

test('Saison-Kalender: bewegliche Anlaesse richtig berechnet, Hinweis ehrlich', () => {
  const a = anlaesse(2026);
  assert.equal(a.find((x) => x.name === 'Muttertag').bis.toISOString().slice(0, 10), '2026-05-10');
  assert.equal(a.find((x) => x.name === 'Black Week').von.toISOString().slice(0, 10), '2026-11-20');
  assert.equal(saisonJetzt(new Date('2026-01-05T12:00Z')).name, 'Neujahrsvorsätze');
  assert.equal(saisonJetzt(new Date('2026-12-10T12:00Z')).name, 'Advent & Weihnachten');
  assert.match(saisonHinweis(new Date('2026-11-25T12:00Z')), /NUR, wenn der Shop wirklich einen hat/);
  assert.match(saisonHinweis(new Date('2026-11-25T12:00Z')), /keine erfundenen Rabatte/);
});

test('neue Formate (Story, Challenge, Meme, Schnelle Antworten) werden ausprobiert; Meme nie mit Labor-Hook', () => {
  for (const n of ['story', 'challenge', 'meme', 'fragen']) assert.ok(FORMATE[n], n);
  const leer = { format: {} };
  const gesehen = new Set(Array.from({ length: 40 }, (_, t) => formatWaehlen({ handle: 'x' }, { lernstand: leer, tag: t }).name));
  assert.ok(['story', 'challenge', 'meme', 'fragen'].every((n) => gesehen.has(n)));
  for (let t = 0; t < 40; t++) assert.notEqual(formatWaehlen({ handle: 'x' }, { lernstand: leer, tag: t, mitHook: true }).name, 'meme');
});
