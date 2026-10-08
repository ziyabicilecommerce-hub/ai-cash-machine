// Prüft im GitHub-Runner, ob die schlüssellosen Clip-Quellen (Wikimedia Commons, NASA) antworten.
//   node scripts/stock-test.mjs
import { mkdirSync } from 'node:fs';
import { stockHolen } from '../automations/lib/stockVideo.mjs';

mkdirSync('out/stock-test', { recursive: true });
const proben = [
  ['planet Venus with thick glowing clouds in space, cinematic, no people', true],
  ['golden honey dripping from a wooden dipper, close-up detail, cinematic, no text, no people', false],
  ['lightning bolt striking over a city skyline at night, cinematic, no people', false],
  ['orange goldfish swimming in clear water, cinematic, no people', false],
];
let ok = 0;
for (const [i, [prompt, weltall]] of proben.entries()) {
  const z = await stockHolen(prompt, `out/stock-test/p${i}.mp4`, { weltall, schluessel: '' });
  console.log(`${z ? '✓' : '✗'} ${prompt.slice(0, 50)}`);
  if (z) ok++;
}
console.log(`${ok}/${proben.length} Clips gefunden`);
