// TikTok-Rettung (#116): entscheidet, ob ein TikTok-Konto gerade posten darf. Liest nur den Verlauf (#115).
//   node automations/116-tiktok-rettung.mjs <konto> [abend|nacht]  -> darf=ja|nein (GITHUB_OUTPUT) + Grund
//   node automations/116-tiktok-rettung.mjs --fakten                -> konten=@a,@b (Konten, die Fakten-Videos bekommen)
import { readFileSync, appendFileSync } from 'node:fs';
import { KONTEN, zustand, darf, slotAus } from './lib/tiktokRettung.mjs';

const verlauf = (() => { try { return JSON.parse(readFileSync('automations-dashboard/tiktok/verlauf.json', 'utf8')); } catch { return []; } })();
const ausgabe = (z) => { console.log(z); if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${z}\n`); };
const bericht = (z) => { console.log(z); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${z}\n`); };
const [a, b] = process.argv.slice(2);

if (a === '--fakten') {
  const frei = KONTEN.filter((k) => darf(zustand(k, verlauf).modus, 'fakten'));
  for (const k of KONTEN) bericht(`- @${k}: ${zustand(k, verlauf).grund}`);
  ausgabe(`konten=${frei.map((k) => `@${k}`).join(',')}`);
} else if (a) {
  const stunde = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  const slot = b || slotAus(stunde);
  const z = zustand(a, verlauf);
  const ok = darf(z.modus, slot);
  bericht(`@${a.replace(/^@/, '')} (${slot}): ${z.grund} -> ${ok ? 'postet' : 'pausiert in diesem Slot'}`);
  ausgabe(`darf=${ok ? 'ja' : 'nein'}`);
}
