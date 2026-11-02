import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baueFolge, pruefen, skriptAus, KONTEN } from '../../automations/schatten/videobot.mjs';

const SK = JSON.parse(readFileSync(new URL('../../automations-dashboard/tiktok/skripte.json', import.meta.url), 'utf8'));

test('alle fertigen Skripte aus der App ergeben eine gültige Folge', () => {
  assert.ok(SK.skripte.length >= 6);
  for (const s of SK.skripte) {
    assert.deepEqual(pruefen(s), [], s.titel);
    const f = baueFolge(s);
    assert.equal(f.szenen[0].art, 'blitz');
    assert.ok(!/^TEIL/.test(f.szenen[0].text), 'Hook ohne "Teil"');
    assert.deepEqual(f.szenen.slice(-3).map((x) => x.art), ['fratze', 'ende', 'teil2']);
    assert.ok(f.szenen.some((x) => x.art === 'dunkel'));
    if (s.nachricht) assert.equal(f.szenen.find((x) => x.art === 'nachricht').nachricht, s.nachricht);
    assert.ok(f.szenen.slice(1).every((x) => !x.text || x.text.length <= 44), 'Bildschirmtext kurz');
    assert.ok(!f.szenen[0].text.endsWith('…'), `Hook ganz: ${f.szenen[0].text}`);
  }
});

