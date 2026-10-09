// Echte Video-Clips (Pexels) für den Fakten-Kanal: Suchbegriff, Clip-Auswahl, Zuschnitt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { suchbegriff, clipAuswaehlen, clipAnpassen, stockHolen, kernwoerter, commonsAuswaehlen, nasaDateiAuswaehlen } from '../../automations/lib/stockVideo.mjs';

test('suchbegriff: nur das Motiv, ohne Stil-Wörter, max. 5 Wörter', () => {
  assert.equal(suchbegriff('planet Venus with thick glowing clouds in space, cinematic, photorealistic, dramatic light, no text, no people'), 'planet Venus with thick clouds');
  assert.equal(suchbegriff('golden honey dripping from a wooden dipper, close-up detail, cinematic, no text, no people'), 'golden honey dripping from a');
  assert.equal(suchbegriff(''), '');
});

test('clipAuswaehlen: Hochformat, mind. 1280 hoch, mind. 4 s, nahe 1920, nichts doppelt', () => {
  const antwort = { videos: [
    { id: 1, duration: 10, video_files: [{ link: 'https://x/1.mp4', file_type: 'video/mp4', width: 1920, height: 1080 }] },
    { id: 2, duration: 2, video_files: [{ link: 'https://x/2.mp4', file_type: 'video/mp4', width: 1080, height: 1920 }] },
    { id: 3, duration: 12, video_files: [
      { link: 'https://x/3a.mp4', file_type: 'video/mp4', width: 2160, height: 3840 },
      { link: 'https://x/3b.mp4', file_type: 'video/mp4', width: 1080, height: 1920 },
      { link: 'http://x/3c.mp4', file_type: 'video/mp4', width: 1080, height: 1920 }] },
  ] };
  assert.deepEqual(clipAuswaehlen(antwort), { id: 3, link: 'https://x/3b.mp4', dauer: 12 });
  assert.equal(clipAuswaehlen(antwort, new Set([3])), null);
  assert.equal(clipAuswaehlen({}), null);
});

test('stockHolen: nur Pexels ohne Schlüssel -> kein Netz, leeres Ergebnis', async () => {
  assert.equal(await stockHolen('planet venus', '/tmp/x.mp4', { schluessel: '', quellen: ['pexels'] }), '');
});

test('kernwoerter: Motiv ohne Füllwörter', () => {
  assert.equal(kernwoerter('planet Venus with thick glowing clouds in space, cinematic, no people'), 'planet Venus thick');
  assert.equal(kernwoerter('golden honey dripping from a wooden dipper, cinematic', 2), 'golden honey');
});

test('commonsAuswaehlen: nur gemeinfrei/CC0, lang genug, 480-1080p-Fassung', () => {
  const v = (title, lizenz, extra = {}) => ({ title, videoinfo: [{ duration: 12, width: 1920, height: 1080, size: 9e6, url: `https://upload.wikimedia.org/${title}.webm`, extmetadata: { LicenseShortName: { value: lizenz } },
    derivatives: [{ src: `https://upload.wikimedia.org/${title}.1080p.webm`, type: 'video/webm; codecs="vp9"', height: 1080 }, { src: `https://upload.wikimedia.org/${title}.2160p.webm`, type: 'video/webm', height: 2160 }], ...extra }] });
  const antwort = { query: { pages: { 1: v('File:A', 'CC BY-SA 4.0'), 2: v('File:B', 'Public domain', { duration: 1 }), 3: v('File:C', 'CC0') } } };
  assert.deepEqual(commonsAuswaehlen(antwort), { id: 'File:C', link: 'https://upload.wikimedia.org/File:C.1080p.webm', dauer: 12 });
  assert.equal(commonsAuswaehlen(antwort, new Set(['File:C'])), null);
  assert.equal(commonsAuswaehlen({}), null);
});

test('nasaDateiAuswaehlen: nur die mittlere MP4 (kleinere Fassungen wurden unscharf), https', () => {
  assert.equal(nasaDateiAuswaehlen(['http://images-assets.nasa.gov/video/x/x~orig.mp4', 'http://images-assets.nasa.gov/video/x/x~medium.mp4', 'http://images-assets.nasa.gov/video/x/x~small.mp4']), 'https://images-assets.nasa.gov/video/x/x~medium.mp4');
  assert.equal(nasaDateiAuswaehlen(['https://a/x~mobile.mp4', 'https://a/x~preview.mp4']), '');
  assert.equal(nasaDateiAuswaehlen(['https://a/x.srt']), '');
});

test('clipAnpassen: kurzer Querformat-Clip wird Hochformat in Szenenlänge', () => {
  const d = mkdtempSync(join(tmpdir(), 'stock-'));
  const quelle = join(d, 'q.mp4');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=1', '-pix_fmt', 'yuv420p', quelle]);
  const ziel = clipAnpassen(quelle, join(d, 'z.mp4'), 2.5, { breite: 540, hoehe: 960 });
  assert.ok(ziel);
  const info = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', ziel]).toString();
  const j = JSON.parse(info);
  assert.equal(j.streams[0].width, 540);
  assert.equal(j.streams[0].height, 960);
  assert.ok(Math.abs(Number(j.format.duration) - 2.5) < 0.15);
});

