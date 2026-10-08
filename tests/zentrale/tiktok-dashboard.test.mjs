// TikTok-Viral-Zentrale (#103): Kennzahlen, Konten, geplante Posts und Tipps aus Buffer-Posts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dashboardDaten, tippsAus } from '../../automations/lib/tiktokDashboard.mjs';

const jetzt = Date.parse('2026-10-20T12:00:00Z');
const m = (views, sek, kom = 0, likes = 0) => [{ type: 'views', value: views }, { type: 'averageTimeWatched', value: sek }, { type: 'comments', value: kom }, { type: 'reactions', value: likes }];
const kanaele = [{ id: 'k1', name: 'zyx_7851' }, { id: 'k2', name: 'futureflowxx' }];
const posts = [
  { id: '1', status: 'sent', channelId: 'k1', sentAt: '2026-10-19T10:00:00Z', text: 'Welcher Planet? #weltall', externalLink: 'https://tiktok.com/@zyx_7851/video/1', metrics: m(1000, 9, 12, 50) },
  { id: '2', status: 'sent', channelId: 'k2', sentAt: '2026-10-10T10:00:00Z', text: 'Honig verdirbt nie. Wahr oder Mythos?', externalLink: 'javascript:alert(1)', metrics: m(100, 5, 0, 3) },
  { id: '3', status: 'scheduled', channelId: 'k2', dueAt: '2026-10-20T17:00:00Z', text: 'Nächstes Video' },
  { id: '4', status: 'error', channelId: 'k1', dueAt: '2026-10-18T17:00:00Z', text: 'kaputt' },
];

test('dashboardDaten: Summen, Wochenvergleich, Konten, sichere Links', () => {
  const d = dashboardDaten({ posts, kanaele, nischen: { zyx_7851: ['Weltall'] }, serien: { '@zyx_7851': 4 }, jetzt });
  assert.equal(d.gesamt.aufrufe, 1100);
  assert.equal(d.gesamt.aufrufe7, 1000);
  assert.equal(d.gesamt.aufrufeVor7, 100);
  assert.equal(d.gesamt.sehdauer, 7);
  assert.equal(d.konten[0].name, '@zyx_7851');
  assert.deepEqual(d.konten[0].nische, ['Weltall']);
  assert.equal(d.konten[0].serie, 4);
  assert.equal(d.konten[0].bester.aufrufe, 1000);
  assert.equal(d.geplant.length, 1);
  assert.equal(d.fehler, 1);
  assert.equal(d.letzte.find((z) => z.konto === '@futureflowxx').link, '', 'nur echte TikTok-Links');
  assert.equal(d.letzte.find((z) => z.konto === '@futureflowxx').format, 'mythos');
  assert.equal(d.letzte[0].text, 'Welcher Planet?', 'erste Zeile ohne Hashtags');
});

test('tippsAus: warnt bei kurzer Sehdauer, wenig Kommentaren, leerer Warteschlange und Fehlern', () => {
  const t = tippsAus({ aufrufe: 1000, sehdauer: 6, kommentare: 2 }, [], [], 2).map((x) => x.text).join(' | ');
  assert.match(t, /Sehdauer nur 6 s/);
  assert.match(t, /Kommentar/);
  assert.match(t, /Keine TikTok-Posts geplant/);
  assert.match(t, /2 Post\(s\)/);
  assert.match(tippsAus({ aufrufe: 0 }, [], [{}], 0)[0].text, /Noch keine Zahlen/);
});

test('dashboardDaten: warnt, wenn Buffer für ältere Posts keine Zahlen mehr abholt', () => {
  const alt = { id: 'x', status: 'sent', channelId: 'k1', sentAt: '2026-10-19T22:19:00Z', metricsUpdatedAt: '2026-10-19T22:18:00Z', text: 'a', metrics: m(0, 0) };
  const frisch = { id: 'y', status: 'sent', channelId: 'k1', sentAt: '2026-10-20T10:00:00Z', metricsUpdatedAt: '2026-10-20T09:59:00Z', text: 'b', metrics: m(0, 0) };
  const d = dashboardDaten({ posts: [alt, frisch], kanaele, jetzt });
  assert.equal(d.ohneZahlen, 1);
  assert.match(d.tipps.map((t) => t.text).join(' '), /Buffer holt für 1 Post/);
});
