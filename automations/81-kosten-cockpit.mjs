// Kosten-Cockpit - EINE Tabelle mit allem: Status jeder Automation (aus dem
// Agenten-Status-Sammler #80), welche Verbindungen sie braucht, was heute an
// Claude-Kosten angefallen ist, und was JETZT Aufmerksamkeit braucht - statt
// dass man durch 18 Apps klicken muss, um zu sehen was kaputt ist. Neu, kein
// n8n-Workflow · Zeitplan: alle 6 Stunden (kurz nach #80, damit die Live-
// Status-Daten frisch sind).
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './lib/config.mjs';
import { loadState, saveState } from './lib/state.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DATA_FILE = join(__dirname, '..', 'agents', 'data.json');
const CHEF_AGENT_FILE = join(__dirname, '..', 'command', 'chef-agent.json');
const CHAINS_FILE = join(__dirname, '..', 'command', 'chains.json');
const COCKPIT_DIR = join(__dirname, '..', 'cockpit');
const KOSTEN_VERLAUF_STATE = 'kosten-cockpit-verlauf';
const MAX_VERLAUF_TAGE = 30;

// Welche lib/*.mjs-Datei braucht welche externe Verbindung (=Secrets) - so
// muss diese Liste nicht von Hand gepflegt werden, sondern wird direkt aus
// den echten Imports jeder Automation abgeleitet.
const VERBINDUNGS_LABEL = {
  shopify: 'Shopify', claude: 'Anthropic Claude', whatsapp: 'WhatsApp', whatsappChunk: 'WhatsApp',
  telegram: 'Telegram', email: 'E-Mail (Resend)', meta: 'Meta Ads', binance: 'Binance',
  sms: 'Twilio SMS', judgeme: 'Judge.me', openaiImage: 'OpenAI (Bilder)', composioMaps: 'Composio/Maps',
};

// Grobe Mischkalkulation (Input+Output gemischt) für Claude Sonnet, bewusst
// konservativ (eher zu hoch) geschätzt - keine exakte Abrechnung, die steht
// im Anthropic-Console-Billing. Nur gedacht, um ein grobes Gefühl für die
// Größenordnung zu geben, nicht als Buchhaltungszahl.
const EUR_PRO_MIO_TOKEN = 8;

function leseJson(pfad) {
  if (!existsSync(pfad)) return null;
  try {
    return JSON.parse(readFileSync(pfad, 'utf-8'));
  } catch {
    return null;
  }
}

