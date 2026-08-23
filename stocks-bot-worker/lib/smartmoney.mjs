// "Smart Money" - SEC Form 13F: institutionelle Investmentmanager mit über
// 100 Mio. USD verwaltetem Vermögen müssen JEDES Quartal (bis 45 Tage nach
// Quartalsende) ihre komplette Aktien-Positionsliste offenlegen. Wird in der
// Finanzwelt oft "das legale Insider-Wissen" genannt: du siehst, was Warren
// Buffett &amp; Co. gekauft/verkauft haben - aber erst Wochen später, 100%
// öffentlich, 100% pflichtgemäß. Vergleicht die neueste 13F-Meldung mit der
// vorherigen (per CUSIP, ISIN-ähnliche Wertpapierkennung) und zeigt neue
// Positionen, komplett geschlossene Positionen und größere Auf-/Abbauten.
//
// Marktweit, NICHT auf die eigenen STOCKS_SYMBOLS gefiltert (wie Scanner/
// Globale Märkte) - Buffetts Portfolio hat i.d.R. nichts mit den eigenen
// Symbolen zu tun, das hier ist reiner Marktkontext, keine Kauf-/Verkaufs-
// empfehlung. Läuft höchstens 1x pro Tag (13F kommt ohnehin nur alle ~3
// Monate raus), mit zusätzlichem Cache über die accessionNumber der jeweils
// neuesten 13F-HR, damit die (größere) infoTable-XML nicht jeden Tag neu
// geparst wird, wenn sich nichts geändert hat.
//
// HINWEIS: CUSIP→Ticker gibt es bei der SEC nicht offiziell (das ist
// proprietäre Daten von CUSIP Global Services) - deshalb wird hier bewusst
// NUR der Firmenname aus der Meldung selbst gezeigt (nameOfIssuer), kein
// Versuch einer unzuverlässigen Ticker-Zuordnung per Namens-Rateraten.

const SEC_USER_AGENT_FALLBACK = 'CashMachineStocksBot/1.0 (dein-kontakt@example.com)';
const MAX_BEWEGUNGEN = 6;

export const SUPERINVESTOREN = [
  { cik: '0001067983', name: 'Warren Buffett (Berkshire Hathaway)' },
  { cik: '0001649339', name: 'Michael Burry (Scion Asset Management)' },
  { cik: '0001336528', name: 'Bill Ackman (Pershing Square)' },
];

function secHeaders(cfg) {
  return { 'User-Agent': cfg?.insiderSecUserAgent || SEC_USER_AGENT_FALLBACK, 'Accept-Encoding': 'gzip, deflate' };
}

async function ladeInfoTableXml(cikOhneNullen, accessionNoDash, cfg) {
  const basisUrl = `https://www.sec.gov/Archives/edgar/data/${cikOhneNullen}/${accessionNoDash}`;
  const indexRes = await fetch(`${basisUrl}/index.json`, { headers: secHeaders(cfg) });
  if (!indexRes.ok) return null;
  const indexData = await indexRes.json();
  const items = (indexData.directory && indexData.directory.item) || [];
  const xmlItem = items.find((it) => it.name.endsWith('.xml') && it.name !== 'primary_doc.xml');
  if (!xmlItem) return null;
  const xmlRes = await fetch(`${basisUrl}/${xmlItem.name}`, { headers: secHeaders(cfg) });
  if (!xmlRes.ok) return null;
  return xmlRes.text();
}

function parseInfoTable(xml) {
  const positionen = new Map(); // cusip -> { nameOfIssuer, shares, wertUsd }
  const blockRegex = /<infoTable>([\s\S]*?)<\/infoTable>/g;
  let block;
  while ((block = blockRegex.exec(xml))) {
    const b = block[1];
    const cusip = (b.match(/<cusip>([^<]*)<\/cusip>/) || [])[1];
    const nameOfIssuer = (b.match(/<nameOfIssuer>([^<]*)<\/nameOfIssuer>/) || [])[1];
    const shares = parseFloat((b.match(/<sshPrnamt>([^<]*)<\/sshPrnamt>/) || [])[1] || '0');
    const wertUsd = parseFloat((b.match(/<value>([^<]*)<\/value>/) || [])[1] || '0') * 1000; // 13F meldet Value in Tausend USD
    if (!cusip) continue;
    const bestehend = positionen.get(cusip);
    if (bestehend) {
      bestehend.shares += shares;
      bestehend.wertUsd += wertUsd;
    } else {
      positionen.set(cusip, { nameOfIssuer, shares, wertUsd });
    }
  }
  return positionen;
}

