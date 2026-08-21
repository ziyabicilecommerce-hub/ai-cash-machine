// Empire-Worker - verbindet Krypto-Bot (trading-bot-worker) und Aktien-Bot
// (stocks-bot-worker) WIRKLICH serverseitig zu einem System, statt sie nur
// im Dashboard clientseitig zusammenzurechnen. Bindet BEIDE bereits
// bestehenden KV-Namespaces direkt (read-only per Konvention - dieser
// Worker ruft NIE .put() auf, kann also strukturell nie einen Trade
// auslösen oder den State eines Bots verändern).
//
// Drei Aufgaben:
// 1. GET /status - EIN kombinierter, rein lesender Endpoint über beide
//    Bots (Gesamtkapital pro Währung, Gesamt-Trades, kombinierte
//    Readiness) - liest die KV-Keys direkt statt die /status-Endpoints der
//    einzelnen Bots per HTTP anzufragen (kein Secret der anderen Bots nötig).
// 2. Täglicher Cron - EIN kombinierter WhatsApp/Telegram-Report statt zwei
//    getrennter Nachrichten von den einzelnen Bots - "das System spricht
//    mit einer Stimme".
// 3. POST /telegram-webhook - interaktiver Telegram-Bot: auf Zuruf (/status,
//    /krypto, /aktien, /hilfe) antworten statt nur einmal täglich zu senden.
//    Genau wie 1./2. strikt rein lesend - kein Befehl kann je einen Trade
//    auslösen. Antwortet NUR im eigenen konfigurierten TELEGRAM_CHAT_ID,
//    damit niemand sonst, der den Bot findet, dein Portfolio abfragen kann.

import { notify } from './lib/notify.mjs';
import { formatBotDetail, formatKombiniertenStatusKern, formatStatusAntwort, formatHilfe } from './lib/telegram-commands.mjs';

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
  const text = `🏛️ CASHMACHINE EMPIRE — Tages-Report (beide Bots):\n${formatKombiniertenStatusKern(status)}`;
  await notify(env, text);
}

async function sendeTelegramAntwort(env, chatId, text) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch (err) {
    console.error('[telegram-webhook] Antwort fehlgeschlagen:', err);
  }
}

// Routet einen eingehenden Befehltext zur passenden Antwort. Unbekannter
// Text fällt bewusst auf /status zurück (freundlicher Standard statt
// "Befehl nicht erkannt") - jede Anfrage bekommt eine nützliche Antwort.
async function verarbeiteTelegramBefehl(env, text) {
  const befehl = (text || '').trim().split(/\s+/)[0].toLowerCase();
  if (befehl === '/krypto') {
    return formatBotDetail(await ladeAlleStates(env.TRADING_STATE), '₿ Krypto-Bot', 'USDT');
  }
  if (befehl === '/aktien') {
    return formatBotDetail(await ladeAlleStates(env.STOCKS_STATE), '📈 Aktien-Bot', 'USD');
  }
  if (befehl === '/hilfe' || befehl === '/start' || befehl === '/help') {
    return formatHilfe();
  }
  return formatStatusAntwort(await buildCombinedStatus(env));
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

    if (url.pathname === '/telegram-webhook' && request.method === 'POST') {
      // Telegrams eigener Webhook-Schutz: beim setWebhook-Aufruf einen
      // secret_token mitgeben, Telegram schickt ihn dann bei JEDEM Update in
      // diesem Header zurück - fremde POSTs ohne den Header werden abgelehnt.
      if (!env.TELEGRAM_WEBHOOK_SECRET || request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response('Forbidden', { status: 403 });
      }
      let update;
      try {
        update = await request.json();
      } catch {
        return new Response('OK', { status: 200 }); // Telegram erwartet immer 200, sonst wird geretried
      }
      const chatId = update.message && update.message.chat && update.message.chat.id;
      const text = update.message && update.message.text;
      // Nur im EIGENEN konfigurierten Chat antworten - verhindert, dass
      // irgendjemand anderes, der den Bot-Namen findet, dein Portfolio per
      // Nachricht abfragen kann. Kein Fehler nach außen, einfach stumm OK.
      if (chatId == null || !text || String(chatId) !== String(env.TELEGRAM_CHAT_ID)) {
        return new Response('OK', { status: 200 });
      }
      const antwort = await verarbeiteTelegramBefehl(env, text);
      await sendeTelegramAntwort(env, chatId, antwort);
      return new Response('OK', { status: 200 });
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
