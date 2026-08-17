// Insider-Buy-Radar - reiner Report per WhatsApp, KEIN automatischer Kauf.
// Scannt die öffentlichen SEC-EDGAR-Form-4-Meldungen (US-Börsenaufsicht:
// Firmen-Insider MÜSSEN dort melden, wenn sie eigene Aktien kaufen/verkaufen)
// und meldet auffällige Insider-KÄUFE - kein Key, keine Anmeldung nötig, SEC
// EDGAR ist komplett frei zugänglich (verlangt nur einen erkennbaren
// User-Agent-Header, siehe SEC_USER_AGENT unten).
//
// Was als "auffällig" gilt (config.INSIDER_MIN_KAUFWERT_USD /
// config.INSIDER_MIN_INSIDER_ANZAHL): entweder ein einzelner Kauf über einer
// Mindestsumme, oder mehrere verschiedene Insider derselben Firma am selben
// Tag ("Cluster-Kauf" - historisch das stärkere der beiden Signale, weil ein
// einzelner Insider auch aus persönlichen Gründen kaufen kann, mehrere
// gleichzeitig eher auf gemeinsames internes Wissen hindeutet).
//
// WICHTIG, unmissverständlich: Das ist ein Informations-Radar, KEINE
// Kaufempfehlung und KEIN automatischer Handel. Insider-Käufe sind ein
// schwaches statistisches Signal, keine Garantie - die Meldung selbst kommt
// außerdem mit 1-2 Werktagen Verzug (SEC-Meldefrist), ist also nie
// Echtzeit-Information. Nur Formular-Typ "P" (offener Markt-Kauf) zählt,
// keine Options-Ausübungen (Code M), Zuteilungen oder Geschenke.

import { config } from './lib/config.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { chunkZeilen } from './lib/whatsappChunk.mjs';
import { loadState, saveState } from './lib/state.mjs';

const STATE_NAME = 'insider-buy-radar-state';
const WHATSAPP_MAX_CHARS = 3500;
const MAX_STATE_ACCESSIONS = 3000; // deckt ~2 Handelstage ab (genug, um Mehrfachläufe am selben Tag zu deduplizieren) - ältere Einträge sind ohnehin nutzlos, weil jeder Tag eine eigene Index-Datei hat

// SEC verlangt keinen API-Key, aber einen aussagekräftigen User-Agent, um
// Missbrauch zurückverfolgen zu können (https://www.sec.gov/os/webmaster-faq#developers).
const SEC_USER_AGENT = config.INSIDER_SEC_USER_AGENT;

// Vollständige Liste ALLER an einem Tag eingereichten Form-4-Meldungen
// (marktweit) über SECs "Daily Index" - anders als der rollierende
// "getcurrent"-Feed (nur die neuesten ~100 Einträge über ALLE Formular-Typen
// hinweg, verliert bei normalem Tagesvolumen von hunderten Form-4-Meldungen
// schnell ältere Meldungen aus dem Fenster) deckt der Tages-Index WIRKLICH
// den kompletten Tag ab - wichtig, damit ein einmal täglicher Lauf nichts
// verpasst.
async function ladeTagesindexForm4(datum) {
  const jahr = datum.getUTCFullYear();
  const monat = datum.getUTCMonth() + 1;
  const quartal = Math.ceil(monat / 3);
  const datumStr = `${jahr}${String(monat).padStart(2, '0')}${String(datum.getUTCDate()).padStart(2, '0')}`;
  const url = `https://www.sec.gov/Archives/edgar/daily-index/${jahr}/QTR${quartal}/form.${datumStr}.idx`;

  const res = await fetch(url, { headers: { 'User-Agent': SEC_USER_AGENT } });
  // SECs S3-Archiv liefert für einen nicht existierenden Tagesindex (z.B.
  // Wochenende/Feiertag ohne Handel, oder heutiger Index noch nicht
  // veröffentlicht) meist ein S3-"AccessDenied" (403), nicht das erwartbare
  // 404 - beides bedeutet hier dasselbe: kein Index für diesen Tag.
  if (!res.ok) return null;
  const text = await res.text();

  const gesehen = new Set(); // Meldungen mit mehreren gemeinsam einreichenden Insidern können mehrfach im Index auftauchen (gleiche Datei) - nur einmal verarbeiten
  const eintraege = [];
  for (const zeile of text.split('\n')) {
    // Fixe Spaltenbreite: Formular-Typ am Zeilenanfang, danach mind. 2
    // Leerzeichen - grenzt exakt "4" von "4/A", "424B2" usw. ab (die haben
    // kein Leerzeichen direkt nach der "4").
    if (!/^4\s{2,}/.test(zeile)) continue;
    const dateiMatch = zeile.match(/edgar\/data\/(\d+)\/([\d-]+)\.txt\s*$/);
    if (!dateiMatch) continue;
    const accessionNoDash = dateiMatch[2].replace(/-/g, '');
    if (gesehen.has(accessionNoDash)) continue;
    gesehen.add(accessionNoDash);
    eintraege.push({ cik: dateiMatch[1], accessionNoDash });
  }
  return eintraege;
}

