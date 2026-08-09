// Chef-Agent - fasst den Tag über die wichtigsten Bereiche (Finanzen,
// Fulfillment, Kundenstamm) zu EINER priorisierten Ansage zusammen, statt
// dass du einzeln durch alle anderen Automations-Nachrichten wühlen musst.
// Trifft eine echte Priorisierungs-Entscheidung (was ZUERST), nicht nur eine
// Zahlen-Zusammenfassung. Neu, kein n8n-Workflow · Zeitplan: täglich, abends.
//
// Bewusst NICHT an die internen State-Dateien der anderen Automationen
// gekoppelt (würde bei jeder Änderung dort brechen) - berechnet die
// wichtigsten Signale frisch aus Shopify + liest nur das stabile,
// etablierte finance-cockpit/data.json-Format.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { getOrders, getCustomers } from './lib/shopify.mjs';
import { askClaude, parseJsonFromText } from './lib/claude.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FINANCE_DATA_FILE = join(__dirname, '..', 'finance-cockpit', 'data.json');

async function ermittleFinanzLage() {
  if (!existsSync(FINANCE_DATA_FILE)) return null;
  const data = JSON.parse(readFileSync(FINANCE_DATA_FILE, 'utf-8'));
  const history = (data.history || []).filter((h) => h && h.datum);
  if (!history.length) return null;
  const latest = history[history.length - 1];
  const nettoGewinn = latest.nettoGewinn !== undefined ? latest.nettoGewinn : latest.gewinn;
  return { datum: latest.datum, umsatz: latest.umsatz, nettoGewinn, waehrung: latest.waehrung };
}

async function ermittleFulfillmentLage() {
  const verzugStunden = parseFloat(config.FULFILLMENT_VERZUG_STUNDEN || '48');
  const vor30Tagen = new Date();
  vor30Tagen.setDate(vor30Tagen.getDate() - 30);
  const orders = (await getOrders({ status: 'open', created_at_min: encodeURIComponent(vor30Tagen.toISOString()) }))
    .filter((o) => !o.cancelled_at);
  const verzoegert = orders.filter((o) => {
    const alterH = (Date.now() - new Date(o.created_at).getTime()) / 3600000;
    return o.fulfillment_status !== 'fulfilled' && alterH >= verzugStunden;
  });
  return { offeneBestellungen: orders.length, verzoegert: verzoegert.length };
}

async function ermittleKundenLage() {
  const atRiskTage = parseInt(config.CRM_AT_RISK_TAGE, 10) || 45;
  const vipUmsatzSchwelle = parseFloat(config.VIP_UMSATZ_SCHWELLE || '150');
  const kunden = await getCustomers({ limit: '250' });

  const vor400Tagen = new Date();
  vor400Tagen.setDate(vor400Tagen.getDate() - 400);
  const orders = (await getOrders({ created_at_min: encodeURIComponent(vor400Tagen.toISOString()), status: 'any' }))
    .filter((o) => !o.cancelled_at && o.email);
  const letzteProKunde = {};
  for (const o of orders) {
    if (!letzteProKunde[o.email] || new Date(o.created_at) > new Date(letzteProKunde[o.email])) {
      letzteProKunde[o.email] = o.created_at;
    }
  }

  let atRiskAnzahl = 0;
  for (const k of kunden) {
    const umsatz = parseFloat(k.total_spent || 0);
    if (umsatz < vipUmsatzSchwelle) continue;
    const letzte = letzteProKunde[k.email];
    const tageSeit = letzte ? (Date.now() - new Date(letzte).getTime()) / 86400000 : Infinity;
    if (tageSeit >= atRiskTage) atRiskAnzahl++;
  }
  return { gesamtKunden: kunden.length, atRiskVips: atRiskAnzahl };
}

async function main() {
  const [finanzen, fulfillment, kunden] = await Promise.all([
    ermittleFinanzLage().catch((err) => { console.error('[60-chef-agent] Finanz-Lage fehlgeschlagen:', err.message); return null; }),
    ermittleFulfillmentLage().catch((err) => { console.error('[60-chef-agent] Fulfillment-Lage fehlgeschlagen:', err.message); return null; }),
    ermittleKundenLage().catch((err) => { console.error('[60-chef-agent] Kunden-Lage fehlgeschlagen:', err.message); return null; }),
  ]);

  if (!finanzen && !fulfillment && !kunden) {
    console.log('[60-chef-agent] Keine Daten aus irgendeinem Bereich verfügbar - übersprungen.');
    return;
  }

  const bereiche = [
    finanzen ? `FINANZEN (${finanzen.datum}): Umsatz ${finanzen.umsatz.toFixed(2)} ${finanzen.waehrung}, Nettogewinn ${finanzen.nettoGewinn.toFixed(2)} ${finanzen.waehrung}` : 'FINANZEN: keine Daten (Gewinn-Radar noch nicht gelaufen)',
    fulfillment ? `FULFILLMENT: ${fulfillment.offeneBestellungen} offene Bestellungen, davon ${fulfillment.verzoegert} überfällig (>${config.FULFILLMENT_VERZUG_STUNDEN || '48'}h unbearbeitet)` : 'FULFILLMENT: keine Daten',
    kunden ? `KUNDENSTAMM: ${kunden.gesamtKunden} Kunden gesamt, davon ${kunden.atRiskVips} wertvolle Kunden gerade inaktiv (At-Risk)` : 'KUNDENSTAMM: keine Daten',
  ].join('\n');

  const prompt = `Du bist der Chef-Agent (General Manager) für den Onlineshop "${config.SHOP_NAME}". Du bekommst täglich die Lage aus 3 Bereichen und triffst EINE klare Priorisierungs-Entscheidung, statt nur Zahlen aufzulisten - wie ein guter Geschäftsführer, der weiß, worauf es HEUTE ankommt.

${bereiche}

Schreibe eine kurze Chef-Ansage auf Deutsch (Du-Form):
1. STATUS: 1 Satz pro Bereich (Finanzen/Fulfillment/Kunden), nur wenn Daten vorhanden
2. PRIORITÄT HEUTE: die EINE Sache, die am dringendsten Aufmerksamkeit braucht, mit klarer Begründung warum gerade die (nicht die anderen)
3. Falls alles im grünen Bereich: sag das ehrlich, statt ein Problem zu erfinden

Antworte NUR mit validem JSON, ohne Markdown:
{"status": "...", "prioritaet": "...", "alles_gut": true oder false}`;

  const antwort = await askClaude(prompt, { maxTokens: 1000 });
  const daten = parseJsonFromText(antwort, null);
  if (!daten) {
    console.log('[60-chef-agent] Ungültige Antwort, kein Report versendet.');
    return;
  }

  const text = [
    `👔 *Chef-Agent* - Tagesansage`,
    daten.status,
    `*${daten.alles_gut ? '✅ Alles im grünen Bereich, aber:' : '🎯 Priorität heute:'}*\n${daten.prioritaet}`,
  ].join('\n\n');

  await notifyWhatsapp(text);
  console.log('[60-chef-agent] Tagesansage versendet.');
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[60-chef-agent] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[60-chef-agent] Fehler:', err);
  process.exit(1);
});
