// Gemeinsames Protokoll für Automation-zu-Automation-Verknüpfungen ("Ketten") -
// jede Kette wird hier ausgelöst UND geloggt, damit die Command-App an EINER
// Stelle zeigen kann, welche Verknüpfungen es gibt und wann sie zuletzt
// gefeuert haben. Nutzt intern dispatchWorkflow() (siehe githubActions.mjs) -
// dieselbe Sicherheitsregel gilt: welche Kette feuert, entscheidet immer
// fester Code im Aufrufer, nie freier Text der KI.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadState, saveState } from './state.mjs';
import { dispatchWorkflow } from './githubActions.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMAND_DIR = join(__dirname, '..', '..', 'command');
const STATE_KEY = 'ketten-log';
const MAX_LOG = 100;

// Statische Übersicht ALLER konfigurierten Ketten - unabhängig davon, ob sie
// heute schon gefeuert haben. Bei einer neuen Kette hier einfach eine Zeile
// ergänzen, dann taucht sie sofort in der Command-App auf.
export const KETTEN_DEFINITIONEN = [
  { von: '60 · Chef-Agent', nach: '55 · Fulfillment & Supplier Hub', bedingung: 'überfällige, unbearbeitete Bestellungen erkannt' },
  { von: '60 · Chef-Agent', nach: '05 · Winback-Maschine', bedingung: 'wertvolle Kunden lange inaktiv erkannt' },
  { von: '20 · Lager-Wächter', nach: '63 · Reorder-Agent', bedingung: 'Bestand kritisch niedrig oder ausverkauft' },
];

export async function loeseKetteAus({ von, nach, workflowDatei, grund }) {
  const ergebnis = await dispatchWorkflow(workflowDatei);

  const state = loadState(STATE_KEY);
  state.log = state.log || [];
  state.log.unshift({ datum: new Date().toISOString(), von, nach, grund, ...ergebnis });
  if (state.log.length > MAX_LOG) state.log = state.log.slice(0, MAX_LOG);
  saveState(STATE_KEY, state);

  if (!existsSync(COMMAND_DIR)) mkdirSync(COMMAND_DIR, { recursive: true });
  writeFileSync(
    join(COMMAND_DIR, 'chains.json'),
    JSON.stringify({ updatedAt: new Date().toISOString(), definitionen: KETTEN_DEFINITIONEN, log: state.log }, null, 2),
  );

  return ergebnis;
}
