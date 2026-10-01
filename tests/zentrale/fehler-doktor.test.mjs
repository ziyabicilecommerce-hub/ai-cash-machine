// Fehler-Doktor: erkennt die Ursache aus echten GitHub-Logs und sagt, wer es loest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagnose } from '../../automations/lib/fehlerDoktor.mjs';

const log = (...z) => z.map((x) => `2026-10-01T20:07:06.3878387Z ${x}`).join('\n');

test('KI-Limit: heilt sich selbst (eigene KI), Tipp Gemini', () => {
  const d = diagnose(log('[94-video-fabrik] ✗ "Purivelle LotusTap": Beide kostenlosen KI-Dienste nicht verfügbar - Pollinations: Pollinations-Fehler 402: {}; LLM7: LLM7-Fehler 429: {"error":{"message":"Daily token quota exceeded."}}', '##[error]Process completed with exit code 1.'));
  assert.equal(d.art, 'ki-limit');
  assert.equal(d.selbst, true);
  assert.match(d.loesung, /GEMINI_API_KEY/);
  assert.match(d.beleg, /LotusTap/);
});

test('Abgelaufener Zugang: braucht dich und nennt den Schluessel', () => {
  const d = diagnose(log('[99-direkt-poster] Instagram: 401 Error validating access token: Session has expired (META_ACCESS_TOKEN)', '##[error]Process completed with exit code 1.'));
  assert.deepEqual([d.art, d.selbst, d.secret], ['zugang', false, 'META_ACCESS_TOKEN']);
  assert.match(d.loesung, /META_ACCESS_TOKEN/);
});

test('Netz-Wackler und Push-Konflikt heilen sich selbst', () => {
  assert.equal(diagnose(log('Error: fetch failed', 'cause: ECONNRESET')).art, 'netz');
  const k = diagnose(log(' ! [rejected]        main -> main (fetch first)', 'error: failed to push some refs to github.com'));
  assert.deepEqual([k.art, k.selbst], ['konflikt', true]);
});

test('Programmfehler mit Beleg, Zeitlimit, Unbekanntes', () => {
  const c = diagnose(log("file:///home/runner/work/x/automations/08-trend-scout.mjs:40", "SyntaxError: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON", '##[error]Process completed with exit code 1.'));
  assert.deepEqual([c.art, c.selbst], ['code', false]);
  assert.match(c.beleg, /SyntaxError/);
  assert.equal(diagnose(log('##[error]The job running on runner X has exceeded the maximum execution time of 30 minutes.')).art, 'zeit');
  const u = diagnose(log('alles komisch', '##[error]Process completed with exit code 3.'));
  assert.deepEqual([u.art, u.selbst], ['unbekannt', false]);
  assert.equal(diagnose('').art, 'unbekannt');
});
