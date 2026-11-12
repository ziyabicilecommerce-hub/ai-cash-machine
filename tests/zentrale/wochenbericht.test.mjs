import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verlaufMischen, bericht } from '../../automations/lib/wochenbericht.mjs';

const JETZT = Date.parse('2026-11-15T12:00:00Z');
const vor = (tage, extra = {}) => ({ zeit: new Date(JETZT - tage * 864e5).toISOString(), konto: '@desk.rebel', format: 'horror', aufrufe: 100, sehdauer: 4, text: 'x', ...extra });

test('Verlauf: neue Zahlen überschreiben alte, nichts doppelt, älter als 30 Tage fliegt raus', () => {
  const alt = [vor(2, { link: 'L1', aufrufe: 5 }), vor(40, { link: 'L0' })];
  const v = verlaufMischen(alt, [vor(2, { link: 'L1', aufrufe: 300 }), vor(1, { link: 'L2' })], JETZT);
  assert.deepEqual(v.map((p) => p.link), ['L1', 'L2']);
  assert.equal(v[0].aufrufe, 300);
});

test('Bericht: Woche gegen Vorwoche, frische Posts ohne Zahlen zählen nicht, Schritte ehrlich aus den Zahlen', () => {
  const v = [vor(0.2, { aufrufe: 0 }), vor(2, { aufrufe: 400 }), vor(3, { aufrufe: 200 }), vor(10, { aufrufe: 50 }),
    ...[2, 3, 4, 5, 6].map((t) => vor(t, { konto: '@zyx_7851', aufrufe: 2, sehdauer: 1 }))];
  const b = bericht(v, JETZT, (p) => (p.aufrufe === 400 ? 'anruf' : p.aufrufe === 200 ? 'anruf' : ''));
  assert.equal(b.gesamt.posts, 7, 'der Post von vor 5 Std. hat noch keine Zahlen');
  assert.equal(b.konten['@desk.rebel'].schnitt, 300); assert.equal(b.konten['@desk.rebel'].vorher, 50);
  assert.equal(b.top[0].aufrufe, 400);
  assert.ok(b.schritte.some((s) => s.includes('@desk.rebel läuft am besten')));
  assert.ok(b.schritte.some((s) => s.includes('@zyx_7851')));
  assert.ok(b.schritte.some((s) => s.includes('„anruf“')));
  assert.deepEqual(bericht([], JETZT).schritte, []);
});

test('A/B-Test: Varianten zufällig, Auswertung mit/ohne, Urteil erst ab je 3 Videos', async () => {
  const { abVariante, abSchluessel } = await import('../../automations/lib/bufferVerteiler.mjs');
  const { abAuswertung } = await import('../../automations/lib/wochenbericht.mjs');
  assert.deepEqual(abVariante(() => 0.9), { kalt: true, raum: true, suchbild: true, duhook: true, schlag: true, gestalt: true });
  assert.deepEqual(abVariante(() => 0.1), { kalt: false, raum: false, suchbild: false, duhook: false, schlag: false, gestalt: false });
  assert.deepEqual(abVariante(() => 0.4), { kalt: true, raum: true, suchbild: true, duhook: false, schlag: false, gestalt: false }, 'Du-Hook, Schlagzeile und Gestalt halbe-halbe');
  assert.equal(abSchluessel('Ich wohne allein.  Heute stehen zwei Kaffeetassen auf dem Tisch. 🎧'), 'Ich wohne allein. Heute stehen zwei Kaff');
  const posts = [...[6, 7, 8].map((s, i) => vor(2, { text: `mit${i}`, sehdauer: s })), ...[2, 3, 4].map((s, i) => vor(2, { text: `ohne${i}`, sehdauer: s }))];
  const ab = abAuswertung(posts, (p) => ({ kalt: p.text.startsWith('mit') }));
  assert.deepEqual(ab.kalt.an, { n: 3, schnitt: 100, sehdauer: 7 }); assert.equal(ab.kalt.aus.sehdauer, 3);
  const b = bericht(posts, JETZT, () => '', (p) => ({ kalt: p.text.startsWith('mit') }));
  assert.ok(b.schritte.some((s) => s.includes('Kalter Einstieg') && s.includes('wirkt')));
  assert.ok(!bericht(posts.slice(0, 4), JETZT, () => '', (p) => ({ kalt: p.text.startsWith('mit') })).schritte.some((s) => s.includes('A/B')), 'zu wenig Daten');
});