function vergleicheQuartale(neu, alt) {
  const neuePositionen = [], geschlossenePositionen = [], veraenderte = [];
  for (const [cusip, pos] of neu) {
    const vorher = alt.get(cusip);
    if (!vorher) {
      neuePositionen.push({ cusip, ...pos });
    } else if (vorher.shares > 0) {
      const changeProzent = ((pos.shares - vorher.shares) / vorher.shares) * 100;
      if (Math.abs(changeProzent) >= 10) veraenderte.push({ cusip, nameOfIssuer: pos.nameOfIssuer, changeProzent, wertUsd: pos.wertUsd });
    }
  }
  for (const [cusip, pos] of alt) {
    if (!neu.has(cusip)) geschlossenePositionen.push({ cusip, ...pos });
  }
  neuePositionen.sort((a, b) => b.wertUsd - a.wertUsd);
  geschlossenePositionen.sort((a, b) => b.wertUsd - a.wertUsd);
  veraenderte.sort((a, b) => Math.abs(b.changeProzent) - Math.abs(a.changeProzent));
  return {
    neuePositionen: neuePositionen.slice(0, MAX_BEWEGUNGEN),
    geschlossenePositionen: geschlossenePositionen.slice(0, MAX_BEWEGUNGEN),
    veraenderte: veraenderte.slice(0, MAX_BEWEGUNGEN),
  };
}

export async function pruefeUndAktualisiereSmartMoney(env, cfg) {
  const heuteStr = new Date().toISOString().slice(0, 10);
  const letzterTag = await env.STOCKS_STATE.get('smartmoney:letzterTag');
  if (letzterTag === heuteStr) return;

  const ergebnis = [];
  for (const investor of SUPERINVESTOREN) {
    try {
      const res = await fetch(`https://data.sec.gov/submissions/CIK${investor.cik}.json`, { headers: secHeaders(cfg) });
      if (!res.ok) continue;
      const submissions = await res.json();
      const recent = submissions.filings?.recent;
      if (!recent) continue;

      const hrIndizes = [];
      for (let i = 0; i < recent.form.length && hrIndizes.length < 2; i++) {
        if (recent.form[i] !== '13F-HR') continue; // nur echte Holdings-Meldungen, keine Amendments/Notices
        hrIndizes.push(i);
      }
      if (!hrIndizes.length) continue;

      const letzteAcc = recent.accessionNumber[hrIndizes[0]];
      const schonVerarbeitet = await env.STOCKS_STATE.get(`smartmoney:letzte:${investor.cik}`);
      if (schonVerarbeitet === letzteAcc) {
        const cached = await env.STOCKS_STATE.get(`smartmoney:daten:${investor.cik}`);
        if (cached) ergebnis.push(JSON.parse(cached));
        continue;
      }

      const cikOhneNullen = parseInt(investor.cik, 10);
      const neuXml = await ladeInfoTableXml(cikOhneNullen, letzteAcc.replace(/-/g, ''), cfg);
      if (!neuXml) continue;
      const neuePositionen = parseInfoTable(neuXml);

      let altePositionen = new Map();
      if (hrIndizes.length > 1) {
        const altAcc = recent.accessionNumber[hrIndizes[1]];
        const altXml = await ladeInfoTableXml(cikOhneNullen, altAcc.replace(/-/g, ''), cfg);
        if (altXml) altePositionen = parseInfoTable(altXml);
      }

      const eintrag = {
        name: investor.name,
        gemeldetAm: recent.filingDate[hrIndizes[0]],
        stichtag: recent.reportDate ? recent.reportDate[hrIndizes[0]] : null,
        ...vergleicheQuartale(neuePositionen, altePositionen),
      };

      await env.STOCKS_STATE.put(`smartmoney:daten:${investor.cik}`, JSON.stringify(eintrag));
      await env.STOCKS_STATE.put(`smartmoney:letzte:${investor.cik}`, letzteAcc);
      ergebnis.push(eintrag);
    } catch (err) {
      console.error(`[stocks-bot] Smart-Money ${investor.name} fehlgeschlagen:`, err);
    }
  }

  if (ergebnis.length) {
    await env.STOCKS_STATE.put('smartmoney:letzte', JSON.stringify({ datum: new Date().toISOString(), investoren: ergebnis }));
  }
  await env.STOCKS_STATE.put('smartmoney:letzterTag', heuteStr);
}