// Nicht-derivative Kauf-Transaktionen (Code "P", offener Markt) aus dem
// primary_doc.xml einer einzelnen Form-4-Meldung extrahieren. Bewusst mit
// einfachen Regexes statt einer XML-Bibliothek (keine zusätzliche Dependency
// nötig, Form-4-XML hat ein stabiles, flaches Tag-Schema ohne Namespaces auf
// den relevanten Feldern).
async function ladeKaeufeAusFiling(cik, accessionNoDash) {
  const cikOhneNullen = String(parseInt(cik, 10));
  const basisUrl = `https://www.sec.gov/Archives/edgar/data/${cikOhneNullen}/${accessionNoDash}`;

  // Der Dateiname der Ownership-XML ist NICHT einheitlich (z.B. "primary_doc.xml"
  // bei neueren, "form4.xml" bei älteren/anderen Filern) - deshalb erst die
  // von SEC bereitgestellte Verzeichnis-Liste abfragen statt den Namen zu raten.
  let xmlDateiname;
  try {
    const indexRes = await fetch(`${basisUrl}/index.json`, { headers: { 'User-Agent': SEC_USER_AGENT } });
    if (!indexRes.ok) return [];
    const indexData = await indexRes.json();
    const items = (indexData.directory && indexData.directory.item) || [];
    const xmlItem = items.find((it) => it.name.endsWith('.xml') && !it.name.toLowerCase().includes('index'));
    if (!xmlItem) return [];
    xmlDateiname = xmlItem.name;
  } catch {
    return [];
  }

  let xml;
  try {
    const res = await fetch(`${basisUrl}/${xmlDateiname}`, { headers: { 'User-Agent': SEC_USER_AGENT } });
    if (!res.ok) return [];
    xml = await res.text();
  } catch {
    return [];
  }

  const feld = (block, tag) => {
    const m = block.match(new RegExp(`<${tag}>\\s*<value>([^<]*)<\\/value>`));
    return m ? m[1] : null;
  };
  const entitiesDekodieren = (str) =>
    str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  const feldEinfach = (xmlStr, tag) => {
    const m = xmlStr.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`));
    return m ? entitiesDekodieren(m[1].trim()) : null;
  };

  const issuerSymbol = feldEinfach(xml, 'issuerTradingSymbol') || '?';
  const issuerName = feldEinfach(xml, 'issuerName') || issuerSymbol;
  const ownerName = feldEinfach(xml, 'rptOwnerName') || 'Unbekannt';

  const kaeufe = [];
  const transRegex = /<nonDerivativeTransaction>([\s\S]*?)<\/nonDerivativeTransaction>/g;
  let m;
  while ((m = transRegex.exec(xml))) {
    const block = m[1];
    const code = feldEinfach(block, 'transactionCode');
    const acquiredDisposed = feld(block, 'transactionAcquiredDisposedCode');
    if (code !== 'P' || acquiredDisposed !== 'A') continue; // nur echte offene Markt-Käufe, keine Optionen/Zuteilungen/Geschenke

    const shares = parseFloat(feld(block, 'transactionShares'));
    const preis = parseFloat(feld(block, 'transactionPricePerShare'));
    if (!(shares > 0) || !(preis > 0)) continue;

    kaeufe.push({ issuerSymbol, issuerName, ownerName, shares, preis, wertUsd: shares * preis });
  }
  return kaeufe;
}

function heute() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const minKaufwertUsd = parseFloat(config.INSIDER_MIN_KAUFWERT_USD);
  const minInsiderAnzahl = parseInt(config.INSIDER_MIN_INSIDER_ANZAHL, 10);
  const maxProLauf = parseInt(config.INSIDER_MAX_PRO_LAUF, 10) || 10;

  const state = loadState(STATE_NAME);
  const bekannteAccessions = new Set(state.bekannteAccessions || []);

  // Heutiger Tagesindex zuerst versuchen, sonst gestern (z.B. wenn der Lauf
  // vor Veröffentlichung des heutigen Index feuert, oder heute ein
  // US-Feiertag/Wochenende ohne eigenen Index war).
  const heuteDatum = new Date();
  let filings = await ladeTagesindexForm4(heuteDatum);
  if (!filings) {
    const gestern = new Date(heuteDatum);
    gestern.setUTCDate(gestern.getUTCDate() - 1);
    filings = await ladeTagesindexForm4(gestern);
  }
  if (!filings) {
    console.log('[85-insider-buy-radar] Kein SEC-Tagesindex für heute/gestern verfügbar (Feiertag/Wochenende?).');
    return;
  }

  const neueFilings = filings.filter((f) => !bekannteAccessions.has(f.accessionNoDash));

  if (!neueFilings.length) {
    console.log('[85-insider-buy-radar] Keine neuen Form-4-Meldungen seit dem letzten Lauf.');
    return;
  }

  // Sicherheitsventil gegen einen pathologisch großen Tages-Index (normal
  // sind ca. 800-1500 Form-4-Meldungen/Handelstag - das wird komplett
  // verarbeitet). Nur TATSÄCHLICH verarbeitete Meldungen werden unten als
  // "bekannt" markiert, damit ein eventueller Rest beim nächsten Lauf
  // nachgeholt wird, statt für immer übersprungen zu werden.
  const maxDeepFetch = parseInt(config.INSIDER_ANZAHL_FILINGS_PRO_LAUF, 10) || 1500;
  const zuVerarbeiten = neueFilings.slice(0, maxDeepFetch);

  // Pro Firma+Tag aggregieren, damit Cluster-Käufe (mehrere Insider derselben
  // Firma) als EIN Signal erkannt werden, statt als mehrere Einzelmeldungen.
  const proFirma = new Map();
  for (const filing of zuVerarbeiten) {
    let kaeufe = [];
    try {
      kaeufe = await ladeKaeufeAusFiling(filing.cik, filing.accessionNoDash);
    } catch (err) {
      console.error(`[85-insider-buy-radar] Filing ${filing.accessionNoDash} übersprungen:`, err.message || err);
    }
    for (const k of kaeufe) {
      const key = k.issuerSymbol;
      if (!proFirma.has(key)) {
        proFirma.set(key, { issuerSymbol: k.issuerSymbol, issuerName: k.issuerName, gesamtWertUsd: 0, insider: new Set() });
      }
      const eintrag = proFirma.get(key);
      eintrag.gesamtWertUsd += k.wertUsd;
      eintrag.insider.add(k.ownerName);
    }
  }

  const kandidaten = [...proFirma.values()]
    .filter((f) => f.gesamtWertUsd >= minKaufwertUsd || f.insider.size >= minInsiderAnzahl)
    .sort((a, b) => b.gesamtWertUsd - a.gesamtWertUsd)
    .slice(0, maxProLauf);

  for (const filing of zuVerarbeiten) bekannteAccessions.add(filing.accessionNoDash);
  const gekuerzteAccessions = [...bekannteAccessions].slice(-MAX_STATE_ACCESSIONS);
  saveState(STATE_NAME, { bekannteAccessions: gekuerzteAccessions, letzterLauf: heute() });

  if (!kandidaten.length) {
    console.log(`[85-insider-buy-radar] ${zuVerarbeiten.length} Form-4-Meldungen geprüft, keine über der Schwelle (min. ${minKaufwertUsd} USD oder ${minInsiderAnzahl}+ Insider).`);
    return;
  }

  const zeilen = kandidaten.map((f, i) => {
    const clusterHinweis = f.insider.size > 1 ? ` — ${f.insider.size} Insider gleichzeitig` : '';
    return `${i + 1}. *${f.issuerSymbol}* (${f.issuerName}): ${f.gesamtWertUsd.toLocaleString('de-DE', { maximumFractionDigits: 0 })} USD${clusterHinweis}`;
  });

  const chunks = chunkZeilen(zeilen, WHATSAPP_MAX_CHARS);
  for (let i = 0; i < chunks.length; i++) {
    const kopf = chunks.length > 1
      ? `🕵️ ${kandidaten.length} auffällige Insider-Käufe (SEC Form 4, Teil ${i + 1}/${chunks.length}):`
      : kandidaten.length > 1
        ? `🕵️ ${kandidaten.length} auffällige Insider-Käufe (SEC Form 4, USA):`
        : `🕵️ 1 auffälliger Insider-Kauf (SEC Form 4, USA):`;
    await notifyWhatsapp(`${kopf}\n\n${chunks[i].join('\n')}\n\n⚠️ Reine Information, keine Kaufempfehlung, kein automatischer Handel. Meldung kann 1-2 Werktage alt sein.`);
  }

  console.log(`[85-insider-buy-radar] ${kandidaten.length} Insider-Kauf-Signal(e) per WhatsApp verschickt (${zuVerarbeiten.length} von ${neueFilings.length} neuen Meldungen geprüft).`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[85-insider-buy-radar] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[85-insider-buy-radar] Fehler:', err);
  process.exit(1);
});
