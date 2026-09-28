// Statische Analyse fuer MCP-Pakete (#93). Liest Archive nur als Bytes,
// entpackt sie im Speicher und durchsucht Quelltext nach Warnsignalen.
// Es wird NIE etwas installiert oder ausgefuehrt.
import { gunzipSync, inflateRawSync } from 'node:zlib';

const MAX_DATEI = 512 * 1024;
const MAX_DATEIEN = 400;
const MAX_ENTPACKT = 40 * 1024 * 1024;
const CODE = /\.(m?js|cjs|ts|mts|py|sh|ps1)$/i;

export function tarDateien(gz) {
  const tar = gunzipSync(gz, { maxOutputLength: MAX_ENTPACKT });
  const dateien = [];
  let pos = 0;
  let langerName = '';
  while (pos + 512 <= tar.length && dateien.length < MAX_DATEIEN) {
    const kopf = tar.subarray(pos, pos + 512);
    if (kopf.every((b) => b === 0)) break;
    const text = (a, b) => kopf.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
    const groesse = parseInt(text(124, 136).trim() || '0', 8) || 0;
    const typ = String.fromCharCode(kopf[156] || 48);
    let name = langerName || (text(345, 500) ? `${text(345, 500)}/${text(0, 100)}` : text(0, 100));
    langerName = '';
    const daten = tar.subarray(pos + 512, pos + 512 + groesse);
    if (typ === 'L') langerName = daten.toString('utf8').replace(/\0.*$/s, '');
    else if ((typ === '0' || typ === '\0') && groesse <= MAX_DATEI && (CODE.test(name) || /package\.json$/.test(name))) {
      dateien.push({ name, text: daten.toString('utf8') });
    }
    pos += 512 + Math.ceil(groesse / 512) * 512;
  }
  return dateien;
}

export function zipDateien(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return [];
  const anzahl = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const dateien = [];
  for (let i = 0; i < anzahl && dateien.length < MAX_DATEIEN && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const methode = buf.readUInt16LE(p + 10);
    const komprimiert = buf.readUInt32LE(p + 20);
    const roh = buf.readUInt32LE(p + 24);
    const nl = buf.readUInt16LE(p + 28);
    const el = buf.readUInt16LE(p + 30);
    const cl = buf.readUInt16LE(p + 32);
    const lokal = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nl).toString('utf8');
    p += 46 + nl + el + cl;
    if (!CODE.test(name) || roh > MAX_DATEI || lokal + 30 > buf.length) continue;
    const start = lokal + 30 + buf.readUInt16LE(lokal + 26) + buf.readUInt16LE(lokal + 28);
    const daten = buf.subarray(start, start + komprimiert);
    try {
      const inhalt = methode === 0 ? daten : methode === 8 ? inflateRawSync(daten, { maxOutputLength: MAX_DATEI }) : null;
      if (inhalt) dateien.push({ name, text: inhalt.toString('utf8') });
    } catch {
      /* defekter Eintrag */
    }
  }
  return dateien;
}

// Laedt eine Datei mit harter Groessengrenze, ohne sie irgendwo auszufuehren.
export async function ladeBytes(url, maxBytes) {
  const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(45000), headers: { 'user-agent': 'ai-cash-machine-mcp-analyse' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const laenge = Number(res.headers.get('content-length') || 0);
  if (laenge > maxBytes) throw new Error('zu-gross');
  const teile = [];
  let summe = 0;
  for await (const teil of res.body) {
    summe += teil.length;
    if (summe > maxBytes) throw new Error('zu-gross');
    teile.push(teil);
  }
  return Buffer.concat(teile);
}

const MUSTER = {
  'eval-dekodiert': /\beval\s*\(\s*(atob|Buffer\.from|unescape|decodeURIComponent|String\.fromCharCode)|exec\s*\(\s*(base64\.b64decode|codecs\.decode|bytes\.fromhex|zlib\.decompress)|new\s+Function\s*\(\s*(atob|Buffer\.from)/,
  'hex-kette': /(\\x[0-9a-fA-F]{2}){60,}/,
  'langer-blob': /["'`][A-Za-z0-9+/]{800,}={0,2}["'`]/,
  'fremd-webhook': /discord(app)?\.com\/api\/webhooks|webhook\.site|requestbin|pipedream\.net|pastebin\.com\/raw|transfer\.sh|ngrok(-free)?\.(io|app)|interact\.sh|burpcollaborator/i,
  'liest-geheimnisse': /\.ssh\/id_|id_rsa|\.aws\/credentials|\.npmrc|\.pypirc|wallet\.dat|Login Data|Local State|keychain|JSON\.stringify\(\s*process\.env\s*\)|dict\(\s*os\.environ\s*\)|os\.environ\.copy\(\)|Object\.(entries|keys)\(\s*process\.env\s*\)/,
  'krypto-miner': /stratum\+tcp|xmrig|coinhive|cryptonight/i,
  'shell': /child_process|execSync|spawnSync|subprocess\.(run|Popen|call)|os\.system\(/,
};

const INSTALL_GEFAHR = /curl|wget|https?:\/\/|node\s+-e|python\s+-c|powershell|bash\s+-c|\|\s*sh\b|eval/i;

export function scanne(dateien, manifest) {
  const flags = new Set();
  const skripte = manifest?.scripts || {};
  for (const phase of ['preinstall', 'install', 'postinstall', 'prepare']) {
    const s = skripte[phase];
    if (!s || phase === 'prepare') continue;
    flags.add('install-skript');
    if (INSTALL_GEFAHR.test(s)) flags.add('install-download');
  }
  for (const d of dateien) {
    for (const [flag, re] of Object.entries(MUSTER)) {
      if (!flags.has(flag) && re.test(d.text)) flags.add(flag);
    }
  }
  return flags;
}

const ROT = new Set(['eval-dekodiert', 'install-download', 'krypto-miner', 'hex-kette', 'geheimnis-abfluss', 'malware-gemeldet']);
const GELB = new Set(['install-skript', 'langer-blob', 'fremd-webhook', 'liest-geheimnisse', 'keine-lizenz', 'kein-repo', 'veraltet', 'archiviert', 'deprecated', 'neu-und-unbekannt', 'zu-gross']);

// 1 = unauffaellig, 2 = Vorsicht, 3 = gefaehrlich, 0 = nicht analysierbar
export function bewerte(flags) {
  if (flags.has('liest-geheimnisse') && (flags.has('fremd-webhook') || flags.has('install-skript'))) flags.add('geheimnis-abfluss');
  if ([...flags].some((f) => ROT.has(f))) return 3;
  if ([...flags].some((f) => GELB.has(f))) return 2;
  return 1;
}

export function qualitaetsFlags({ lizenz, repo, letzteAenderung, erstellt, nutzung, archiviert, deprecated }, jetzt = Date.now()) {
  const flags = new Set();
  if (!lizenz) flags.add('keine-lizenz');
  if (!repo) flags.add('kein-repo');
  if (archiviert) flags.add('archiviert');
  if (deprecated) flags.add(/malware|malicious|security holding/i.test(String(deprecated)) ? 'malware-gemeldet' : 'deprecated');
  const tag = 24 * 3600 * 1000;
  if (letzteAenderung && jetzt - Date.parse(letzteAenderung) > 540 * tag) flags.add('veraltet');
  if (erstellt && jetzt - Date.parse(erstellt) < 30 * tag && (nutzung ?? 0) < 20) flags.add('neu-und-unbekannt');
  return flags;
}
