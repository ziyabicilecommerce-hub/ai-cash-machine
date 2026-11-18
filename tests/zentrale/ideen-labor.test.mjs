import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDEEN, tagAuswerten, naechsteIdee, normal, ergebnis, fehlerSuchen, ideeFuer, hookNachIdee } from '../../automations/lib/ideenLabor.mjs';

const T = 864e5;
const JETZT = Date.parse('2026-11-20T12:00:00Z');
const post = (tageAlt, aufrufe, sehdauer = 4, konto = '@desk.rebel', text = '') =>
  ({ zeit: new Date(JETZT - tageAlt * T).toISOString(), konto, aufrufe, sehdauer, text: text || `Video ${tageAlt} ${aufrufe}` });
// 10 alte Videos um 100 Aufrufe = normales Niveau
const alt = Array.from({ length: 10 }, (_, i) => post(5 + i * 0.5, 90 + i * 2));

test('Start: ohne Stand beginnt jeder Kanal mit der Standard-Idee und merkt sich das normale Niveau', () => {
  const r = tagAuswerten(null, alt, 'desk.rebel', JETZT);
  assert.equal(r.urteil, 'start');
  assert.equal(r.stand.idee, IDEEN[0].id);
  assert.equal(r.stand.basis, normal(alt, 'desk.rebel', JETZT));
  assert.ok(r.stand.basis >= 90 && r.stand.basis <= 110);
});

test('Vor Ablauf von 2 Tagen oder mit zu wenig Videos wird nur gesammelt', () => {
  const stand = { idee: 'akte', seit: new Date(JETZT - 1 * T).toISOString(), basis: 100, status: 'läuft', verlauf: [] };
  assert.equal(tagAuswerten(stand, [...alt, post(0.9, 500), post(0.95, 500), post(0.92, 500)], 'desk.rebel', JETZT).urteil, 'warten');
  const stand2 = { ...stand, seit: new Date(JETZT - 3 * T).toISOString() };
  assert.equal(tagAuswerten(stand2, [...alt, post(2, 50), post(1.5, 50)], 'desk.rebel', JETZT).urteil, 'warten', 'nur 2 Videos');
});

test('Jackpot: deutlich über normal -> Idee bleibt, neues Normal = Jackpot-Wert', () => {
  const stand = { idee: 'akte-du', seit: new Date(JETZT - 2.5 * T).toISOString(), basis: 100, status: 'läuft', verlauf: [] };
  const r = tagAuswerten(stand, [...alt, post(2, 180), post(1.5, 160), post(1, 170)], 'desk.rebel', JETZT);
  assert.equal(r.urteil, 'jackpot');
  assert.equal(r.stand.idee, 'akte-du');
  assert.equal(r.stand.status, 'jackpot');
  assert.equal(r.stand.basis, 170);
  // hält am nächsten Tag (über 80 % vom neuen Normal)
  const r2 = tagAuswerten(r.stand, [...alt, post(2, 150), post(1.5, 150), post(1, 150)], 'desk.rebel', JETZT);
  assert.equal(r2.urteil, 'jackpot-hält');
});

test('Kein Erfolg -> nach 2 Tagen nächste Idee, Ergebnis landet im Verlauf', () => {
  const stand = { idee: 'akte', seit: new Date(JETZT - 2.2 * T).toISOString(), basis: 100, status: 'läuft', verlauf: [] };
  const r = tagAuswerten(stand, [...alt, post(2, 90), post(1.5, 100), post(1, 95)], 'desk.rebel', JETZT);
  assert.equal(r.urteil, 'gewechselt');
  assert.notEqual(r.stand.idee, 'akte');
  assert.equal(r.stand.verlauf.at(-1).idee, 'akte');
  assert.equal(r.stand.verlauf.at(-1).urteil, 'kein Erfolg');
  assert.equal(r.stand.status, 'läuft');
});

test('Abgestürzter Jackpot wird gewechselt', () => {
  const stand = { idee: 'klassik', seit: new Date(JETZT - 6 * T).toISOString(), basis: 200, status: 'jackpot', verlauf: [] };
  const r = tagAuswerten(stand, [...alt, post(2, 90), post(1.5, 100), post(1, 95)], 'desk.rebel', JETZT);
  assert.equal(r.urteil, 'gewechselt');
  assert.equal(r.stand.verlauf.at(-1).urteil, 'abgestürzt');
});

test('Nächste Idee: nie probierte zuerst, dann die am längsten nicht probierte - nie die aktuelle', () => {
  assert.equal(naechsteIdee({ idee: 'akte', verlauf: [] }), IDEEN[1].id);
  const alle = IDEEN.map((i) => ({ idee: i.id }));
  assert.equal(naechsteIdee({ idee: IDEEN.at(-1).id, verlauf: alle }), IDEEN[0].id);
});

test('Zu junge Videos (unter 20 Std.) und doppelte Einträge zählen nicht', () => {
  const seit = new Date(JETZT - 3 * T).toISOString();
  const e = ergebnis([post(2, 100, 4, '@desk.rebel', 'A'), post(2.01, 100, 4, '@desk.rebel', 'A'), post(0.3, 9999)], 'desk.rebel', seit, JETZT);
  assert.equal(e.n, 1);
  assert.equal(e.aufrufe, 100);
});

test('Fehlersuche: kein Post, kurze Sehdauer, kaum ausgespielt, Nullen', () => {
  assert.ok(fehlerSuchen([], 'desk.rebel', { n: 0 }, 100, JETZT).some((f) => /kein Video/.test(f)));
  assert.ok(fehlerSuchen([post(0.2, 10)], 'desk.rebel', { n: 3, aufrufe: 80, sehdauer: 2.1 }, 100, JETZT).some((f) => /wischen/.test(f)));
  assert.ok(fehlerSuchen([post(0.2, 10)], 'desk.rebel', { n: 3, aufrufe: 30, sehdauer: 6 }, 100, JETZT).some((f) => /ausgespielt|zu sehen/.test(f)));
  assert.ok(fehlerSuchen([post(1, 0), post(2, 0), post(0.2, 5)], 'desk.rebel', { n: 0 }, 100, JETZT).some((f) => /0 Aufrufen/.test(f)));
});

test('Video-Bots: Einstellungen der laufenden Idee, Standard ohne Labor', () => {
  assert.deepEqual(ideeFuer({}, 'desk.rebel'), {});
  assert.deepEqual(ideeFuer({ kanaele: { 'giyuuu sama': { idee: 'klassik' } } }, 'giyuuu sama'), { stil: 'klassik' });
  assert.deepEqual(ideeFuer({ kanaele: { futureflowx3: { idee: 'akte-direkt' } } }, '@futureflowx3'), { akte: null });
  assert.equal(hookNachIdee({ hookArt: 'du' }, { hook: 'Ich', hook2: 'Wenn du' }, 'Ich'), 'Wenn du');
  assert.equal(hookNachIdee({}, { hook: 'Ich', hook2: 'Wenn du' }, 'Ich'), 'Ich');
});

test('Fehlersuche verträgt "fehler" als Zahl (so steht es in daten.json)', () => {
  assert.doesNotThrow(() => tagAuswerten({ idee: 'akte', seit: new Date(JETZT - T).toISOString(), basis: 100, status: 'läuft', verlauf: [] }, alt, 'desk.rebel', JETZT, 1));
});
