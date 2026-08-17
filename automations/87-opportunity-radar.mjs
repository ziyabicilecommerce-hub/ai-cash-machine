// Opportunity-Radar - erkennt nicht nur Probleme, sondern echte Chancen:
// welche Produkte gerade sprunghaft mehr verkaufen als in der Woche davor.
// Bewusst NUR aus echten, eigenen Shopify-Verkaufsdaten hergeleitet - keine
// externen "Konkurrenz-CPM fällt"/"Creative Y skalieren"-Signale, für die es
// schlicht keine verlässliche Datenquelle gibt (das wäre erfunden). Neu,
// kein n8n-Workflow · Zeitplan: täglich.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { getOrdersSince } from './lib/shopify.mjs';
import { notifyTelegram } from './lib/telegram.mjs';

const NL = '\n';
const __dirname = dirname(fileURLToPath(import.meta.url));
const COMMAND_DIR = join(__dirname, '..', 'command');
const FENSTER_TAGE = 7;

async function main() {
  const minVerkaeufe = parseInt(config.OPPORTUNITY_RADAR_MIN_VERKAEUFE, 10) || 5;
  const wachstumSchwelle = parseFloat(config.OPPORTUNITY_RADAR_WACHSTUM_PROZENT || '50') / 100;

  const vor14Tagen = new Date();
  vor14Tagen.setDate(vor14Tagen.getDate() - FENSTER_TAGE * 2);
  const orders = (await getOrdersSince(vor14Tagen)).filter((o) => !o.cancelled_at);

  const grenzeMitte = new Date();
  grenzeMitte.setDate(grenzeMitte.getDate() - FENSTER_TAGE);

  const letzte7 = {};
  const vorherige7 = {};
  for (const o of orders) {
    const eimer = new Date(o.created_at) >= grenzeMitte ? letzte7 : vorherige7;
    for (const li of o.line_items || []) {
      eimer[li.title] = (eimer[li.title] || 0) + li.quantity;
    }
  }

  const chancen = [];
  for (const [name, menge] of Object.entries(letzte7)) {
    if (menge < minVerkaeufe) continue;
    const vorherigeMenge = vorherige7[name] || 0;
    let wachstumProzent = null;
    let istChance = false;

    if (vorherigeMenge > 0) {
      wachstumProzent = Math.round(((menge - vorherigeMenge) / vorherigeMenge) * 100);
      istChance = menge >= vorherigeMenge * (1 + wachstumSchwelle);
    } else {
      istChance = true; // komplett neuer Schnellstarter ohne Vorwoche
    }
    if (!istChance) continue;

    chancen.push({
      name,
      verkaeufeLetzte7Tage: menge,
      verkaeufeVorherige7Tage: vorherigeMenge,
      wachstumProzent,
      empfehlung: vorherigeMenge > 0
        ? 'Läuft deutlich besser als letzte Woche - Ad-Budget für dieses Produkt prüfen, Lagerbestand rechtzeitig sichern.'
        : 'Neuer Schnellstarter ohne Vorlauf - beobachten, ob sich das Tempo hält, bevor groß skaliert wird.',
    });
  }
  chancen.sort((a, b) => b.verkaeufeLetzte7Tage - a.verkaeufeLetzte7Tage);

  if (!existsSync(COMMAND_DIR)) mkdirSync(COMMAND_DIR, { recursive: true });
  writeFileSync(join(COMMAND_DIR, 'opportunity-radar.json'), JSON.stringify({
    updatedAt: new Date().toISOString(),
    fensterTage: FENSTER_TAGE,
    chancen,
  }, null, 2));

  if (!chancen.length) {
    console.log('[87-opportunity-radar] Keine auffälligen Chancen diese Woche.');
    return;
  }

  const zeilen = chancen.map((c) =>
    `- ${c.name}: ${c.verkaeufeLetzte7Tage}x (${c.wachstumProzent !== null ? `${c.wachstumProzent > 0 ? '+' : ''}${c.wachstumProzent}% ggü. Vorwoche` : 'neu ohne Vorwoche'}) - ${c.empfehlung}`);
  await notifyTelegram(`🚀 OPPORTUNITY-RADAR - ${config.SHOP_NAME}${NL}--------------------${NL}${zeilen.join(NL)}`);

  console.log(`[87-opportunity-radar] ${chancen.length} Chance(n) erkannt.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[87-opportunity-radar] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[87-opportunity-radar] Fehler:', err);
  process.exit(1);
});
