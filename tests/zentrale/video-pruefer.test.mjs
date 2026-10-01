import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { messungLesen, bewerten, notbremse, nachbauenEinplanen } from '../../automations/lib/videoPruefung.mjs';

const SKRIPT = fileURLToPath(new URL('../../automations/video-pruefer.mjs', import.meta.url));
const FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;

test('messungLesen liest Lautheit, Schwarz, Standbild und Stille', () => {
  const log = `[blackdetect @ 0x1] black_start:0 black_end:0.8 black_duration:0.8
[freezedetect @ 0x2] lavfi.freezedetect.freeze_start: 3.04
[freezedetect @ 0x2] lavfi.freezedetect.freeze_duration: 5.0
[silencedetect @ 0x3] silence_start: 4.5
[freezedetect @ 0x2] lavfi.freezedetect.freeze_end: 8.04
[silencedetect @ 0x3] silence_end: 7.9 | silence_duration: 3.4
  Integrated loudness:
    I:         -31.2 LUFS`;
  const m = messungLesen(log);
  assert.equal(m.lufs, -31.2);
  assert.equal(JSON.stringify(m.schwarz), '[[0,0.8]]');
  assert.equal(JSON.stringify(m.standbild), '[[3.04,8.04]]');
  assert.equal(JSON.stringify(m.stille), '[[4.5,7.9]]');
  assert.equal(messungLesen('[Parsed_metadata_1 @ 0x4] lavfi.signalstats.YAVG=16.2').start, 16.2);
  assert.ok(Number.isNaN(m.start), 'ohne Messung kein Start-Fehler');
});

test('bewerten: ok, Lautstärke reparieren, harte Fehler aussortieren', () => {
  const leer = { lufs: -14.5, schwarz: [], standbild: [], stille: [] };
  const gut = { breite: 1080, hoehe: 1920, dauer: 25, ton: true, format: 'hoch' };
  assert.equal(bewerten(gut, leer).status, 'ok');
  assert.equal(bewerten(gut, { ...leer, lufs: -30 }).status, 'repariert');
  assert.match(bewerten({ ...gut, ton: false }, leer).gruende.join(), /kein Ton/);
  assert.match(bewerten({ ...gut, breite: 1920, hoehe: 1080 }, leer).gruende.join(), /falsches Format/);
  assert.match(bewerten(gut, { ...leer, standbild: [[5, 12]] }).gruende.join(), /friert ein/);
  assert.match(bewerten(gut, { ...leer, stille: [[8, 12]] }).gruende.join(), /Stimme fehlt/);
  assert.match(bewerten(gut, { ...leer, start: 16 }).gruende.join(), /Anfang schwarz/);
  assert.equal(bewerten(gut, { ...leer, start: 110 }).status, 'ok');
  assert.equal(bewerten(gut, { ...leer, start: 16 }).hart, false, 'schwarzer Anfang ist ein weicher Fehler (Notbremse greift)');
  assert.equal(bewerten(gut, { ...leer, stille: [[22.8, 25]] }).status, 'ok', 'Stille am Ende (Musik-Ausklang) ist erlaubt');
  assert.equal(bewerten({ ...gut, breite: 1920, hoehe: 1080, dauer: 600, format: 'quer' }, leer).status, 'ok', 'lange Querformat-Videos sind erlaubt');
});

test('notbremse: nur weiche Fehler bei allen Videos -> mit Warnung freigeben, harte Fehler nie', () => {
  const leer = { lufs: -14, schwarz: [], standbild: [[5, 12]], stille: [] };
  const gut = { breite: 1080, hoehe: 1920, dauer: 25, ton: true, format: 'hoch' };
  const weich = [bewerten(gut, leer), bewerten(gut, leer)];
  assert.equal(notbremse(weich), true);
  assert.ok(weich.every((e) => e.status === 'ok' && e.warnung.length));
  const gemischt = [bewerten(gut, leer), bewerten({ ...gut, ton: false }, { ...leer, standbild: [] })];
  assert.equal(notbremse(gemischt), false);
  assert.equal(gemischt[0].status, 'abgelehnt');
  const einGutes = [bewerten(gut, leer), bewerten(gut, { ...leer, standbild: [] })];
  assert.equal(notbremse(einGutes), false, 'ist mindestens ein Video gut, bleibt das kaputte draußen');
});