test('Videobot lehnt kaputte oder gefährliche Skripte ab', () => {
  assert.ok(pruefen({ hook: 'x', saetze: ['a'], ende: 'e' }).some((f) => f.includes('mindestens 3')));
  assert.ok(pruefen({ hook: 'x', saetze: ['a', 'b', 'c'], ende: 'e', ort: 'mond' }).some((f) => f.includes('ort')));
  assert.ok(pruefen({ hook: 'x', saetze: ['a', 'b', 'c'], ende: 'e', posten: 'fremd' }).some((f) => f.includes('posten')));
  assert.throws(() => baueFolge({}));
  const f = baueFolge({ hook: 'Hallo `$(echo boese)` <script>', saetze: ['a', 'b', 'c'], ende: 'e' });
  assert.ok(!/[`$<>]/.test(JSON.stringify(f.szenen[0])));
  assert.deepEqual(skriptAus('Text\n```json\n{"hook":"h"}\n```'), { hook: 'h' });
  assert.throws(() => skriptAus('kein block'));
  const formular = '### Hook\n\nIch wohne allein. Trotzdem klopft es.\n\n### Geschichte\n\nEins.\nZwei.\n\nDrei.\nVier.\nFünf.\n\n### Twist am Ende\n\nEs ist innen.\n\n'
    + '### Frage an die Zuschauer\n\n_No response_\n\n### Antwort 1\n\nTür auf\n\n### Antwort 2\n\nWegrennen\n\n### Ort\n\nwald\n\n### Länge\n\nkurz (ca. 25 s, empfohlen)\n\n### Danach\n\nnur Video-Link';
  const fs_ = skriptAus(formular);
  assert.deepEqual(fs_.saetze, ['Eins.', 'Zwei.', 'Drei.', 'Vier.', 'Fünf.']);
  assert.deepEqual(fs_.wahl, ['Tür auf', 'Wegrennen']);
  assert.equal(fs_.ort, 'wald'); assert.equal(fs_.kurz, true); assert.equal(fs_.posten, undefined); assert.equal(fs_.frage, undefined);
  const folge = baueFolge(fs_);
  assert.equal(folge.szenen.filter((x) => ['innen', 'gesicht', 'handy', 'nachricht', 'dunkel'].includes(x.art)).length, 3, 'Kurz-Modus: 3 Sätze');
  assert.equal(folge.tempo, '+24%');
  assert.equal(Object.keys(KONTEN).length, 3);
});

test('Autopilot: jedes Konto eigene Geschichten, keine Teil-2-Versprechen', async () => {
  const { autopilotListe, slug } = await import('../../automations/schatten/videobot.mjs');
  const listen = [0, 1, 2].map((i) => autopilotListe(SK.skripte, i));
  const alle = listen.flat().map((x) => x.slug);
  assert.equal(new Set(alle).size, SK.skripte.length, 'keine Geschichte doppelt');
  for (const l of listen) {
    assert.ok(l.length >= 6);
    for (const { skript } of l) {
      const ende = baueFolge(skript).szenen.at(-1);
      assert.equal(ende.cta, skript.wahl ? 'KOMMENTIER 1 ODER 2' : 'FOLG MIR FÜR MEHR');
      assert.ok(!/TEIL/.test(ende.text), ende.text);
      if (skript.wahl) assert.ok(ende.wahl.length === 2 && ende.sprich.includes('Eins'), ende.sprich);
    }
  }
  assert.equal(slug('Zwei Zahnbürsten'), 'zwei-zahnbuersten');
  assert.ok(pruefen({ hook: 'x', saetze: ['a', 'b', 'c'], ende: 'e', wahl: ['nur eins'] }).some((f) => f.includes('wahl')));
  assert.ok(pruefen({ hook: 'x', saetze: ['a', 'b', 'c'], ende: 'e', wahl: ['viel zu lange Antwort hier', 'b'] }).some((f) => f.includes('wahl')));
});

test('Gewinner-Bot: was auf einem Konto viral ging, kommt auf den anderen Konten zuerst', async () => {
  const { autopilotListe, gewinner } = await import('../../automations/schatten/videobot.mjs');
  const [a, b] = SK.skripte;
  const letzte = [
    { konto: '@futureflowx3', format: 'horror', aufrufe: 900, sehdauer: 6, text: `${a.hook} ${a.frage} 👇` },
    { konto: '@zyx_7851', format: 'horror', aufrufe: 100, sehdauer: 3, text: `${b.hook} 👇` },
    { konto: '@zyx_7851', format: 'quiz', aufrufe: 5000, sehdauer: 9, text: 'Welcher Planet?' },
  ];
  const g = gewinner(SK.skripte, letzte);
  assert.equal(g.length, 1, 'nur über dem Schnitt, Quiz zählt nicht');
  assert.equal(g[0].konto, 'futureflowx3');
  const zyx = autopilotListe(SK.skripte, 1, 3, letzte);
  assert.equal(zyx[0].skript.titel, a.titel, 'Gewinner zuerst auf anderem Konto');
  assert.equal(new Set(zyx.map((x) => x.slug)).size, zyx.length, 'nichts doppelt in der Liste');
  const eigenes = autopilotListe(SK.skripte, 0, 3, letzte);
  assert.equal(eigenes[0].slug, a.teil2 ? `${zyx[0].slug}-teil-2` : eigenes[0].slug, 'eigenes Konto bekommt Teil 2 statt Wiederholung');
  assert.deepEqual(autopilotListe(SK.skripte, 2, 3, []), autopilotListe(SK.skripte, 2));
});

test('Fortsetzungs-Bot: eigener Gewinner bekommt Teil 2 auf demselben Konto', async () => {
  const { autopilotListe, baueFolge, pruefen } = await import('../../automations/schatten/videobot.mjs');
  const { serienText } = await import('../../automations/schatten/posten.mjs');
  const mit = SK.skripte.filter((s) => s.teil2);
  assert.ok(mit.length >= 6);
  for (const s of mit) assert.deepEqual(pruefen({ ...s, ...s.teil2 }), [], s.titel);
  const s = mit[0], i = SK.skripte.indexOf(s) % 3, konto = ['futureflowx3', 'zyx_7851', 'futureflowxx'][i];
  const letzte = [{ konto: `@${konto}`, format: 'horror', aufrufe: 900, sehdauer: 6, text: s.hook }, { konto: '@x', format: 'horror', aufrufe: 100, sehdauer: 3, text: 'egal' }];
  const liste = autopilotListe(SK.skripte, i, 3, letzte);
  assert.match(liste[0].slug, /-teil-2$/);
  const f = baueFolge(liste[0].skript);
  assert.equal(f.teile, 2);
  assert.equal(f.szenen[0].sprich, s.teil2.hook);
  const text = serienText(f);
  assert.match(text, /\(Teil 2\/2\)/); assert.ok(!/Teil 3/.test(text)); assert.match(text, /KI-generiert/);
  assert.ok(!autopilotListe(SK.skripte, (i + 1) % 3, 3, letzte).some((x) => /-teil-2$/.test(x.slug)), 'Teil 2 nur auf dem eigenen Konto');
});

test('Lern-Bot: eigene Geschichten mit erfolgreichem Ort/Bösewicht kommen zuerst', async () => {
  const { lernen, autopilotListe } = await import('../../automations/schatten/videobot.mjs');
  const zug = SK.skripte.find((s) => s.ort === 'zug'), haus = SK.skripte.find((s) => s.ort === 'haus');
  const letzte = [
    { konto: '@x', format: 'horror', aufrufe: 500, sehdauer: 6, text: zug.hook },
    { konto: '@x', format: 'horror', aufrufe: 500, sehdauer: 2, text: haus.hook },
  ];
  const g = lernen(SK.skripte, letzte);
  assert.ok(g['ort:zug'] > g['ort:haus']);
  for (const i of [0, 1, 2]) {
    const liste = autopilotListe(SK.skripte, i, 3, letzte).filter((x) => !/-teil-2$/.test(x.slug));
    const ersterZug = liste.findIndex((x) => x.skript.ort === 'zug'), ersterHausOhneZug = liste.findIndex((x) => x.skript.ort === 'haus' && x.skript.boesewicht !== zug.boesewicht);
    if (ersterZug >= 0 && ersterHausOhneZug >= 0) assert.ok(ersterZug < ersterHausOhneZug, `Konto ${i}: Zug vor Haus`);
  }
  assert.equal(SK.skripte.filter((s) => s.teil2).length, 15);
});
