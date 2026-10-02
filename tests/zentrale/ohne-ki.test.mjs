// Notfall-Skript ohne KI: nur echte Saetze aus dem Shop-Text, Preis, CTA - Video faellt nicht mehr aus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saetzeAus, notfallSkript } from '../../automations/lib/ohneKi.mjs';
import { skriptMitFormat } from '../../automations/lib/formate.mjs';

const HTML = '<p><strong>Dein Klimmzug-Upgrade – überall, jederzeit.</strong></p><p>Das PowerBand ist ein endloses Latex-Loopband für Klimmzug-Unterstützung, Stretching und Krafttraining.</p>' +
  '<h3>Warum du es willst</h3><ul><li>Unterstützt dich bei Klimmzügen, bis du sie allein schaffst</li><li>Acht Stärken von Warm-up bis Profi</li><li>Maße: 208 cm x 4,5 mm</li><li>Kostenloser Versand ab 30 Euro</li></ul>' +
  '<p>Hinweis: Sportartikel, kein Medizinprodukt.</p>';
const P = { title: 'DeskRebel PowerBand – Klimmzugband', handle: 'powerband', shopName: 'DeskRebel', body_html: HTML, variants: [{ price: '12.99' }], images: [{ src: 'a' }, { src: 'b' }] };

test('saetzeAus nimmt nur sprechbare, echte Saetze - ohne Ueberschriften, Masse, Versand, Hinweis', () => {
  const s = saetzeAus(HTML);
  assert.deepEqual(s, [
    'Dein Klimmzug-Upgrade – überall, jederzeit.',
    'Das PowerBand ist ein endloses Latex-Loopband für Klimmzug-Unterstützung, Stretching und Krafttraining.',
    'Unterstützt dich bei Klimmzügen, bis du sie allein schaffst.',
    'Acht Stärken von Warm-up bis Profi.',
  ]);
  assert.deepEqual(saetzeAus('Warum du es willst Unterstützt dich jeden Tag beim Training. Hinweis: kein Medizinprodukt.'), ['Unterstützt dich jeden Tag beim Training.']);
});

test('notfallSkript: Hook + Shop-Saetze + Preis + Kommentar-Frage + Link in der Bio, Fotos reihum', () => {
  const d = notfallSkript(P, { such: null, tags: ['#klimmzugband', '#training'], tag: 1 });
  const texte = d.szenen.map((x) => x.text);
  assert.equal(texte[0], 'Klimmzugband in 30 Sekunden erklärt.');
  assert.equal(texte[1], 'Dein Klimmzug-Upgrade – überall, jederzeit.');
  assert.ok(texte.includes('Gerade für 12,99 Euro im DeskRebel.'));
  assert.match(texte.at(-2), /Kommentare/);
  assert.match(texte.at(-1), /Link in der Bio/);
  assert.deepEqual(d.szenen.map((x) => x.foto), texte.map((_, i) => i % 2));
  assert.match(d.caption, /#klimmzugband #training .*#DeskRebel/);
  assert.equal(d.hook, texte[0]);
});

test('notfallSkript ohne brauchbaren Text liefert keine Szenen (dann springt ein Ersatzprodukt ein)', () => {
  assert.deepEqual(notfallSkript({ ...P, body_html: '<p>Kurz.</p>' }, { such: null, tags: [] }).szenen, []);
});

test('Notfall-Videos verfaelschen das Lernen nicht (kein Format/Winkel zugeordnet)', async () => {
  const s = await skriptMitFormat({ handle: 'x' }, 'Kauf-Psychologie: Neugier. ', async () => ({ szenen: [], ohneKi: true }));
  assert.equal(s.formatName, '');
  assert.equal(s.winkelName, '');
});

test('viral ohne KI: echte Google-Frage als Hook nur mit passender Antwort aus dem Shop-Text', async () => {
  const { einstieg, notfallSkript, kommentarFrage } = await import('../../automations/lib/ohneKi.mjs');
  const saetze = ['Dein Klimmzug-Upgrade – überall, jederzeit.', 'Acht Stärken von Warm-up bis Profi.'];
  assert.deepEqual(einstieg(saetze, 'klimmzugband', ['klimmzugband welche stärke']), { hook: 'Klimmzugband: welche stärke?', antwort: 'Acht Stärken von Warm-up bis Profi.' });
  assert.equal(einstieg(saetze, 'klimmzugband', ['klimmzugband wie lange halten']).antwort, '', 'keine Antwort im Text -> keine Frage');
  assert.match(einstieg(saetze, 'klimmzugband', [], 0).hook, /3 Dinge, die du über Klimmzugband wissen solltest/);
  const d = notfallSkript(P, { such: { stichwort: 'klimmzugband', fragen: ['klimmzugband welche stärke'], hashtags: ['#klimmzugband'] }, tag: 1 });
  const texte = d.szenen.map((x) => x.text);
  assert.equal(texte[0], 'Klimmzugband: welche stärke?');
  assert.equal(texte[1], 'Acht Stärken von Warm-up bis Profi.');
  assert.equal(texte.at(-2), kommentarFrage(1));
  assert.match(texte.at(-1), /Link in der Bio/);
  assert.ok(d.anwendung.prompt.includes('reference image') && d.anwendung.schritte.length === 3, 'KI-Beispiel-Szene auch ohne Text-KI');
});

test('KI-Skripte bekommen die Viral-Regel (Kommentar-Frage + Loop)', async () => {
  let z = '';
  await skriptMitFormat({ handle: 'x' }, '', async (p, zusatz) => { z = zusatz; return { titel: 'X', szenen: [] }; });
  assert.match(z, /VIRAL:.*Kommentieren.*Schleife/);
});

test('Notfall-Skript nimmt keine Sätze/Google-Fragen, die der Werbe-Check sperren würde (z. B. Schmerzen)', async () => {
  const { pruefen } = await import('../../automations/lib/werbeCheck.mjs');
  const html = '<p>Atmungsaktiver Rückengurt gegen Rückenschmerzen im Alltag.</p><p>Stabilisiert den unteren Rücken beim Sitzen.</p><p>Der Klettverschluss lässt sich stufenlos verstellen.</p>';
  const s = notfallSkript({ ...P, title: 'BackEase Rückengurt', body_html: html }, { such: { stichwort: 'rückengurt', fragen: ['rückengurt gegen schmerzen', 'rückengurt beim sitzen'] }, tags: [], tag: 0 });
  assert.ok(s.szenen.length >= 5);
  const alles = [s.titel, s.hook, s.caption, ...s.szenen.map((x) => x.text)].join('\n');
  assert.deepEqual(pruefen(alles).filter((x) => x.stufe === 'block'), []);
  assert.match(s.hook, /sitzen/i, 'die erlaubte Google-Frage wird genommen');
});