test('nachbauenEinplanen: aussortierte Produkte zuerst, Tagesmenge bleibt gleich', () => {
  const P = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((t) => ({ title: t }));
  const auftraege = P.slice(0, 5).map((p) => ({ thema: p.title, produkt: p, format: 'hoch' }));
  const neu = nachbauenEinplanen(auftraege, P, [{ thema: 'G' }, { thema: 'B' }, { thema: 'X' }]);
  assert.equal(neu.length, 5);
  assert.equal(neu[0].thema, 'G');
  assert.equal(neu[0].nachbau, true);
  assert.equal(JSON.stringify(neu.map((a) => a.thema)), JSON.stringify(['G', 'A', 'B', 'C', 'D']));
  assert.equal(nachbauenEinplanen(auftraege, P, []), auftraege);
});

function ff(args) { execFileSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]); }

test('echter Lauf: repariert leise Videos, sortiert kaputte aus, plant Nachbau', { skip: !FFMPEG && 'ffmpeg fehlt' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'pruefer-'));
  const v = join(dir, 'out', 'videos');
  mkdirSync(v, { recursive: true });
  const bild = ['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=8'];
  const stimme = (vol) => ['-f', 'lavfi', '-i', `sine=frequency=220:duration=8,volume=${vol}`];
  const enc = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest'];
  ff([...bild, ...stimme(2.5), ...enc, join(v, 'gut.mp4')]);
  ff([...bild, ...stimme(0.01), ...enc, join(v, 'leise.mp4')]);
  ff([...bild, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', join(v, 'stumm.mp4')]);
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=8', ...stimme(2.5), ...enc, join(v, 'quer.mp4')]);
  ff(['-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30:duration=10', ...stimme(0.5).slice(0, 3), 'sine=frequency=220:duration=10,volume=2.5', '-filter_complex', "[0:v]trim=0:2,setpts=PTS-STARTPTS[a];[0:v]trim=2:2.04,setpts=PTS-STARTPTS,loop=180:1:0[b];[0:v]trim=8:10,setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1[v]", '-map', '[v]', '-map', '1:a', ...enc, join(v, 'standbild.mp4')]);
  ff([...bild, ...stimme(2.5), '-vf', "drawbox=c=black:t=fill:enable='lt(t,0.5)'", ...enc, join(v, 'schwarzstart.mp4')]);
  writeFileSync(join(v, 'standbild.jpg'), 'x');
  const manifest = ['gut', 'leise', 'stumm', 'quer', 'standbild', 'schwarzstart'].map((n) => ({ datei: `${n}.mp4`, vorschau: n === 'standbild' ? 'standbild.jpg' : '', thema: `Produkt ${n}`, titel: n, sprache: 'de', format: 'hoch' }));
  writeFileSync(join(dir, 'out', 'manifest.json'), JSON.stringify(manifest));
  const log = execFileSync(process.execPath, [SKRIPT], { cwd: dir, encoding: 'utf8' });
  const rest = JSON.parse(readFileSync(join(dir, 'out', 'manifest.json'), 'utf8')).map((e) => e.datei);
  assert.equal(JSON.stringify(rest), JSON.stringify(['gut.mp4', 'leise.mp4']), log);
  assert.ok(existsSync(join(dir, 'out', 'abgelehnt', 'standbild.jpg')), 'Vorschaubild wandert mit');
  assert.ok(!existsSync(join(v, 'stumm.mp4')));
  const nachher = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', join(v, 'leise.mp4'), '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const lufs = messungLesen(nachher).lufs;
  assert.ok(lufs > -18 && lufs < -11, `leise.mp4 nach Reparatur bei ${lufs} LUFS`);
  const state = JSON.parse(readFileSync(join(dir, 'automations', 'state', 'video-pruefung.json'), 'utf8'));
  assert.equal(JSON.stringify(state.nachbauen.map((n) => n.thema).sort()), JSON.stringify(['Produkt quer', 'Produkt schwarzstart', 'Produkt standbild', 'Produkt stumm']));
  assert.equal(state.laeufe.at(-1).repariert, 1);
  assert.match(log, /friert ein/);
  assert.match(log, /schwarzstart\.mp4 – Anfang schwarz/);
});
