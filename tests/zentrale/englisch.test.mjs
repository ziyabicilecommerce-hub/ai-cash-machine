import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKRIPTE_EN, naechstesSkriptEn } from '../../automations/schatten/skripteEn.mjs';
import { baueFolge, pruefen, slug } from '../../automations/schatten/videobot.mjs';

test('Englische Geschichten: gültig, kurze Hooks, Du-Hooks, keine doppelt, kein Deutsch im Video', () => {
  assert.ok(SKRIPTE_EN.length >= 24);
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
  assert.equal(naechstesSkriptEn([slug(SKRIPTE_EN[0].titel)]).titel, SKRIPTE_EN[1].titel);
});

test('Englischer Kanal: nur mit Kanal-ID aktiv, englische Texte bei YouTube, Instagram und Story', async () => {
  const ohne = await import(`../../automations/lib/bufferVerteiler.mjs?ohne=${Date.now()}`);
  assert.deepEqual(ohne.KANAELE.filter((k) => k.quelle === 'horror-en').map((k) => k.name), ['giyuuu sama'], 'YouTube ist englisch');
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
