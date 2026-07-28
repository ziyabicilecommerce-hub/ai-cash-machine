// Trend-Scout - analysiert tägliche E-Commerce-Trends von Reddit für deine Nische
// Original: n8n Workflow "08_Trend_Scout" · Zeitplan: täglich 07:00
import { config } from './lib/config.mjs';
import { askClaude } from './lib/claude.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const NL = '\n';

async function main() {
  const res = await fetch(
    'https://www.reddit.com/r/ecommerce+dropship+shopify+EntrepreneurRideAlong/top.json?t=day&limit=25',
    { headers: { 'User-Agent': 'trend-scout/1.0' } }
  );
  const data = await res.json();
  const kids = data?.data?.children || [];
  const posts = kids
    .map((c) => c.data)
    .filter((p) => p && p.title)
    .slice(0, 20)
    .map((p) => `- [${p.score || 0} Upvotes, r/${p.subreddit}] ${p.title}${p.selftext ? ' :: ' + p.selftext.slice(0, 200) : ''}`);

  const prompt = `Du bist E-Commerce-Trend-Analyst für den Shop "${config.SHOP_NAME}" (Nische: ${config.SHOP_NISCHE}).${NL}${NL}Hier die heißesten E-Commerce-Diskussionen der letzten 24h auf Reddit:${NL}${NL}${posts.join(NL)}${NL}${NL}Analysiere das und gib mir auf Deutsch: (1) TOP-SIGNAL: der eine relevanteste Trend für meine Nische (2-3 Sätze warum). (2) DREI konkrete Chancen für meinen Shop (je: Was? Warum jetzt? Erster Schritt heute? Score 1-10). (3) EINE Warnung: häufiger Fehler, den viele Shop-Betreiber gerade machen. Sei brutal ehrlich und konkret, keine Floskeln. Wenn die Posts nichts hergeben, sag das ehrlich und gib stattdessen einen zeitlosen Wachstums-Tipp für die Nische. Formatiere kompakt mit Emojis als Trenner, Klartext ohne Markdown-Codeblock.`;

  const analyse = await askClaude(prompt, { maxTokens: 2500 });
  const voll = `TREND-SCOUT · ${config.SHOP_NAME}${NL}========${NL}${NL}${analyse}`;

  for (let i = 0; i < voll.length; i += 3900) {
    await notifyTelegram(voll.slice(i, i + 3900));
  }

  console.log('[08-trend-scout] Trend-Analyse versendet');
}

main().catch((err) => {
  console.error('[08-trend-scout] Fehler:', err);
  process.exit(1);
});
