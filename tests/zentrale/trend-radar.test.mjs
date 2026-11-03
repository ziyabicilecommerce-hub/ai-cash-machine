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

test('Ähnlichkeits- und Themen-Check gegen abgeschriebene oder unpassende Geschichten', async () => {
  const { aehnlich, passtZumThema, saeubern, BEISPIEL } = await import('../../automations/schatten/horrorKi.mjs');
  assert.ok(aehnlich('Ich wohne allein. Heute stehen drei Zahnbürsten im Glas.', BEISPIEL.hook) >= 0.6, 'fast gleicher Hook');
  assert.ok(aehnlich('Mein Wecker klingelt um 3:33. Ich habe ihn auf 7 gestellt.', BEISPIEL.hook) < 0.5);
  assert.equal(saeubern({ ...BEISPIEL, hook: 'Ich wohne allein. Heute stehen drei Zahnbürsten im Glas.' }), null);
  const s = { hook: 'Im Nebel hält ein Auto neben mir. Am Steuer sitze ich.', saetze: ['a', 'b', 'c'], ende: 'x' };
  assert.equal(passtZumThema(s, 'Novembernebel auf der Landstraße'), true);
  assert.equal(passtZumThema({ ...s, hook: 'Ich wohne allein.' }, 'Novembernebel auf der Landstraße'), false);
  assert.equal(passtZumThema(s, ''), true, 'ohne Thema immer ok');
});

test('Qualitäts-Sperre: Geschichten der kleinen eigenen KI werden ohne Freigabe nicht genommen', async () => {
  const { neueGeschichte, BEISPIEL } = await import('../../automations/schatten/horrorKi.mjs');
  const gut = { ...BEISPIEL, titel: 'Der Wecker', hook: 'Mein Wecker klingelt um 3:33. Ich habe ihn auf 7 gestellt.' };
  const lokal = async () => gut; lokal.quelle = 'lokal';
  const stark = async () => gut; stark.quelle = 'stark';
  assert.equal(await neueGeschichte(lokal, []), null);
  assert.equal((await neueGeschichte(stark, [])).titel, 'Der Wecker');
  process.env.HORROR_KI_LOKAL = 'an';
  assert.equal((await neueGeschichte(lokal, [])).titel, 'Der Wecker', 'mit Freigabe erlaubt');
  delete process.env.HORROR_KI_LOKAL;
});
