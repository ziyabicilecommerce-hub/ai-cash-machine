// Formate, Trend-Radar und echte Zahlen im Werbe-Labor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FORMATE, formatWaehlen, trendHinweis, winkelAus, skriptMitFormat } from '../../automations/lib/formate.mjs';
import { trendsLesen, passt } from '../../automations/trend-radar.mjs';
import '../../zentrale/js/labor.js';

test('formatWaehlen probiert neue Formate je Produkt versetzt, danach gewinnt das beste', () => {
  const leer = { format: {} };
  const a = formatWaehlen({ handle: 'powerband' }, { lernstand: leer, tag: 1 }).name;
  const b = formatWaehlen({ handle: 'backease' }, { lernstand: leer, tag: 1 }).name;
  assert.ok(FORMATE[a] && FORMATE[b]);
  assert.notEqual(formatWaehlen({ handle: 'powerband' }, { lernstand: leer, tag: 2 }).name, a, 'naechster Tag, naechstes Format');
  const viel = { format: Object.fromEntries(Object.keys(FORMATE).map((n) => [n, { n: 40, punkte: n === 'mythos' ? 0.8 : -0.2 }])) };
  assert.equal(formatWaehlen({ handle: 'x' }, { lernstand: viel }).name, 'mythos');
  for (let t = 0; t < 20; t++) assert.ok(!['pov', 'check'].includes(formatWaehlen({ handle: 'x' }, { lernstand: leer, tag: t, mitHook: true }).name), 'Labor-Hook bleibt Szene 1');
});

test('trendHinweis nur frisch und nur mit passenden Trends', () => {
  const pfad = join(mkdtempSync(join(tmpdir(), 'tr-')), 'trends.json');
  const jetzt = Date.parse('2026-10-02T08:00:00Z');
  writeFileSync(pfad, JSON.stringify({ stand: '2026-10-02T03:30:00Z', passend: ['Rückenschmerzen Homeoffice'] }));
  assert.match(trendHinweis(pfad, jetzt), /Rückenschmerzen Homeoffice.*NUR auf, wenn es ehrlich/);
  assert.equal(trendHinweis(pfad, jetzt + 3 * 864e5), '', 'alter Trend zaehlt nicht');
  assert.equal(trendHinweis(join(pfad, 'fehlt'), jetzt), '');
});

test('Trend-Radar liest Google-Trends-RSS und filtert nach Nische', () => {
  const xml = `<rss><channel><item><title>Bundesliga</title><ht:approx_traffic>500.000+</ht:approx_traffic></item>
    <item><title><![CDATA[Yoga am Morgen]]></title><ht:approx_traffic>20.000+</ht:approx_traffic><ht:news_item_title>Dehnen hilft</ht:news_item_title></item></channel></rss>`;
  const t = trendsLesen(xml);
  assert.equal(JSON.stringify(t.map((x) => [x.titel, x.verkehr])), '[["Bundesliga",500000],["Yoga am Morgen",20000]]');
  assert.equal(JSON.stringify(t.filter((x) => passt(x)).map((x) => x.titel)), '["Yoga am Morgen"]');
});

test('skriptMitFormat gibt Winkel, Format und Trend an den Skript-Bauer und merkt sie sich', async () => {
  let prompt = '';
  const s = await skriptMitFormat({ handle: 'p' }, 'Beginne GENAU mit ... Kauf-Psychologie: Schmerz-Vermeidung. ', async (p, w) => { prompt = w; return { szenen: [] }; });
  assert.equal(s.winkelName, 'Schmerz-Vermeidung');
  assert.ok(FORMATE[s.formatName] && prompt.includes(FORMATE[s.formatName]));
  assert.equal(winkelAus(''), '');
});

test('Werbe-Labor: echte Zahlen verschieben die Jury-Note, je mehr Messungen desto staerker', () => {
  const { echtBonus, auswerten, WINKEL, JURY } = globalThis.ZLabor;
  assert.equal(echtBonus({ [WINKEL[0].name]: { n: 20, punkte: 0.5 } }, WINKEL[0].name), 1);
  assert.equal(echtBonus({ [WINKEL[0].name]: { n: 2, punkte: 0.5 } }, WINKEL[0].name), 0.2);
  assert.equal(echtBonus(null, 'x'), 0);
  const hooks = ['Hook A ist gut', 'Hook B ist gut'];
  const jury = { werte: JURY.map(() => [7, 7.5]) };
  const ohne = auswerten(hooks, jury, { titel: 'X' });
  const mit = auswerten(hooks, jury, { titel: 'X' }, { [WINKEL[0].name]: { n: 30, punkte: 0.9 } });
  assert.equal(ohne.gewinner.hook, 'Hook B ist gut');
  assert.equal(mit.gewinner.hook, 'Hook A ist gut', 'echte Zahlen schlagen die simulierte Jury');
  assert.equal(mit.gewinner.quelle, 'Jury');
});
