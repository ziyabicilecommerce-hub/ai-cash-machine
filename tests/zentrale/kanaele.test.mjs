// Plattform 14/15 (X, Tumblr): OAuth-1.0a-Signatur gegen das offizielle X-Rechenbeispiel, Kanal-Status.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { oauthHeader, x, tumblr } from '../../automations/lib/plattformen3.mjs';
import { statusSchreiben } from '../../automations/lib/kanalStatus.mjs';

test('OAuth 1.0a: Signatur stimmt mit dem offiziellen Beispiel der X-Dokumentation ueberein', () => {
  const h = oauthHeader({
    methode: 'POST', url: 'https://api.twitter.com/1.1/statuses/update.json?include_entities=true',
    parameter: { status: 'Hello Ladies + Gentlemen, a signed OAuth request!' },
    schluessel: 'xvz1evFS4wEEPTGEFPHBog', geheim: 'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
    token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb', tokenGeheim: 'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
    nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg', zeit: 1318622958,
  });
  assert.match(h, /oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"/);
  assert.match(h, /^OAuth oauth_consumer_key="xvz1evFS4wEEPTGEFPHBog"/);
});

test('X und Tumblr sind ohne Zugangsdaten nicht bereit', () => {
  for (const k of ['X_API_KEY', 'TUMBLR_CONSUMER_KEY']) delete process.env[k];
  assert.equal(x.bereit(), false);
  assert.equal(tumblr.bereit(), false);
  assert.equal(x.name, 'X');
  assert.equal(tumblr.name, 'Tumblr');
});

test('Kanal-Status: verbunden/Zaehler/Fehler, keine Geheimnisse, kein Schreiben ohne Aenderung', () => {
  const pfad = join(mkdtempSync(join(tmpdir(), 'kan-')), 'kanaele.json');
  process.env.X_API_KEY = 'geheim-123';
  statusSchreiben([{ name: 'Telegram', verbunden: true, heute: 2, limit: 5, ok: '2026-10-02T08:00:00Z' }, { name: 'X', verbunden: false, heute: 0, limit: 5 }], { pfad });
  const a = JSON.parse(readFileSync(pfad, 'utf8'));
  assert.equal(a.kanaele.Telegram.letzterErfolg, '2026-10-02T08:00:00Z');
  assert.equal(a.kanaele.X.verbunden, false);
  assert.ok(!readFileSync(pfad, 'utf8').includes('geheim-123'));
  delete process.env.X_API_KEY;
  statusSchreiben([{ name: 'Telegram', verbunden: true, heute: 3, limit: 5, fehler: 'sendVideo: 400', zeit: '2026-10-02T09:00:00Z' }, { name: 'X', verbunden: false, heute: 0, limit: 5 }], { pfad });
  const b = JSON.parse(readFileSync(pfad, 'utf8'));
  assert.equal(b.kanaele.Telegram.letzterFehler.text, 'sendVideo: 400');
  assert.equal(b.kanaele.Telegram.letzterErfolg, '2026-10-02T08:00:00Z', 'letzter Erfolg bleibt erhalten');
  const zeit = statSync(pfad).mtimeMs;
  statusSchreiben([{ name: 'Telegram', verbunden: true, heute: 3, limit: 5 }, { name: 'X', verbunden: false, heute: 0, limit: 5 }], { pfad, jetzt: new Date('2030-01-01') });
  assert.equal(JSON.parse(readFileSync(pfad, 'utf8')).stand, b.stand, 'unveraendert = nicht neu geschrieben');
  assert.ok(statSync(pfad).mtimeMs >= zeit);
});

test('Zentrale-Anleitung deckt genau 15 Plattformen ab und jede hat Zugangswerte', async () => {
  globalThis.window = globalThis;
  globalThis.ZUI = { h: (x) => String(x), kopieren: () => {}, datum: (x) => x };
  await import('../../zentrale/js/views-i.js');
  const K = globalThis.ZViews.kanaele15.KANAELE;
  assert.equal(K.length, 15);
  assert.equal(new Set(K.map((k) => k.name)).size, 15);
  assert.ok(K.every((k) => k.werte.length && k.schritte.length && k.link));
});

test('KI-Kette: Pollinations 402 -> Gemini springt ein; ohne Schluessel weiter zur alten Kette', async () => {
  const { kiTextEinmal } = await import('../../automations/lib/kiJson.mjs');
  const echt = globalThis.fetch;
  const gefragt = [];
  globalThis.fetch = async (url) => {
    const u = String(url); gefragt.push(new URL(u).hostname);
    if (u.includes('pollinations')) return new Response('{}', { status: 402 });
    if (u.includes('generativelanguage')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":1}' }] } }] }));
    return new Response('{}', { status: 500 });
  };
  process.env.GEMINI_API_KEY = 'gratis';
  try {
    assert.equal(await kiTextEinmal('Hallo', { maxTokens: 50 }), '{"ok":1}');
    assert.equal(JSON.stringify(gefragt), '["text.pollinations.ai","generativelanguage.googleapis.com"]');
  } finally { globalThis.fetch = echt; delete process.env.GEMINI_API_KEY; }
  assert.equal(globalThis.ZViews.kanaele15.KI.length, 3);
});
