// Wrapped-Generator - baut aus den täglichen Finance-Cockpit-Daten (die der
// Gewinn-Radar #01 ohnehin schon jeden Tag sammelt) einen wöchentlichen
// Rückblick im "Spotify Wrapped"-Stil: große Zahlen, bester Tag, Top-Produkt,
// Wachstum ggü. der Vorwoche. Keine neuen Shopify-Calls nötig - liest nur
// finance-cockpit/data.json. Neu, kein n8n-Workflow · Zeitplan: wöchentlich,
// montags.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FINANCE_DATA_FILE = join(__dirname, '..', 'finance-cockpit', 'data.json');
const WRAPPED_DATA_FILE = join(__dirname, '..', 'wrapped', 'data.json');
const PAGES_BASE_URL = 'https://ziyabicilecommerce-hub.github.io/ai-cash-machine';

function summeUndBestTag(tage) {
  let umsatz = 0, bestellungen = 0, nettoGewinn = 0;
  let bestTag = null;
  const produktMengen = {};

  for (const tag of tage) {
    umsatz += tag.umsatz || 0;
    bestellungen += tag.bestellungen || 0;
    nettoGewinn += tag.nettoGewinn !== undefined ? tag.nettoGewinn : (tag.gewinn || 0);
    if (!bestTag || (tag.umsatz || 0) > (bestTag.umsatz || 0)) bestTag = tag;
    for (const p of tag.topProdukte || []) {
      if (!produktMengen[p.name]) produktMengen[p.name] = 0;
      produktMengen[p.name] += p.menge || 0;
    }
  }

  const topProdukt = Object.entries(produktMengen).sort((a, b) => b[1] - a[1])[0];
  return {
    umsatz: Number(umsatz.toFixed(2)),
    bestellungen,
    nettoGewinn: Number(nettoGewinn.toFixed(2)),
    aov: bestellungen ? Number((umsatz / bestellungen).toFixed(2)) : 0,
    bestTag: bestTag ? { datum: bestTag.datum, umsatz: bestTag.umsatz } : null,
    topProdukt: topProdukt ? { name: topProdukt[0], menge: topProdukt[1] } : null,
  };
}

async function main() {
  if (!existsSync(FINANCE_DATA_FILE)) {
    console.log('[79-wrapped-generator] Noch keine Finance-Cockpit-Daten vorhanden (Gewinn-Radar #01 muss zuerst mindestens einmal gelaufen sein) - übersprungen.');
    return;
  }

  const financeData = JSON.parse(readFileSync(FINANCE_DATA_FILE, 'utf-8'));
  const history = (financeData.history || []).filter((h) => h && h.datum);
  const zeitraumTage = parseInt(config.WRAPPED_ZEITRAUM_TAGE, 10) || 7;

  if (history.length < 2) {
    console.log('[79-wrapped-generator] Zu wenig Historie für einen Rückblick (mind. 2 Tage nötig) - übersprungen.');
    return;
  }

  const aktuellePeriode = history.slice(-zeitraumTage);
  const vorherigePeriode = history.slice(-zeitraumTage * 2, -zeitraumTage);

  const aktuell = summeUndBestTag(aktuellePeriode);
  const vorher = vorherigePeriode.length ? summeUndBestTag(vorherigePeriode) : null;
  const wachstumProzent = vorher && vorher.umsatz > 0
    ? Number((((aktuell.umsatz - vorher.umsatz) / vorher.umsatz) * 100).toFixed(1))
    : null;

  const wrapped = {
    generatedAt: new Date().toISOString(),
    shopName: financeData.shopName || config.SHOP_NAME || 'Dein Shop',
    waehrung: aktuellePeriode[aktuellePeriode.length - 1]?.waehrung || 'EUR',
    zeitraumVon: aktuellePeriode[0].datum,
    zeitraumBis: aktuellePeriode[aktuellePeriode.length - 1].datum,
    ...aktuell,
    wachstumProzent,
  };

  const dir = dirname(WRAPPED_DATA_FILE);
  if (!existsSync(dir)) {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(WRAPPED_DATA_FILE, JSON.stringify(wrapped, null, 2));

  const link = `${PAGES_BASE_URL}/wrapped/`;
  const wachstumText = wachstumProzent === null ? '' : `\n${wachstumProzent >= 0 ? '📈 +' : '📉 '}${wachstumProzent}% ggü. der Vorwoche`;
  await notifyTelegram(
    `🎉 Dein Wochen-Rückblick ist da!\n${wrapped.umsatz.toFixed(2)} ${wrapped.waehrung} Umsatz, ${wrapped.bestellungen} Bestellungen.${wachstumText}\n\nAnsehen: ${link}`
  );

  console.log('[79-wrapped-generator] Rückblick erstellt:', wrapped.zeitraumVon, 'bis', wrapped.zeitraumBis);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[79-wrapped-generator] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[79-wrapped-generator] Fehler:', err);
  process.exit(1);
});
