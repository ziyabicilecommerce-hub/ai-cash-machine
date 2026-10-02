// Anwendungs-Szene: Person mit dem echten Produkt, aus dem Produktfoto als Vorlage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { anwendungEinbauen, anwendungBild, anwendungURL, vergleichEinbauen } from '../../automations/lib/anwendung.mjs';

const skript = () => ({ szenen: ['Hook', 'Problem', 'Vorteil', 'Vorteil 2', 'Link in der Bio'].map((text) => ({ text, foto: 'f.png' })) });
const fotos = ['https://cdn.shopify.com/a.png', 'https://cdn.shopify.com/b.png'];

test('anwendungEinbauen setzt die Szene mit echtem Produktfoto als Vorlage, nie Hook oder Schluss', () => {
  const s = anwendungEinbauen(skript(), { szene: 2, foto: 1, prompt: 'realistic photo, person using this resistance band for a pull-up' }, fotos);
  assert.equal(s.szenen[2].anwendung.ref, fotos[1]);
  assert.equal(s.szenen[2].foto, 'f.png', 'Produktfoto bleibt als Rueckfall');
  assert.equal(anwendungEinbauen(skript(), { szene: 0, prompt: 'person using the product at the desk' }, fotos).szenen[1].anwendung.ref, fotos[0]);
  assert.ok(anwendungEinbauen(skript(), { szene: 9, prompt: 'person using the product at the desk' }, fotos).szenen[3].anwendung);
  assert.ok(!anwendungEinbauen(skript(), undefined, fotos).szenen.some((x) => x.anwendung), 'ohne KI-Angabe keine Szene');
  assert.ok(!anwendungEinbauen(skript(), { prompt: 'person using the product' }, []).szenen.some((x) => x.anwendung), 'ohne Foto keine Szene');
});

test('anwendungURL gibt das echte Produktfoto als Vorlage mit', () => {
  const u = new URL(anwendungURL('person using it', fotos[0], { breite: 1080, hoehe: 1920, model: 'kontext', seed: 1 }));
  assert.equal(u.searchParams.get('image'), fotos[0]);
  assert.equal(u.searchParams.get('model'), 'kontext');
});

test('anwendungBild probiert das naechste Modell, wenn eins kein Bild liefert', async () => {
  const ziel = join(mkdtempSync(join(tmpdir(), 'anw-')), 'r.img');
  const gefragt = [];
  const laden = async (url) => {
    const model = new URL(url).searchParams.get('model');
    gefragt.push(model);
    return model === 'kontext'
      ? new Response('{"error":"needs auth"}', { status: 401, headers: { 'content-type': 'application/json' } })
      : new Response(new Uint8Array(30000), { status: 200, headers: { 'content-type': 'image/jpeg' } });
  };
  assert.equal(await anwendungBild({ prompt: 'p', ref: fotos[0] }, ziel, { breite: 1080, hoehe: 1920, laden }), true);
  assert.equal(JSON.stringify(gefragt), '["kontext","gptimage"]');
  assert.equal(readFileSync(ziel).length, 30000);
  const leer = join(mkdtempSync(join(tmpdir(), 'anw-')), 'r.img');
  assert.equal(await anwendungBild({ prompt: 'p', ref: fotos[0] }, leer, { breite: 1080, hoehe: 1920, laden: async () => new Response('x', { status: 500 }) }), false);
  assert.ok(!existsSync(leer));
});

test('vergleichEinbauen setzt Ohne/Mit auf die Problem-Szene und schiebt die Anwendung eine weiter', () => {
  const mitAnwendung = anwendungEinbauen(skript(), { szene: 1, foto: 1, prompt: 'person using this resistance band for a pull-up' }, fotos);
  const s = vergleichEinbauen(mitAnwendung, { szene: 1, ohne: 'person struggling with a pull-up at home', mit: 'same person doing the pull-up with the band' }, fotos);
  assert.equal(s.szenen[1].vergleich.ref, fotos[1], 'echtes Produktfoto der Anwendung wird Vorlage');
  assert.ok(!s.szenen[1].anwendung);
  assert.ok(s.szenen[2].anwendung, 'Anwendung rueckt auf Szene 3');
  assert.ok(!vergleichEinbauen(skript(), { ohne: 'kurz', mit: 'kurz' }, fotos).szenen.some((x) => x.vergleich), 'zu kurze Prompts: kein Vergleich');
  assert.ok(vergleichEinbauen(skript(), { szene: 9, ohne: 'person struggling with a pull-up', mit: 'person doing it with the band' }, fotos).szenen[3].vergleich, 'nie die letzte Szene');
});

