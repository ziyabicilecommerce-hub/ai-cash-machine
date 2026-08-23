// "International, der alles mitbekommt" - Alpaca handelt nur US-gelistete
// Wertpapiere, ECHTE ausländische Börsen (London, Frankfurt, Tokio, ...)
// sind darüber nicht erreichbar - ein zweiter Broker/eine zweite Integration
// dafür wäre ein riesiger, eigener Umbau. Der ehrliche Weg zu echter
// globaler Marktbeobachtung OHNE neue Integration: US-gelistete ADRs
// (American Depositary Receipts) großer internationaler Konzerne - dieselben
// Firmen, ganz normal in USD über denselben Alpaca-Feed abrufbar wie jede
// andere US-Aktie. Rein informativ, wie der Scanner: fügt NIE automatisch
// ein Symbol zum Bot hinzu - das bleibt eine bewusste, manuelle Entscheidung
// (STOCKS_SYMBOLS in wrangler.toml anpassen und deployen).
//
// Läuft einmal pro Tag (nicht bei jedem 5-Minuten-Cron), nur wenn der Markt
// gerade offen ist (runAll() ruft diese Funktion ohnehin nur dann auf) -
// die ADRs bewegen sich sowieso nur während der US-Börsenzeiten.
//
// HINWEIS: Der genaue Antwort-Aufbau von /v2/stocks/snapshots konnte in
// dieser Umgebung NICHT live gegen ein echtes Alpaca-Konto getestet werden
// (kein API-Key hier verfügbar) - defensiv gegen unerwartete Felder
// abgesichert (bricht bei Abweichung sauber ab), aber nach dem ersten
// echten Lauf bitte einmal den `globaleMaerkte`-Wert in /status gegenprüfen.

const DATA_BASE = 'https://data.alpaca.markets';

export const GLOBALE_ADRS = [
  { symbol: 'SAP', name: 'SAP', land: '🇩🇪 Deutschland' },
  { symbol: 'ASML', name: 'ASML', land: '🇳🇱 Niederlande' },
  { symbol: 'NVO', name: 'Novo Nordisk', land: '🇩🇰 Dänemark' },
  { symbol: 'NSRGY', name: 'Nestlé', land: '🇨🇭 Schweiz' },
  { symbol: 'UL', name: 'Unilever', land: '🇬🇧 UK' },
  { symbol: 'SHEL', name: 'Shell', land: '🇬🇧 UK' },
  { symbol: 'TTE', name: 'TotalEnergies', land: '🇫🇷 Frankreich' },
  { symbol: 'TM', name: 'Toyota', land: '🇯🇵 Japan' },
  { symbol: 'SONY', name: 'Sony', land: '🇯🇵 Japan' },
  { symbol: 'BABA', name: 'Alibaba', land: '🇨🇳 China' },
  { symbol: 'TSM', name: 'Taiwan Semiconductor', land: '🇹🇼 Taiwan' },
  { symbol: 'INFY', name: 'Infosys', land: '🇮🇳 Indien' },
  { symbol: 'SE', name: 'Sea Limited', land: '🇸🇬 Singapur' },
  { symbol: 'SHOP', name: 'Shopify', land: '🇨🇦 Kanada' },
];

function heute() {
  return new Date().toISOString().slice(0, 10);
}

export async function pruefeUndAktualisiereGlobaleMaerkte(env) {
  const heuteStr = heute();
  const letzterTag = await env.STOCKS_STATE.get('globalmarkets:letzterTag');
  if (letzterTag === heuteStr) return;

  try {
    const symbole = GLOBALE_ADRS.map((a) => a.symbol).join(',');
    const res = await fetch(`${DATA_BASE}/v2/stocks/snapshots?symbols=${symbole}&feed=iex`, {
      headers: { 'APCA-API-KEY-ID': env.ALPACA_API_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_API_SECRET },
    });
    if (!res.ok) throw new Error(`Alpaca Snapshots-Fehler: ${res.status}`);
    const data = await res.json();

    const treffer = GLOBALE_ADRS.map((a) => {
      const snap = data?.[a.symbol];
      const aktuellPreis = snap?.dailyBar?.c ?? snap?.latestTrade?.p ?? null;
      const vortagPreis = snap?.prevDailyBar?.c ?? null;
      const changeProzent = (aktuellPreis && vortagPreis) ? ((aktuellPreis / vortagPreis) - 1) * 100 : null;
      return { ...a, aktuellPreis, changeProzent };
    }).filter((t) => t.aktuellPreis != null);

    await env.STOCKS_STATE.put('globalmarkets:letzte', JSON.stringify({ treffer, berechnetAm: new Date().toISOString() }));
  } catch (err) {
    console.error('[stocks-bot] Globale Märkte fehlgeschlagen:', err);
  }
  await env.STOCKS_STATE.put('globalmarkets:letzterTag', heuteStr);
}
