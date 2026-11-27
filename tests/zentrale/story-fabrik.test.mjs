import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pruefen, plan, promptBauen, figurenIn } from '../../automations/schatten/storyFabrik.mjs';

const ep = JSON.parse(readFileSync('automations/schatten/folgen/mutterwaerme-1.json', 'utf8'));
// Die Gratis-Fabrik trägt fertige Bilder/Clips (Release-Links) in die Datei ein -> Plan-Tests mit dem Ausgangsstand
const istRelease = (u) => /\/releases\/download\//.test(String(u || ''));
const frisch = {
  ...ep,
  figuren: Object.fromEntries(Object.entries(ep.figuren).map(([k, f]) => [k, istRelease(f.blattUrl) ? { ...f, blattUrl: undefined } : f])),
  szenen: ep.szenen.map((s) => (istRelease(s.bild) ? { ...s, bild: undefined, clip: undefined } : istRelease(s.clip) ? { ...s, clip: undefined } : s)),
};

test('Story-Fabrik: Mutterwärme Teil 1 erfüllt das Format (Hook zuerst, 10-16 Schnitte, Cliffhanger)', () => {
  assert.deepEqual(pruefen(ep), []);
});

test('Story-Fabrik: Format-Verstöße werden erkannt', () => {
  const kaputt = { ...ep, szenen: ep.szenen.slice(0, 5).map((s, i) => (i === 4 ? { text: 'Ende.' } : s)) };
  const f = pruefen(kaputt);
  assert.ok(f.some((x) => x.includes('Einstellungen')));
  assert.ok(f.some((x) => x.includes('Cliffhanger')));
  assert.ok(f.some((x) => x.includes('weder Bild')));
});

test('Story-Fabrik: Plan gibt Figurenblatt als Referenz mit, Clips nur für fertige Bilder', () => {
  const p = plan(frisch);
  assert.equal(p.blaetter.length, 1);
  assert.equal(p.blaetter[0].figur, 'MADAME');
  const tuer = p.bilder.find((b) => b.index === 4);
  assert.deepEqual(tuer.wartetAuf, ['MADAME']);
  assert.equal(tuer.params.medias.length, 1);  // Mama + Sohn teilen ein Figurenblatt -> nur einmal
  assert.ok(p.clips.every((c) => c.params.medias[0].role === 'start_image'));
  assert.ok(!p.clips.some((c) => c.index === 3));  // Szene 3 hat schon einen Clip
  assert.deepEqual(figurenIn('{MAMA} und {SOHN}', ep.figuren), ['MAMA', 'SOHN']);
  assert.ok(promptBauen('{SOHN} eats', ep.figuren).includes('from the reference image'));
});

test('Gratis-Story-Fabrik: offene Arbeit, Prompt ohne Referenz, Fortschritt eintragen', async () => {
  const { offen, promptOhneRef, eintragen } = await import('../../automations/schatten/storyGratis.mjs');
  const o = offen(frisch);
  assert.deepEqual(o.blaetter, ['MADAME']);
  assert.equal(o.bilder.length, 8);
  assert.ok(!o.clips.includes(2));
  assert.ok(promptOhneRef('{MADAME} smiles', ep.figuren).includes('lavender'));
  const neu = eintragen(frisch, { blaetter: { MADAME: 'blatt-MADAME.jpg' }, bilder: { 3: 's4.jpg' }, clips: { 0: 's1.mp4' } }, 'https://x/dl/T/');
  assert.equal(neu.figuren.MADAME.blattUrl, 'https://x/dl/T/blatt-MADAME.jpg');
  assert.equal(neu.szenen[3].bild, 'https://x/dl/T/s4.jpg');
  assert.equal(neu.szenen[0].clip, 'https://x/dl/T/s1.mp4');
  assert.equal(offen(neu).bilder.length, 7);
});

test('Cloudflare-Bild: Antwort als JSON-base64 oder Bilddaten', async () => {
  const { bildAusAntwort } = await import('../../automations/lib/cfBild.mjs');
  const json = new Response(JSON.stringify({ result: { image: Buffer.from('BILD').toString('base64') } }), { headers: { 'content-type': 'application/json' } });
  assert.equal((await bildAusAntwort(json)).toString(), 'BILD');
  const roh = new Response(Buffer.from('PNG'), { headers: { 'content-type': 'image/png' } });
  assert.equal((await bildAusAntwort(roh)).toString(), 'PNG');
  await assert.rejects(bildAusAntwort(new Response('{"errors":[{"message":"nope"}]}', { status: 400, headers: { 'content-type': 'application/json' } })), /nope/);
});

test('Story-Fabrik: Klick-Liste mit Startbild und Prompt je Szene', async () => {
  const { klickliste } = await import('../../automations/schatten/storyFabrik.mjs');
  const k = klickliste(ep);
  assert.ok(k.includes('### Szene 13'));
  assert.ok(k.includes('✅ Clip schon da'));
  assert.ok(k.includes('wan.video'));
});

