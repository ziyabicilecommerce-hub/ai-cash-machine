// ⚠️ ECHTES FINANZIELLES RISIKO - kein Backtest-Ergebnis, keine Anlageberatung.
// Krypto-Spot-Trading-Bot (kein Hebel/Margin - maximaler Verlust ist immer nur
// das zugewiesene Kapital, nie mehr). Strategie: EMA-Crossover (einfach,
// nachvollziehbar, keine Blackbox). Startet standardmäßig im Paper-Modus
// (simuliert, kein echtes Geld) - erst nach bewusstem Umstellen von
// TRADING_PAPER_MODE=nein wird wirklich gehandelt. Siehe automations/README.md
// für die vollständige Erklärung der Sicherheitsgrenzen.
import { config } from './lib/config.mjs';
import { getKlines, getMinNotional, placeMarketBuy, placeMarketSell } from './lib/binance.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { loadState, saveState } from './lib/state.mjs';

const STATE_NAME = 'trading-bot-state';
const INTERVAL = '15m';
const KLINES_LIMIT = 100;

function emaSeries(closes, period) {
  const k = 2 / (period + 1);
  const out = [closes[0]];
  for (let i = 1; i < closes.length; i++) {
    out.push(closes[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

function heute() {
  return new Date().toISOString().slice(0, 10);
}

function initialerState() {
  const kapital = parseFloat(config.TRADING_KAPITAL_USDT);
  return {
    position: null,
    startKapital: kapital,
    kapital,
    heutigerVerlustUsdt: 0,
    letzterTag: heute(),
    killSwitchAktiv: false,
    killSwitchBenachrichtigt: false,
  };
}

async function main() {
  const paperModus = config.TRADING_PAPER_MODE !== 'nein';
  const symbol = config.TRADING_SYMBOL;
  const maxPositionProzent = parseFloat(config.TRADING_MAX_POSITION_PROZENT);
  const maxTagesverlustProzent = parseFloat(config.TRADING_MAX_TAGESVERLUST_PROZENT);
  const maxGesamtverlustProzent = parseFloat(config.TRADING_MAX_GESAMTVERLUST_PROZENT);
  const stopLossProzent = parseFloat(config.TRADING_STOP_LOSS_PROZENT);
  const emaSchnell = parseInt(config.TRADING_EMA_SCHNELL, 10);
  const emaLangsam = parseInt(config.TRADING_EMA_LANGSAM, 10);

  let state = loadState(STATE_NAME);
  if (!state.startKapital) state = initialerState();

  if (state.letzterTag !== heute()) {
    state.letzterTag = heute();
    state.heutigerVerlustUsdt = 0;
  }

  if (state.killSwitchAktiv) {
    if (!state.killSwitchBenachrichtigt) {
      await notifyWhatsapp(
        `🛑 Trading-Bot GESTOPPT: Gesamtverlust-Grenze (${maxGesamtverlustProzent}%) erreicht. ` +
        `Kapital: ${state.kapital.toFixed(2)} USDT (Start: ${state.startKapital.toFixed(2)} USDT). ` +
        `Bot bleibt aus, bis du automations/state/trading-bot-state.json manuell zurücksetzt.`,
      );
      state.killSwitchBenachrichtigt = true;
      saveState(STATE_NAME, state);
    }
    console.log('[49-trading-bot] Kill-Switch aktiv - kein Handel.');
    return;
  }

  const klines = await getKlines(symbol, INTERVAL, KLINES_LIMIT);
  const closes = klines.map((k) => k.close);
  if (closes.length < emaLangsam + 2) {
    console.log('[49-trading-bot] Zu wenig Kerzendaten für die Strategie.');
    return;
  }

  const fastSeries = emaSeries(closes, emaSchnell);
  const slowSeries = emaSeries(closes, emaLangsam);
  const n = closes.length;
  const diffJetzt = fastSeries[n - 1] - slowSeries[n - 1];
  const diffVorher = fastSeries[n - 2] - slowSeries[n - 2];
  const crossUp = diffVorher <= 0 && diffJetzt > 0;
  const crossDown = diffVorher >= 0 && diffJetzt < 0;
  const preis = closes[n - 1];

  const handelsSperreHeute = state.heutigerVerlustUsdt <= -(state.kapital * maxTagesverlustProzent) / 100;

  if (!state.position) {
    if (handelsSperreHeute) {
      console.log('[49-trading-bot] Tagesverlust-Grenze erreicht - kein neuer Einstieg heute.');
    } else if (crossUp) {
      const investBetrag = (state.kapital * maxPositionProzent) / 100;
      const minNotional = await getMinNotional(symbol);

      if (minNotional !== null && investBetrag < minNotional) {
        console.log(`[49-trading-bot] Kaufsignal übersprungen: ${investBetrag.toFixed(2)} USDT liegt unter Binances Mindest-Ordergröße (${minNotional.toFixed(2)} USDT für ${symbol}).`);
        await notifyWhatsapp(
          `⚠️ Trading-Bot: Kaufsignal erkannt, aber übersprungen - dein Kapital (${state.kapital.toFixed(2)} USDT, ` +
          `${maxPositionProzent}% davon = ${investBetrag.toFixed(2)} USDT pro Trade) liegt unter Binances Mindest-Ordergröße ` +
          `von ${minNotional.toFixed(2)} USDT für ${symbol}. Erhöhe TRADING_KAPITAL_USDT oder TRADING_MAX_POSITION_PROZENT.`,
        );
        saveState(STATE_NAME, state);
        return;
      }

      let qty, tatsaechlicherPreis;
      if (paperModus) {
        qty = investBetrag / preis;
        tatsaechlicherPreis = preis;
      } else {
        const order = await placeMarketBuy(symbol, investBetrag);
        qty = parseFloat(order.executedQty);
        tatsaechlicherPreis = parseFloat(order.cummulativeQuoteQty) / qty;
      }
      state.position = { qty, entryPreis: tatsaechlicherPreis, einstiegAm: new Date().toISOString() };
      await notifyWhatsapp(
        `📈 ${paperModus ? '[PAPER] ' : ''}Trading-Bot: Einstieg ${symbol} @ ${tatsaechlicherPreis.toFixed(2)} USDT ` +
        `(${investBetrag.toFixed(2)} USDT eingesetzt).`,
      );
    }
  } else {
    const stopLossPreis = state.position.entryPreis * (1 - stopLossProzent / 100);
    const ausstiegsSignal = crossDown || preis <= stopLossPreis;

    if (ausstiegsSignal) {
      let erloes;
      if (paperModus) {
        erloes = state.position.qty * preis;
      } else {
        const order = await placeMarketSell(symbol, state.position.qty);
        erloes = parseFloat(order.cummulativeQuoteQty);
      }
      const einsatz = state.position.qty * state.position.entryPreis;
      const gewinnVerlust = erloes - einsatz;

      state.kapital += gewinnVerlust;
      state.heutigerVerlustUsdt += Math.min(0, gewinnVerlust);

      const grund = preis <= stopLossPreis ? 'Stop-Loss' : 'EMA-Crossover';
      await notifyWhatsapp(
        `📉 ${paperModus ? '[PAPER] ' : ''}Trading-Bot: Ausstieg ${symbol} @ ${preis.toFixed(2)} USDT (${grund}). ` +
        `${gewinnVerlust >= 0 ? 'Gewinn' : 'Verlust'}: ${gewinnVerlust.toFixed(2)} USDT. ` +
        `Kapital jetzt: ${state.kapital.toFixed(2)} USDT.`,
      );
      state.position = null;

      const gesamtVerlustProzent = ((state.kapital - state.startKapital) / state.startKapital) * 100;
      if (gesamtVerlustProzent <= -maxGesamtverlustProzent) {
        state.killSwitchAktiv = true;
      }
    }
  }

  saveState(STATE_NAME, state);
  console.log(`[49-trading-bot] Lauf abgeschlossen. Kapital: ${state.kapital.toFixed(2)} USDT, Position: ${state.position ? 'offen' : 'keine'}.`);
}

main().catch(async (err) => {
  console.error('[49-trading-bot] Fehler:', err);
  // Bei echtem Geld darf ein fehlgeschlagener Kauf/Verkauf (z.B. abgelehnte
  // Order, Netzwerkfehler) nicht nur im GitHub-Actions-Log verschwinden -
  // sonst merkt niemand, dass gerade z.B. ein Stop-Loss NICHT ausgeführt wurde.
  try {
    await notifyWhatsapp(
      `🛑 Trading-Bot: Lauf mit Fehler abgebrochen - ${err.message || err}. ` +
      `Eine Order (Ein- oder Ausstieg) wurde dadurch möglicherweise NICHT ausgeführt. Bitte Binance-Konto und automations/state/trading-bot-state.json manuell prüfen.`,
    );
  } catch (notifyErr) {
    console.error('[49-trading-bot] Zusätzlich: WhatsApp-Fehlerbenachrichtigung fehlgeschlagen:', notifyErr);
  }
  process.exit(1);
});
