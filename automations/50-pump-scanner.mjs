// Pump-Scanner - reiner Alarm, kein Handel. Meldet per WhatsApp, wenn eine
// Kryptowährung gerade stark steigt. Läuft unabhängig vom Trading-Bot (#49)
// und handelt selbst nichts - nur Information, keine Order.
import { config } from './lib/config.mjs';
import { getAllTickers24hr } from './lib/binance.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { chunkZeilen } from './lib/whatsappChunk.mjs';
import { loadState, saveState } from './lib/state.mjs';

const STATE_NAME = 'pump-scanner-state';
const WHATSAPP_MAX_CHARS = 3500;

async function main() {
  const quoteWaehrung = config.PUMP_QUOTE_WAEHRUNG;
  const schwelleProzent = parseFloat(config.PUMP_SCHWELLE_PROZENT);
  const minVolumen = parseFloat(config.PUMP_MIN_VOLUMEN_USDT);
  const cooldownMs = parseFloat(config.PUMP_COOLDOWN_STUNDEN) * 60 * 60 * 1000;
  const maxProLauf = parseInt(config.PUMP_MAX_PRO_LAUF, 10) || 10;

  const state = loadState(STATE_NAME);
  const jetzt = Date.now();

  // Abgelaufene Cooldown-Einträge entfernen - sie blockieren ohnehin nichts
  // mehr, würden aber sonst für immer im State liegen bleiben.
  const letzteAlarme = {};
  for (const [symbol, zeitpunkt] of Object.entries(state.alarme || {})) {
    if (jetzt - new Date(zeitpunkt).getTime() < cooldownMs) letzteAlarme[symbol] = zeitpunkt;
  }

  const tickers = await getAllTickers24hr();

  const kandidaten = tickers
    .filter((t) => t.symbol.endsWith(quoteWaehrung))
    .filter((t) => t.quoteVolume >= minVolumen)
    .filter((t) => t.priceChangePercent >= schwelleProzent)
    .filter((t) => !letzteAlarme[t.symbol])
    .sort((a, b) => b.priceChangePercent - a.priceChangePercent)
    .slice(0, maxProLauf);

  if (!kandidaten.length) {
    saveState(STATE_NAME, { alarme: letzteAlarme });
    console.log('[50-pump-scanner] Keine neuen Pumps über der Schwelle gefunden.');
    return;
  }

  const zeilen = kandidaten.map(
    (t, i) => `${i + 1}. *${t.symbol}*: +${t.priceChangePercent.toFixed(1)}% (24h) — ${t.lastPrice} ${quoteWaehrung}`,
  );

  const chunks = chunkZeilen(zeilen, WHATSAPP_MAX_CHARS);
  for (let i = 0; i < chunks.length; i++) {
    const kopf = chunks.length > 1
      ? `🚀 ${kandidaten.length} Coins pumpen gerade (Teil ${i + 1}/${chunks.length}):`
      : `🚀 ${kandidaten.length} Coin${kandidaten.length > 1 ? 's' : ''} pumpen gerade:`;
    await notifyWhatsapp(`${kopf}\n\n${chunks[i].join('\n')}`);
  }

  for (const t of kandidaten) {
    letzteAlarme[t.symbol] = new Date(jetzt).toISOString();
  }
  saveState(STATE_NAME, { alarme: letzteAlarme });

  console.log(`[50-pump-scanner] ${kandidaten.length} Pump-Alarm(e) per WhatsApp verschickt.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[50-pump-scanner] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[50-pump-scanner] Fehler:', err);
  process.exit(1);
});
