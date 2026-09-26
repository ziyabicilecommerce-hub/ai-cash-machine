import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OWNER = 'ziyabicilecommerce-hub';
const REPO = 'ai-cash-machine';
const BRANCH = 'main';

// Committet eine bereits lokal generierte Datei (z.B. ein ffmpeg-Video)
// SOFORT ins Repo und gibt die oeffentliche raw.githubusercontent.com-URL
// zurueck. Noetig, weil generierte Videos (anders als Pollinations-Bilder)
// keine eigene oeffentliche URL haben - Metricool braucht aber eine, um das
// Medium selbst abzurufen. Laeuft als EIGENER, sofortiger Commit (nicht ueber
// den generischen State-Commit am Ende des Jobs in _automation-runner.yml),
// weil Metricool die URL direkt danach abrufen muss.
export function commitUndOeffentlicheURL(lokalerPfad, repoPfad) {
  const dir = dirname(repoPfad);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  copyFileSync(lokalerPfad, repoPfad);

  execFileSync('git', ['config', 'user.name', 'github-actions[bot]']);
  execFileSync('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com']);
  execFileSync('git', ['add', repoPfad]);
  try {
    execFileSync('git', ['commit', '-m', `chore: generated media ${repoPfad} [skip ci]`]);
  } catch {
    // Nichts zu committen (z.B. Retry mit identischem Inhalt) - kein Fehler.
  }
  execFileSync('git', ['push']);

  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${repoPfad}`;
}

// raw.githubusercontent.com braucht nach einem Push manchmal ein paar
// Sekunden, bis die neue Datei wirklich ausgeliefert wird - ohne diese
// Wartepruefung wuerde Metricools normalize-Aufruf direkt danach oft mit
// 404 fehlschlagen.
export async function warteBisOeffentlichErreichbar(url, { versucheMax = 8, wartenMs = 3000 } = {}) {
  for (let i = 0; i < versucheMax; i++) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      if (res.ok) return true;
    } catch {
      // Netzwerkfehler - einfach nochmal versuchen.
    }
    await new Promise((resolve) => setTimeout(resolve, wartenMs));
  }
  throw new Error(`Generiertes Video war nach ${versucheMax} Versuchen nicht oeffentlich erreichbar: ${url}`);
}
