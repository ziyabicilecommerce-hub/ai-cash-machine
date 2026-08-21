// Live Market Scanner (Pendant zum Krypto-Bot) - sucht ÜBER die
// konfigurierten STOCKS_SYMBOLS hinaus nach US-Aktien mit starkem
// Momentum, über Alpacas Movers-Screener (dieselben ALPACA_API_KEY/-SECRET
// wie der Live-Bot, kein neues Secret nötig). REIN INFORMATIV: fügt NIE
// automatisch ein Symbol zum Bot hinzu - das bleibt bewusst eine manuelle
// Entscheidung (STOCKS_SYMBOLS in wrangler.toml anpassen und deployen).
//
// Läuft einmal pro Tag (nicht bei jedem 5-Minuten-Cron), nur wenn der
// Markt gerade offen ist (runAll() ruft diese Funktion ohnehin nur dann auf).
//
// HINWEIS: Der genaue Antwort-Aufbau von
// /v1beta1/screener/stocks/movers konnte in dieser Umgebung NICHT live
// gegen ein echtes Alpaca-Konto getestet werden (kein API-Key hier
// verfügbar) - defensiv gegen unerwartete Formate abgesichert (bricht bei
// Abweichung sauber ab, gefährdet nie den restlichen Cron-Lauf), aber nach
// dem ersten echten Lauf bitte einmal die Telegram/WhatsApp-Nachricht oder
// den `scanner`-Wert in /status gegenprüfen.

import { notify } from './notify.mjs';

const DATA_BASE = 'https://data.alpaca.markets';

function heute() {
  return new Date().toISOString().slice(0, 10);
}

export async function pruefeUndAktualisiereScanner(env, cfg) {
  if (!cfg.scanner) return;
  const heuteStr = heute();
  const letzterTag = await env.STOCKS_STATE.get('scanner:letzterTag');
  if (letzterTag === heuteStr) return;

  try {
    const res = await fetch(`${DATA_BASE}/v1beta1/screener/stocks/movers?top=20`, {
      headers: { 'APCA-API-KEY-ID': env.ALPACA_API_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_API_SECRET },
    });
    if (!res.ok) throw new Error(`Alpaca Screener-Fehler: ${res.status}`);
    const data = await res.json();
    const gainers = Array.isArray(data.gainers) ? data.gainers : [];
    const eigeneSymbole = new Set(cfg.symbols);

    const treffer = gainers
      .filter((g) => g && typeof g.symbol === 'string' && !eigeneSymbole.has(g.symbol))
      .filter((g) => typeof g.percent_change === 'number' && g.percent_change >= cfg.scannerMomentumSchwelleProzent)
      .slice(0, 10)
      .map((g) => ({ symbol: g.symbol, changeProzent: g.percent_change, preisUsd: g.price }));

    await env.STOCKS_STATE.put('scanner:trending', JSON.stringify({ treffer, berechnetAm: new Date().toISOString(), momentumSchwelleProzent: cfg.scannerMomentumSchwelleProzent }));

    if (treffer.length) {
      const zeilen = treffer.map((t) => `${t.symbol}: +${t.changeProzent.toFixed(1)}% @ ${t.preisUsd?.toFixed ? t.preisUsd.toFixed(2) : t.preisUsd} USD`);
      await notify(env, `🔍 Live Market Scanner: ${treffer.length} Aktie(n) mit starkem Momentum außerhalb deiner konfigurierten Symbole:\n${zeilen.join('\n')}\n\nRein informativ - füge Symbole nur bewusst in STOCKS_SYMBOLS hinzu, keine automatische Übernahme.`);
    }
  } catch (err) {
    console.error('[stocks-bot] Live Market Scanner fehlgeschlagen:', err);
  }
  await env.STOCKS_STATE.put('scanner:letzterTag', heuteStr);
}
