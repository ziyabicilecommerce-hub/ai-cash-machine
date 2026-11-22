import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auswahl, infoZu, kapitel, beitragLang, YT_KANAL } from '../../automations/lib/ytLangvideo.mjs';

const JETZT = Date.parse('2026-11-22T12:00:00Z');
const rel = (tageAlt, name, kanal = YT_KANAL) => ({ tag_name: `horror-${kanal}-x${tageAlt}`, created_at: new Date(JETZT - tageAlt * 864e5).toISOString(),
  assets: [{ name: 'cover.jpg' }, { name: `${name}.mp4`, browser_download_url: `https://example.org/${name}.mp4` }] });

test('Auswahl: nur YouTube-Shorts der letzten 8 Tage, älteste zuerst, höchstens 10', () => {
  const l = [rel(1, 'neu'), rel(3, 'mitte'), rel(9, 'zu-alt'), rel(2, 'anderer', 'abc'), ...Array.from({ length: 12 }, (_, i) => rel(4 + i * 0.1, `f${i}`))];
  const a = auswahl(l, JETZT);
  assert.equal(a.length, 10);
  assert.equal(a.at(-1).slug, 'neu');
  assert.ok(!a.some((x) => ['zu-alt', 'anderer'].includes(x.slug)));
});

test('Titel und Fallnummer aus den englischen Geschichten, Part 2 erkannt', () => {
  assert.deepEqual(infoZu('the-baby-monitor-man'), { titel: 'The Baby Monitor Man', nr: 9 });
  assert.deepEqual(infoZu('two-coffee-cups-part-2'), { titel: 'Two Coffee Cups (Part 2)', nr: 0 });
});

test('Kapitel beginnen bei 0:00 und laufen mit den Längen mit; Beitrag ohne #shorts und mit KI-Hinweis', () => {
  const teile = [{ titel: 'A', nr: 6, dauer: 40 }, { titel: 'B', nr: 0, dauer: 70 }, { titel: 'C', nr: 12, dauer: 30 }];
  assert.deepEqual(kapitel(teile, 4), ['0:00 Intro', '0:04 File 006 – A', '0:44 B', '1:54 File 012 – C']);
  const b = beitragLang(3, teile);
  assert.match(b.titel, /^The Erased Files #3/);
  assert.ok(!/#shorts/i.test(b.titel + b.text));
  assert.equal(b.metadata.youtube.isAiGenerated, true);
  assert.match(b.text, /AI-generated/);
});
