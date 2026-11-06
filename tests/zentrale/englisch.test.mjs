import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKRIPTE_EN, naechstesSkriptEn } from '../../automations/schatten/skripteEn.mjs';
import { baueFolge, pruefen, slug } from '../../automations/schatten/videobot.mjs';

test('Englische Geschichten: gültig, kurze Hooks, Du-Hooks, keine doppelt, kein Deutsch im Video', () => {
  assert.ok(SKRIPTE_EN.length >= 44);
  assert.equal(new Set(SKRIPTE_EN.map((s) => slug(s.titel))).size, SKRIPTE_EN.length);
  for (const s of SKRIPTE_EN) {
    assert.deepEqual(pruefen(s), [], s.titel);
    assert.ok(s.hook.length <= 70 && s.hook2.length <= 70, `${s.hook} / ${s.hook2}`);
    assert.ok(/\b(you|your)\b/i.test(s.hook2) && /[.!]$/.test(s.hook2), s.hook2);
    const f = baueFolge({ ...s, kurz: true });
    assert.equal(f.sprache, 'en'); assert.match(f.stimme, /^en-US-/);
    const alles = JSON.stringify(f.szenen.map((x) => [x.sprich, x.text, x.cta, x.frage])) + f.caption;
    assert.ok(!/\b(und|nicht|ich|kommentier|folg|schreib|eins|zwei|kopfhörer|versteckt)\b/i.test(alles), `Deutsch in ${s.titel}: ${alles.slice(0, 200)}`);
  }
  const erste = naechstesSkriptEn([]), zweite = naechstesSkriptEn([slug(erste.titel)]);
  assert.notEqual(erste.muster, zweite.muster, 'Muster wechseln sich ab');
  const anruf = SKRIPTE_EN.filter((s) => s.muster === 'anruf');
  const letzte = [{ konto: '@giyuuu sama', aufrufe: 900, text: anruf[0].hook }, { konto: '@giyuuu sama', aufrufe: 800, text: anruf[1].hook2 },
    { konto: '@giyuuu sama', aufrufe: 5, text: SKRIPTE_EN.find((s) => s.muster === 'allein').hook }, { konto: '@giyuuu sama', aufrufe: 5, text: SKRIPTE_EN.filter((s) => s.muster === 'allein')[1].hook }];
  assert.equal(naechstesSkriptEn([slug(anruf[0].titel), slug(anruf[1].titel)], letzte).muster, 'anruf', 'lernt das beste Muster');
});

test('Englischer Kanal: nur mit Kanal-ID aktiv, englische Texte bei YouTube, Instagram und Story', async () => {
  const ohne = await import(`../../automations/lib/bufferVerteiler.mjs?ohne=${Date.now()}`);
  assert.equal(ohne.KANAELE.find((k) => k.name === 'giyuuu sama').quelle, 'horror-mix', 'YouTube testet Deutsch gegen Englisch');
  process.env.EN_KANAL = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const mit = await import(`../../automations/lib/bufferVerteiler.mjs?mit=${Date.now()}`);
  delete process.env.EN_KANAL;
  const k = mit.KANAELE.find((x) => x.name === 'english-horror');
  assert.equal(k.dienst, 'youtube');
  const f = baueFolge({ ...SKRIPTE_EN[0], kurz: true });
  const yt = mit.beitrag({ caption: f.caption, titel: f.titel }, 'youtube', 'horror-en');
  assert.equal(yt.metadata.youtube.title, `${SKRIPTE_EN[0].hook} 😨 #shorts`);
  assert.match(yt.text, /AI-generated/); assert.ok(!/Gruselgeschichte|KI-generiert/.test(yt.text));
  const ig = mit.beitrag({ caption: f.caption }, 'instagram', 'horror-en');
  assert.match(ig.text, /#scarystories/); assert.match(ig.metadata.instagram.firstComment, /second/);
  assert.match(mit.storyEingabe('a'.repeat(24), 'https://x/c.jpg', true).metadata.instagram.stickerFields.text, /New video/);
});

test('Part 2 auf Englisch bei einem Hit, ohne den Du-Hook von Teil 1', async () => {
  const { teil2Kandidat, alleSkripte } = await import('../../automations/schatten/skriptBot.mjs');
  const s = SKRIPTE_EN.find((x) => x.muster === 'kamera');
  const normal = [40, 50, 60].map((a) => ({ konto: '@giyuuu sama', aufrufe: a, text: 'x' }));
  const t = teil2Kandidat('giyuuu', [], [...normal, { konto: '@giyuuu sama', aufrufe: 600, text: s.hook2 }], { alle: SKRIPTE_EN, suffix: ' – Part 2' });
  assert.equal(t.titel, `${s.titel} – Part 2`); assert.equal(t.hook2, undefined); assert.equal(t.sprache, 'en');
  const f = baueFolge({ ...t, kurz: true });
  assert.ok(!/\b(und|nicht|ich|teil)\b/i.test(JSON.stringify(f.szenen.map((x) => x.sprich)) + f.caption));
  for (const m of new Set(SKRIPTE_EN.map((x) => x.muster))) assert.deepEqual(pruefen({ ...SKRIPTE_EN.find((x) => x.muster === m), ...SKRIPTE_EN.find((x) => x.muster === m).teil2 }), [], m);
  const de = alleSkripte()[0];
  const tde = teil2Kandidat('desk.rebel', [], [...normal.map((p) => ({ ...p, konto: '@desk.rebel' })), { konto: '@desk.rebel', aufrufe: 600, text: de.hook }]);
  assert.equal(tde.hook2, undefined, 'deutscher Teil 2 erbt keinen Du-Hook');
});

test('Sprach-Test: 50/50 bis ein klarer Sieger feststeht', async () => {
  const { sprachAnteil } = await import('../../automations/lib/bufferVerteiler.mjs');
  const { sprachTest } = await import('../../automations/lib/wochenbericht.mjs');
  assert.equal(sprachAnteil(null), 0.5);
  assert.equal(sprachAnteil({ de: { n: 4, schnitt: 200 }, en: { n: 4, schnitt: 400 } }), 0.85);
  assert.equal(sprachAnteil({ de: { n: 4, schnitt: 400 }, en: { n: 4, schnitt: 200 } }), 0.15);
  assert.equal(sprachAnteil({ de: { n: 4, schnitt: 300 }, en: { n: 3, schnitt: 900 } }), 0.5, 'zu wenig Daten');
  assert.equal(sprachAnteil({ de: { n: 5, schnitt: 300 }, en: { n: 5, schnitt: 350 } }), 0.5, 'kein klarer Sieger');
  const t = sprachTest([{ konto: '@giyuuu sama', aufrufe: 700, text: 'Wenn dich deine eigene Nummer anruft' }, { konto: '@giyuuu sama', aufrufe: 100, text: 'My phone rings.' }, { konto: '@desk.rebel', aufrufe: 999, text: 'x' }],
    (p) => /\bmy\b/i.test(p.text));
  assert.deepEqual(t, { de: { n: 1, schnitt: 700 }, en: { n: 1, schnitt: 100 } });
});
