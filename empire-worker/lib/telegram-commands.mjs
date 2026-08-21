// Antworten auf eingehende Telegram-Befehle - rein lesend, nutzt dieselben
// State-Leseflüsse wie GET /status und der tägliche Digest. Kann strukturell
// NIE einen Trade auslösen oder State ändern (kein einziger .put()-Aufruf
// in dieser Datei).

function symbolIcon(s) {
  if (s.killSwitchAktiv) return '🛑';
  if (s.position) return '📈';
  return '⏸️';
}

function formatSymbolZeile(s, waehrung) {
  const posInfo = s.position ? ` · Position offen @ ${s.position.entryPreis.toFixed ? s.position.entryPreis.toFixed(4) : s.position.entryPreis}` : '';
  const killInfo = s.killSwitchAktiv ? ' · KILL-SWITCH AKTIV' : '';
  return `${symbolIcon(s)} ${s.symbol}: ${s.kapital.toFixed(2)} ${waehrung} (Start ${s.startKapital.toFixed(2)})${posInfo}${killInfo}`;
}

// Detail-Ansicht EINES Bots, Symbol für Symbol - für /krypto und /aktien.
export function formatBotDetail(states, botName, waehrung) {
  if (!states.length) return `${botName}: noch keine Daten (Bot noch nie gelaufen oder KV leer).`;
  const zeilen = [`${botName} — Detail pro Symbol:`, ...states.map((s) => formatSymbolZeile(s, waehrung))];
  return zeilen.join('\n');
}

// Kombinierte Kurzübersicht - EIN Kern-Text, den sowohl der tägliche
// Digest (sendeKombiniertenDigest) als auch /status im Telegram-Bot nutzen,
// jeweils mit eigener Überschrift/Fußzeile drumherum statt duplizierter
// Formatierungslogik.
export function formatKombiniertenStatusKern(status) {
  const zeilen = [];
  zeilen.push(`₿ Krypto: ${status.krypto.kapital.toFixed(2)} USDT (${status.krypto.plProzent >= 0 ? '+' : ''}${status.krypto.plProzent.toFixed(2)}%), ${status.krypto.anzahlTrades} Trades${status.krypto.winRateProzent != null ? `, Win-Rate ${status.krypto.winRateProzent.toFixed(0)}%` : ''}`);
  zeilen.push(`📈 Aktien: ${status.aktien.kapital.toFixed(2)} USD (${status.aktien.plProzent >= 0 ? '+' : ''}${status.aktien.plProzent.toFixed(2)}%), ${status.aktien.anzahlTrades} Trades${status.aktien.winRateProzent != null ? `, Win-Rate ${status.aktien.winRateProzent.toFixed(0)}%` : ''}`);
  const killSwitches = [...status.krypto.killSwitchSymbole, ...status.aktien.killSwitchSymbole];
  zeilen.push(killSwitches.length ? `🛑 Kill-Switch aktiv bei: ${killSwitches.join(', ')}` : '✅ Kein Kill-Switch aktiv.');
  return zeilen.join('\n');
}

// /status im Telegram-Bot: Kern-Text plus Hinweis auf die anderen Befehle.
export function formatStatusAntwort(status) {
  return `🏛️ CASHMACHINE EMPIRE — Status:\n${formatKombiniertenStatusKern(status)}\n\nBefehle: /krypto · /aktien · /hilfe`;
}

export function formatHilfe() {
  return [
    '🏛️ CASHMACHINE EMPIRE BOT — Befehle:',
    '/status — kombinierte Übersicht beider Bots',
    '/krypto — Detail-Status Krypto-Bot (pro Symbol)',
    '/aktien — Detail-Status Aktien-Bot (pro Symbol)',
    '/hilfe — diese Liste',
    '',
    'Rein lesend — kein Befehl hier kann jemals einen Trade auslösen oder',
    'etwas verändern, egal was du schreibst.',
  ].join('\n');
}
