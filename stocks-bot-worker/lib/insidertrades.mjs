// SEC Form 4 Insider-Trades für die Dashboard-Anzeige - Führungskräfte und
// Direktoren einer Firma müssen JEDEN eigenen Kauf/Verkauf ihrer Aktien
// innerhalb von nur 2 Werktagen bei der SEC melden (Section 16, Securities
// Exchange Act 1934). Genau wie beim Congress-Trades-Feature: 100% legal,
// 100% öffentlich - das exakte Gegenteil von echtem (illegalem) Insider-
// Handel, der geheim bleibt. Läuft als Teil der Montags-Wartung.
//
// Nicht zu verwechseln mit lib/insiderbuys.mjs: das dortige Modul ist ein
// NICHT-blockierendes TRADING-Signal (nur aggregierte Kaufsumme, boostet
// die Positionsgröße, läuft täglich). Dieses Modul hier ist reine
// DASHBOARD-Anzeige (wer genau, welche Rolle, Käufe UND Verkäufe einzeln)
// und fasst NIE einen Trade an. Beide teilen sich dieselbe CIK-Auflösung
// (ladeCikFuerSymbol aus insiderbuys.mjs) statt sie zu duplizieren.
//
// Nur Transaktionscode P (Kauf am offenen Markt) und S (Verkauf am offenen
// Markt) zählen - Aktienpakete/Optionsausübungen/Geschenke (Codes A, M, G)
// werden bewusst rausgefiltert, weil die kein echtes eigenes Geld bewegen
// und das Signal nur verwässern würden.

import { ladeCikFuerSymbol } from './insiderbuys.mjs';

const MAX_TREFFER_PRO_SYMBOL = 3;

function secHeaders(cfg) {
  return { 'User-Agent': cfg.insiderSecUserAgent, 'Accept-Encoding': 'gzip, deflate' };
}

function wochenSchluessel(datum) {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const tagNummer = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tagNummer);
  const jahresStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d - jahresStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-KW${String(kw).padStart(2, '0')}`;
}

function parseForm4(xml) {
  const owner = (xml.match(/<rptOwnerName>([^<]*)<\/rptOwnerName>/) || [])[1] || 'Unbekannt';
  const isDirector = /<isDirector>1<\/isDirector>/.test(xml);
  const isOfficer = /<isOfficer>1<\/isOfficer>/.test(xml);
  const isTenPercent = /<isTenPercentOwner>1<\/isTenPercentOwner>/.test(xml);
  const officerTitleMatch = xml.match(/<officerTitle>([^<]*)<\/officerTitle>/);

  const transaktionen = [];
  const blockRegex = /<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/g;
  let block;
  while ((block = blockRegex.exec(xml))) {
    const b = block[1];
    const code = (b.match(/<transactionCode>([^<]*)<\/transactionCode>/) || [])[1] || '';
    if (code !== 'P' && code !== 'S') continue; // nur echte Käufe/Verkäufe am offenen Markt
    const shares = parseFloat((b.match(/<transactionShares>\s*<value>([^<]*)<\/value>/) || [])[1] || '0');
    const preis = parseFloat((b.match(/<transactionPricePerShare>\s*<value>([^<]*)<\/value>/) || [])[1] || '0');
    const datum = (b.match(/<transactionDate>\s*<value>([^<]*)<\/value>/) || [])[1] || '';
    if (!shares || !preis) continue;
    transaktionen.push({ code, shares, preis, datum, wert: Math.round(shares * preis) });
  }
  if (!transaktionen.length) return null;

  let rolle = 'Insider';
  if (isTenPercent) rolle = '10%-Eigentümer';
  if (isOfficer) rolle = officerTitleMatch ? officerTitleMatch[1] : 'Officer';
  if (isDirector) rolle = isOfficer ? `${rolle} & Director` : 'Director';

  return { owner, rolle, transaktionen };
}

export async function pruefeUndAktualisiereInsiderTrades(env, cfg) {
  const jetzt = new Date();
  if (jetzt.getUTCDay() !== 1) return; // nur montags, wie die anderen Wochen-Checks
  const aktuelleWoche = wochenSchluessel(jetzt);
  const letzte = await env.STOCKS_STATE.get('insidertrades:letzteWoche');
  if (letzte === aktuelleWoche) return;

  const ergebnis = {};
  for (const symbol of cfg.symbols) {
    try {
      const cik = await ladeCikFuerSymbol(env, symbol, cfg);
      if (!cik) continue;
      const cikPadded = cik.padStart(10, '0');
      const res = await fetch(`https://data.sec.gov/submissions/CIK${cikPadded}.json`, { headers: secHeaders(cfg) });
      if (!res.ok) continue;
      const submissions = await res.json();
      const recent = submissions.filings?.recent;
      if (!recent) continue;

      const treffer = [];
      const cikOhneNullen = parseInt(cik, 10);
      for (let i = 0; i < recent.form.length && treffer.length < MAX_TREFFER_PRO_SYMBOL; i++) {
        if (recent.form[i] !== '4') continue;
        const acc = recent.accessionNumber[i].replace(/-/g, '');
        const doc = recent.primaryDocument[i];
        if (!doc || !doc.endsWith('.xml')) continue;
        try {
          const xmlRes = await fetch(`https://www.sec.gov/Archives/edgar/data/${cikOhneNullen}/${acc}/${doc}`, { headers: secHeaders(cfg) });
          if (!xmlRes.ok) continue;
          const xml = await xmlRes.text();
          const geparst = parseForm4(xml);
          if (geparst) treffer.push({ ...geparst, filingDatum: recent.filingDate[i] });
        } catch { /* einzelnes kaputtes/unlesbares Filing - überspringen */ }
      }
      if (treffer.length) ergebnis[symbol] = treffer;
    } catch (err) {
      console.error(`[stocks-bot] Insider-Trades ${symbol} fehlgeschlagen:`, err);
    }
  }

  await env.STOCKS_STATE.put('insidertrades:letzte', JSON.stringify({ datum: jetzt.toISOString(), symbole: ergebnis }));
  await env.STOCKS_STATE.put('insidertrades:letzteWoche', aktuelleWoche);
}
