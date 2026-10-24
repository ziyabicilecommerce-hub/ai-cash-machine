// Tages-Bot: wählt den Bot des Tages, lässt ihn eine Idee erfinden und gibt den Auftrag als Step-Outputs weiter
// (nachtwerk-tagesbot.yml baut daraus mit dem Ziya Studio das Video). Gleiche Prüfung wie bei bestellten Aufträgen.
import { appendFileSync, readFileSync } from 'node:fs';
import { auftragAusIssue, tagesBot, tagesIdee } from './lib/nachtwerkBots.mjs';
import { kiJson } from './lib/kiJson.mjs';

const { bots } = JSON.parse(readFileSync(new URL('../nachtwerk/bots.json', import.meta.url), 'utf8'));
const wunsch = bots.find((b) => b.id === String(process.env.TAGES_BOT || '').trim());
const { bot, tag } = wunsch ? { bot: wunsch, tag: tagesBot(bots).tag } : tagesBot(bots);
const { idee, hook, quelle } = await tagesIdee(bot, tag, kiJson);
const auftrag = auftragAusIssue(JSON.stringify({ bot: bot.id, idee, hook, krass: true }), bots);
console.log(`[tages-bot] ${bot.name} (${quelle}): ${idee} · Hook: ${hook}`);
const titel = `${bot.emoji} Tagesvideo ${bot.name}: ${idee.slice(0, 70)}`;
appendFileSync(process.env.GITHUB_OUTPUT, [...Object.entries(auftrag).map(([k, v]) => `${k}=${v}`), `titel=${titel.replace(/[\r\n]/g, ' ')}`, `name=${bot.name}`].join('\n') + '\n');
process.exit(0);
