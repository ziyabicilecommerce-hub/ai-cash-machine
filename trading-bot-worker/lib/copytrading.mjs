// OKX Copy-Trading Leaderboard - echte, öffentliche Rangliste der Top-
// Lead-Trader PLUS deren aktuell offene Positionen. Fühlt sich an wie
// "ich seh genau, was der Nr.-1-Trader gerade hält" - ist aber 100% legal
// und öffentlich: OKX zeigt das ABSICHTLICH, weil Lead-Trader damit
// Follower fürs Copy-Trading gewinnen wollen (Opt-in-Transparenz seitens
// der Trader, kein Datenleck, keine SEC-Meldepflicht nötig - hier macht's
// die Börse selbst öffentlich).
//
// Öffentliche, unauthentifizierte OKX-v5-Endpoints (kein API-Key nötig,
// live per curl verifiziert):
//   GET /api/v5/copytrading/public-lead-traders?instType=SWAP
//   GET /api/v5/copytrading/public-current-subpositions?uniqueCode=...
// KEIN CORS für Browser-Fetch (anders als CoinGecko/blockchain.info) -
// deshalb läuft der Abruf hier serverseitig statt im Trading Deck.
//
// Läuft höchstens 1x pro Tag. Ein Lead-Trader kann viele "Sub-Positionen"
// im selben Instrument haben (eine je gekoppeltem Follower-Kapitalanteil) -
// werden hier zu EINER konsolidierten Position pro Instrument
// zusammengefasst statt 100 Zeilen für dieselbe Position zu zeigen.

const OKX_BASIS = 'https://www.okx.com/api/v5/copytrading';
const MAX_TRADER = 5;
const MAX_POSITIONEN_PRO_TRADER = 5;

export async function pruefeUndAktualisiereCopyTrading(env) {
  const heuteStr = new Date().toISOString().slice(0, 10);
  const letzterTag = await env.TRADING_STATE.get('copytrading:letzterTag');
  if (letzterTag === heuteStr) return;

  try {
    const res = await fetch(`${OKX_BASIS}/public-lead-traders?instType=SWAP`);
    if (!res.ok) throw new Error(`OKX Leaderboard-Fehler: ${res.status}`);
    const data = await res.json();
    if (data.code !== '0') throw new Error(`OKX-Fehler: ${data.msg || data.code}`);
    const ranks = (data.data[0] && data.data[0].ranks) || [];

    const trader = [];
    for (const r of ranks.slice(0, MAX_TRADER)) {
      const eintrag = {
        nickName: r.nickName,
        pnl: parseFloat(r.pnl),
        pnlRatioProzent: parseFloat(r.pnlRatio) * 100,
        winRatioProzent: parseFloat(r.winRatio) * 100,
        aum: parseFloat(r.aum),
        copyTraderNum: parseInt(r.copyTraderNum, 10),
        leadDays: parseInt(r.leadDays, 10),
        positionen: [],
      };
      try {
        const posRes = await fetch(`${OKX_BASIS}/public-current-subpositions?uniqueCode=${r.uniqueCode}&instType=SWAP`);
        if (posRes.ok) {
          const posData = await posRes.json();
          if (posData.code === '0') {
            const gruppen = {};
            for (const p of posData.data || []) {
              if (!gruppen[p.instId]) {
                gruppen[p.instId] = { instId: p.instId, subPosSumme: 0, gewichteteEinstiegSumme: 0, lever: p.lever, markPx: parseFloat(p.markPx) };
              }
              const subPos = parseFloat(p.subPos);
              gruppen[p.instId].subPosSumme += subPos;
              gruppen[p.instId].gewichteteEinstiegSumme += subPos * parseFloat(p.openAvgPx);
            }
            eintrag.positionen = Object.values(gruppen).slice(0, MAX_POSITIONEN_PRO_TRADER).map((g) => {
              const einstiegPreis = g.subPosSumme ? g.gewichteteEinstiegSumme / g.subPosSumme : 0;
              return {
                instId: g.instId,
                hebel: g.lever,
                einstiegPreis,
                marktPreis: g.markPx,
                veraenderungProzent: einstiegPreis ? ((g.markPx - einstiegPreis) / einstiegPreis) * 100 : 0,
              };
            });
          }
        }
      } catch (err) {
        console.error(`[trading-bot] Copy-Trading Positionen für ${r.nickName} fehlgeschlagen:`, err);
      }
      trader.push(eintrag);
    }

    await env.TRADING_STATE.put('copytrading:letzte', JSON.stringify({ datum: new Date().toISOString(), trader }));
  } catch (err) {
    console.error('[trading-bot] OKX Copy-Trading-Leaderboard fehlgeschlagen:', err);
  }
  await env.TRADING_STATE.put('copytrading:letzterTag', heuteStr);
}
