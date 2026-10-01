// Community-Chat-Bot: begruessen, nur Fragen beantworten, Shop-Link nur zum passenden Produkt, Heikles melden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verarbeiten, produktFuer } from '../../automations/lib/communityChat.mjs';

const PRODUKTE = [{ name: 'Purivelle RelaxRoll – Faszienrolle aus EPP-Hartschaum', info: 'Faszienrolle aus EPP, 33 cm.', url: 'https://purivelle.store/products/relaxroll' }, { name: 'DeskRebel PowerBand – Klimmzugband & Widerstandsband', info: 'Latex-Loopband.', url: 'https://www.deskrebel.store/products/powerband' }];
const gruppe = { id: -100, type: 'supergroup' };
const msg = (id, text, extra = {}) => ({ update_id: id, message: { message_id: id, chat: gruppe, from: { first_name: 'Max' }, text, ...extra } });
const jetzt = new Date('2026-10-05T12:00:00Z');

test('neue Mitglieder werden mit der Challenge der Woche begruesst, Bots nicht', async () => {
  const a = await verarbeiten([{ update_id: 1, message: { message_id: 1, chat: gruppe, new_chat_members: [{ first_name: 'Lena' }, { first_name: 'Spam', is_bot: true }] } }], { jetzt, ki: async () => ({}) });
  assert.equal(a.length, 1);
  assert.match(a[0].text, /Willkommen in der Community, Lena!/);
  assert.match(a[0].text, /Diese Woche läuft die /);
  assert.doesNotMatch(a[0].text, /Spam/);
});

test('in der Gruppe nur Fragen beantworten - mit Shop-Link des passenden Produkts, als Antwort auf die Nachricht', async () => {
  const prompts = [];
  const ki = async (p) => { prompts.push(p); return { kategorie: 'kauf', antwort: 'Die gibt es hier: https://purivelle.store/products/relaxroll 🙂' }; };
  const a = await verarbeiten([msg(2, 'Guten Morgen zusammen'), msg(3, 'Wo bekomme ich die Faszienrolle?')], { produkte: PRODUKTE, ki, jetzt, eigenerChat: '999' });
  assert.equal(a.length, 1);
  assert.deepEqual([a[0].typ, a[0].antwortAuf], ['antworten', 3]);
  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /relaxroll/);
});

test('Gesundheitsfragen und fremde Links werden gemeldet, eigener Melde-Chat wird ignoriert', async () => {
  const ki = async () => ({ kategorie: 'frage', antwort: 'Schau mal hier: https://fremd.example/x' });
  const a = await verarbeiten([msg(4, 'Hilft das gegen Bandscheibe?'), msg(5, 'Ist das Klimmzugband gut?'), { update_id: 6, message: { message_id: 6, chat: { id: 999, type: 'private' }, from: { first_name: 'Ich' }, text: 'Test?' } }], { produkte: PRODUKTE, ki, jetzt, eigenerChat: '999' });
  assert.deepEqual(a.map((x) => x.typ), ['melden', 'melden']);
  assert.match(a[0].text, /Gesundheitsfrage/);
  assert.match(a[1].text, /fremden Link/);
});

test('Privatnachrichten: /start begruesst, jede Nachricht wird bewertet; Produkt-Zuordnung', async () => {
  const privat = { id: 7, type: 'private' };
  const a = await verarbeiten([{ update_id: 7, message: { message_id: 7, chat: privat, from: { first_name: 'Ali' }, text: '/start' } }, { update_id: 8, message: { message_id: 8, chat: privat, from: { first_name: 'Ali' }, text: 'Danke für die Tipps' } }], { ki: async () => ({ kategorie: 'lob', antwort: 'Sehr gern, freut uns! 💪' }), jetzt });
  assert.deepEqual(a.map((x) => x.typ), ['antworten', 'antworten']);
  assert.match(a[0].text, /Hey Ali!/);
  assert.equal(produktFuer('Welches Widerstandsband nehme ich für Klimmzüge?', PRODUKTE).url, 'https://www.deskrebel.store/products/powerband');
  assert.equal(produktFuer('Hallo', PRODUKTE), null);
});
