import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { baueFolge as bauen, pruefen, skriptAus, KONTEN } from '../../automations/schatten/videobot.mjs';
const baueFolge = (s) => bauen(s && Object.keys(s).length ? { stil: 'studio', ...s } : s);  // diese Tests prüfen das alte Studio-Aussehen (Karten, Banner)

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
    assert.ok(f.szenen.slice(1).every((x) => !x.text || x.text.length <= 142 && !x.text.endsWith('…')), 'Bildschirmtext vollständig, nichts abgeschnitten');
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
  assert.equal(folge.szenen.filter((x) => ['innen', 'gesicht', 'handy', 'nachricht', 'dunkel'].includes(x.art)).length, 2, 'Kurz-Modus: 2 Sätze (~15-20 s)');
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
      if (skript.wahl) assert.ok(ende.wahl.length === 2 && ende.sprich === ende.frage, ende.sprich);  // kurz: nur die Frage sprechen, Antworten stehen auf den Karten
    }
  }
  assert.equal(slug('Zwei Zahnbürsten'), 'zwei-zahnbuersten');
  assert.ok(pruefen({ hook: 'x', saetze: ['a', 'b', 'c'], ende: 'e', wahl: ['nur eins'] }).some((f) => f.includes('wahl')));
  assert.ok(pruefen({ hook: 'x', saetze: ['a', 'b', 'c'], ende: 'e', wahl: ['viel zu lange Antwort hier', 'b'] }).some((f) => f.includes('wahl')));
});

test('Keine Kopien zwischen TikTok-Konten: Hits anderer Konten kommen nicht auf das eigene Konto', async () => {
  const { autopilotListe, gewinner } = await import('../../automations/schatten/videobot.mjs');
  const [a, b] = SK.skripte;
  const letzte = [
    { konto: '@futureflowx3', format: 'horror', aufrufe: 900, sehdauer: 6, text: `${a.hook} ${a.frage} 👇` },
    { konto: '@zyx_7851', format: 'horror', aufrufe: 100, sehdauer: 3, text: `${b.hook} 👇` },
    { konto: '@zyx_7851', format: 'quiz', aufrufe: 5000, sehdauer: 9, text: 'Welcher Planet?' },
  ];
  const g = gewinner(SK.skripte, letzte);
  assert.equal(g.length, 1, 'nur über dem Schnitt, Quiz zählt nicht (für Instagram-Weitergabe)');
  for (const i of [1, 2]) {
    const liste = autopilotListe(SK.skripte, i, 3, letzte);
    assert.ok(liste.every((x) => SK.skripte.indexOf(SK.skripte.find((s) => s.titel === x.skript.titel.replace(/ – Teil 2$/, ''))) % 3 === i), `Konto ${i}: nur eigene Geschichten`);
    assert.equal(new Set(liste.map((x) => x.slug)).size, liste.length);
  }
  assert.deepEqual(autopilotListe(SK.skripte, 2, 3, []), autopilotListe(SK.skripte, 2));
});

