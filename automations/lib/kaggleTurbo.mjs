// Kaggle-Turbo: echte KI-Clips auf der kostenlosen Kaggle-GPU (30 h/Woche) statt Hugging-Face-Tageslimit.
// Ablauf: Notebook (scripts/kaggle/turbo.py) mit den Shots füllen -> per Kaggle-CLI hochschieben -> warten ->
// Clips abholen. Braucht die Secrets KAGGLE_USERNAME und KAGGLE_KEY; ohne sie bleibt alles beim Alten.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const kaggleBereit = () => !!(process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY);
export const KERNEL_NAME = 'ziya-turbo';

// Kernel-Metadaten: privat, mit GPU und Internet (für Modell-Download und Startbilder).
export const kernelMeta = (nutzer) => ({
  id: `${nutzer}/${KERNEL_NAME}`, title: KERNEL_NAME, code_file: 'turbo.py', language: 'python', kernel_type: 'script',
  is_private: true, enable_gpu: true, enable_internet: true, dataset_sources: [], competition_sources: [], kernel_sources: [], model_sources: [],
});

// Setzt den Auftrag ins Notebook ein - Base64-kodiert, damit kein Zeichen im Prompt das Python-Skript bricht.
export function skriptBauen(vorlage, job) {
  if (!vorlage.includes('__JOB__')) throw new Error('Vorlage ohne __JOB__');
  const b64 = Buffer.from(JSON.stringify(job), 'utf8').toString('base64');
  return vorlage.replace('__JOB__', `json.loads(__import__("base64").b64decode("${b64}").decode("utf-8"))`);
}

// T4 (Kaggle) hat 15 GB: 480x832 passt in den Speicher (704x1280 lief out of memory) - auf 1080p bringt es danach
// der Hochskalierer. 24 fps, Wan braucht 4n+1 Bilder; mehr als 81 Bilder sprengen den Speicher.
// zeit_min: das Notebook hört rechtzeitig auf (Ausgabe gibt es erst, wenn es fertig ist) - lieber 12 von 18 Clips als 0.
export function auftragBauen(shots, { negativ = '', sekunden = 3.5, qualitaet = 'kino', maxMinuten = 150 } = {}) {
  const kino = qualitaet === 'kino';
  return {
    breite: 480, hoehe: 832, fps: 24, negativ,
    frames: Math.min(81, Math.max(49, Math.round((sekunden * 24) / 4) * 4 + 1)),
    schritte: kino ? 30 : 20, guidance: 5, zeit_min: Math.max(20, maxMinuten - 20),
    shots: shots.map((s) => ({ nr: s.nr, bild_url: s.bildUrl, ...(s.bildB64 ? { bild_b64: s.bildB64 } : {}), prompt: s.bewegung })),
  };
}

// Startbilder schon hier laden und mitschicken - von Kaggle aus lieferte der Bilddienst "402 Payment Required".
// Schon fertige Bilder (bildB64) bleiben; der Rest nacheinander - parallel drosselt der Bilddienst (fast alle 429).
export async function bilderMitschicken(shots, versuche = 3) {
  const fertig = [];
  for (const s of shots) fertig.push(await bildHolen(s, versuche));
  return fertig;
}

// Kaggle nimmt nur kleine Aufträge an: 8 volle Startbilder (doppelt base64) liefen am 24.10. ins Leere. Kaggle rechnet
// ohnehin in 480x832 - also die Bilder vorher genau darauf verkleinern (~40 KB statt ~400 KB je Bild).
export function bildVerkleinern(b64, breite = 480, hoehe = 832) {
  try {
    const klein = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', 'pipe:0', '-vf', `scale=${breite}:${hoehe}:force_original_aspect_ratio=increase,crop=${breite}:${hoehe}`, '-q:v', '6', '-f', 'mjpeg', 'pipe:1'],
      { input: Buffer.from(b64, 'base64'), stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 });
    return klein.length ? klein.toString('base64') : b64;
  } catch { return b64; }
}

// Kaggle lehnt Skripte ab ~3 MB ab (400 Bad Request, getestet: 1 MB geht). Bilder werden im Skript noch einmal base64-
// verpackt (x1,33) - also höchstens ~650 KB Bilder; was darüber liegt, holt sich Kaggle selbst über bild_url.
export function bildBudget(shots, maxKb = 650) {
  let summe = 0;
  return shots.map((s) => {
    if (!s.bildB64) return s;
    summe += s.bildB64.length / 1024;
    if (summe <= maxKb) return s;
    const { bildB64, ...rest } = s;
    return rest;
  });
}

