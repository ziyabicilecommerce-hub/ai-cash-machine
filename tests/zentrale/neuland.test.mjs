// NEULAND-Bruecke: derselbe Rechenmotor wie im Browser, gefuettert mit echten Daten der Cash Machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motorenLaden, belegeEingabe, rechteEingabe, vorhabenEingabe, versucheEingabe, allesRechnen, BAUSTEINE } from '../../automations/lib/neuland.mjs';

const T = motorenLaden();
const jetzt = Date.parse('2026-10-02T12:00:00Z');

test('alle 17 Rechenmotoren der 19 NEULAND-Werkzeuge laden', () => {
  for (const id of ['ProfitLeaks', 'RunwayRadar', 'CapacityTwin', 'BreakEvenMap', 'ConcentrationWatch', 'FeeDetective', 'ReturnPatternMap', 'StressMatrix', 'PromiseCheck', 'RightsLedger', 'EvidenceDebt', 'RenewalCalendar', 'LaunchCompass', 'ExperimentLab', 'ValueMap', 'ExperimentSamplePlanner', 'DecisionJournal']) assert.equal(typeof T[id]?.run, 'function', id);
});

test('Belegprobe: nur Werbung mit Shop-Link, Werbe-Check-Sperre = Pruefung offen', () => {
  const feed = [
    { datei: 'a.mp4', titel: 'PowerBand Upgrade', caption: 'x 👉 https://www.deskrebel.store/products/powerband?utm_source=x', erstellt: '2026-10-01T10:00:00Z' },
    { datei: 'b.mp4', titel: 'Rückenfrei mit Purivelle', caption: '👉 https://purivelle.store/products/backease', erstellt: '2026-10-01T10:00:00Z' },
    { datei: 'c.mp4', titel: 'Kage no Shiro – Folge 1', caption: 'Anime', erstellt: '2026-10-01T10:00:00Z' },
    { datei: 'd.mp4', titel: 'Alt', caption: 'https://purivelle.store/products/x', erstellt: '2026-09-01T10:00:00Z' },
  ];
  const e = belegeEingabe(feed, new Set(['b.mp4']), { jetzt });
  assert.deepEqual(e.claims.map((c) => [c.text, c.evidence_url, c.verified]), [['PowerBand Upgrade', 'https://www.deskrebel.store/products/powerband', true], ['Rückenfrei mit Purivelle', 'https://purivelle.store/products/backease', false]]);
  const r = allesRechnen(T, { PromiseCheck: { eingabe: e, quelle: 'test' } }).PromiseCheck;
  assert.equal(JSON.stringify(r.metrics.map((m) => m.value)), '[2,1,1]', 'Beleglinks gueltig (URL im Motor verfuegbar)');
});

test('Rechtebuch: ehrliche Lizenzlage der Video-Bausteine (Wav2Lip, edge-tts, Pollinations offen)', () => {
  const r = allesRechnen(T, { RightsLedger: { eingabe: rechteEingabe('2026-10-02'), quelle: 'test' } }).RightsLedger;
  assert.equal(r.metrics[0].value, BAUSTEINE.length);
  assert.equal(r.metrics[1].value, 3);
  assert.ok(r.rows.some((x) => /Wav2Lip/.test(x.Inhalt) && x.Freigabe === 'Fehlt'));
});

test('Vorhabenwaage: unverbundene Kanaele und fehlende Schluessel, Gemini zuerst', () => {
  const e = vorhabenEingabe({ Telegram: { verbunden: true } }, { gemini: false, pollinations: true });
  assert.ok(!e.priorities.some((p) => /Telegram/.test(p.name)));
  assert.ok(!e.priorities.some((p) => /POLLINATIONS/.test(p.name)));
  const r = allesRechnen(T, { ValueMap: { eingabe: e, quelle: 'test' } }).ValueMap;
  assert.match(r.rows[0].Vorhaben, /GEMINI/);
});

test('Versuchsfeld: echte Post-Zahlen je Hook-Typ und Welt-Bot-Sprache, ohne Zahlen leer', () => {
  assert.deepEqual(versucheEingabe([]).experiments, []);
  const posts = [
    { datei: 'de.mp4', hookTyp: 'frage', zahlen: { aufrufe: 1000, likes: 40, kommentare: 5, teilen: 5 } },
    { datei: 'de-w.mp4', hookTyp: 'warnung', zahlen: { aufrufe: 800, likes: 60, kommentare: 4, teilen: 0 } },
    { datei: 'en.mp4', hookTyp: 'frage', zahlen: { aufrufe: 500, likes: 10, kommentare: 0, teilen: 0 } },
    { datei: 'x.mp4', hookTyp: 'frage', zahlen: null },
  ];
  const e = versucheEingabe(posts, [{ datei: 'en.mp4', sprache: 'en' }]);
  const namen = e.experiments.map((x) => x.name);
  assert.deepEqual(namen, ['Hook: warnung vs. frage', 'Sprache: en vs. de']);
  assert.deepEqual([e.experiments[0].control_visitors, e.experiments[0].control_conversions, e.experiments[0].variant_conversions], [1500, 60, 64]);
  const r = allesRechnen(T, { ExperimentLab: { eingabe: e, quelle: 'test' } }).ExperimentLab;
  assert.equal(r.rows.length, 2);
});

test('ein kaputter Rechner stoppt die anderen nicht', () => {
  const r = allesRechnen(T, { ProfitLeaks: { eingabe: { orders: 'kaputt' } }, ValueMap: { eingabe: vorhabenEingabe({}), quelle: 'x' } });
  assert.ok(r.ProfitLeaks.fehler);
  assert.ok(r.ValueMap.rows.length > 0);
});