test('Caption folgt der Variante', async () => {
  const { baueFolge: bauen } = await import('../../automations/schatten/videobot.mjs');
  const baueFolge = (s) => bauen(s && Object.keys(s).length ? { stil: 'studio', ...s } : s);  // diese Tests prüfen das alte Studio-Aussehen (Karten, Banner)
  const sk = { hook: 'Ich wohne allein.', saetze: ['Es klopft.', 'Ich schaue.', 'Niemand.'], ende: 'Er steht hinter mir.', kurz: true };
  assert.match(baueFolge(sk).caption, /🎧.*3x im Video versteckt/);
  const ohne = baueFolge({ ...sk, raum: false, suchbild: false });
  assert.ok(!/🎧|versteckt/.test(ohne.caption) && !ohne.raum && !ohne.suchbild && ohne.kalt);
});

test('Vorrats-Wächter: zählt ungepostete Geschichten und Tage', async () => {
  const { vorrat } = await import('../../automations/lib/wochenbericht.mjs');
  assert.deepEqual(vorrat(['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['horror:a', 'horror:hit:b', 'x.mp4']), { rest: 5, tage: 1 });
  assert.deepEqual(vorrat([], []), { rest: 0, tage: 0 });
});

test('A/B optimiert sich selbst: Gewinner meist an, Verlierer meist aus, erst ab klarem Ergebnis', async () => {
  const { abGewichte, AB_FEATURES, abVariante } = await import('../../automations/lib/bufferVerteiler.mjs');
  const w = (an, aus, n = 3) => ({ an: { n, sehdauer: an }, aus: { n, sehdauer: aus } });
  const g = abGewichte({ kalt: w(7, 4), raum: w(3, 5), suchbild: w(5, 4.8), duhook: w(9, 2, 2) });
  assert.equal(g.kalt, 0.15); assert.equal(g.raum, 0.85);
  assert.equal(g.suchbild, AB_FEATURES.suchbild, 'zu kleiner Unterschied'); assert.equal(g.duhook, AB_FEATURES.duhook, 'zu wenig Videos');
  assert.deepEqual(abGewichte(undefined), AB_FEATURES);
  assert.equal(abVariante(() => 0.5, g).raum, false); assert.equal(abVariante(() => 0.5, g).kalt, true);
});

test('A/B-Auswertung ignoriert Posts ohne Sehdauer (YouTube)', async () => {
  const { abAuswertung } = await import('../../automations/lib/wochenbericht.mjs');
  const ab = abAuswertung([{ text: 'a', sehdauer: 6 }, { text: 'b', sehdauer: 0, aufrufe: 900 }], () => ({ kalt: true }));
  assert.equal(ab.kalt.an.n, 1);
});

test('Trick-Radar: misst Kniffe gegen den Konto-Schnitt, erkennt Deckel und tote Videos', async () => {
  const { trickRadar, deckel, trickSchritte, hookVon } = await import('../../automations/lib/trickRadar.mjs');
  const jetzt = Date.parse('2026-11-12T12:00:00Z');
  const post = (konto, tag, stunde, aufrufe, text) => ({ konto, zeit: `2026-11-${String(tag).padStart(2, '0')}T${String(stunde).padStart(2, '0')}:00:00Z`, aufrufe, text, format: 'horror' });
  const v = [];
  for (let i = 0; i < 10; i++) {
    v.push(post('@a', 5 + (i % 5), 1 + i, 300, `Wenn es um 3 Uhr klingelt, renn. Nummer ${i}`));  // Du-Ansprache: stark
    v.push(post('@a', 5 + (i % 5), 12 + i, 100, `Ich höre Schritte. Nummer ${i}`));
  }
  assert.equal(hookVon(v[0]), 'Wenn es um 3 Uhr klingelt, renn.');
  const r = trickRadar(v, jetzt);
  const du = r.find((x) => x.trick.startsWith('Du-Ansprache'));
  assert.ok(du && du.n === 10 && du.faktor > 1.2 && du.ohne < 1, JSON.stringify(du));
  assert.equal(r[0].faktor >= r.at(-1).faktor, true, 'bester Trick zuerst');
  assert.deepEqual(trickRadar(v.slice(0, 6), jetzt), [], 'zu wenig Posts -> kein Urteil');
  // Deckel: fast immer ~750, zwei Videos ohne Aufrufe
  const k = [750, 745, 760, 0, 748, 752, 0, 749].map((a, i) => post('@b', 4 + i, 10, a, `Ich ${i}.`));
  const d = deckel(k, jetzt)['@b'];
  assert.ok(d.gedeckelt && d.tot === 2 && d.median === 750, JSON.stringify(d));
  assert.equal(deckel(v, jetzt)['@a'].gedeckelt, false, '100 und 300 gemischt ist kein Deckel');
  const s = trickSchritte(r, { '@b': d });
  assert.ok(s.some((x) => x.includes('Du-Ansprache')) && s.some((x) => x.startsWith('Deckel: @b')), s.join(' | '));
});