function ermittleVerbindungen(dateiInhalt) {
  const gefunden = new Set();
  const regex = /from ['"]\.\/lib\/(\w+)\.mjs['"]/g;
  let m;
  while ((m = regex.exec(dateiInhalt))) {
    const label = VERBINDUNGS_LABEL[m[1]];
    if (label) gefunden.add(label);
  }
  return [...gefunden];
}

function heute() {
  return new Date().toISOString().slice(0, 10);
}

// Pflegt eine rollierende Tageshistorie der Kosten (heutiger Eintrag wird bei
// mehrfachen Läufen am selben Tag überschrieben, nicht dupliziert) - macht
// aus dem reinen "heute"-Snapshot einen echten Trend statt nur einer Zahl.
function aktualisiereKostenVerlauf(tokenHeute, geschaetzteKostenEurHeute) {
  const state = loadState(KOSTEN_VERLAUF_STATE);
  const verlauf = (state.verlauf || []).filter((e) => e.datum !== heute());
  verlauf.push({ datum: heute(), tokenHeute, geschaetzteKostenEurHeute });
  verlauf.sort((a, b) => a.datum.localeCompare(b.datum));
  const gekuerzt = verlauf.slice(-MAX_VERLAUF_TAGE);
  saveState(KOSTEN_VERLAUF_STATE, { verlauf: gekuerzt });
  return gekuerzt;
}

async function main() {
  const agentenStatus = leseJson(AGENTS_DATA_FILE);
  const budgetState = loadState('claude-budget-state');
  const chefAgent = leseJson(CHEF_AGENT_FILE);
  const chains = leseJson(CHAINS_FILE);

  const nummerZuDatei = {};
  for (const f of readdirSync(__dirname)) {
    const treffer = f.match(/^(\d+)-.*\.mjs$/);
    if (treffer) nummerZuDatei[parseInt(treffer[1], 10)] = f;
  }

  const automationen = (agentenStatus?.agenten || [])
    .map((a) => {
      const datei = nummerZuDatei[a.nummer];
      let verbindungen = [];
      if (datei) {
        try {
          verbindungen = ermittleVerbindungen(readFileSync(join(__dirname, datei), 'utf-8'));
        } catch { /* Datei nicht lesbar - Verbindungsliste bleibt leer */ }
      }

      let status = 'ok';
      let sofortNoetig = null;
      if (!a.letzterLauf) {
        status = 'nie-gelaufen';
        sofortNoetig = verbindungen.length
          ? `Noch nie gelaufen - prüfen ob ${verbindungen.join(', ')} als GitHub-Secrets gesetzt sind.`
          : 'Noch nie gelaufen.';
      } else if (a.letzterLauf.conclusion === 'failure') {
        status = 'fehler';
        sofortNoetig = 'Letzter Lauf fehlgeschlagen - Action-Log ansehen.';
      }

      return {
        nummer: a.nummer, name: a.name, verbindungen, status, letzterLauf: a.letzterLauf,
        sofortNoetig, workflowUrl: a.workflowUrl, verlauf: a.verlauf || [],
      };
    })
    .sort((x, y) => (x.nummer || 999) - (y.nummer || 999));

  const anzahlHandlungsbedarf = automationen.filter((a) => a.status !== 'ok').length;

  const sofortNoetig = [];
  const letzterChef = chefAgent?.historie?.[0];
  if (letzterChef && !letzterChef.allesGut) {
    sofortNoetig.push({ titel: 'Chef-Agent · Priorität heute', detail: letzterChef.prioritaet, quelle: '60 · Chef-Agent' });
  }
  for (const eintrag of (chains?.log || []).filter((e) => !e.ausgeloest).slice(0, 5)) {
    sofortNoetig.push({ titel: `Kette fehlgeschlagen: ${eintrag.von} → ${eintrag.nach}`, detail: eintrag.grund, quelle: 'Ketten' });
  }
  if (anzahlHandlungsbedarf > 0) {
    sofortNoetig.push({
      titel: `${anzahlHandlungsbedarf} Automation(en) brauchen Aufmerksamkeit`,
      detail: 'Nie gelaufen oder letzter Lauf fehlgeschlagen - siehe Tabelle.',
      quelle: 'Cockpit',
    });
  }

  const tokenHeute = budgetState?.tokenHeute || 0;
  const geschaetzteKostenEurHeute = Math.round((tokenHeute / 1_000_000) * EUR_PRO_MIO_TOKEN * 100) / 100;
  const kostenVerlauf = aktualisiereKostenVerlauf(tokenHeute, geschaetzteKostenEurHeute);

  // Monats-Projektion: Durchschnitt der bisher bekannten Tage (nicht nur
  // heute) * 30 - stabiler als eine Hochrechnung aus einem einzelnen Tag,
  // der zufällig sehr ruhig oder sehr aktiv war.
  const tageMitDaten = kostenVerlauf.filter((e) => e.geschaetzteKostenEurHeute > 0);
  const durchschnittProTag = tageMitDaten.length
    ? tageMitDaten.reduce((s, e) => s + e.geschaetzteKostenEurHeute, 0) / tageMitDaten.length
    : geschaetzteKostenEurHeute;

  const kosten = {
    tokenHeute,
    limit: parseInt(config.CLAUDE_MAX_TOKENS_PRO_TAG, 10) || null,
    geschaetzteKostenEurHeute,
    monatsProjektionEur: Math.round(durchschnittProTag * 30 * 100) / 100,
    verlauf: kostenVerlauf,
  };

  if (!existsSync(COCKPIT_DIR)) mkdirSync(COCKPIT_DIR, { recursive: true });
  writeFileSync(
    join(COCKPIT_DIR, 'data.json'),
    JSON.stringify({ updatedAt: new Date().toISOString(), kosten, sofortNoetig, automationen }, null, 2),
  );

  console.log(`[81-kosten-cockpit] ${automationen.length} Automationen erfasst, ${anzahlHandlungsbedarf} mit Handlungsbedarf.`);
}

main().catch((err) => {
  console.error('[81-kosten-cockpit] Fehler:', err);
  process.exit(1);
});
