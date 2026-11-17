import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KANAELE, passend, naechstes, postenJetzt, beitrag, heuteBerlin, zaehlen } from '../../automations/lib/bufferVerteiler.mjs';

const VIDEOS = JSON.parse(readFileSync(new URL('../../video-feed/videos.json', import.meta.url), 'utf8')).videos;

test('keine Shop-Werbung, jeder Kanal etwas anderes', () => {
  assert.deepEqual(KANAELE.map((k) => k.quelle), ['horror-mix', 'horror', 'horror-mix']);  // desk.rebel + YouTube testen Deutsch gegen Englisch
  const fakten = passend(VIDEOS, 'fakten', 'purivelle.785'), anime = passend(VIDEOS, 'anime');
  assert.ok(fakten.length >= 20 && anime.length >= 5);
  for (const v of [...fakten, ...anime]) assert.ok(!/deskrebel\.store|purivelle\.store|#deskrebel|#purivelle/i.test(`${v.caption}${v.url}${v.titel}`), `Werbung: ${v.titel}`);
  assert.ok(fakten.every((v) => v.kanal === 'fakten' && v.konto !== '@desk.rebel'), 'nur Fakten, nie die eines anderen Instagram-Kontos');
  assert.equal(fakten[0].konto, '@purivelle.785', 'eigene Fakten-Videos zuerst');
  assert.ok(anime.every((v) => v.format === 'hoch' && (v.dauer || 0) <= 180), 'YouTube: nur Shorts');
  const fa = new Set(fakten.map((v) => v.datei));
  assert.ok(!anime.some((v) => fa.has(v.datei)), 'nichts doppelt');
});

test('Horror-Generator: KI-Text wird streng geprüft', async () => {
  const { saeubern, prompt, BEISPIEL } = await import('../../automations/schatten/horrorKi.mjs');
  const EIGEN = { ...BEISPIEL, titel: 'Der Wecker', hook: 'Mein Wecker klingelt um 3:33. Ich habe ihn auf 7 gestellt.' };
  assert.ok(saeubern(EIGEN), 'eigene Geschichte ist gültig');
  assert.equal(saeubern(BEISPIEL), null); assert.match(saeubern.grund, /abgeschrieben/);
  assert.equal(saeubern({ ...EIGEN, saetze: ['<Satz 1>', 'b', 'c'] }), null); assert.match(saeubern.grund, /Platzhalter/);
  const rep = saeubern({ ...EIGEN, frage: 'Hättest du aufgemacht', wahl: ['Sofort die Tür aufmachen', 'Weg'] });
  assert.equal(rep.frage, 'Hättest du aufgemacht?', 'Fragezeichen ergänzt');
  assert.ok(rep.wahl[0].length <= 18 && !rep.wahl[0].endsWith(' '), `an Wortgrenze gekürzt: ${rep.wahl[0]}`);
  assert.equal(saeubern({ ...EIGEN, ende: 'Überall ist Blut.' }), null, 'kein Blut'); assert.match(saeubern.grund, /verboten/);
  assert.equal(saeubern({ ...EIGEN, hook: 'x'.repeat(120) }), null, 'Hook zu lang');
  assert.equal(saeubern({ ...EIGEN, wahl: ['nur eins'] }), null);
  
  assert.equal(saeubern({ ...EIGEN, ort: 'mond' }).ort, 'haus', 'unbekannter Ort -> Haus');
  assert.equal(saeubern('kaputt'), null);
  assert.match(prompt(['zwei-zahnbuersten'], () => 0), /zwei-zahnbuersten/);
});

test('nächstes Video: erst neue (neueste zuerst), dann das am längsten nicht gepostete', () => {
  const v = [{ datei: 'a', erstellt: '2026-10-01' }, { datei: 'b', erstellt: '2026-10-03' }, { datei: 'c', erstellt: '2026-10-02' }];
  assert.equal(naechstes(v, {}).datei, 'b');
  assert.equal(naechstes(v, { b: '2026-11-01T10:00:00Z' }).datei, 'c');
  assert.equal(naechstes(v, { a: '2026-11-01T09:00:00Z', b: '2026-11-01T08:00:00Z', c: '2026-11-01T10:00:00Z' }).datei, 'b');
  assert.equal(naechstes([], {}), null);
});

test('posten nur mit Abstand und höchstens 6 am Tag', () => {
  const jetzt = Date.parse('2026-11-02T12:00:00Z');
  assert.equal(postenJetzt(0, null, jetzt), true);
  assert.equal(postenJetzt(3, '2026-11-02T11:00:00Z', jetzt), false, '60 Min. zu kurz');
  assert.equal(postenJetzt(3, '2026-11-02T10:00:00Z', jetzt), true);
  assert.equal(postenJetzt(6, '2026-11-02T08:00:00Z', jetzt), false);
});

test('Texte: KI-Hinweis immer, Instagram als Reel ohne Link, YouTube mit Titel und Kategorie', () => {
  const ig = beitrag({ caption: 'Honig verdirbt nie. Wahr?\n\nTag 26 von 100 🔥 Folge @futureflowx3! #wissen', titel: 'T' }, 'instagram');
  assert.match(ig.text, /KI-generiert/); assert.ok(!/Folge @|Tag 26/.test(ig.text), ig.text);
  const h = beitrag({ caption: 'Ich wohne allein. 1️⃣ Ins Bad oder 2️⃣ Raus hier? Zahl in die Kommentare 👇 #horrortok', titel: 'Z' }, 'instagram', 'horror');
  assert.equal(h.metadata.instagram.firstComment, 'Was machst du? 1️⃣ Ins Bad oder 2️⃣ Raus hier - schreib nur die Zahl 👇');
  assert.match(h.text, /#gruselgeschichte/); assert.ok(!/#horrortok/.test(h.text), 'nur Nischen-Tags');
  const f = beitrag({ caption: 'Fakt #12: Oktopus hat drei Herzen #tiere', titel: 'F' }, 'instagram', 'fakten');
  assert.match(f.text, /^Fakt #12: Oktopus/); assert.match(f.metadata.instagram.firstComment, /Wusstest du/);
  assert.deepEqual(ig.metadata.instagram, { type: 'reel', shouldShareToFeed: true, isAiGenerated: true });
  const nurTags = beitrag({ caption: '#wissen #honig', titel: 'Honig verdirbt nie' }, 'instagram');
  assert.match(nurTags.text, /^Honig verdirbt nie\n\n#wissen/);
  const yt = beitrag({ titel: 'Kage no Shiro – Folge 30 (Teaser)', caption: 'Die ganze Folge jetzt auf YouTube!\n\nDie Ninja kehren zurück.' }, 'youtube');
  assert.ok(!/jetzt auf YouTube/.test(yt.text)); assert.match(yt.text, /^Die Ninja/);
  assert.match(yt.text, /KI-generiert/);
  assert.ok(yt.metadata.youtube.title.length <= 100 && yt.metadata.youtube.categoryId && yt.metadata.youtube.isAiGenerated);
});

test('Zählen und Tagesbeginn Berlin', () => {
  assert.equal(heuteBerlin(new Date('2026-11-02T12:00:00Z')), '2026-11-01T23:00:00.000Z');
  assert.equal(heuteBerlin(new Date('2026-07-02T12:00:00Z')), '2026-07-01T22:00:00.000Z');
  const z = zaehlen([{ channelId: 'k', status: 'sent', sentAt: '2026-11-02T08:00:00Z' }, { channelId: 'k', status: 'error', dueAt: '2026-11-02T09:00:00Z' }, { channelId: 'x', status: 'sent', sentAt: '2026-11-02T10:00:00Z' }], 'k');
  assert.deepEqual(z, { heute: 1, letzter: '2026-11-02T08:00:00Z' });
});

test('Hook-Wettbewerb: stärkster gültiger KI-Hook gewinnt, schwache fliegen raus', async () => {
  const { neueGeschichte, hookPunkte, BEISPIEL } = await import('../../automations/schatten/horrorKi.mjs');
  assert.ok(hookPunkte('Um 3:12 Uhr klingelt mein Handy. Der Anrufer bin ich.') >= 5);
  assert.ok(hookPunkte('Es war einmal ein Wald?') <= 2);
  const antworten = [{ ...BEISPIEL, titel: 'Schwach', hook: 'Es war dunkel im Wald und kalt.' }, { ...BEISPIEL, titel: 'Stark', hook: 'Um 3 Uhr nachts schreibt mir mein Handy: Ich bin allein.' }];
  let i = 0;
  const s = await neueGeschichte(async () => antworten[i++ % 2], []);
  assert.equal(s.titel, 'Stark');
  assert.equal(await neueGeschichte(async () => ({ ...BEISPIEL, hook: 'Es war dunkel und kalt im Wald.' }), []), null, 'nur schwache Hooks -> Vorrat');
});

test('YouTube-Horror: Hook als Titel, Instagram höchstens 5 Hashtags, Suchbild-Kommentar', () => {
  const v = { titel: 'Zahnbürsten', caption: 'Ich wohne allein. Heute stehen zwei Zahnbürsten im Glas. 👀 Seine Augen sind 3x im Video versteckt – bei welcher Sekunde hast du sie gesehen? 👇' };
  const yt = beitrag(v, 'youtube', 'horror');
  assert.equal(yt.metadata.youtube.title, 'Ich wohne allein. Heute stehen zwei Zahnbürsten im Glas. 😨 #shorts');
  assert.equal(yt.metadata.youtube.categoryId, '24');
  assert.ok(yt.metadata.youtube.isAiGenerated && /KI/.test(yt.text));
  const ig = beitrag(v, 'instagram', 'horror');
  assert.ok((ig.text.match(/#/g) || []).length <= 5, 'Instagram: max. 5 Hashtags');
  assert.match(ig.metadata.instagram.firstComment, /Sekunde/);
  assert.ok((beitrag({ caption: 'Wusstest du?' }, 'instagram', 'fakten').text.match(/#/g) || []).length <= 5);
});

test('Story zum Reel: Titelbild, KI-Kennzeichnung, zählt nicht als Tages-Post', async () => {
  const { storyEingabe, zaehlen } = await import('../../automations/lib/bufferVerteiler.mjs');
  const s = storyEingabe('6ae8f441e29c69a1713e44f3', 'https://github.com/x/releases/download/t/cover.jpg');
  assert.equal(s.metadata.instagram.type, 'story'); assert.equal(s.metadata.instagram.isAiGenerated, true);
  assert.ok(s.assets[0].image.url.endsWith('cover.jpg')); assert.equal(s.text, '');
  const posts = [{ channelId: 'a', status: 'sent', text: 'Reel', sentAt: '2026-11-05T08:00:00Z' }, { channelId: 'a', status: 'sent', text: '', sentAt: '2026-11-05T08:01:00Z' }];
  assert.equal(zaehlen(posts, 'a').heute, 1);
});

test('Fakten: stärkstes Format des Kontos zuerst, nur mit echtem Vergleich', async () => {
  const { formatWerte, naechstes } = await import('../../automations/lib/bufferVerteiler.mjs');
  const jetzt = Date.parse('2026-11-06T12:00:00Z'), z = '2026-11-05T08:00:00Z';
  const letzte = [{ konto: '@purivelle.785', format: 'mythos', aufrufe: 125, zeit: z }, { konto: '@purivelle.785', format: 'mythos', aufrufe: 25, zeit: z },
    { konto: '@purivelle.785', format: 'quiz', aufrufe: 10, zeit: z }, { konto: '@purivelle.785', format: 'quiz', aufrufe: 8, zeit: z }, { konto: '@desk.rebel', format: 'quiz', aufrufe: 999, zeit: z }];
  assert.deepEqual(formatWerte(letzte, 'purivelle', jetzt), { mythos: 75, quiz: 9 });
  assert.equal(formatWerte(letzte.slice(0, 2), 'purivelle', jetzt), null, 'nur ein Format = kein Vergleich');
  const v = [{ datei: 'q', kanal: 'fakten', caption: 'Welcher Planet ist am heißesten?', erstellt: '2026-11-06' }, { datei: 'm', kanal: 'fakten', caption: 'Honig verdirbt nie. Wahr oder Mythos?', erstellt: '2026-11-01' }];
  assert.equal(naechstes(v, {}).datei, 'q', 'ohne Werte: das neueste');
  assert.equal(naechstes(v, {}, { mythos: 75, quiz: 9 }).datei, 'm', 'mit Werten: Mythos zuerst');
});

test('Masse runter (17.11.): YouTube 1 am Tag, Instagram ~4-5 pro Woche, nur nachts und abends', async () => {
  const { guteStunde, ZIEL_EINS, IG_ABSTAND_MIN } = await import('../../automations/lib/bufferVerteiler.mjs');
  assert.ok(KANAELE.every((k) => k.ziel === ZIEL_EINS), 'jeder Kanal höchstens 1 Video am Tag');
  assert.ok(KANAELE.filter((k) => k.dienst === 'instagram').every((k) => k.abstandMin === IG_ABSTAND_MIN));
  const yt = KANAELE.find((k) => k.dienst === 'youtube'), ig = KANAELE.find((k) => k.dienst === 'instagram');
  const jetzt = Date.parse('2026-11-02T22:00:00Z');
  const opt = (k) => ({ ziel: k.ziel, abstandMin: k.abstandMin });
  assert.equal(postenJetzt(0, null, jetzt, opt(yt)), true, 'YouTube: das eine Video des Tages geht');
  assert.equal(postenJetzt(1, '2026-11-02T08:00:00Z', jetzt, opt(yt)), false, 'YouTube: kein zweites');
  assert.equal(postenJetzt(0, '2026-11-01T22:00:00Z', jetzt, opt(ig)), false, 'Instagram: 24 Std. sind zu kurz');
  assert.equal(postenJetzt(0, '2026-11-01T15:00:00Z', jetzt, opt(ig)), true, 'Instagram: nach 31 Std. wieder');
  // eine Woche im Takt der Workflow-Läufe: Instagram landet bei 4-5 Reels
  let letzter = null, n = 0;
  for (let t = Date.parse('2026-11-02T00:00:00Z'); t < Date.parse('2026-11-09T00:00:00Z'); t += 3600000) {
    const stunde = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23' }).format(new Date(t)));
    if (guteStunde(stunde) && postenJetzt(0, letzter, t, opt(ig))) { letzter = new Date(t).toISOString(); n++; }
  }
  assert.ok(n >= 4 && n <= 5, `Instagram: ${n} Reels pro Woche`);
  assert.deepEqual([0, 3, 8, 11, 14, 17, 20, 22].filter(guteStunde), [0, 3, 20, 22]);
});

test('zaehlenMitStand: eigenes Protokoll fängt verzögerte Buffer-Liste ab', async () => {
  const { zaehlenMitStand } = await import('../../automations/lib/bufferVerteiler.mjs');
  const heute = '2026-11-08T00:00:00.000Z';
  const stand = { 'horror:a': '2026-11-08T09:18:00.000Z', 'horror:b': '2026-11-08T07:09:00.000Z', 'horror:alt': '2026-11-07T20:00:00.000Z', 'kurz:x': '2026-11-08T09:19:00.000Z', 'horror:c': 'heute' };
  const r = zaehlenMitStand({ heute: 1, letzter: '2026-11-08T07:09:30Z' }, stand, heute);
  assert.equal(r.heute, 2);
  assert.equal(r.letzter, '2026-11-08T09:18:00.000Z');
  assert.equal(postenJetzt(r.heute, r.letzter, Date.parse('2026-11-08T10:05:00Z')), false, '47 Min. nach dem letzten Reel: warten');
  assert.deepEqual(zaehlenMitStand({ heute: 3, letzter: null }, {}, heute), { heute: 3, letzter: null });
});

test('YouTube-A/B nach Aufrufen: Du-Hook gewinnt dort, 3D-Ton bremst', async () => {
  const { abGewichteAufrufe, AB_FEATURES } = await import('../../automations/lib/bufferVerteiler.mjs');
  const { abAuswertungAufrufe } = await import('../../automations/lib/wochenbericht.mjs');
  const g = abGewichteAufrufe({ duhook: { an: { n: 3, schnitt: 775 }, aus: { n: 13, schnitt: 337 } }, raum: { an: { n: 8, schnitt: 236 }, aus: { n: 8, schnitt: 603 } },
    kalt: { an: { n: 9, schnitt: 403 }, aus: { n: 7, schnitt: 441 } }, suchbild: { an: { n: 2, schnitt: 900 }, aus: { n: 9, schnitt: 100 } } });
  assert.equal(g.duhook, 0.15);
  assert.equal(g.raum, 0.85);
  assert.equal(g.kalt, AB_FEATURES.kalt, 'zu knapp - bleibt beim Test');
  assert.equal(g.suchbild, AB_FEATURES.suchbild, 'zu wenig Videos');
  const posts = [{ text: 'a', aufrufe: 100 }, { text: 'b', aufrufe: 300 }, { text: 'c', aufrufe: 0 }];
  const v = { a: { raum: true }, b: { raum: false }, c: { raum: false } };
  assert.deepEqual(abAuswertungAufrufe(posts, (p) => v[p.text]), { raum: { an: { n: 1, schnitt: 100 }, aus: { n: 1, schnitt: 300 } } });
});

test('Englisch auf Instagram: Reel mit englischem Text, Tags, KI-Hinweis und erstem Kommentar', () => {
  const r = beitrag({ url: 'https://x/v.mp4', titel: 'Fourteen Steps', caption: 'My stairs have 13 steps. Tonight I hear 14 footsteps.\n1️⃣ Count again or 2️⃣ Run?' }, 'instagram', 'horror-en');
  assert.match(r.text, /#scarystories/);
  assert.match(r.text, /AI-generated/);
  assert.ok(!/KI-generiert|gruselgeschichte/.test(r.text));
  assert.match(r.metadata.instagram.firstComment, /comment the number/);
});

test('Schonkur: das Tagesziel 0 wird nicht durch den Standard ersetzt (0 ist ein gültiges Ziel)', () => {
  const quelle = readFileSync(new URL('../../automations/113-buffer-verteiler.mjs', import.meta.url), 'utf8');
  assert.match(quelle, /ziel: k\.ziel \?\? ZIEL_PRO_TAG/, 'mit || würde aus ZIEL_WENIGER = 0 wieder das Standardziel');
  assert.doesNotMatch(quelle, /k\.ziel \|\| ZIEL_PRO_TAG/);
});

test('A/B-Test klassik: nur im Test-Arm der Hit-Look, Fehler fallen auf den Standard zurück', async () => {
  const { folgeFuer } = await import('../../automations/lib/bufferVerteiler.mjs');
  const { baueFolge } = await import('../../automations/schatten/videobot.mjs');
  const { SKRIPTE_EN } = await import('../../automations/schatten/skripteEn.mjs');
  const { SKRIPTE_EN_AKTE } = await import('../../automations/schatten/skripteEnAkte.mjs');
  const stil = [];
  folgeFuer({ klassik: true }, (e) => stil.push(e.stil));
  folgeFuer({ klassik: false }, (e) => stil.push(e.stil));
  folgeFuer({}, (e) => stil.push(e.stil));
  assert.deepEqual(stil, ['klassik', undefined, undefined]);
  assert.equal(folgeFuer({ klassik: true }, (e) => { if (e.stil === 'klassik') throw new Error('passt nicht'); return 'standard'; }), 'standard');
  for (const s of SKRIPTE_EN_AKTE) {  // Akte-Universum: nummerierte Fälle bleiben im Akte-Stil, auch im Test-Arm
    const f = folgeFuer({ ...s, kurz: true, weiter: '', posten: '', klassik: true }, baueFolge);
    assert.ok(s.fall_nr > 0 && !f.klassik && f.stil === 'akte' && /FILE \d{3}/.test(f.caption), `${s.titel}: Serie bleibt Akte`);
  }
  assert.ok(SKRIPTE_EN.some((s) => !s.fall_nr), 'es gibt Geschichten außerhalb der Serie');
  for (const s of SKRIPTE_EN.filter((x) => !x.fall_nr)) {
    const basis = { ...s, kurz: true, weiter: '', posten: '' };
    const f = folgeFuer({ ...basis, klassik: true }, baueFolge);
    assert.ok(f.klassik && f.szenen.length <= 8, `${s.titel}: ${f.szenen.length} Szenen`);
    assert.ok(!folgeFuer({ ...basis, klassik: false }, baueFolge).klassik, `${s.titel}: ohne Test-Arm kein Klassik`);
  }
});

test('Früher Schock: nur im Hit-Look, nach dem Titelbild, sonst zählt der Post nicht im Test', async () => {
  const { fruehSchock, folgeFuer } = await import('../../automations/lib/bufferVerteiler.mjs');
  const { baueFolge } = await import('../../automations/schatten/videobot.mjs');
  const { SKRIPTE_EN } = await import('../../automations/schatten/skripteEn.mjs');
  const basis = { ...SKRIPTE_EN[0], kurz: true, weiter: '', posten: '' };
  const hit = folgeFuer({ ...basis, klassik: true }, baueFolge), akte = folgeFuer({ ...basis, klassik: false }, baueFolge);
  const an = fruehSchock(hit, true);
  assert.equal(an.frueh, true);
  assert.deepEqual(an.folge.szenen[0].blitzbild, [0.5, 1.1]);
  assert.ok(an.folge.szenen[0].blitzbild[0] > 0.35 + 2 / 30, 'Fratze nie auf dem Titelbild (0,35 s)');
  assert.equal(hit.szenen[0].blitzbild, undefined, 'Original bleibt unverändert');
  assert.deepEqual(fruehSchock(hit, false), { folge: hit, frueh: false });
  assert.deepEqual(fruehSchock(akte, true), { folge: akte, frueh: null });
});
