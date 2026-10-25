import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { radarPruefen, radarText } from '../../automations/lib/videoRadar.mjs';

test('Fehler-Radar: erkennt die Fehler aus den echten Läufen', () => {
  // Tagesvideo #217: Kaggle abgelehnt, nur 3/9 echte Clips; Drachen-Test #235: weißes Titelbild, Ideen-KI aus.
  const funde = radarPruefen({
    log: '[kaggle-turbo] Hochladen fehlgeschlagen: \n[ziya-studio] Fertig',
    bericht: { shots: [{ nr: 0, modell: 'turbo' }, ...Array.from({ length: 9 }, (_, i) => ({ nr: i + 1, modell: i < 3 ? 'turbo' : 'kamerafahrt' }))] },
    messungen: { dauer: 27, ton: true, hell: 0.02, dunkel: 0, cover: 246 },
    issueText: '**Folge:** 1 · **Idee-Quelle:** liste',
  });
  const texte = funde.map((f) => f.text).join(' | ');
  assert.match(texte, /Kaggle hat den Auftrag abgelehnt/);
  assert.match(texte, /3\/9 Szenen echt animiert/);
  assert.match(texte, /Titelbild fast weiß/);
  assert.match(texte, /Ideen-KI ausgefallen/);
  assert.equal(funde[0].stufe, 'rot', 'Rotes zuerst');
  assert.match(radarText(funde), /^🩺 \*\*Fehler-Radar:\*\*\n- 🔴/);
});

test('Fehler-Radar: gutes Video (Drachen 11/11) ist grün', () => {
  const funde = radarPruefen({
    log: '[kaggle-turbo] 10/10 Clips von Kaggle zurück\n[ziya-studio] Text eingeblendet',
    bericht: { shots: Array.from({ length: 11 }, (_, i) => ({ nr: i + 1, modell: 'kaggle' })) },
    messungen: { dauer: 41, ton: true, hell: 0.03, dunkel: 0.01, cover: 120 },
    issueText: '**Idee-Quelle:** ki',
  });
  assert.deepEqual(funde, []);
  assert.match(radarText(funde), /🟢 alles in Ordnung/);
  assert.match(radarText(radarPruefen({ messungen: { dauer: 9, ton: false } })), /nur 9 s.*\n.*Keine Tonspur/s);
});

test('Fehler-Radar CLI misst ein echtes Video', (t) => {
  const ordner = mkdtempSync(join(tmpdir(), 'radar-'));
  try {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=white:s=270x480:d=6', '-f', 'lavfi', '-i', 'sine=d=6', '-shortest', join(ordner, 'ziya-1.mp4')]);
  } catch { return t.skip('kein ffmpeg'); }
  writeFileSync(join(ordner, 'bericht.json'), JSON.stringify({ shots: [{ nr: 1, modell: 'kaggle' }] }));
  writeFileSync(join(ordner, 'protokoll.txt'), 'Sprecher übersprungen: weg');
  const aus = execFileSync('node', ['automations/video-radar.mjs', ordner]).toString();
  assert.match(aus, /Video nur 6 s lang/);
  assert.match(aus, /100 % der Bilder fast weiß/);
  assert.match(aus, /Erzählerstimme fehlt/);
  assert.doesNotMatch(aus, /Keine Tonspur/);
});