async function bildHolen(s, versuche) {
  if (s.bildB64) return s;
  {
    for (let i = 0; i < versuche && s.bildUrl; i++) {
      try {
        const r = await fetch(s.bildUrl);
        if (r.ok) return { ...s, bildB64: Buffer.from(await r.arrayBuffer()).toString('base64') };
      } catch { /* nächster Versuch */ }
      await new Promise((ok) => setTimeout(ok, 4000 * (i + 1)));
    }
    return s;
  }
}

// Neue Kaggle-API-Tokens (KGAT_...) liest die CLI aus KAGGLE_API_TOKEN, alte Keys aus KAGGLE_KEY - beides geht.
export const kaggleEnv = (env = process.env) => {
  const key = String(env.KAGGLE_KEY || '').trim();
  return /^KGAT_/.test(key) && !env.KAGGLE_API_TOKEN ? { ...env, KAGGLE_API_TOKEN: key } : env;
};
// Kaggle meldet Fehler oft auf stdout statt stderr - beides zeigen, sonst steht im Protokoll nur eine leere Zeile.
const fehlerText = (err) => [err.stdout, err.stderr, err.message].map((x) => String(x || '').trim()).filter(Boolean).join(' | ').slice(0, 600);
const kaggle = (args, opts = {}) => execFileSync('kaggle', args, { stdio: 'pipe', timeout: 300000, env: kaggleEnv(), ...opts }).toString();

// Schiebt den Auftrag zu Kaggle, wartet bis fertig (max. `maxMinuten`) und lädt die Clips nach `ordner`.
// Zurück: Map Shot-Nr -> Pfad zum Rohclip (nur erfolgreiche Shots).
export async function kaggleClips(shots, ordner, opts = {}) {
  const ergebnis = new Map();
  if (!kaggleBereit() || !shots.length) return ergebnis;
  const nutzer = process.env.KAGGLE_USERNAME.trim();
  const kdir = join(ordner, 'kaggle-kernel');
  mkdirSync(kdir, { recursive: true });
  writeFileSync(join(kdir, 'kernel-metadata.json'), JSON.stringify(kernelMeta(nutzer), null, 2));
  const mitBild = bildBudget((await bilderMitschicken(shots)).map((s) => (s.bildB64 ? { ...s, bildB64: bildVerkleinern(s.bildB64) } : s)));
  const kb = Math.round(mitBild.reduce((n, s) => n + (s.bildB64?.length || 0), 0) / 1024);
  console.log(`[kaggle-turbo] ${mitBild.filter((s) => s.bildB64).length}/${shots.length} Startbilder mitgeschickt (${kb} KB)`);
  writeFileSync(join(kdir, 'turbo.py'), skriptBauen(readFileSync(resolve('scripts/kaggle/turbo.py'), 'utf8'), auftragBauen(mitBild, opts)));
  console.log(`[kaggle-turbo] ${shots.length} Shots an die Kaggle-GPU geschickt`);
  try {
    console.log(kaggle(['kernels', 'push', '-p', kdir]).trim());
  } catch (err) {
    console.log(`[kaggle-turbo] Hochladen fehlgeschlagen: ${fehlerText(err)}`);
    return ergebnis;
  }
  // Höchstens 150 min warten - danach braucht der Lauf noch Zeit fürs Hochskalieren (Job-Limit 340 min).
  const bis = Date.now() + (opts.maxMinuten || 150) * 60000;
  let status = '';
  while (Date.now() < bis) {
    await new Promise((r) => setTimeout(r, 60000));
    try { status = kaggle(['kernels', 'status', `${nutzer}/${KERNEL_NAME}`]).toLowerCase(); } catch { continue; }
    if (/complete|error|cancel/.test(status)) break;
  }
  console.log(`[kaggle-turbo] Status: ${status.trim().slice(0, 200)}`);
  const ziel = join(ordner, 'kaggle-out');
  mkdirSync(ziel, { recursive: true });
  try { kaggle(['kernels', 'output', `${nutzer}/${KERNEL_NAME}`, '-p', ziel], { timeout: 900000 }); } catch (err) {
    console.log(`[kaggle-turbo] Abholen fehlgeschlagen: ${fehlerText(err)}`);
  }
  if (existsSync(join(ziel, 'bericht.json'))) console.log(`[kaggle-turbo] Bericht: ${readFileSync(join(ziel, 'bericht.json'), 'utf8').slice(0, 3000)}`);
  for (const s of shots) {
    const p = join(ziel, `shot${s.nr}-roh.mp4`);
    if (existsSync(p)) ergebnis.set(s.nr, p);
  }
  console.log(`[kaggle-turbo] ${ergebnis.size}/${shots.length} Clips von Kaggle zurück`);
  return ergebnis;
}
