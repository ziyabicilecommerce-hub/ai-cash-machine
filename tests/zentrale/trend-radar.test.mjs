import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rssTitel, redditTitel, sichereTrends, inspiration, saisonThemen, themenHeute } from '../../automations/lib/trendRadar.mjs';

test('Google-Trends: nur harmlose Alltagsthemen, nie echte Unglücke oder Personen', () => {
  const xml = '<rss><item><title>Zeitumstellung 2026</title></item><item><title><![CDATA[Unfall auf der A3: zwei Tote]]></title></item><item><title>Bundesliga</title></item><item><title>Vollmond November</title></item><item><title>Kanzler Rede Sturm</title></item></rss>';
  const t = rssTitel(xml);
  assert.equal(t.length, 5);
  assert.deepEqual(sichereTrends(t), ['Zeitumstellung 2026', 'Vollmond November']);
});

test('Reddit nur als Stimmung, Saison immer da, Themen ohne Doppelte', () => {
  const r = redditTitel({ data: { children: [{ data: { title: 'My neighbor waves every night' } }, { data: { title: 'The kid next door went missing - mord' } }] } });
  assert.deepEqual(inspiration(r), ['My neighbor waves every night']);
  for (let m = 1; m <= 12; m++) assert.ok(saisonThemen(m).length >= 3 && saisonThemen(m).every((x) => !/kind|schul/i.test(x)), `Monat ${m}`);
  const th = themenHeute({ trends: ['Nebel morgen früh'], reddit: r, monat: 11, anzahl: 3 });
  assert.equal(th.length, 3);
  assert.deepEqual(th[0], { thema: 'Nebel morgen früh', inspiration: 'My neighbor waves every night', quelle: 'google-trends' });
  assert.equal(th[1].quelle, 'saison');
  assert.equal(themenHeute({ monat: 12 }).length, 3, 'ohne Netz: Saison');
});

test('Thema landet im KI-Auftrag, ohne gefährliche Zeichen', async () => {
  const { prompt } = await import('../../automations/schatten/horrorKi.mjs');
  const p = prompt([], () => 0, { thema: 'Nebel `$(x)` <b>', inspiration: 'neighbor waves' });
  assert.match(p, /Aktuelles Thema, um das es gehen soll: Nebel \(x\) b/);
  assert.match(p, /NICHT nacherzählen/);
  assert.match(p, /keine Kinder in Gefahr/);
});
