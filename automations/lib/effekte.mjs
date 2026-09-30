// Effekt-Paket fuer Premium-Szenen (alles lokal mit ffmpeg, ohne Key):
// Zoom-Punch am Szenenanfang, Kamera-Wackler beim Hook, wechselnde Uebergaenge (Blitz, Glitch,
// Light-Leak), QR-Endkarte "Scannen & shoppen" und ein pulsierender "Link in Bio"-Hinweis.
// VIDEO_EFFEKTE=0 schaltet das Paket ab.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';

export const effekteAn = () => !/^(0|nein|aus|false)$/i.test(String(process.env.VIDEO_EFFEKTE || '').trim());

const bild = (args) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args], { stdio: 'pipe', timeout: 120000 });

// Light-Leak: warmes Licht (Orange/Magenta) aus zwei Ecken, wie bei alten Filmkameras.
// Wird in halber Groesse berechnet und weich hochskaliert (schnell).
export function lichtLeckBauen(ziel, breite, hoehe) {
  if (!existsSync(ziel)) {
    const glow = (x, y, r, s) => `${s}*exp(-(pow(X-W*${x},2)+pow(Y-H*${y},2))/pow(W*${r},2))`;
    bild(['-f', 'lavfi', '-i', `color=black:s=${breite / 2}x${hoehe / 2},format=rgba`,
      '-vf', `geq=r=255:g='120+90*Y/H':b='60+150*X/W':a='min(225,${glow(1, 0.08, 0.6, 210)}+${glow(0, 0.9, 0.45, 130)})',scale=${breite}:${hoehe}:flags=bicubic`,
      '-frames:v', '1', ziel]);
  }
  return ziel;
}

// QR-Code zum Produkt (segno, reines Python). Ohne segno oder Link: kein QR, Video bleibt heil.
export function qrBauen(url, ziel) {
  if (!/^https:\/\/[\w.-]+\//.test(String(url || ''))) return '';
  try {
    execFileSync('python3', ['-c', 'import sys,segno; segno.make(sys.argv[1], error="m").save(sys.argv[2], scale=12, border=2, dark="#111111", light="#ffffff")', url, ziel], { stdio: 'pipe', timeout: 30000 });
    return existsSync(ziel) ? ziel : '';
  } catch { return ''; }
}

// Uebergang je Szene - wechselt, damit der Schnitt nie gleich wirkt.
export function uebergangFuer(index) {
  if (index === 0) return 'start';
  return ['blitz', 'glitch', 'leck'][index % 3];
}

// Kamera nach dem Zusammensetzen: Zoom-Punch (startet 12 % naeher und schnappt in 0,35 s zurueck),
// beim Hook zusaetzlich ein kurzer Wackler wie bei einem Bass-Drop.
export function kameraFilter({ breite, hoehe, wackeln = false, fps = 30 }) {
  const zoom = `1+0.12*max(0,1-it/0.35)${wackeln ? '+0.035' : ''}`;
  const w = (a, f) => (wackeln ? `+${a}*sin(it*${f})*max(0,1-it/0.8)` : '');
  return `zoompan=z='${zoom}':x='iw/2-iw/zoom/2${w(14, 53)}':y='ih/2-ih/zoom/2${w(11, 41)}':d=1:s=${breite}x${hoehe}:fps=${fps}`;
}

// Glitch: RGB-Versatz und Rauschen fuer die ersten 0,14 s.
export const glitchFilter = () => [
  "rgbashift=rh=-22:bh=22:gv=6:enable='lt(t,0.14)'",
  "noise=alls=45:allf=t:enable='lt(t,0.1)'",
];

const zeit = (ms) => {
  const t = Math.max(0, Math.round(ms / 10));
  return `${Math.floor(t / 360000)}:${String(Math.floor(t / 6000) % 60).padStart(2, '0')}:${String(Math.floor(t / 100) % 60).padStart(2, '0')}.${String(t % 100).padStart(2, '0')}`;
};

// Endkarte: Beschriftung unter dem QR-Code und pulsierender "Link in Bio"-Hinweis (in die .ass der Szene).
export function endkarteAss(ass, { breite, hoehe, qr = false, cta = 'LINK IN BIO', shop = '' }) {
  const zeilen = [];
  if (qr) {
    zeilen.push(`Dialogue: 5,${zeit(600)},${zeit(600000)},Shop,,0,0,0,,{\\an8\\pos(${Math.round(breite * 0.17)},${Math.round(hoehe * 0.075 + breite * 0.26 + 14)})\\fs${Math.round(breite * 0.034)}\\fad(250,0)}SCAN & SHOP`);
  }
  const puls = Array.from({ length: 10 }, (_, i) => `\\t(${i * 900},${i * 900 + 450},\\fscx112\\fscy112)\\t(${i * 900 + 450},${i * 900 + 900},\\fscx100\\fscy100)`).join('');
  // Hochformat: links der Mitte, damit die Moderatorin unten rechts nichts verdeckt.
  zeilen.push(`Dialogue: 5,${zeit(500)},${zeit(600000)},Hook,,0,0,0,,{\\an2\\pos(${Math.round(breite * (breite > hoehe ? 0.5 : 0.36))},${Math.round(hoehe * 0.9)})\\fs${Math.round(Math.min(breite, hoehe) * 0.05)}\\fad(200,0)${puls}}▼ ${cta} ▼`);
  // Shopname unter dem Hinweis (gleiche Achse, nicht unter der Moderatorin).
  if (shop) zeilen.push(`Dialogue: 5,${zeit(200)},${zeit(600000)},Shop,,0,0,0,,{\\an2\\pos(${Math.round(breite * (breite > hoehe ? 0.5 : 0.36))},${Math.round(hoehe * 0.955)})\\fad(300,0)}${String(shop).replace(/[{}\\]/g, '')}`);
  appendFileSync(ass, zeilen.join('\n') + '\n');
}
