// Telegram-Befehle: der Bot reagiert auf eingehende Telegram-Nachrichten
// (Webhook, siehe worker.js POST /telegram-webhook) statt nur passiv zu
// benachrichtigen. NUR der konfigurierte Besitzer-Chat (env.TELEGRAM_CHAT_ID)
// wird akzeptiert - jede Nachricht von einer anderen Chat-ID wird ignoriert,
// damit niemand sonst den Bot fernsteuern kann, selbst wenn er den Bot-Namen
// oder -Link kennt. Befehle:
//   /status [SYMBOL]  - Kapital, offene Position, Trades (aus dem
//                        gespeicherten State, kein Live-Kursabruf - schnelle
//                        Antwort statt bei jedem Befehl die Börse anzufragen)
//   /pause SYMBOL      - stoppt NEUE Käufe für dieses Symbol (eine bereits
//                        offene Position wird weiter normal verwaltet,
//                        Stop-Loss/Trailing-Stop laufen unverändert weiter -
//                        siehe worker.js runSymbol)
//   /resume SYMBOL     - hebt die Pause wieder auf
//   /help              - Befehlsübersicht

import { loadState, saveState } from './state.mjs';
import { readConfig } from './config.mjs';

async function sendeTelegramAntwort(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    });
  } catch (err) {
    console.error('[telegram-befehle] Antwort fehlgeschlagen:', err);
  }
}

function formatiereStatusZeile(symbol, state) {
  const position = state.position
    ? `Position offen @ ${state.position.entryPreis.toFixed(4)} (Menge ${state.position.qty.toFixed(6)})`
    : 'Keine offene Position';
  const trades = state.trades || [];
  const plGesamt = trades.reduce((s, t) => s + t.gewinnVerlustUsdt, 0);
  const pausiertText = state.pausiert ? ' ⏸️ PAUSIERT' : '';
  return `${symbol}${pausiertText}: ${state.kapital.toFixed(2)} USDT (${plGesamt >= 0 ? '+' : ''}${plGesamt.toFixed(2)} P&L) - ${position} - ${trades.length} Trades gesamt`;
}

const HILFE_TEXT = 'Befehle:\n/status [SYMBOL] - Kapital, Position, Trades\n/pause SYMBOL - keine neuen Käufe mehr für dieses Symbol\n/resume SYMBOL - Pause aufheben\n/help - diese Übersicht';

export async function verarbeiteTelegramUpdate(env, update) {
  const message = update && update.message;
  const text = message && message.text;
  const chatId = message && message.chat && String(message.chat.id);
  if (!text || !chatId) return;

  if (!env.TELEGRAM_CHAT_ID || chatId !== String(env.TELEGRAM_CHAT_ID)) {
    console.error(`[telegram-befehle] Nachricht von fremder Chat-ID ${chatId} ignoriert.`);
    return;
  }

  const teile = text.trim().split(/\s+/);
  const befehl = (teile[0] || '').toLowerCase();
  const symbolArg = teile[1] ? teile[1].toUpperCase() : null;
  const cfg = readConfig(env);

  if (befehl === '/status') {
    if (symbolArg) {
      if (!cfg.symbols.includes(symbolArg)) {
        await sendeTelegramAntwort(env, `Unbekanntes Symbol "${symbolArg}" - gültig: ${cfg.symbols.join(', ')}`);
        return;
      }
      const state = await loadState(env, symbolArg, cfg.startKapitalProSymbol);
      await sendeTelegramAntwort(env, formatiereStatusZeile(symbolArg, state));
      return;
    }
    const zeilen = [];
    for (const symbol of cfg.symbols) {
      const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
      zeilen.push(formatiereStatusZeile(symbol, state));
    }
    await sendeTelegramAntwort(env, `📊 Status (${cfg.paperModus ? 'PAPER' : 'LIVE'}):\n${zeilen.join('\n')}`);
    return;
  }

  if (befehl === '/pause' || befehl === '/resume') {
    if (!symbolArg || !cfg.symbols.includes(symbolArg)) {
      await sendeTelegramAntwort(env, `Bitte Symbol angeben, z.B. "${befehl} ${cfg.symbols[0]}" - gültig: ${cfg.symbols.join(', ')}`);
      return;
    }
    const state = await loadState(env, symbolArg, cfg.startKapitalProSymbol);
    state.pausiert = befehl === '/pause';
    await saveState(env, symbolArg, state);
    await sendeTelegramAntwort(env, state.pausiert
      ? `⏸️ ${symbolArg}: pausiert - keine neuen Käufe mehr, eine bereits offene Position läuft normal mit Stop-Loss/Trailing-Stop weiter.`
      : `▶️ ${symbolArg}: Pause aufgehoben, handelt ab dem nächsten Lauf wieder normal.`);
    return;
  }

  await sendeTelegramAntwort(env, HILFE_TEXT);
}
