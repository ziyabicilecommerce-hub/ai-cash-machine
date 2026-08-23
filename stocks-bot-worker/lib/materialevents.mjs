// SEC Form 8-K "Material Events" - börsennotierte Firmen müssen JEDES
// wesentliche Ereignis (Führungswechsel, Insolvenz, Delisting-Warnung,
// Übernahme, gekündigter Großvertrag, Kontrollwechsel, ...) innerhalb von
// nur 4 Werktagen der SEC melden. Fühlt sich an wie "brandheiße geheime
// Firmennews, bevor sie jeder mitbekommt" - ist aber komplett legal, weil
// exakt das Gegenteil von Geheimhaltung: Pflicht-Sofortoffenlegung
// (Securities Exchange Act, Section 13/15(d)). Gleiche CIK-Auflösung wie
// insidertrades.mjs/insiderbuys.mjs - kein XML-Parsing nötig, die SEC
// liefert die Item-Codes direkt in der Filing-Liste selbst.
//
// Läuft höchstens 1x pro Tag (wie Scanner/Globale Märkte/Smart Money).

import { ladeCikFuerSymbol } from './insiderbuys.mjs';

const SEC_USER_AGENT_FALLBACK = 'CashMachineStocksBot/1.0 (dein-kontakt@example.com)';
const MAX_TREFFER_PRO_SYMBOL = 3;

// Offizielle SEC-Item-Bezeichnungen (Form 8-K), gekürzt auf die häufigsten -
// unbekannte Codes fallen einfach auf "Item {code}" zurück statt zu raten.
const ITEM_BESCHREIBUNGEN = {
  '1.01': 'Neuer wesentlicher Vertrag',
  '1.02': 'Wesentlicher Vertrag gekündigt',
  '1.03': '⚠️ Insolvenz/Zwangsverwaltung',
  '2.01': 'Übernahme/Verkauf von Vermögenswerten abgeschlossen',
  '2.02': 'Quartals-/Jahreszahlen veröffentlicht',
  '2.03': 'Neue direkte Finanzverbindlichkeit',
  '2.04': 'Verbindlichkeit fällig gestellt/erhöht',
  '2.05': 'Kosten durch Restrukturierung/Schließung',
  '2.06': 'Wesentliche Wertminderung (Impairment)',
  '3.01': '⚠️ Delisting-Warnung/Listing-Verstoß',
  '3.02': 'Nicht-registrierter Aktienverkauf',
  '3.03': 'Änderung der Aktionärsrechte',
  '4.01': 'Wirtschaftsprüfer gewechselt',
  '4.02': '⚠️ Frühere Bilanzen nicht mehr verlässlich',
  '5.01': '⚠️ Kontrollwechsel des Unternehmens',
  '5.02': 'Führungswechsel (Vorstand/Aufsichtsrat)',
  '5.03': 'Satzungsänderung',
  '5.07': 'Ergebnis einer Aktionärsabstimmung',
  '7.01': 'Reg-FD-Offenlegung (an alle Investoren gleichzeitig)',
  '8.01': 'Sonstiges wesentliches Ereignis',
  '9.01': 'Finanzunterlagen/Anhänge zur Meldung',
};

const KRITISCHE_CODES = new Set(['1.03', '3.01', '4.02', '5.01']);

function secHeaders(cfg) {
  return { 'User-Agent': cfg?.insiderSecUserAgent || SEC_USER_AGENT_FALLBACK, 'Accept-Encoding': 'gzip, deflate' };
}

function beschreibeItems(itemsFeld) {
  return (itemsFeld || '').split(',').map((c) => c.trim()).filter(Boolean).map((code) => ({
    code,
    beschreibung: ITEM_BESCHREIBUNGEN[code] || `Item ${code}`,
    kritisch: KRITISCHE_CODES.has(code),
  }));
}

export async function pruefeUndAktualisiereMaterialEvents(env, cfg) {
  const heuteStr = new Date().toISOString().slice(0, 10);
  const letzterTag = await env.STOCKS_STATE.get('materialevents:letzterTag');
  if (letzterTag === heuteStr) return;

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

      const cikOhneNullen = parseInt(cik, 10);
      const treffer = [];
      for (let i = 0; i < recent.form.length && treffer.length < MAX_TREFFER_PRO_SYMBOL; i++) {
        if (recent.form[i] !== '8-K') continue;
        const items = beschreibeItems(recent.items ? recent.items[i] : '');
        if (!items.length) continue;
        const acc = recent.accessionNumber[i];
        treffer.push({
          gemeldetAm: recent.filingDate[i],
          items,
          link: `https://www.sec.gov/Archives/edgar/data/${cikOhneNullen}/${acc.replace(/-/g, '')}/${acc}-index.html`,
        });
      }
      if (treffer.length) ergebnis[symbol] = treffer;
    } catch (err) {
      console.error(`[stocks-bot] Material-Events ${symbol} fehlgeschlagen:`, err);
    }
  }

  await env.STOCKS_STATE.put('materialevents:letzte', JSON.stringify({ datum: new Date().toISOString(), symbole: ergebnis }));
  await env.STOCKS_STATE.put('materialevents:letzterTag', heuteStr);
}
