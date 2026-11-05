import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zustand, darf, slotAus, HAUPTKONTO } from '../../automations/lib/tiktokRettung.mjs';

const JETZT = Date.parse('2026-11-15T12:00:00Z');
const post = (konto, tage, aufrufe) => ({ konto: `@${konto}`, zeit: new Date(JETZT - tage * 864e5).toISOString(), aufrufe });

test('Hauptkonto postet immer, Nebenkonten in Schonung nur abends und ohne Fakten', () => {
  assert.equal(HAUPTKONTO, 'futureflowx3');
  assert.equal(zustand('@futureflowx3', [], JETZT).modus, 'haupt');
  const z = zustand('zyx_7851', [2, 3, 4, 5, 6].map((t) => post('zyx_7851', t, 3)), JETZT);
  assert.equal(z.modus, 'schonung');
  assert.equal(darf(z.modus, 'abend'), true); assert.equal(darf(z.modus, 'nacht'), false); assert.equal(darf(z.modus, 'fakten'), false);
  assert.equal(darf('haupt', 'nacht'), true); assert.equal(darf('haupt', 'fakten'), true);
});

test('Erholt sich automatisch ab Ø 50 aus mind. 5 Videos der letzten 7 Tage', () => {
  assert.equal(zustand('zyx_7851', [2, 3, 4, 5, 6].map((t) => post('zyx_7851', t, 80)), JETZT).modus, 'normal');
  assert.equal(zustand('zyx_7851', [2, 3, 4, 5].map((t) => post('zyx_7851', t, 80)), JETZT).modus, 'schonung', 'zu wenig Videos');
  assert.equal(zustand('zyx_7851', [0.2, 9, 10, 11, 12].map((t) => post('zyx_7851', t, 900)), JETZT).modus, 'schonung', 'zu frisch / zu alt zählt nicht');
  assert.equal(slotAus(20), 'abend'); assert.equal(slotAus(2), 'nacht');
});
