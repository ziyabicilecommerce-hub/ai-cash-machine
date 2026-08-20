// Empire-Worker - verbindet Krypto-Bot (trading-bot-worker) und Aktien-Bot
// (stocks-bot-worker) WIRKLICH serverseitig zu einem System, statt sie nur
// im Dashboard clientseitig zusammenzurechnen. Bindet BEIDE bereits
// bestehenden KV-Namespaces direkt (read-only per Konvention - dieser
// Worker ruft NIE .put() auf, kann also strukturell nie einen Trade
// auslösen oder den State eines Bots verändern).
//
// Zwei Aufgaben:
// 1. GET /status - EIN kombinierter, rein lesender Endpoint über beide
//    Bots (Gesamtkapital pro Währung, Gesamt-Trades, kombinierte
//    Readiness) - liest die KV-Keys direkt statt die /status-Endpoints der
//    einzelnen Bots per HTTP anzufragen (kein Secret der anderen Bots nötig).
// 2. Täglicher Cron - EIN kombinierter WhatsApp/Telegram-Report statt zwei
//    getrennter Nachrichten von den einzelnen Bots - "das System spricht
//    mit einer Stimme".

import { notify } from './lib/notify.mjs';

async function ladeAlleStates(kv) {
  const list = await kv.list({ prefix: 'state:' });
  const states = [];
  for (const key of list.keys) {
    const raw = await kv.get(key.name);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.startKapital) continue;
      states.push({ symbol: key.name.replace('state:', ''), ...parsed });
    } catch {
      // Kaputter/unerwarteter Eintrag - einfach überspringen, kein Fehler
      // für den gesamten kombinierten Status.
    }
  }
  return states;
}

function fasseZusammen(states) {
  const kapital = states.reduce((s, x) => s + x.kapital, 0);
  const start = states.reduce((s, x) => s + x.startKapital, 0);
  const pl = kapital - start;
  const plProzent = start ? (pl / start) * 100 : 0;
  const offenePositionen = states.filter((s) => s.position).length;
  const alleTrades = states.flatMap((s) => s.trades || []);
  const gewinnTrades = alleTrades.filter((t) => t.gewinnVerlustUsdt > 0).length;
  const winRateProzent = alleTrades.length ? (gewinnTrades / alleTrades.length) * 100 : null;
  const killSwitchSymbole = states.filter((s) => s.killSwitchAktiv).map((s) => s.symbol);
  return { kapital, start, pl, plProzent, offenePositionen, anzahlSymbole: states.length, anzahlTrades: alleTrades.length, winRateProzent, killSwitchSymbole };
}

async function buildCombinedStatus(env) {
  const kryptoStates = await ladeAlleStates(env.TRADING_STATE);
  const aktienStates = await ladeAlleStates(env.STOCKS_STATE);
  return {
    updatedAt: new Date().toISOString(),
    krypto: { waehrung: 'USDT', ...fasseZusammen(kryptoStates) },
    aktien: { waehrung: 'USD', ...fasseZusammen(aktienStates) },
  };
}

async function sendeKombiniertenDigest(env) {
  const status = await buildCombinedStatus(env);
  const zeilen = ['🏛️ CASHMACHINE EMPIRE — Tages-Report (beide Bots):'];

  zeilen.push(`₿ Krypto: ${status.krypto.kapital.toFixed(2)} USDT (${status.krypto.plProzent >= 0 ? '+' : ''}${status.krypto.plProzent.toFixed(2)}%), ${status.krypto.anzahlTrades} Trades${status.krypto.winRateProzent != null ? `, Win-Rate ${status.krypto.winRateProzent.toFixed(0)}%` : ''}`);
  zeilen.push(`📈 Aktien: ${status.aktien.kapital.toFixed(2)} USD (${status.aktien.plProzent >= 0 ? '+' : ''}${status.aktien.plProzent.toFixed(2)}%), ${status.aktien.anzahlTrades} Trades${status.aktien.winRateProzent != null ? `, Win-Rate ${status.aktien.winRateProzent.toFixed(0)}%` : ''}`);

  const killSwitches = [...status.krypto.killSwitchSymbole, ...status.aktien.killSwitchSymbole];
  if (killSwitches.length) zeilen.push(`🛑 Kill-Switch aktiv bei: ${killSwitches.join(', ')}`);

  await notify(env, zeilen.join('\n'));
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendeKombiniertenDigest(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/status' && request.method === 'GET') {
      if (!env.STATUS_READ_KEY || url.searchParams.get('key') !== env.STATUS_READ_KEY) {
        return new Response('Forbidden', { status: 403 });
      }
      const status = await buildCombinedStatus(env);
      return new Response(JSON.stringify(status), {
        status: 200,
        headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Manueller Test-Auslöser für den Report (rein lesend, kann nie einen
    // Trade auslösen - schreibt nirgends).
    if (url.searchParams.get('key') !== env.TRIGGER_SECRET || !env.TRIGGER_SECRET) {
      return new Response('Forbidden', { status: 403 });
    }
    await sendeKombiniertenDigest(env);
    return new Response('OK - Report gesendet, siehe WhatsApp/Telegram/Logs.', { status: 200 });
  },
};
