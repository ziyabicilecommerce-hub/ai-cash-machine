// Werbe-Check: Heilversprechen & Co. in vielen Sprachen sperren, harmlose Werbung durchlassen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruefen, videoPruefen, bericht } from '../../automations/lib/werbeCheck.mjs';
import { skriptMitFormat } from '../../automations/lib/formate.mjs';

const block = (t) => pruefen(t).filter((x) => x.stufe === 'block').map((x) => x.art);

test('Heilversprechen in vielen Sprachen werden gesperrt (echte Fälle aus dem Feed)', () => {
  for (const t of ['Rückenfrei mit Purivelle', 'Tiefer, stärker, schmerzfrei', 'Heilt Verspannungen', 'Lindert Rückenschmerzen sofort', 'Hilft bei Nackenschmerzen', 'Gegen Kopfschmerzen', 'Pain-free back in 5 minutes', 'Cures your neck', 'Libre de dolor de espalda', 'Bez bólu pleców', 'Свободный от боли спины', 'Без болю спини', 'Alivia a dor', 'Sans douleur au dos', 'Ağrısız bir sırt']) assert.ok(block(t).includes('heilversprechen'), t);
});

test('Klinik, Testsieger, Knappheit, erfundene Kunden', () => {
  assert.deepEqual(block('Klinisch getestet und Testsieger'), ['klinisch', 'superlativ']);
  assert.deepEqual(block('Nur noch 3 Stück - nur heute!'), ['knappheit']);
  assert.deepEqual(block('Über 10.000 zufriedene Kunden'), ['kunden']);
  assert.deepEqual(block('Only 2 left - today only'), ['knappheit']);
  assert.deepEqual(pruefen('Bestseller mit Geld-zurück-Garantie').map((x) => x.stufe), ['pruefen']);
});

test('harmlose, ehrliche Werbung bleibt erlaubt', () => {
  for (const t of ['Dein Klimmzug-Upgrade – überall, jederzeit.', 'Löst Verspannungen nach dem Büro - 12,99 €', 'Treat yourself after work', 'Acht Stärken von Warm-up bis Profi', 'Tu mejora para dominadas', 'Massage lumbar sencillo', '3 Fehler beim Dehnen', 'Link in der Bio']) assert.deepEqual(pruefen(t), [], t);
});

test('videoPruefen/bericht: Titel + Caption, Links zaehlen nicht', () => {
  assert.equal(videoPruefen({ titel: 'PowerBand', caption: 'Mehr Kraft 👉 https://x.store/products/schmerzfrei-band' }).ok, true);
  const b = bericht([{ datei: 'a.mp4', titel: 'Rückenfrei mit Purivelle' }, { datei: 'b.mp4', titel: 'PowerBand' }, { datei: 'c.mp4', titel: 'Bestseller' }]);
  assert.deepEqual([b.geprueft, b.blockiert, b.hinweise, b.liste[0].datei], [3, 1, 1, 'a.mp4']);
});

test('Video-Fabrik: verbotene Aussage im Skript -> neu schreiben lassen, sonst verwerfen', async () => {
  const anweisungen = [];
  let n = 0;
  const bauer = async (p, z) => { anweisungen.push(z); n++; return { titel: n === 1 ? 'Rückenfrei mit Purivelle' : 'Feierabend für deinen Rücken', hook: 'x', szenen: [{ text: 'a' }, { text: 'b' }, { text: 'c' }] }; };
  const s = await skriptMitFormat({ handle: 'x' }, '', bauer);
  assert.equal(s.titel, 'Feierabend für deinen Rücken');
  assert.match(anweisungen[1], /VERBOTEN \(Werberecht\).*Rückenfrei/);
  const immer = await skriptMitFormat({ handle: 'x' }, '', async () => ({ titel: 'Schmerzfrei!', szenen: [{ text: 'a' }] }));
  assert.equal(immer.szenen.length, 0, 'zweimal unzulaessig -> Fabrik nimmt Ersatzprodukt');
});

test('Schmerz-Bezug wird gesperrt - auch indirekt (echter Hook aus dem Fabrik-Lauf)', () => {
  for (const t of ['Hör auf, solche Schmerzen zu tragen!', 'Weniger Beschwerden im Alltag', 'Say goodbye to back aches', 'Adiós al dolor', 'Koniec z bólem']) assert.ok(block(t).length, t);
  for (const t of ['Angenehmer Halt für den Alltag', 'Klettverschluss für die perfekte Passform', 'Dorf-Leben, entspannt']) assert.deepEqual(block(t), [], t);
});

test('Feed: auch der Text IM Video (werbetext) wird geprüft - nicht nur Titel und Caption', async () => {
  const { werbeText } = await import('../../automations/lib/werbeCheck.mjs');
  const s = { titel: 'BackEase – dein Helfer', hook: 'Hör auf, solche Schmerzen zu tragen!', szenen: [{ text: 'Angenehmer Halt.' }], anfaenge: [{ hook: 'Stoppt jetzt!' }] };
  assert.match(werbeText(s), /Schmerzen.*\n.*Halt.*\n.*Stoppt/s);
  assert.equal(videoPruefen({ titel: s.titel, caption: '#Purivelle' }).ok, true);
  assert.equal(videoPruefen({ titel: s.titel, caption: '#Purivelle', werbetext: werbeText(s) }).ok, false);
});
