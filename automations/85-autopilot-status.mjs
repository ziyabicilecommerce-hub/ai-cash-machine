// Autopilot-Status - veröffentlicht NUR den An/Aus-Zustand der 11 AUTO_*-
// Schalter (aus config.mjs) als öffentliche command/autopilot-status.json.
// Bewusst NUR Booleans, keine Secret-Werte selbst - sicher genug, um vom
// statischen Command-Frontend gelesen zu werden. Ohne diese Automation
// könnte Command nur die STANDARD-Werte zeigen, nicht den echten, vom
// Nutzer tatsächlich konfigurierten Stand. Neu, kein n8n-Workflow ·
// Zeitplan: täglich.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMAND_DIR = join(__dirname, '..', 'command');

const SCHALTER = [
  'AUTO_SKALIEREN', 'AUTO_PAUSE', 'AUTO_STOP', 'AUTO_POST_FACEBOOK', 'AUTO_POST_INSTAGRAM',
  'AUTO_PREISANPASSUNG', 'AUTO_BESTELLUNG_SENDEN', 'AUTO_BUDGET_UMSCHICHTEN',
  'AUTO_UEBERVERKAUF_STOPPEN', 'AUTO_GUTSCHEIN_SENDEN', 'AUTO_ERSTATTUNG_GENEHMIGEN',
];

async function main() {
  const schalter = SCHALTER.map((name) => ({ name, an: config[name] === 'ja' }));
  const anAnzahl = schalter.filter((s) => s.an).length;

  if (!existsSync(COMMAND_DIR)) mkdirSync(COMMAND_DIR, { recursive: true });
  writeFileSync(join(COMMAND_DIR, 'autopilot-status.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    schalter,
    anAnzahl,
    gesamtAnzahl: schalter.length,
  }, null, 2));

  console.log(`[85-autopilot-status] ${anAnzahl}/${schalter.length} Schalter aktiv.`);
}

main().catch((err) => {
  console.error('[85-autopilot-status] Fehler:', err);
  process.exit(1);
});