test('Fortsetzungs-Bot: eigener Gewinner bekommt Teil 2 auf demselben Konto', async () => {
  const { autopilotListe, pruefen } = await import('../../automations/schatten/videobot.mjs');
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

test('Suchbild: kurze Videos verstecken 3x Augen und fragen nach der Sekunde', () => {
  const sk = { hook: 'Ich wohne allein.', saetze: ['Es klopft.', 'Ich schaue zum Fenster.', 'Da ist niemand.'], ende: 'Er steht hinter mir.' };
  const kurz = baueFolge({ ...sk, kurz: true });
  assert.equal(kurz.suchbild, true);
  assert.match(kurz.caption, /3x im Video versteckt/);
  assert.equal(baueFolge({ ...sk, kurz: true, suchbild: false }).suchbild, false);
  assert.equal(baueFolge(sk).suchbild, false);
});

test('Skript-Bot: viele gültige Geschichten mit starkem Hook, keine doppelt, nächste überspringt Bekannte', async () => {
  const { alleSkripte, naechstesSkript } = await import('../../automations/schatten/skriptBot.mjs');
  const { hookPunkte } = await import('../../automations/schatten/horrorKi.mjs');
  const { slug } = await import('../../automations/schatten/videobot.mjs');
  const alle = alleSkripte();
  assert.ok(alle.length >= 24, `nur ${alle.length}`);
  assert.equal(new Set(alle.map((s) => slug(s.titel))).size, alle.length);
  const vorrat = new Set(JSON.parse(readFileSync('automations-dashboard/tiktok/skripte.json', 'utf8')).skripte.map((s) => slug(s.titel)));
  for (const s of alle) {
    assert.deepEqual(pruefen(s), [], s.titel);
    assert.ok(hookPunkte(s.hook) >= 4 && s.hook.length <= 70, s.hook);
    assert.ok(!vorrat.has(slug(s.titel)), `schon im Vorrat: ${s.titel}`);
    baueFolge({ ...s, kurz: true });
  }
  assert.equal(naechstesSkript([slug(alle[0].titel)]).titel, alle[1].titel);
});

test('Skript-Bot lernt: bestes Muster zuerst, ungetestete Muster bekommen eine Chance', async () => {
  const { alleSkripte, naechstesSkript, musterWerte } = await import('../../automations/schatten/skriptBot.mjs');
  const alle = alleSkripte();
  assert.ok(alle.length >= 44 && alle.every((s) => s.muster && s.teil2));
  const von = (m, i = 0) => alle.filter((s) => s.muster === m)[i];
  const post = (s, aufrufe) => ({ konto: '@desk.rebel', aufrufe, text: `${s.hook} 👀 Seine Augen ...` });
  const letzte = [post(von('anruf'), 400), post(von('anruf', 1), 300), post(von('allein'), 10), post(von('allein', 1), 20), post(von('kamera'), 900), { konto: '@zyx_7851', aufrufe: 9999, text: von('regel').hook }];
  const w = musterWerte(letzte, alle);
  assert.equal(w.anruf.schnitt, 350); assert.equal(w.allein.n, 2); assert.ok(!w.regel, 'TikTok zählt nicht');
  assert.equal(naechstesSkript([], letzte).muster, 'anruf');
  assert.equal(naechstesSkript([], []).titel, alle[0].titel, 'ohne Zahlen: einfach der Reihe nach');
});

test('Teil 2 nur bei echtem Hit und nur einmal', async () => {
  const { alleSkripte, teil2Kandidat } = await import('../../automations/schatten/skriptBot.mjs');
  const { slug } = await import('../../automations/schatten/videobot.mjs');
  const s = alleSkripte()[3];
  const normal = [50, 60, 40, 55].map((a) => ({ konto: '@desk.rebel', aufrufe: a, text: 'irgendwas' }));
  assert.equal(teil2Kandidat('desk.rebel', [], [...normal, { konto: '@desk.rebel', aufrufe: 90, text: s.hook }]), null, 'kein Hit');
  const t = teil2Kandidat('desk.rebel', [], [...normal, { konto: '@desk.rebel', aufrufe: 500, text: s.hook }]);
  assert.equal(t.titel, `${s.titel} – Teil 2`); assert.deepEqual(pruefen(t), []); baueFolge({ ...t, kurz: true });
  assert.equal(teil2Kandidat('giyuuu sama', [], [...normal, { konto: '@desk.rebel', aufrufe: 500, text: s.hook }]), null, 'anderes Konto');
  assert.equal(teil2Kandidat('desk.rebel', [slug(t.titel)], [...normal, { konto: '@desk.rebel', aufrufe: 500, text: s.hook }]), null, 'schon gepostet');
});

test('KI wird nur mit starkem Schlüssel versucht', async () => {
  const { kiVerfuegbar } = await import('../../automations/113-buffer-verteiler.mjs');
  assert.equal(kiVerfuegbar({}), false);
  assert.equal(kiVerfuegbar({ GEMINI_API_KEY: 'x' }), true);
  assert.equal(kiVerfuegbar({ HORROR_KI_LOKAL: 'an' }), true);
});

test('Hook-A/B: jede Bot-Geschichte hat einen gültigen Du-Hook, Posts mit beiden Hooks werden erkannt', async () => {
  const { alleSkripte, passt, musterWerte } = await import('../../automations/schatten/skriptBot.mjs');
  const alle = alleSkripte();
  for (const s of alle) {
    assert.ok(s.hook2 && s.hook2 !== s.hook, `Du-Hook fehlt: ${s.titel}`);
    assert.ok(s.hook2.length <= 70 && /[.!]$/.test(s.hook2) && /\b(du|dich|dir|dein|deine|deinem|deinen|deiner)\b/i.test(s.hook2), s.hook2);
    for (const z of s.saetze.slice(-2)) assert.notEqual(s.hook2, z, 'wiederholt keinen behaltenen Satz');
    baueFolge({ ...s, hook: s.hook2, kurz: true });
  }
  const s = alle[0];
  assert.ok(passt({ text: `${s.hook2} 🎧` }, s) && passt({ text: s.hook }, s) && !passt({ text: 'etwas anderes' }, s));
  const w = musterWerte([{ konto: '@desk.rebel', aufrufe: 300, text: s.hook2 }, { konto: '@desk.rebel', aufrufe: 100, text: s.hook }], alle);
  assert.deepEqual(w[s.muster], { schnitt: 200, n: 2 });
});

test('KI-Hintergründe standardmäßig an, abschaltbar, mit Prompt je Szene (außer Nachricht und Endkarte)', () => {
  const sk = { hook: 'Ich wohne allein.', saetze: ['Es klopft.', 'Ich schaue.', 'Niemand.'], ende: 'Er steht hinter mir.', kurz: true, ort: 'zug', titel: 'Test' };
  const aus = baueFolge({ ...sk, ki: false });
  assert.equal(aus.ki_bilder, false); assert.ok(aus.szenen.every((s) => !s.ki));
  assert.equal(baueFolge(sk).ki_bilder, true, 'kurze Videos: KI-Bilder sind Standard');
  assert.equal(baueFolge({ ...sk, kurz: false }).ki_bilder, false, 'lange Serien-Folgen bleiben wie sie sind');
  const an = baueFolge({ ...sk, ki: true });
  assert.equal(an.ki_bilder, true); assert.match(an.ki_stil, /no text/);
  assert.ok(an.szenen.filter((s) => !['nachricht', 'teil2'].includes(s.art)).every((s) => /train|face/.test(s.ki)));
  assert.ok(an.szenen.filter((s) => s.art === 'teil2').every((s) => !s.ki));
});

test('Nativer Stil: Standard für kurze Videos - keine Karte, keine Banner, Frage als letzter Untertitel', () => {
  const sk = { titel: 'Probe', hook: 'Wenn es um 3 Uhr klingelt, renn.', saetze: ['Ich öffne.', 'Niemand da.', 'Es klingelt wieder.'], ende: 'Von innen.', frage: 'Hättest du geöffnet?', wahl: ['Öffnen', 'Rennen'], kurz: true };
  const f = bauen(sk);
  assert.equal(f.stil, 'nativ');
  assert.equal(f.suchbild, false); assert.equal(f.schlag, '');
  const ende = f.szenen.at(-1);
  assert.equal(ende.art, 'dunkel'); assert.equal(ende.text, 'HÄTTEST DU GEÖFFNET?'); assert.equal(ende.wahl, undefined);
  assert.ok(ende.ki, 'das Ende hat ein KI-Bild statt einer Karte');
  assert.match(f.caption, /1️⃣ Öffnen oder 2️⃣ Rennen/, 'die Wahl steht weiter im Beitragstext');
  assert.equal(bauen({ ...sk, stil: 'studio' }).szenen.at(-1).art, 'teil2', 'stil: studio stellt die Karte wieder her');
});
