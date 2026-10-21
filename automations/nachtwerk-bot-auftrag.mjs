// Liest den Video-Auftrag aus dem Issue (ISSUE_BODY) und gibt ihn als Step-Outputs an nachtwerk-bots.yml weiter.
import { appendFileSync, readFileSync } from 'node:fs';
import { auftragAusIssue } from './lib/nachtwerkBots.mjs';

const { bots } = JSON.parse(readFileSync(new URL('../nachtwerk/bots.json', import.meta.url), 'utf8'));
try {
  const auftrag = auftragAusIssue(process.env.ISSUE_BODY, bots);
  console.log('[nachtwerk-bot] Auftrag:', JSON.stringify(auftrag));
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(auftrag).map(([k, v]) => `${k}=${v}`).join('\n') + '\nok=true\n');
} catch (err) {
  console.log(`[nachtwerk-bot] ${err.message}`);
  appendFileSync(process.env.GITHUB_OUTPUT, `ok=false\nfehler=${err.message}\n`);
}
