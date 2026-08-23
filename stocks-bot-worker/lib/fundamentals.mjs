// Fundamentaldaten aus SEC XBRL "Company Facts" - echte, aus 10-K/10-Q-
// Meldungen extrahierte Kennzahlen (Umsatz, Nettogewinn, Gewinn pro Aktie),
// kostenlos und ohne API-Key direkt von der SEC. Reutzt dieselbe CIK-
// Auflösung wie insidertrades.mjs/insiderbuys.mjs.
//
// BEWUSST NUR INFORMATIV, KEIN TRADING-FILTER: die XBRL-Tag-Zuordnung
// variiert zwischen Firmen (z.B. "Revenues" vs.
// "RevenueFromContractWithCustomerExcludingAssessedTax"), und eine simple
// YoY-Vergleichslogik über verschiedene Firmen hinweg ist nicht robust
// genug, um sie ungetestet in eine echte Kauf-/Verkaufsentscheidung
// einzubauen - das wäre fahrlässig. Zeigt die Zahlen ehrlich an, lässt aber
// bei fehlenden/unklaren Daten einfach Felder leer statt zu raten.
//
// Läuft höchstens 1x pro Woche (Fundamentaldaten ändern sich nur alle paar
// Monate durch neue Quartalsberichte) - Montags, wie der Auto-Backtest.

import { ladeCikFuerSymbol } from './insiderbuys.mjs';

const SEC_USER_AGENT_FALLBACK = 'CashMachineStocksBot/1.0 (dein-kontakt@example.com)';

// Mehrere mögliche XBRL-Tags pro Kennzahl - Firmen nutzen unterschiedliche
// GAAP-Taxonomie-Tags für denselben wirtschaftlichen Sachverhalt, deshalb
// wird der erste vorhandene Tag genutzt statt nur einen fest anzunehmen.
const UMSATZ_TAGS = ['RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'Revenues'];
const NETTOGEWINN_TAGS = ['NetIncomeLoss', 'ProfitLoss'];
const EPS_TAGS = ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'];

function secHeaders(cfg) {
  return { 'User-Agent': cfg?.insiderSecUserAgent || SEC_USER_AGENT_FALLBACK, 'Accept-Encoding': 'gzip, deflate' };
}

function letzterQuartalswert(usgaap, tagListe) {
  for (const tag of tagListe) {
    const eintrag = usgaap[tag];
    if (!eintrag || !eintrag.units) continue;
    const werte = Object.values(eintrag.units)[0];
    if (!werte || !werte.length) continue;
    // Nur echte Quartals-/Jahresmeldungen, neueste zuerst (SEC liefert idR
    // bereits chronologisch, aber nicht garantiert - sicherheitshalber
    // selbst sortieren).
    const relevante = werte.filter((w) => (w.form === '10-Q' || w.form === '10-K') && w.start && w.end)
      .sort((a, b) => new Date(b.end) - new Date(a.end));
    if (!relevante.length) continue;
    const neuester = relevante[0];
    const dauerTage = (new Date(neuester.end) - new Date(neuester.start)) / 86400000;
    // Vorjahresquartal mit ähnlicher Periodenlänge (±20 Tage) suchen, für
    // einen fairen YoY-Vergleich statt z.B. ein Quartal mit einem Jahreswert
    // zu vergleichen.
    const vorjahr = relevante.find((w) => {
      const wDauerTage = (new Date(w.end) - new Date(w.start)) / 86400000;
      const monateZurueck = (new Date(neuester.end) - new Date(w.end)) / (86400000 * 30);
      return Math.abs(wDauerTage - dauerTage) <= 20 && monateZurueck >= 10 && monateZurueck <= 14;
    });
    return {
      wert: neuester.val,
      periodeVon: neuester.start,
      periodeBis: neuester.end,
      vorjahrWert: vorjahr ? vorjahr.val : null,
      veraenderungProzent: vorjahr && vorjahr.val ? ((neuester.val - vorjahr.val) / Math.abs(vorjahr.val)) * 100 : null,
    };
  }
  return null;
}

export async function pruefeUndAktualisiereFundamentaldaten(env, cfg) {
  const jetzt = new Date();
  if (jetzt.getUTCDay() !== 1) return; // nur montags - Fundamentaldaten ändern sich nur quartalsweise
  const aktuelleWoche = `${jetzt.getUTCFullYear()}-${Math.floor((jetzt - new Date(Date.UTC(jetzt.getUTCFullYear(), 0, 1))) / (7 * 86400000))}`;
  const letzte = await env.STOCKS_STATE.get('fundamentals:letzteWoche');
  if (letzte === aktuelleWoche) return;

  const ergebnis = {};
  for (const symbol of cfg.symbols) {
    try {
      const cik = await ladeCikFuerSymbol(env, symbol, cfg);
      if (!cik) continue;
      const cikPadded = cik.padStart(10, '0');
      const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cikPadded}.json`, { headers: secHeaders(cfg) });
      if (!res.ok) continue;
      const daten = await res.json();
      const usgaap = daten.facts && daten.facts['us-gaap'];
      if (!usgaap) continue;

      const umsatz = letzterQuartalswert(usgaap, UMSATZ_TAGS);
      const nettogewinn = letzterQuartalswert(usgaap, NETTOGEWINN_TAGS);
      const eps = letzterQuartalswert(usgaap, EPS_TAGS);
      if (!umsatz && !nettogewinn && !eps) continue;

      ergebnis[symbol] = { entityName: daten.entityName || symbol, umsatz, nettogewinn, eps };
    } catch (err) {
      console.error(`[stocks-bot] Fundamentaldaten ${symbol} fehlgeschlagen:`, err);
    }
  }

  if (Object.keys(ergebnis).length) {
    await env.STOCKS_STATE.put('fundamentals:letzte', JSON.stringify({ datum: jetzt.toISOString(), symbole: ergebnis }));
  }
  await env.STOCKS_STATE.put('fundamentals:letzteWoche', aktuelleWoche);
}
