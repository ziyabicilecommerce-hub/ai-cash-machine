// Welt-Turbo-Job (#96): ein Runner bekommt eine Skript-Gruppe ("t:3,17,42") und baut jedes Skript
// in ALLEN Sprachen - die Bildspur nur einmal (weltTurbo.mjs). Uebersetzungen kommen aus dem
// Gedaechtnis (welt-cache/), nur Fehlendes geht an die Gratis-KI.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { turboBauen, aufraeumen } from './weltTurbo.mjs';
import { uebersetzenBuendel } from './uebersetzen.mjs';
import { uebersetzungenLaden, uebersetzungenSpeichern, schluessel, anwenden, auszug } from './weltCache.mjs';
import { kurzHook } from './shopProdukte.mjs';

export const istTurboGruppe = (liste) => /^t:/.test(String(liste || ''));

// Teilt die Skripte in hoechstens `jobs` Gruppen fuer die Matrix des Workflows.
export function turboGruppen(skripte, jobs) {
  const n = Math.max(1, Math.min(jobs, skripte.length));
  const gruppen = Array.from({ length: n }, () => []);
  skripte.forEach((x, i) => gruppen[i % n].push(x.nr));
  return gruppen.map((g) => `t:${g.join(',')}`);
}

export async function turboJob({ liste, out, sprachen, stimmen, stil, zeitMin, ablegen }) {
  mkdirSync(join(out, 'videos'), { recursive: true });
  const nummern = new Set(String(liste).slice(2).split(',').map(Number));
  const skripte = JSON.parse(readFileSync(join(out, 'skripte.json'), 'utf8'));
  const gueltig = new Set(skripte.map((x) => schluessel(x.skript)));
  const meine = skripte.filter((x) => nummern.has(x.nr));
  const ende = Date.now() + zeitMin * 60000;
  const manifest = [];

  // 1) Uebersetzungen: erst Gedaechtnis, fehlende in Buendeln zu 5 an die KI.
  const gedaechtnis = Object.fromEntries(sprachen.map((s) => [s, uebersetzungenLaden(s)]));
  let kiAus = 0;
  let neuUebersetzt = 0;
  for (const sprache of sprachen) {
    const fehlt = meine.filter((x) => !anwenden(x.skript, gedaechtnis[sprache][schluessel(x.skript)], kurzHook));
    for (let b = 0; b < fehlt.length && kiAus < 2 && Date.now() < ende - 60 * 60000; b += 5) {
      const teil = fehlt.slice(b, b + 5);
      const neu = await uebersetzenBuendel(teil.map((x) => x.skript), sprache).catch(() => []);
      if (!neu.some(Boolean)) { kiAus++; continue; }
      kiAus = 0;
      teil.forEach((x, j) => { if (neu[j]) { gedaechtnis[sprache][schluessel(x.skript)] = auszug(neu[j]); neuUebersetzt++; } });
    }
  }
  console.log(`[welt-turbo] ${meine.length} Skripte, ${neuUebersetzt} neue Uebersetzungen${kiAus >= 2 ? ' (Gratis-KI ausgelastet - Rest aus dem Gedaechtnis)' : ''}`);

  // 2) Je Skript: alle Sprachen auf einmal.
  for (const { nr, thema, skript } of meine) {
    if (Date.now() > ende) { console.log('[welt-turbo] Zeitbudget erreicht - Rest uebersprungen'); break; }
    const fassungen = sprachen
      .map((sprache) => ({ sprache, stimme: stimmen[sprache], skript: anwenden(skript, gedaechtnis[sprache][schluessel(skript)], kurzHook) }))
      .filter((f) => f.skript && f.stimme);
    if (!fassungen.length) { console.log(`[welt-turbo] ✗ Skript ${nr}: keine Uebersetzung vorhanden`); continue; }
    const arbeit = join(out, `turbo-${nr}`);
    const t0 = Date.now();
    try {
      const erg = await turboBauen(fassungen, arbeit, { stil });
      let ok = 0;
      for (const e of erg) {
        if (!e.v) { console.log(`[welt-turbo] ✗ ${e.sprache} Skript ${nr}: ${String(e.fehler?.message || e.fehler).slice(0, 120)}`); continue; }
        await ablegen(manifest, e.v, fassungen.find((f) => f.sprache === e.sprache).skript, { thema, format: 'hoch' }, nr, e.sprache);
        ok++;
      }
      console.log(`[welt-turbo] ✓ Skript ${nr} "${thema}": ${ok}/${fassungen.length} Sprachen in ${Math.round((Date.now() - t0) / 1000)} s`);
    } catch (err) {
      console.log(`[welt-turbo] ✗ Skript ${nr}: ${String(err.message).slice(0, 160)}`);
    }
    aufraeumen(arbeit);
    writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
  }
  for (const sprache of sprachen) uebersetzungenSpeichern(sprache, gedaechtnis[sprache], gueltig, out);
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`[welt-turbo] ${manifest.length} Welt-Videos fertig`);
}
