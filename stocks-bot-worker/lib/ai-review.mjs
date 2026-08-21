// AI Trade Review - wöchentlicher, REIN LESENDER Rückblick auf die eigenen
// abgeschlossenen Trades durch Claude (Anthropic API). Pendant zu
// trading-bot-worker/lib/ai-review.mjs. Liest NUR bereits gespeicherte
// Daten (Trade-Historie, Portfolio-Kennzahlen, letzter Auto-Backtest) und
// schreibt eine Text-Einschätzung nach KV - kann STRUKTURELL NIE einen
// Trade auslösen oder eine Bot-Einstellung verändern (kein einziger Aufruf
// von entscheideKauf/entscheideVerkauf/placeMarketBuy/-Sell in dieser
// Datei), das bleibt ausschließlich Sache des Nutzers.
//
// KOSTET ECHTES GELD pro Aufruf (Anthropic API) - deshalb standardmäßig AUS
// UND läuft nur einmal pro Woche (montags), NIE bei jedem 5-Minuten-Cron.
// Braucht zusätzlich das ANTHROPIC_API_KEY-Secret - fehlt es, wird sauber
// übersprungen statt einen Fehler zu werfen.

import { loadState } from './state.mjs';
import { berechneRisikoKennzahlen } from './statistik.mjs';
import { notify } from './notify.mjs';

const MODELL = 'claude-sonnet-5';
const MAX_TOKENS = 900;

function wochenSchluessel(datum) {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const tagNummer = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tagNummer);
  const jahresStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d - jahresStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-KW${String(kw).padStart(2, '0')}`;
}

async function fragClaude(env, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: MODELL, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Claude API Fehler ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const block = (data.content || []).find((b) => b.type === 'text');
  return block ? block.text : '';
}

function baueBriefing(alleTrades, backtestZeilen, k) {
  const letzteTrades = [...alleTrades].sort((a, b) => new Date(b.ausstiegAm) - new Date(a.ausstiegAm)).slice(0, 30);
  const tradesText = letzteTrades.map((t) => `${t.ausstiegAm}: ${t.gewinnVerlustUsdt >= 0 ? '+' : ''}${t.gewinnVerlustUsdt.toFixed(2)} USD (${t.gewinnProzent.toFixed(2)}%) - ${t.grund}`).join('\n');
  return `Du bist ein nüchterner, ehrlicher Trading-Coach für einen US-AKTIEN-PAPER-TRADING-BOT (kein echtes Geld im Einsatz). Hier sind die letzten abgeschlossenen Trades:
${tradesText || 'Keine Trades.'}

Portfolio-Kennzahlen: Profit Factor ${k.profitFactor?.toFixed(2) ?? '-'}, Expectancy ${k.expectancyUsdt?.toFixed(2) ?? '-'} USD/Trade, Recovery Factor ${k.recoveryFactor?.toFixed(2) ?? '-'}.

Letzte automatische Backtests (14 Tage, echte Alpaca-Kursdaten):
${backtestZeilen.join('\n') || 'Noch keine.'}

Gib eine KURZE (max. 5 Sätze), ehrliche Einschätzung: Gibt es ein Muster bei den Verlusten? Wirkt die Strategie angesichts der Backtests noch stimmig? Was würdest du als Nächstes beobachten? Keine Finanzberatung, keine Erfolgsgarantie - nur eine nüchterne Beobachtung. Antworte auf Deutsch, ohne Einleitung, direkt mit der Einschätzung.`;
}

export async function pruefeUndFuehreAiReview(env, cfg) {
  if (!cfg.aiReview) return;
  if (!env.ANTHROPIC_API_KEY) return; // Feature an, aber Secret fehlt - sauber überspringen
  const jetzt = new Date();
  if (jetzt.getUTCDay() !== 1) return; // nur montags
  const aktuelleWoche = wochenSchluessel(jetzt);
  const letzte = await env.STOCKS_STATE.get('ai-review:letzteWoche');
  if (letzte === aktuelleWoche) return;

  const alleTrades = [];
  const backtestZeilen = [];
  for (const symbol of cfg.symbols) {
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    alleTrades.push(...(state.trades || []));
    try {
      const raw = await env.STOCKS_STATE.get(`backtest:${symbol}`);
      if (raw) {
        const b = JSON.parse(raw);
        backtestZeilen.push(`${symbol}: ${b.gesamtReturnProzent.toFixed(1)}% (${b.anzahlTrades} Trades, ${b.tageZurueck} Tage)`);
      }
    } catch {
      // Kein/kaputter Backtest-Eintrag - einfach weglassen.
    }
  }
  if (!alleTrades.length) {
    await env.STOCKS_STATE.put('ai-review:letzteWoche', aktuelleWoche);
    return; // nichts zu reviewen, keine Kosten für eine leere Analyse verursachen
  }

  try {
    const kennzahlen = berechneRisikoKennzahlen(alleTrades);
    const prompt = baueBriefing(alleTrades, backtestZeilen, kennzahlen);
    const text = await fragClaude(env, prompt);
    await env.STOCKS_STATE.put('ai-review:aktuell', JSON.stringify({ text, erstelltAm: jetzt.toISOString() }));
    await notify(env, `🤖 AI Trade Review (wöchentlich):\n${text}`);
  } catch (err) {
    console.error('[stocks-bot] AI Trade Review fehlgeschlagen:', err);
  }
  await env.STOCKS_STATE.put('ai-review:letzteWoche', aktuelleWoche);
}
