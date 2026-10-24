// Tages-Bot: wählt den Bot des Tages, lässt ihn eine Idee erfinden und gibt den Auftrag als Step-Outputs weiter
// (nachtwerk-tagesbot.yml baut daraus mit dem Ziya Studio das Video). Gleiche Prüfung wie bei bestellten Aufträgen.
import { appendFileSync, readFileSync } from 'node:fs';
import { auftragAusIssue, letzteFolge, tagesBot, tagesIdee } from './lib/nachtwerkBots.mjs';
import { kiJson } from './lib/kiJson.mjs';

const { bots } = JSON.parse(readFileSync(new URL('../nachtwerk/bots.json', import.meta.url), 'utf8'));
const wunsch = bots.find((b) => b.id === String(process.env.TAGES_BOT || '').trim());
const { bot, tag } = wunsch ? { bot: wunsch, tag: tagesBot(bots).tag } : tagesBot(bots);
// Frühere Tagesvideos (vom Workflow per gh geholt) - daraus die letzte Folge dieses Bots für die Serie.
const frueher = (() => { try { return JSON.parse(readFileSync(process.env.TAGES_FRUEHER || '', 'utf8')); } catch { return []; } })();
const { idee, hook, sprecher, beschreibung, folge, quelle } = await tagesIdee(bot, tag, kiJson, letzteFolge(frueher, bot));
const auftrag = auftragAusIssue(JSON.stringify({ bot: bot.id, idee, hook, text: sprecher, krass: true }), bots);
console.log(`[tages-bot] ${bot.name} Folge ${folge} (${quelle}): ${idee} · Hook: ${hook}`);
const titel = `${bot.emoji} Tagesvideo ${bot.name} · Folge ${folge}: ${idee.slice(0, 60)}`;
appendFileSync(process.env.GITHUB_OUTPUT, [...Object.entries(auftrag).map(([k, v]) => `${k}=${v}`), `titel=${titel.replace(/[\r\n]/g, ' ')}`, `name=${bot.name}`, `beschreibung=${beschreibung}`, `folge=${folge}`].join('\n') + '\n');
process.exit(0);
