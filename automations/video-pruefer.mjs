// Video-Prüfer: läuft in der Video-Fabrik zwischen „Bauen“ und „Veröffentlichen“. Misst jedes Video,
// repariert die Lautstärke, sortiert fehlerhafte Videos aus (sie werden nicht veröffentlicht und
// nicht gepostet) und merkt sich deren Produkte, damit die Fabrik sie beim nächsten Lauf neu baut.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { messungLesen, bewerten, notbremse, stateLaden, STATE, ZIEL_LUFS } from './lib/videoPruefung.mjs';

const OUT = process.env.VIDEO_OUT || 'out';
const MANIFEST = join(OUT, 'manifest.json');
const VIDEOS = join(OUT, 'videos');
const ABGELEHNT = join(OUT, 'abgelehnt');

function proben(datei) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', datei], { encoding: 'utf8' });
  const d = JSON.parse(r.stdout || '{}');
  const v = (d.streams || []).find((s) => s.codec_type === 'video') || {};
  return { breite: v.width || 0, hoehe: v.height || 0, dauer: Number(d.format && d.format.duration) || 0, ton: (d.streams || []).some((s) => s.codec_type === 'audio') };
}

function messen(datei, ton) {
  const video = 'blackdetect=d=0.4:pix_th=0.10,freezedetect=n=-60dB:d=3';
  const args = ton
    ? ['-hide_banner', '-nostats', '-i', datei, '-filter_complex', `[0:v]${video}[v];[0:a]ebur128=framelog=quiet,silencedetect=n=-45dB:d=2.5[a]`, '-map', '[v]', '-map', '[a]', '-f', 'null', '-']
    : ['-hide_banner', '-nostats', '-i', datei, '-vf', video, '-f', 'null', '-'];
  const start = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', datei, '-frames:v', '1', '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  return messungLesen(spawnSync('ffmpeg', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).stderr + start);
}

function lautstaerkeReparieren(datei) {
  const tmp = datei.replace(/\.mp4$/, '.laut.mp4');
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', datei, '-c:v', 'copy', '-af', `loudnorm=I=${ZIEL_LUFS}:TP=-1.5:LRA=11`, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', tmp]);
  if (r.status !== 0 || !existsSync(tmp)) { rmSync(tmp, { force: true }); return false; }
  renameSync(tmp, datei);
  return true;
}

function wegraeumen(eintrag) {
  mkdirSync(ABGELEHNT, { recursive: true });
  for (const name of [eintrag.datei, eintrag.vorschau, eintrag.untertitel, ...(eintrag.karussell || [])].filter(Boolean)) {
    const quelle = join(VIDEOS, name);
    if (existsSync(quelle)) renameSync(quelle, join(ABGELEHNT, name));
  }
}

function main() {
  if (!existsSync(MANIFEST)) { console.log('[video-pruefer] Keine neuen Videos.'); return; }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const behalten = [], ergebnis = [], geprueft = [];
  for (const e of manifest) {
    const datei = join(VIDEOS, e.datei || '');
    if (!/\.mp4$/.test(e.datei || '') || !existsSync(datei)) { behalten.push(e); continue; }
    const info = { ...proben(datei), format: e.format };
    const b = bewerten(info, messen(datei, info.ton));
    ergebnis.push({ datei: e.datei, thema: e.thema, titel: e.titel, sprache: e.sprache, ...b });
    geprueft.push({ e, datei });
  }
  if (notbremse(ergebnis)) console.log('[video-pruefer] Notbremse: weiche Fehler bei ALLEN Videos - vermutlich Messung zu streng. Videos werden mit Warnung freigegeben.');
  geprueft.forEach(({ e, datei }, i) => {
    const b = ergebnis[i];
    if (b.status === 'repariert' && !lautstaerkeReparieren(datei)) b.reparatur = b.reparatur.map((r) => `${r} (fehlgeschlagen)`);
    const zeichen = { ok: '✓', repariert: '🔧', abgelehnt: '✗' }[b.status];
    console.log(`[video-pruefer] ${zeichen} ${e.datei}${b.gruende.length ? ' – ' + b.gruende.join('; ') : ''}${b.reparatur.length ? ' – ' + b.reparatur.join('; ') : ''}${b.warnung ? ' – Warnung: ' + b.warnung.join('; ') : ''}`);
    if (b.status === 'abgelehnt') wegraeumen(e); else behalten.push(e);
  });
  writeFileSync(MANIFEST, JSON.stringify(behalten, null, 1));

  const state = stateLaden();
  const heute = new Date().toISOString().slice(0, 10);
  const abgelehnt = ergebnis.filter((x) => x.status === 'abgelehnt');
  state.laeufe = [...(state.laeufe || []), { datum: new Date().toISOString(), geprueft: ergebnis.length, ok: ergebnis.filter((x) => x.status === 'ok').length, repariert: ergebnis.filter((x) => x.status === 'repariert').length, abgelehnt: abgelehnt.map(({ datei, thema, gruende }) => ({ datei, thema, gruende })) }].slice(-60);
  const neu = abgelehnt.filter((x) => x.sprache === 'de' || !x.sprache).map((x) => ({ thema: x.thema, datum: heute, gruende: x.gruende }));
  state.nachbauen = [...neu, ...(state.nachbauen || []).filter((n) => !neu.some((x) => x.thema === n.thema) && n.datum === heute)].slice(0, 10);
  state.stand = new Date().toISOString();
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, JSON.stringify(state, null, 1));
  console.log(`[video-pruefer] ${ergebnis.length} geprüft · ${ergebnis.length - abgelehnt.length} freigegeben · ${abgelehnt.length} aussortiert und für den nächsten Lauf neu eingeplant.`);
}

main();
