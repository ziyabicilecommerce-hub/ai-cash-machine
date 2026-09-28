// MCP-Live-Check - ruft jeden Online-MCP aus mcp-hub/catalog.json wirklich an
// (initialize + tools/list, ohne Zugangsdaten) und speichert, ob er antwortet,
// einen Login verlangt oder tot ist. Ergebnis: mcp-hub/live.json - Grundlage
// fuer die Status-Labels im MCP-Hub und die Freigabeliste des Router-MCP.
import { readFileSync, writeFileSync } from 'node:fs';
import { RemoteMcp, sichereZielUrl } from '../mcp-router/client.mjs';

const KATALOG = 'mcp-hub/catalog.json';
const OUT = 'mcp-hub/live.json';
const PARALLEL = Number(process.env.MCP_LIVECHECK_PARALLEL || 64);
const BUDGET_MIN = Number(process.env.MCP_LIVECHECK_BUDGET_MIN || 25);
const MAX_WERKZEUGE = 25;

// Status: 1 = antwortet ohne Login, 2 = Login noetig, 0 = tot/kaputt, 3 = nicht pruefbar
// Harte Obergrenze pro Server: normale Timer halten den Prozess am Leben,
// AbortSignal.timeout allein tut das nicht (Node beendete sonst still).
function pruefe(eintrag) {
  let timer;
  const hart = new Promise((r) => {
    timer = setTimeout(() => r([0, 0, []]), 40000);
  });
  return Promise.race([pruefeEcht(eintrag), hart]).finally(() => clearTimeout(timer));
}

async function pruefeEcht(eintrag) {
  const url = sichereZielUrl(eintrag.u);
  if (!url) return [3, 0, []];
  try {
    const mcp = new RemoteMcp(url, { timeoutMs: 12000 });
    await mcp.verbinden();
    const tools = await mcp.werkzeuge();
    return [1, tools.length, tools.slice(0, MAX_WERKZEUGE).map((t) => String(t.name || '').slice(0, 48))];
  } catch (err) {
    return [err.auth ? 2 : 0, 0, []];
  }
}

async function main() {
  const katalog = JSON.parse(readFileSync(KATALOG, 'utf8'));
  const ziele = [];
  const gesehen = new Set();
  for (const s of katalog.server || []) {
    if (!s.u || gesehen.has(s.u)) continue;
    gesehen.add(s.u);
    ziele.push(s);
  }
  console.log(`[92-mcp-livecheck] ${ziele.length} Online-MCPs werden geprueft (${PARALLEL} parallel, max. ${BUDGET_MIN} Min.)`);

  const deadline = Date.now() + BUDGET_MIN * 60 * 1000;
  const ergebnis = {};
  let index = 0;
  let abgebrochen = false;
  async function arbeiter() {
    while (index < ziele.length) {
      if (Date.now() > deadline) {
        abgebrochen = true;
        return;
      }
      const s = ziele[index++];
      const [status, anzahl, namen] = await pruefe(s);
      ergebnis[s.u] = anzahl ? [status, anzahl, namen] : [status];
    }
  }
  const lebenszeichen = setInterval(() => console.log(`[92-mcp-livecheck] ${Object.keys(ergebnis).length}/${ziele.length} geprueft`), 60000);
  await Promise.all(Array.from({ length: PARALLEL }, arbeiter));
  clearInterval(lebenszeichen);

  const werte = Object.values(ergebnis);
  const zaehle = (st) => werte.filter((v) => v[0] === st).length;
  const zusammenfassung = { geprueft: werte.length, antwortet: zaehle(1), login: zaehle(2), tot: zaehle(0), nichtPruefbar: zaehle(3), werkzeuge: werte.reduce((a, v) => a + (v[1] || 0), 0) };
  if (!werte.length) throw new Error('Nichts geprueft - live.json wird nicht ueberschrieben.');
  writeFileSync(OUT, JSON.stringify({ stand: new Date().toISOString(), abgebrochen, ...zusammenfassung, server: ergebnis }));
  console.log('[92-mcp-livecheck] Ergebnis:', JSON.stringify(zusammenfassung), abgebrochen ? '(Zeitlimit erreicht)' : '');
}

// Prueft eine live.json aus dem Pruef-Job streng auf erwartete Form und
// schreibt sie neu aufgebaut (nur bekannte Felder) an den Zielort.
function validieren(quelle, ziel) {
  const roh = readFileSync(quelle, 'utf8');
  if (roh.length > 8_000_000) throw new Error('live.json zu gross');
  const d = JSON.parse(roh);
  const zahl = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  const server = {};
  for (const [url, wert] of Object.entries(d.server || {})) {
    if (!sichereZielUrl(url) || url.length > 500 || !Array.isArray(wert)) continue;
    const status = [0, 1, 2, 3].includes(wert[0]) ? wert[0] : 0;
    const namen = Array.isArray(wert[2]) ? wert[2].filter((n) => typeof n === 'string').slice(0, MAX_WERKZEUGE).map((n) => n.slice(0, 48)) : [];
    server[url] = namen.length ? [status, Math.min(zahl(wert[1]), 10000), namen] : [status];
  }
  const felder = ['geprueft', 'antwortet', 'login', 'tot', 'nichtPruefbar', 'werkzeuge'];
  const sauber = { stand: new Date(d.stand).toISOString(), abgebrochen: d.abgebrochen === true };
  for (const f of felder) sauber[f] = zahl(d[f]);
  sauber.server = server;
  writeFileSync(ziel, JSON.stringify(sauber));
  console.log(`[92-mcp-livecheck] validiert: ${Object.keys(server).length} Eintraege`);
}

const [modus, quelle, ziel] = process.argv.slice(2);
(modus === '--validieren' ? Promise.resolve().then(() => validieren(quelle, ziel)) : main()).catch((err) => {
  console.error('[92-mcp-livecheck] Fehler:', err.message);
  process.exit(1);
});
