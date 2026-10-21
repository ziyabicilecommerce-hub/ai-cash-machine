// Modal-Turbo: alle Shots auf einer Modal-GPU (30 $ Gratis-Guthaben im Monat, keine Warteschlange).
// Gleicher Auftrag wie Kaggle-Turbo, aber 720p direkt (L40S hat 48 GB). Ergebnis: Map Shot-Nr -> Rohclip.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { auftragBauen, bilderMitschicken } from './kaggleTurbo.mjs';

const ausfuehren = promisify(execFile);
export const modalBereit = (env = process.env) => !!(String(env.MODAL_TOKEN_ID || '').trim() && String(env.MODAL_TOKEN_SECRET || '').trim());

export function modalAuftrag(shots, opts = {}) {
  return { ...auftragBauen(shots, opts), breite: 704, hoehe: 1280, zeit_min: Math.max(20, (opts.maxMinuten || 150) - 10) };
}

export async function modalClips(shots, ordner, opts = {}) {
  const ergebnis = new Map();
  if (!modalBereit() || !shots.length) return ergebnis;
  const mitBild = await bilderMitschicken(shots);
  const job = join(ordner, 'modal-job.json');
  const ziel = join(ordner, 'modal-out');
  mkdirSync(ziel, { recursive: true });
  writeFileSync(job, JSON.stringify(modalAuftrag(mitBild, opts)));
  console.log(`[modal-turbo] ${shots.length} Shots an die Modal-GPU (${mitBild.filter((s) => s.bildB64).length} mit Startbild)`);
  try {
    const { stdout } = await ausfuehren('modal', ['run', resolve('scripts/modal_turbo.py'), '--job', job, '--out', ziel],
      { timeout: ((opts.maxMinuten || 150) + 20) * 60000, maxBuffer: 64 * 1024 * 1024 });
    console.log(stdout.split('\n').filter((z) => /modal-turbo|kaggle-turbo|fertig|fehlgeschlagen/i.test(z)).join('\n').slice(-3000));
  } catch (err) {
    console.log(`[modal-turbo] Lauf fehlgeschlagen: ${String(err.stderr || err.message).slice(-600)}`);
  }
  if (existsSync(join(ziel, 'bericht.json'))) console.log(`[modal-turbo] Bericht: ${readFileSync(join(ziel, 'bericht.json'), 'utf8').slice(0, 2000)}`);
  for (const s of shots) {
    const p = join(ziel, `shot${s.nr}-roh.mp4`);
    if (existsSync(p)) ergebnis.set(s.nr, p);
  }
  console.log(`[modal-turbo] ${ergebnis.size}/${shots.length} Clips von Modal zurück`);
  return ergebnis;
}
