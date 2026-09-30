// Mitmach-Overlays fuer Community-Videos (#100): Antwortfelder A/B/C, Countdown 3-2-1,
// Aufloesung (richtige Antwort gruen, Rest blass) und Stempel "MYTHOS"/"WAHR".
// Alles als .ass-Zeilen (libass) - kostet keine Renderzeit und klappt in jeder Szene.
import { appendFileSync } from 'node:fs';

const zeit = (ms) => {
  const t = Math.max(0, Math.round(ms / 10));
  return `${Math.floor(t / 360000)}:${String(Math.floor(t / 6000) % 60).padStart(2, '0')}:${String(Math.floor(t / 100) % 60).padStart(2, '0')}.${String(t % 100).padStart(2, '0')}`;
};
const sauber = (t) => String(t || '').replace(/[{}\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
const GRUEN = '&H0040C850&';
const ROT = '&H003C3CE8&';
const pop = '\\fscx30\\fscy30\\t(0,160,\\fscx106\\fscy106)\\t(160,240,\\fscx100\\fscy100)';

// overlay: {typ: 'optionen'|'countdown'|'aufloesung'|'stempel', optionen?, richtig?, wahr?}
export function mitmachAss(ass, overlay, { breite, hoehe, dauerMs }) {
  if (!overlay?.typ) return;
  const B = breite;
  const H = hoehe;
  const fs = Math.round(Math.min(B, H) * 0.062);
  const ende = zeit(dauerMs + 1000);
  const zeilen = [];
  const optionen = (overlay.optionen || []).slice(0, 3).map(sauber);
  const feld = (k, text, extra, start) => `Dialogue: 6,${zeit(start)},${ende},Hook,,0,0,0,,{\\an5\\pos(${Math.round(B / 2)},${Math.round(H * (0.44 + k * 0.088))})\\fs${fs}${extra}}${'ABC'[k]}   ${text}`;
  if (overlay.typ === 'optionen' || overlay.typ === 'countdown') {
    // Beim Fragen erscheinen die Felder nacheinander, im Countdown stehen sie sofort da.
    optionen.forEach((o, k) => zeilen.push(feld(k, o, overlay.typ === 'optionen' ? pop : '', overlay.typ === 'optionen' ? 250 + k * 350 : 0)));
  }
  if (overlay.typ === 'countdown') {
    // 3-2-1 gleichmaessig ueber die Szene, jede Zahl knallt rein und verblasst.
    const schritt = Math.max(400, Math.round((dauerMs - 200) / 3));
    [3, 2, 1].forEach((zahl, j) => zeilen.push(`Dialogue: 7,${zeit(100 + j * schritt)},${zeit(100 + (j + 1) * schritt)},Preis,,0,0,0,,{\\an5\\pos(${Math.round(B / 2)},${Math.round(H * 0.27)})\\fs${Math.round(Math.min(B, H) * 0.26)}\\fscx220\\fscy220\\t(0,150,\\fscx100\\fscy100)\\fad(0,${Math.round(schritt * 0.4)})}${zahl}`));
  }
  if (overlay.typ === 'aufloesung') {
    optionen.forEach((o, k) => {
      const richtig = k === overlay.richtig;
      zeilen.push(feld(k, `${o}${richtig ? '  ✓' : ''}`, richtig ? `\\3c${GRUEN}\\4c${GRUEN}\\1c&HFFFFFF&\\fscx115\\fscy115\\t(0,200,\\fscx100\\fscy100)` : '\\alpha&H90&', 0));
    });
  }
  if (overlay.typ === 'stempel') {
    const [text, farbe] = overlay.wahr ? ['WAHR', GRUEN] : ['MYTHOS', ROT];
    zeilen.push(`Dialogue: 7,${zeit(150)},${ende},Hook,,0,0,0,,{\\an5\\pos(${Math.round(B / 2)},${Math.round(H * 0.36)})\\fs${Math.round(Math.min(B, H) * 0.14)}\\3c${farbe}\\4c${farbe}\\1c&HFFFFFF&\\frz12\\fscx320\\fscy320\\alpha&HFF&\\t(0,160,\\fscx92\\fscy92\\alpha&H00&)\\t(160,260,\\fscx100\\fscy100)}${text}`);
  }
  if (zeilen.length) appendFileSync(ass, zeilen.join('\n') + '\n');
}
