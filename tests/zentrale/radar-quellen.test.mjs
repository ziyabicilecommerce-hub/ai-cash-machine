import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEGRIFFE, anstieg, wikiRadar, kpAus, himmelRadar, youtubeRadar, radarThemen } from '../../automations/lib/radarQuellen.mjs';

const antwort = (daten, ok = true) => Promise.resolve({ ok, status: ok ? 200 : 404, json: async () => daten });

test('Begriffe: eindeutig, mit Artikel und Thema', () => {
  assert.ok(BEGRIFFE.length >= 25);
  assert.equal(new Set(BEGRIFFE.map((b) => b.name)).size, BEGRIFFE.length);
  for (const b of BEGRIFFE) assert.ok(b.de && b.en && b.thema, b.name);
});

test('anstieg: letzte 3 Tage gegen 14 Tage davor, zu wenig Aufrufe zählt nicht', () => {
  assert.deepEqual(anstieg([...Array(14).fill(100), 300, 300, 300]), { anstieg: 3, proTag: 300 });
  assert.equal(anstieg([...Array(14).fill(10), 20, 20, 20]), null);
  assert.equal(anstieg([1, 2]), null);
});

test('wikiRadar: DE+EN addiert, Aufsteiger zuerst, kaputte Artikel stören nicht', async () => {
  const begriffe = [{ name: 'A', de: 'A', en: 'A_en', thema: 'a' }, { name: 'B', de: 'B', en: 'B_en', thema: 'b' }];
  const laden = (url) => {
    if (url.includes('/de.wikipedia/') && url.includes('/A/')) return antwort(null, false);
    const hoch = url.includes('/B');
    return antwort({ items: [...Array(14).fill(100), ...Array(3).fill(hoch ? 500 : 110)].map((views) => ({ views })) });
  };
  const r = await wikiRadar({ laden, begriffe, jetzt: new Date('2026-11-08T12:00:00Z') });
  assert.deepEqual(r.map((x) => x.name), ['B', 'A']);
  assert.equal(r[0].proTag, 1000);  // DE + EN
});

test('Satellit: Kp aus Tabelle oder Objekten, Polarlicht ab 6, Ausfall ohne Fehler', async () => {
  assert.equal(kpAus([['time_tag', 'Kp'], ['2026-11-08 09:00', '6.33']]), 6.33);
  assert.equal(kpAus([{ time_tag: 'x', Kp: 2 }]), 2);
  assert.equal(kpAus('kaputt'), null);
  const h = await himmelRadar({ laden: (u) => (u.includes('swpc') ? antwort([['t', 'Kp'], ['x', '7']]) : antwort(null, false)) });
  assert.equal(h.polarlicht, true);
  assert.equal(h.nasa, '');
});

test('YouTube nur mit Schlüssel', async () => {
  assert.deepEqual(await youtubeRadar({ key: '' }), { an: false, de: [], en: [] });
  const y = await youtubeRadar({ key: 'k', laden: () => antwort({ items: [{ snippet: { title: 'Don&#39;t open it' } }] }) });
  assert.deepEqual(y.en, ["Don't open it"]);
});

test('radarThemen: Polarlicht und starke Aufsteiger werden Themen', () => {
  const t = radarThemen({ wiki: [{ name: 'X', thema: 'x', anstieg: 2 }, { name: 'Y', thema: 'y', anstieg: 1.0 }], himmel: { polarlicht: true } });
  assert.deepEqual(t.map((x) => x.quelle), ['satellit', 'wikipedia']);
});
