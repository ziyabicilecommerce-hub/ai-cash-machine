// Qualitätsprüfung für fertige Videos (Video-Prüfer): wertet ffprobe/ffmpeg-Messungen aus und
// entscheidet: freigeben, reparieren (Lautstärke) oder aussortieren und neu bauen lassen.
import { readFileSync, existsSync } from 'node:fs';

export const ZIEL_LUFS = -14;
export const STATE = 'automations/state/video-pruefung.json';

// Liest Lautheit, Schwarzbilder, Standbilder und Stille aus der ffmpeg-Ausgabe (stderr).
export function messungLesen(text) {
  const t = String(text);
  const spannen = (start, ende) => {
    const out = [], re = new RegExp(`${start}:\\s*([\\d.]+)[\\s\\S]*?${ende}:\\s*([\\d.]+)`, 'g');
    let m; while ((m = re.exec(t))) out.push([Number(m[1]), Number(m[2])]);
    return out;
  };
  const lufs = [...t.matchAll(/^\s*I:\s*(-?[\d.]+|-inf)\s*LUFS/gm)].map((m) => Number(m[1])).filter(Number.isFinite).at(-1);
  return {
    lufs: lufs ?? null,
    schwarz: [...t.matchAll(/black_start:([\d.]+)\s+black_end:([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]),
    standbild: spannen('lavfi.freezedetect.freeze_start', 'lavfi.freezedetect.freeze_end'),
    stille: spannen('silence_start', 'silence_end'),
  };
}

// Entscheidung je Video. info: { breite, hoehe, dauer, ton, format }, m: messungLesen(...)
export function bewerten(info, m) {
  const gruende = [], reparatur = [];
  const hoch = info.format !== 'quer';
  if (!info.dauer || info.dauer < 5) gruende.push(`zu kurz (${Math.round(info.dauer || 0)} s)`);
  if (hoch && info.dauer > 95) gruende.push(`zu lang für Shorts/Reels (${Math.round(info.dauer)} s)`);
  if (hoch && !(info.hoehe > info.breite && info.hoehe >= 1280)) gruende.push(`falsches Format (${info.breite}×${info.hoehe} statt 1080×1920)`);
  if (!info.ton) gruende.push('kein Ton');
  const dauer = info.dauer || 0;
  const innen = (a, b) => a > 0.6 && b < dauer - 0.6;
  const schwarz = m.schwarz.reduce((s, [a, b]) => s + (b - a), 0);
  const hart = gruende.length > 0;
  if (schwarz > 1.2) gruende.push(`${schwarz.toFixed(1)} s Schwarzbild`);
  const stand = m.standbild.filter(([a, b]) => innen(a, b) && b - a > 3.5);
  if (stand.length) gruende.push(`Bild friert ein (${stand.map(([a, b]) => `${a.toFixed(0)}–${b.toFixed(0)} s`).join(', ')})`);
  const stumm = m.stille.filter(([a, b]) => innen(a, b) && b - a > 2.5);
  if (info.ton && stumm.length) gruende.push(`Stimme fehlt (${stumm.map(([a, b]) => `${a.toFixed(0)}–${b.toFixed(0)} s`).join(', ')})`);
  if (info.ton && m.lufs !== null && (m.lufs < ZIEL_LUFS - 4 || m.lufs > ZIEL_LUFS + 3)) reparatur.push(`Lautstärke ${m.lufs.toFixed(1)} → ${ZIEL_LUFS} LUFS`);
  return { status: gruende.length ? 'abgelehnt' : reparatur.length ? 'repariert' : 'ok', gruende, reparatur, hart };
}

// Notbremse: Würden weiche Gründe (Standbild, Stille, Schwarz) ALLE Videos eines Laufs aussortieren,
// liegt eher eine falsch eingestellte Messung vor als lauter kaputte Videos. Dann mit Warnung freigeben.
export function notbremse(ergebnisse) {
  if (!ergebnisse.length || !ergebnisse.every((e) => e.status === 'abgelehnt' && !e.hart)) return false;
  for (const e of ergebnisse) { e.status = e.reparatur.length ? 'repariert' : 'ok'; e.warnung = e.gruende; e.gruende = []; }
  return true;
}

export function stateLaden(pfad = STATE) {
  try { return existsSync(pfad) ? JSON.parse(readFileSync(pfad, 'utf8')) : { laeufe: [], nachbauen: [] }; } catch { return { laeufe: [], nachbauen: [] }; }
}

// Abgelehnte Produkte kommen beim nächsten Fabrik-Lauf zuerst dran (ersetzen geplante Aufträge von hinten).
export function nachbauenEinplanen(auftraege, produkte, nachbauen, max = 2) {
  const titel = new Set((nachbauen || []).map((n) => n.thema));
  const extra = produkte.filter((p) => titel.has(p.title) && !auftraege.some((a) => a.produkt === p)).slice(0, max);
  if (!extra.length) return auftraege;
  const neu = [...extra.map((p) => ({ thema: p.title, produkt: p, format: 'hoch', nachbau: true })), ...auftraege];
  const produktAuftraege = neu.filter((a) => a.produkt);
  const rest = neu.filter((a) => !a.produkt);
  return [...produktAuftraege.slice(0, Math.max(auftraege.filter((a) => a.produkt).length, extra.length)), ...rest];
}
