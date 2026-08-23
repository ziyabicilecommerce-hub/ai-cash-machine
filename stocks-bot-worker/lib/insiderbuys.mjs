// Insider-Kauf-Bestätigung (kein API-Key, öffentliche SEC-EDGAR-Daten) -
// EIN ZUSÄTZLICHES, NICHT-BLOCKIERENDES Signal: wurden für dieses Symbol in
// den letzten Tagen echte Insider-Käufe (SEC Form 4, Transaktions-Code "P" =
// offener Markt-Kauf, keine Optionen/Zuteilungen/Geschenke) über einer
// Mindestsumme gemeldet, wird die Positionsgröße leicht erhöht statt den
// Kauf zu blockieren - anders als jeder andere Filter in diesem Projekt.
// Ohne Signal ändert sich nichts (Faktor bleibt 1.0).
//
// Läuft NUR EINMAL PRO TAG (siehe pruefeUndAktualisiereInsiderSignale in
// worker.js), nicht bei jedem 5-Minuten-Cron - SEC EDGAR ist kostenlos,
// aber das Abrufen mehrerer Form-4-XML-Dateien pro Symbol wäre für jeden
// Lauf unnötig teuer und würde SECs Server unnötig belasten.
//
// Gleiche Parsing-Logik wie automations/86-insider-buy-radar.mjs (dortiger
// marktweiter WhatsApp-Radar) - hier auf EIN einzelnes Symbol statt den
// gesamten Markt angewendet, und als Kauf-Signal statt als reiner Report
// genutzt.
//
// WICHTIG: Insider-Käufe sind ein schwaches statistisches Signal, keine
// Garantie - die Meldung kann mehrere Tage alt sein (SEC-Meldefrist).

// SEC verlangt einen aussagekräftigen User-Agent, um Missbrauch
// zurückverfolgen zu können (https://www.sec.gov/os/webmaster-faq#developers) -
// über STOCKS_INSIDER_SEC_USER_AGENT konfigurierbar, damit hier kein
// erfundener Kontakt drinsteht.
function secHeaders(cfg) {
  return { 'User-Agent': cfg.insiderSecUserAgent, 'Accept-Encoding': 'gzip, deflate' };
}

// Exportiert, damit lib/insidertrades.mjs (Dashboard-Anzeige aller
// Insider-Käufe/-Verkäufe) dieselbe CIK-Auflösung + denselben 30-Tage-Cache
// wiederverwendet, statt eine zweite Ticker→CIK-Zuordnung zu pflegen.
export async function ladeCikFuerSymbol(env, symbol, cfg) {
  const cacheKey = `insider:cik:${symbol}`;
  const cached = await env.STOCKS_STATE.get(cacheKey);
  if (cached) return cached || null;

  try {
    const res = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: secHeaders(cfg) });
    if (!res.ok) return null;
    const data = await res.json();
    const eintrag = Object.values(data).find((e) => e.ticker === symbol);
    const cik = eintrag ? String(eintrag.cik_str) : '';
    // Ticker-zu-CIK-Zuordnungen ändern sich praktisch nie - 30 Tage Cache.
    await env.STOCKS_STATE.put(cacheKey, cik, { expirationTtl: 30 * 24 * 60 * 60 });
    return cik || null;
  } catch {
    return null;
  }
}

function feldEinfach(xmlStr, tag) {
  const m = xmlStr.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m ? m[1].trim() : null;
}
function feldVerschachtelt(block, tag) {
  const m = block.match(new RegExp(`<${tag}>\\s*<value>([^<]*)</value>`));
  return m ? m[1] : null;
}

async function ladeKaeufeAusFiling(cik, accessionNoDash, cfg) {
  const cikOhneNullen = String(parseInt(cik, 10));
  const basisUrl = `https://www.sec.gov/Archives/edgar/data/${cikOhneNullen}/${accessionNoDash}`;
  try {
    const indexRes = await fetch(`${basisUrl}/index.json`, { headers: secHeaders(cfg) });
    if (!indexRes.ok) return 0;
    const indexData = await indexRes.json();
    const items = (indexData.directory && indexData.directory.item) || [];
    const xmlItem = items.find((it) => it.name.endsWith('.xml') && !it.name.toLowerCase().includes('index'));
    if (!xmlItem) return 0;

    const xmlRes = await fetch(`${basisUrl}/${xmlItem.name}`, { headers: secHeaders(cfg) });
    if (!xmlRes.ok) return 0;
    const xml = await xmlRes.text();

    let summeUsd = 0;
    const transRegex = /<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/g;
    let m;
    while ((m = transRegex.exec(xml))) {
      const block = m[1];
      const code = feldEinfach(block, 'transactionCode');
      const acquiredDisposed = feldVerschachtelt(block, 'transactionAcquiredDisposedCode');
      if (code !== 'P' || acquiredDisposed !== 'A') continue;
      const shares = parseFloat(feldVerschachtelt(block, 'transactionShares'));
      const preis = parseFloat(feldVerschachtelt(block, 'transactionPricePerShare'));
      if (shares > 0 && preis > 0) summeUsd += shares * preis;
    }
    return summeUsd;
  } catch {
    return 0;
  }
}

// Prüft für EIN Symbol, ob in den letzten cfg.insiderLookbackTage Tagen
// Insider-Käufe über cfg.insiderMinKaufwertUsd gemeldet wurden. Begrenzt auf
// die letzten 5 Form-4-Filings dieses Symbols (schont SECs Server, reicht
// für ein tagesaktuelles Signal). null bei jedem Fehler/Ausfall - Signal
// bleibt dann einfach unwirksam.
export async function ladeInsiderKaufSignal(env, symbol, cfg) {
  const cik = await ladeCikFuerSymbol(env, symbol, cfg);
  if (!cik) return null;

  try {
    const cikPadded = cik.padStart(10, '0');
    const res = await fetch(`https://data.sec.gov/submissions/CIK${cikPadded}.json`, { headers: secHeaders(cfg) });
    if (!res.ok) return null;
    const data = await res.json();
    const recent = data.filings && data.filings.recent;
    if (!recent) return null;

    const grenze = Date.now() - cfg.insiderLookbackTage * 24 * 60 * 60 * 1000;
    const form4Indizes = [];
    for (let i = 0; i < recent.form.length && form4Indizes.length < 5; i++) {
      if (recent.form[i] !== '4') continue;
      const datum = new Date(recent.filingDate[i]).getTime();
      if (datum < grenze) continue;
      form4Indizes.push(i);
    }
    if (!form4Indizes.length) return { aktiv: false, wertUsd: 0 };

    let gesamtWertUsd = 0;
    for (const i of form4Indizes) {
      const accessionNoDash = recent.accessionNumber[i].replace(/-/g, '');
      gesamtWertUsd += await ladeKaeufeAusFiling(cik, accessionNoDash, cfg);
    }
    return { aktiv: gesamtWertUsd >= cfg.insiderMinKaufwertUsd, wertUsd: gesamtWertUsd };
  } catch {
    return null;
  }
}
