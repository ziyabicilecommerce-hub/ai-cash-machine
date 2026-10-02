// Post-Texte je Plattform: Laengen, Hashtags, Link nur wo klickbar, KI-Hinweis; Auswahl fuer heute.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../zentrale/js/captions.js';

const { fuerPlattform, heute, PLATTFORMEN } = globalThis.ZCaptions;
const video = { titel: 'DeskRebel PowerBand – Dein Klimmzug-Upgrade', caption: `Ohne Band ist der Klimmzug schwer. ${'Mit Band schaffst du ihn. '.repeat(200)}\n#Klimmzug #Fitness #HomeGym #DeskRebel #Training #Sport\n\n👉 https://www.deskrebel.store/products/powerband`, datei: 'a.mp4', sprache: 'de', format: 'hoch', dauer: 30 };

test('jede Plattform: Laengengrenze, KI-Hinweis, kein Link wo er nicht klickbar ist', () => {
  const grenzen = { tiktok: 2200, instagram: 2200, youtube: 5000, x: 280, pinterest: 500, facebook: 5000 };
  for (const p of Object.keys(PLATTFORMEN)) {
    const t = fuerPlattform(video, p);
    assert.ok([...t.text].length <= grenzen[p], `${p} zu lang`);
    assert.match(t.text, /#KI|KI-generiert/, `${p} ohne KI-Hinweis`);
  }
  assert.ok(!fuerPlattform(video, 'tiktok').text.includes('https://'), 'TikTok-Caption-Links sind nicht klickbar');
  assert.match(fuerPlattform(video, 'tiktok').text, /Link in Bio/);
  assert.match(fuerPlattform(video, 'x').text, /deskrebel\.store\/products\/powerband/);
  assert.ok([...fuerPlattform(video, 'youtube').titel].length <= 100);
  assert.match(fuerPlattform(video, 'pinterest').link, /^https:\/\/www\.deskrebel\.store\/products\/powerband\?utm_source=pinterest&utm_medium=social/);
  assert.throws(() => fuerPlattform(video, 'myspace'), /Unbekannte Plattform/);
});

test('heute: nur deutsche Kurzvideos, ohne bereits gepostete und ohne Doppelte', () => {
  const v = (datei, x = {}) => ({ ...video, datei, ...x });
  const liste = heute([v('1.mp4'), v('2.mp4'), v('3.mp4', { titel: 'B' }), v('4.mp4', { sprache: 'fr', titel: 'C' }), v('5.mp4', { dauer: 300, titel: 'D' }), v('6.mp4', { titel: 'E', kanal: 'fakten' })], { gepostet: ['3.mp4'] });
  assert.equal(JSON.stringify(liste.map((x) => x.datei)), '["1.mp4"]');
});

test('international: Videos je Sprache, KI-Hinweis als "AI-generated"/#AI ausser auf Deutsch', () => {
  const es = { titel: 'Tu mejora para dominadas', caption: 'Texto #fitness #KI\n👉 https://www.deskrebel.store/products/powerband', sprache: 'es', format: 'hoch', dauer: 30, datei: 'es.mp4' };
  const de = { ...es, titel: 'Dein Klimmzug-Upgrade', sprache: 'de', datei: 'de.mp4' };
  assert.deepEqual(ZCaptions.heute([es, de], { sprache: 'es' }).map((v) => v.datei), ['es.mp4']);
  assert.deepEqual(ZCaptions.heute([es, de]).map((v) => v.datei), ['de.mp4'], 'Standard bleibt Deutsch');
  const ig = ZCaptions.fuerPlattform(es, 'instagram').text;
  assert.match(ig, /AI-generated/);
  assert.match(ig, /#AI/);
  assert.doesNotMatch(ig, /#KI|KI-generiert/);
  assert.match(ZCaptions.fuerPlattform(de, 'instagram').text, /KI-generiert[\s\S]*#KI/);
});
