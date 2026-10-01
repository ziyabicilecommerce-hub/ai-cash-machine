// Engpass-Rechnung (NEULAND) und Engpass-Chef des Agenten-Fliessbands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import '../../zentrale/js/engpass.js';
import { messen, entscheiden } from '../../automations/lib/agentenKette.mjs';
import { planWert } from '../../automations/lib/agentenPlan.mjs';

const { analyse, ausbalancieren } = globalThis.ZEngpass;
const BEISPIEL = { auftraege: 45, schritte: [
  { id: 'prep', name: 'Vorbereitung', verfuegbar: 60, jeAuftrag: 1 },
  { id: 'work', name: 'Bearbeitung', verfuegbar: 40, jeAuftrag: 2 },
  { id: 'finish', name: 'Abschluss', verfuegbar: 30, jeAuftrag: 0.75 },
], verschiebung: { von: 'prep', nach: 'work', menge: 12 } };

test('NEULAND-Beispiel: 20 -> 26 Auftraege, Engpass bleibt Bearbeitung, Summe unveraendert', () => {
  const r = analyse(BEISPIEL);
  assert.equal(r.vorher.durchsatz, 20);
  assert.equal(r.nachher.durchsatz, 26);
  assert.equal(r.differenz, 6);
  assert.equal(r.nachher.engpaesse[0].name, 'Bearbeitung');
  assert.equal(r.summe, 130);
  assert.equal(r.offenNachher, 19);
});

test('exakte Bruchrechnung: 0,3 / 0,1 = 3 (kein Gleitkomma-Fehler)', () => {
  const r = analyse({ auftraege: 3, schritte: [{ id: 'a', name: 'A', verfuegbar: 0.3, jeAuftrag: 0.1 }, { id: 'b', name: 'B', verfuegbar: 9, jeAuftrag: 1 }] });
  assert.equal(r.vorher.schritte[0].kapazitaet, 3);
});

test('Eingaben werden geprueft und Ausbalancieren findet den Gleichstand', () => {
  assert.throws(() => analyse({ auftraege: 1, schritte: [{ id: 'a', name: 'A', verfuegbar: 1, jeAuftrag: 1 }] }), /2 bis 12/);
  assert.throws(() => analyse({ ...BEISPIEL, verschiebung: { von: 'prep', nach: 'work', menge: 99 } }), /Höchstens 60/);
  const m = ausbalancieren(BEISPIEL.schritte[0], BEISPIEL.schritte[1]);
  assert.equal(m, 26.7, '(60 - x) / 1 = (40 + x) / 2');
  const r = analyse({ ...BEISPIEL, verschiebung: { von: 'prep', nach: 'work', menge: m } });
  assert.equal(r.nachher.durchsatz, 33);
});

function repo({ videos = [], laeufe = [], labor = {}, posts = [] }) {
  const d = mkdtempSync(join(tmpdir(), 'kette-'));
  const p = { feed: join(d, 'v.json'), pruefung: join(d, 'p.json'), labor: join(d, 'l.json'), posts: join(d, 'po.json') };
  writeFileSync(p.feed, JSON.stringify({ videos })); writeFileSync(p.pruefung, JSON.stringify({ laeufe }));
  writeFileSync(p.labor, JSON.stringify({ produkte: labor })); writeFileSync(p.posts, JSON.stringify(posts));
  return p;
}
const jetzt = Date.parse('2026-10-07T12:00:00Z');
const tag = (n) => new Date(jetzt - n * 864e5).toISOString();

test('Fliessband misst echte Leistung und erkennt den Poster als Engpass ohne Kanal', () => {
  const pfade = repo({
    videos: [0, 1, 2, 3].flatMap((t) => [1, 2, 3, 4, 5].map((k) => ({ datei: `${t}-${k}.mp4`, sprache: 'de', erstellt: tag(t) }))).concat([{ datei: 'x.mp4', sprache: 'fr', erstellt: tag(1) }]),
    laeufe: [0, 1, 2, 3].map((t) => ({ datum: tag(t), ok: 4, repariert: 1 })),
    labor: { a: { erstellt: tag(1), gewinner: { quelle: 'Jury' } }, b: { erstellt: tag(1), gewinner: { quelle: 'Regeln' } } },
  });
  const m = messen({ jetzt, pfade });
  assert.equal(m.leistung.fabrik, 5, 'nur deutsche Produkt-Videos zaehlen');
  assert.equal(m.leistung.pruefer, 5);
  assert.equal(m.leistung.poster, 0);
  const e = entscheiden(m, { ziel: 5 });
  assert.equal(e.engpass.id, 'poster');
  assert.equal(e.plan.fabrikAnzahl, 2);
  assert.equal(e.kiAnfragen.nachher, e.kiAnfragen.vorher, 'KI-Budget bleibt gleich, nur die Verteilung wandert');
  assert.match(e.aufgabe.titel, /Kanal verbinden/);
});

test('Engpass Fabrik: Labor gibt KI-Kontingent ab; alles im Ziel: Ziel steigt', () => {
  const basis = { kanaele: ['Bluesky'], laborQuote: 50 };
  const fabrik = entscheiden({ ...basis, leistung: { labor: 3, fabrik: 2, pruefer: 2, poster: 5, sammler: 5 } }, { ziel: 5 });
  assert.equal(fabrik.engpass.id, 'fabrik');
  assert.equal(fabrik.plan.laborAnzahl, 3);
  assert.ok(fabrik.plan.fabrikAnzahl > 5);
  assert.equal(fabrik.kiAnfragen.nachher, (6 + 5) * 3);
  const gut = entscheiden({ ...basis, leistung: { labor: 3, fabrik: 6, pruefer: 6, poster: 6, sammler: 6 } }, { ziel: 5 });
  assert.equal(gut.plan.fabrikAnzahl, 6);
  assert.equal(gut.aufgabe, null);
});

test('planWert: frischer Plan zaehlt, alter oder fehlender nicht', () => {
  const pfad = join(mkdtempSync(join(tmpdir(), 'plan-')), 'plan.json');
  assert.equal(planWert('fabrikAnzahl', 5, { pfad }), 5);
  writeFileSync(pfad, JSON.stringify({ stand: new Date(jetzt).toISOString(), plan: { fabrikAnzahl: 2 } }));
  assert.equal(planWert('fabrikAnzahl', 5, { pfad, jetzt }), 2);
  assert.equal(planWert('fabrikAnzahl', 5, { pfad, jetzt: jetzt + 2 * 864e5 }), 5);
});