test('Seedance (BytePlus): Auftrag 9:16 ohne Wasserzeichen, Fehlerarten, Modell-Wechsel', async () => {
  const { auftrag, leer, unbekannt, arkClip } = await import('../../automations/lib/arkVideo.mjs');
  const { writeFileSync, mkdtempSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'ark-'));
  const bild = join(dir, 'b.jpg');
  writeFileSync(bild, 'JPG');
  const a = auftrag('m1', 'wax drips', bild);
  assert.match(a.content[0].text, /--ratio 9:16 .*--watermark false/);
  assert.ok(a.content[1].image_url.url.startsWith('data:image/jpeg;base64,'));
  assert.ok(leer(429, '') && leer(400, 'insufficient balance') && !leer(400, 'bad prompt'));
  assert.ok(unbekannt(404, '') && unbekannt(400, 'InvalidEndpointOrModel.NotFound'));
  process.env.ARK_API_KEY = 'x';
  process.env.ARK_VIDEO_MODELL = 'gibts-nicht';
  const aufrufe = [];
  const laden = async (url, o = {}) => {
    aufrufe.push(url);
    if (o.method === 'POST') {
      const m = JSON.parse(o.body).model;
      return m === 'gibts-nicht' ? new Response('{"error":{"code":"InvalidEndpointOrModel.NotFound"}}', { status: 404 }) : new Response('{"id":"t1"}');
    }
    if (url.endsWith('/tasks/t1')) return new Response('{"status":"succeeded","content":{"video_url":"https://v/clip.mp4"}}');
    return new Response('MP4');
  };
  const r = await arkClip(bild, 'p', join(dir, 'c.mp4'), { warten: 1, laden });
  assert.equal(r.model, 'seedance-1-0-pro-fast-251015');
  assert.equal(readFileSync(join(dir, 'c.mp4'), 'utf8'), 'MP4');
  delete process.env.ARK_API_KEY;
  delete process.env.ARK_VIDEO_MODELL;
});

test('Sprachfassung: Bilder aus der Basis, Texte und Stimme aus der Fassung', async () => {
  const { mitBasis } = await import('../../automations/schatten/storyGratis.mjs');
  const { pruefen } = await import('../../automations/schatten/storyFabrik.mjs');
  const en = JSON.parse(readFileSync('automations/schatten/folgen/mutterwaerme-1-en.json', 'utf8'));
  const e = mitBasis(en, 'automations/schatten/folgen/mutterwaerme-1-en.json');
  assert.equal(e.szenen.length, 13);
  assert.equal(e.szenen[0].text, en.hook);
  assert.equal(e.szenen[0].bild, ep.szenen[0].bild);
  assert.equal(e.stimme, 'en-US-AnaNeural');
  assert.deepEqual(pruefen(e), []);
});

test('Kerzenmutter englisch: ein Text je Szene, kurz genug, Hook vorne', async () => {
  const { mitBasis } = await import('../../automations/schatten/storyGratis.mjs');
  const datei = 'automations/schatten/folgen/kerzenmutter-1-en.json';
  const en = JSON.parse(readFileSync(datei, 'utf8'));
  const de = JSON.parse(readFileSync('automations/schatten/folgen/kerzenmutter-1.json', 'utf8'));
  const e = mitBasis(en, datei);
  assert.equal(en.texte.length, de.szenen.length);
  assert.equal(e.szenen[0].text, en.hook);
  assert.ok(en.texte.every((t) => t.length <= 80));
  assert.equal(e.szenen[2].clip, de.szenen[2].clip);
});

test('Quellen-Netz: Reihenfolge, aktive Quellen je nach Schlüssel, kein Kaggle', async () => {
  const { QUELLEN, netzStatus, netzBericht, aktiv, quellenZaehlen } = await import('../../automations/lib/quellenNetz.mjs');
  const clips = QUELLEN.filter((q) => q.art === 'clip').map((q) => q.id);
  assert.deepEqual(clips, ['seedance', 'agnes', 'modal', 'zhipu', 'freeai', 'huggingface', 'kamerafahrt']);
  assert.ok(!QUELLEN.some((q) => /kaggle/i.test(q.id + q.name)));
  const ohne = netzStatus({});
  assert.ok(ohne.find((q) => q.id === 'huggingface').aktiv && !ohne.find((q) => q.id === 'modal').aktiv);
  assert.ok(aktiv('modal', { MODAL_TOKEN_ID: 'a', MODAL_TOKEN_SECRET: 'b' }));
  assert.ok(!aktiv('modal', { MODAL_TOKEN_ID: 'a' }));
  assert.match(netzBericht({ ARK_API_KEY: 'x' }), /✓ Clip: BytePlus Seedance/);
  assert.equal(quellenZaehlen({ 0: 'Modal', 1: 'Modal', 2: 'Seedance' }), 'Modal 2x, Seedance 1x');
});
