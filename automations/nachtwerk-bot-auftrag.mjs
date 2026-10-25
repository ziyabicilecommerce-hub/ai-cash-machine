// Liest den Video-Auftrag aus dem Issue (ISSUE_BODY) und gibt ihn als Step-Outputs an nachtwerk-bots.yml weiter.
// Ultimativ-Aufträge: die Gratis-KI schreibt dazu Hook und TikTok-Texte (DE/EN).
import { appendFileSync, readFileSync } from 'node:fs';
import { auftragAusIssue, auftragVerfeinern, HOOKS } from './lib/nachtwerkBots.mjs';
import { kiJson } from './lib/kiJson.mjs';

const { bots } = JSON.parse(readFileSync(new URL('../nachtwerk/bots.json', import.meta.url), 'utf8'));
try {
  const auftrag = auftragAusIssue(process.env.ISSUE_BODY, bots);
  const extra = {};
  if (auftrag.ultimativ) {
    const bot = bots.find((b) => b.id === auftrag.bot);
    const fein = await auftragVerfeinern(bot, auftrag.idee, kiJson);
    if (auftrag.hook === HOOKS[bot.id]) auftrag.hook = fein.hook; // eigener Hook aus dem Auftrag bleibt
    Object.assign(extra, { beschreibung: fein.beschreibung, beschreibung_en: fein.beschreibungEn });
  }
  console.log('[nachtwerk-bot] Auftrag:', JSON.stringify(auftrag));
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries({ ...auftrag, ...extra }).map(([k, v]) => `${k}=${v}`).join('\n') + '\nok=true\n');
} catch (err) {
  console.log(`[nachtwerk-bot] ${err.message}`);
  appendFileSync(process.env.GITHUB_OUTPUT, `ok=false\nfehler=${err.message}\n`);
}
process.exit(0);