import { titelPasst, hauptwoerter } from '../../automations/lib/stockVideo.mjs';

test('titelPasst: Hauptwort muss als ganzes Wort im Titel stehen (Live-Fehlgriffe aus dem Test)', () => {
  const honig = 'golden honey dripping from a wooden dipper, close-up detail, cinematic';
  const blitz = 'lightning bolt striking over a city skyline at night, cinematic';
  assert.deepEqual(hauptwoerter(honig), ['honey']);
  assert.equal(titelPasst('File:20160923-AMS-LSC-9001 (Food Demo-Sweet Potato).webm', honig), false);
  assert.equal(titelPasst('File:Republic Aviation - P-47D Thunderbolt start-up', blitz), false);
  assert.equal(titelPasst('File:Honey dripping.webm', honig), true);
  assert.equal(titelPasst('File:Lightning over Oradea.webm', blitz), true);
  assert.equal(titelPasst("NASA's Return to Venus", 'planet Venus with thick glowing clouds in space'), true);
});

import { mitMenschen, clipsHolen } from '../../automations/lib/stockVideo.mjs';
import { writeFileSync } from 'node:fs';

test('mitMenschen: Titel mit Personen werden für Shop-Videos aussortiert', () => {
  assert.equal(mitMenschen('File:Woman doing yoga at sunset.webm'), true);
  assert.equal(mitMenschen('File:Kodune mee võtmine. Harvesting honey with family'), true);
  assert.equal(mitMenschen('File:Flash-Lightning over Germany.ogv'), false);
  assert.equal(mitMenschen('https://www.pexels.com/video/man-typing-on-laptop-123/'), true);
  assert.equal(mitMenschen('https://www.pexels.com/video/ocean-waves-crashing-456/'), false);
});

test('clipsHolen: Produkt-, KI-Beispiel- und Vergleichs-Szenen bleiben unangetastet, vorhandene Clips zählen', async () => {
  const d = mkdtempSync(join(tmpdir(), 'clips-'));
  const da = join(d, 'da.mp4');
  writeFileSync(da, 'x');
  const szenen = [
    { text: 'a', foto: 'https://shop/x.jpg', bild: 'desk' },
    { text: 'b', anwendung: { prompt: 'p' }, bild: 'desk' },
    { text: 'c', vergleich: { ohne: 'x', mit: 'y' } },
    { text: 'd', video: da, bild: 'ocean' },
    { text: 'e' },
  ];
  assert.equal(await clipsHolen(szenen, d), 1);
  assert.equal(szenen[0].video, undefined);
  assert.equal(szenen[1].video, undefined);
  assert.equal(szenen[3].video, da);
});

import { langlinksAus } from '../../automations/lib/stockVideo.mjs';

test('international: Übersetzungen aus Wikipedia-Sprachlinks, Titel passt auch auf Deutsch/Französisch', () => {
  const antwort = { query: { pages: { 1: { title: 'Honey', langlinks: [
    { lang: 'de', '*': 'Honig' }, { lang: 'fr', '*': 'Miel' }, { lang: 'es', '*': 'Miel' }, { lang: 'it', '*': 'Miele' },
    { lang: 'ja', '*': '蜂蜜' }, { lang: 'pl', '*': 'Miód' }, { lang: 'nl', '*': 'Honing (voedsel)' }] } } } };
  const w = langlinksAus(antwort);
  assert.deepEqual(w, ['Honig', 'Miel', 'Miele', 'Miód', 'Honing']);
  const honig = 'golden honey dripping from a wooden dipper, cinematic';
  assert.equal(titelPasst('File:Honig fließt vom Löffel.webm', honig), false);
  assert.equal(titelPasst('File:Honig fließt vom Löffel.webm', honig, w), true);
  assert.equal(titelPasst('File:Récolte du miel en Provence.webm', honig, w), true);
  assert.deepEqual(langlinksAus({}), []);
});

import { unpassend } from '../../automations/lib/stockVideo.mjs';

test('unpassend: Politik, Nachrichten, Sendungen fliegen raus (Live-Fehlgriff Spinat -> West Wing Week)', () => {
  assert.equal(unpassend('File:West Wing Week- 01-22-2016 or, “Say Spinach, Say Kale".webm'), true);
  assert.equal(unpassend('File:President speech on honey bees.webm'), true);
  assert.equal(unpassend('File:Flash-Lightning over Germany.ogv'), false);
  assert.equal(unpassend("NASA's Return to Venus"), false);
  assert.equal(unpassend('File:Spider Moving on Silk Strands- night camera.mpg'), false);
});

import { filterFuer } from '../../automations/lib/stockVideo.mjs';

test('filterFuer: Querformat scharf in die Mitte mit Unschärfe-Hintergrund, Hochformat füllt das Bild', () => {
  const quer = filterFuer(1280, 720, 1080, 1920);
  assert.match(quer, /boxblur/);
  assert.match(quer, /scale=1080:-2/);
  assert.match(quer, /overlay/);
  const hoch = filterFuer(1080, 1920, 1080, 1920);
  assert.doesNotMatch(hoch, /boxblur/);
  assert.doesNotMatch(filterFuer(0, 0, 1080, 1920), /boxblur/, 'unbekannte Größe -> füllen');
});