test('Demo-Sequenz: Schritte werden uebernommen, Video mit harten Schnitten entsteht', async () => {
  const s = anwendungEinbauen(skript(), { szene: 2, prompt: 'person using this resistance band', schritte: ['hook band on bar', 'pull up with band', 'hold at the top'] }, fotos);
  assert.equal(s.szenen[2].anwendung.schritte.length, 3);
  assert.ok(!anwendungEinbauen(skript(), { szene: 2, prompt: 'person using this resistance band', schritte: ['nur einer zu kurz'] }, fotos).szenen[2].anwendung.schritte);
  const { demoBilder, demoVideoBauen, KAPUTT } = await import('../../automations/lib/anwendung.mjs');
  KAPUTT.clear();
  const dir = mkdtempSync(join(tmpdir(), 'demo-'));
  const { execFileSync } = await import('node:child_process');
  let nr = 0;
  const laden = async () => {
    nr += 1;
    const ziel = join(dir, `q${nr}.jpg`);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x${nr}${nr}4080:size=270x480`, '-frames:v', '1', ziel]);
    return new Response(new Uint8Array([...readFileSync(ziel), ...new Uint8Array(25000)]), { headers: { 'content-type': 'image/jpeg' } });
  };
  const roh = join(dir, 'r.img');
  const bilder = await demoBilder({ schritte: ['a', 'b', 'c'], ref: fotos[0] }, roh, { breite: 270, hoehe: 480, laden });
  assert.equal(bilder.length, 3);
  assert.ok(existsSync(roh), 'erstes Schrittbild wird Szenenbild');
  const video = demoVideoBauen(bilder, join(dir, 'demo.mp4'), 2.4, { breite: 270, hoehe: 480, schrift: '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' });
  const dauer = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video], { encoding: 'utf8' }));
  assert.ok(dauer > 2.2 && dauer < 2.8, `Dauer ${dauer}`);
  assert.equal(JSON.stringify(await demoBilder({ schritte: ['a', 'b'], ref: fotos[0] }, join(dir, 'x.img'), { breite: 270, hoehe: 480, laden: async () => new Response('x', { status: 500 }) })), '[]');
});

test('schneller: Schritt-Bilder parallel, kaputte Modelle werden im Lauf uebersprungen', async () => {
  const { demoBilder, anwendungBild, KAPUTT } = await import('../../automations/lib/anwendung.mjs');
  KAPUTT.clear();
  const dir = mkdtempSync(join(tmpdir(), 'schnell-'));
  let gleichzeitig = 0, max = 0;
  const bild = new Uint8Array(30000);
  const laden = async (url) => {
    gleichzeitig++; max = Math.max(max, gleichzeitig);
    await new Promise((r) => setTimeout(r, 30));
    gleichzeitig--;
    return url.includes('model=kontext') ? new Response('x', { status: 402 }) : new Response(bild, { headers: { 'content-type': 'image/jpeg' } });
  };
  const bilder = await demoBilder({ schritte: ['a', 'b', 'c'], ref: 'https://x/y.jpg' }, join(dir, 'r.img'), { breite: 270, hoehe: 480, laden });
  assert.equal(bilder.length, 3);
  assert.ok(max >= 3, `parallel geladen (max ${max})`);
  assert.ok(KAPUTT.has('kontext'), 'kontext lieferte 402 -> gemerkt');
  const urls = [];
  await anwendungBild({ prompt: 'p', ref: 'https://x/y.jpg' }, join(dir, 'z.img'), { breite: 270, hoehe: 480, laden: async (u) => { urls.push(u); return new Response(bild, { headers: { 'content-type': 'image/jpeg' } }); } });
  assert.ok(!urls.some((u) => u.includes('model=kontext')), 'kaputtes Modell wird nicht nochmal versucht');
  KAPUTT.clear();
});
