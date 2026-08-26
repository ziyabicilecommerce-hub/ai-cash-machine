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
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { getOrders, getCustomers } from './lib/shopify.mjs';
import { askKI, parseJsonFromText } from './lib/ki.mjs';
import { notifyWhatsapp } from './lib/whatsapp.mjs';
import { loadState, saveState } from './lib/state.mjs';
import { loeseKetteAus } from './lib/chains.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FINANCE_DATA_FILE = join(__dirname, '..', 'finance-cockpit', 'data.json');
const STATE_KEY = '60-chef-agent';
const COMMAND_DIR = join(__dirname, '..', 'command');
const MAX_HISTORIE = 60;

// Deterministische Auslöse-Regeln - bewusst NICHT von dem freien Text der KI
// abhängig (siehe githubActions.mjs). Nur die 2 Bereiche, für die es eine
// wirklich passende, sichere Automation gibt: Finanzen hat keine, die
// automatisch "besser wird", indem man ein Skript startet - das bleibt
// Empfehlung.
async function loeseAktionenAus({ fulfillment, kunden }) {
  const ausgeloest = [];
  if (fulfillment && fulfillment.verzoegert > 0) {
    const grund = `${fulfillment.verzoegert} überfällige Bestellung(en)`;
    const ergebnis = await loeseKetteAus({
      von: '60 · Chef-Agent', nach: '55 · Fulfillment & Supplier Hub',
      workflowDatei: 'automation-55-fulfillment-supplier-hub.yml', grund,
    });
    ausgeloest.push({ grund, workflow: '55 · Fulfillment & Supplier Hub', ...ergebnis });
  }
  if (kunden && kunden.atRiskVips > 0) {
    const grund = `${kunden.atRiskVips} wertvolle Kunde(n) inaktiv`;
    const ergebnis = await loeseKetteAus({
      von: '60 · Chef-Agent', nach: '05 · Winback-Maschine',
      workflowDatei: 'automation-05-winback-maschine.yml', grund,
    });
    ausgeloest.push({ grund, workflow: '05 · Winback-Maschine', ...ergebnis });
  }
  return ausgeloest;
}

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

  const ziel = (config.BUSINESS_ZIEL || '').trim();
  const zielZeile = ziel ? `\nERKLÄRTES ZIEL DES GRÜNDERS: "${ziel}" - gewichte deine Prioritäts-Entscheidung danach. Wenn eine der 3 Bereiche diesem Ziel klar entgegenläuft, sag das explizit.\n` : '';

  const prompt = `Du bist der Chef-Agent (General Manager) für den Onlineshop "${config.SHOP_NAME}". Du bekommst täglich die Lage aus 3 Bereichen und triffst EINE klare Priorisierungs-Entscheidung, statt nur Zahlen aufzulisten - wie ein guter Geschäftsführer, der weiß, worauf es HEUTE ankommt.
${zielZeile}
${bereiche}

Schreibe eine kurze Chef-Ansage auf Deutsch (Du-Form):
1. STATUS: 1 Satz pro Bereich (Finanzen/Fulfillment/Kunden), nur wenn Daten vorhanden
2. PRIORITÄT HEUTE: die EINE Sache, die am dringendsten Aufmerksamkeit braucht, mit klarer Begründung warum gerade die (nicht die anderen)
3. Falls alles im grünen Bereich: sag das ehrlich, statt ein Problem zu erfinden

Antworte NUR mit validem JSON, ohne Markdown:
{"status": "...", "prioritaet": "...", "alles_gut": true oder false}`;

  const antwort = await askKI(prompt, { maxTokens: 1000 });
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

  const ausgeloesteAktionen = await loeseAktionenAus({ fulfillment, kunden });
  if (ausgeloesteAktionen.length) {
    const zeilen = ausgeloesteAktionen.map((a) =>
      `${a.ausgeloest ? '✅' : '⚠️'} ${a.workflow} — ${a.grund}${a.ausgeloest ? ' (sofort gestartet)' : ' (Start fehlgeschlagen, läuft trotzdem zum normalen Zeitplan)'}`);
    await notifyWhatsapp(`🤖 *Chef-Agent hat gehandelt:*\n\n${zeilen.join('\n')}`);
  }

  const state = loadState(STATE_KEY);
  state.historie = state.historie || [];
  state.historie.unshift({
    datum: new Date().toISOString(),
    finanzen, fulfillment, kunden,
    status: daten.status, prioritaet: daten.prioritaet, allesGut: !!daten.alles_gut,
    ausgeloesteAktionen,
  });
  if (state.historie.length > MAX_HISTORIE) state.historie = state.historie.slice(0, MAX_HISTORIE);
  saveState(STATE_KEY, state);

  if (!existsSync(COMMAND_DIR)) mkdirSync(COMMAND_DIR, { recursive: true });
  writeFileSync(join(COMMAND_DIR, 'chef-agent.json'), JSON.stringify({ updatedAt: new Date().toISOString(), ziel, historie: state.historie }, null, 2));

  console.log(`[60-chef-agent] Tagesansage versendet. ${ausgeloesteAktionen.length} Aktion(en) ausgelöst.`);
}

main().catch((err) => {
  if (err?.uebersprungen) {
    console.log('[60-chef-agent] Übersprungen:', err.message);
    process.exit(0);
  }
  console.error('[60-chef-agent] Fehler:', err);
  process.exit(1);
});
