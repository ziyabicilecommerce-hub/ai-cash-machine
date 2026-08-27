// Lokales Open-Source-Modell über Ollama statt einer externen API (Claude/
// Gemini) - läuft direkt im GitHub-Actions-Job selbst (siehe
// .github/workflows/_automation-runner.yml, das Ollama vor jedem Lauf
// installiert und startet). Komplett ohne API-Key, ohne Account, ohne
// Anmeldung irgendwo - bewusster Trade-off des Shop-Betreibers: spürbar
// schwächere Textqualität als Claude/Gemini und langsamere Automations-
// Läufe (Modell-Download + CPU-Inferenz ohne GPU), dafür wirklich null
// externe Abhängigkeit.
import { config, ueberspringenWerfen } from './config.mjs';
import { loadState, saveState } from './state.mjs';
import { notifyTelegram } from './telegram.mjs';
import { notifyWhatsapp } from './whatsapp.mjs';

const OLLAMA_URL = 'http://localhost:11434';
const BUDGET_STATE_NAME = 'ollama-budget-state';

function heute() {
  return new Date().toISOString().slice(0, 10);
}

// Kein echtes Kosten-Limit mehr (Ollama läuft lokal, kostet nichts) - reines
// Sicherheitsnetz gegen einen Bug (z.B. eine Endlosschleife), der sonst
// unbemerkt sehr viele CPU-lastige Inferenz-Aufrufe in einem einzigen
// GitHub-Actions-Job auslösen könnte. OLLAMA_MAX_TOKENS_PRO_TAG='' bzw. '0'
// deaktiviert das Limit komplett.
async function pruefeTagesBudget() {
  const limit = parseInt(config.OLLAMA_MAX_TOKENS_PRO_TAG, 10);
  if (!limit) return null;

  let state = loadState(BUDGET_STATE_NAME);
  if (state.datum !== heute()) {
    state = { datum: heute(), tokenHeute: 0, limitBenachrichtigt: false };
  }

  if (state.tokenHeute >= limit) {
    if (!state.limitBenachrichtigt) {
      const text = `⚠️ Tages-Sicherheitslimit erreicht: ${state.tokenHeute} von ${limit} Tokens heute lokal generiert. Weitere KI-Aufrufe pausieren bis morgen (OLLAMA_MAX_TOKENS_PRO_TAG anpassen, falls das zu niedrig ist) - reines Sicherheitsnetz gegen Bugs, kein echtes Kostenlimit.`;
      await Promise.all([notifyTelegram(text), notifyWhatsapp(text)]);
      state.limitBenachrichtigt = true;
      saveState(BUDGET_STATE_NAME, state);
    }
    ueberspringenWerfen('Tages-Sicherheitslimit erreicht (OLLAMA_MAX_TOKENS_PRO_TAG) - Aufruf übersprungen.');
  }

  return state;
}

function aktualisiereTagesBudget(state, promptTokens, antwortTokens) {
  if (!state) return;
  state.tokenHeute += (promptTokens || 0) + (antwortTokens || 0);
  saveState(BUDGET_STATE_NAME, state);
}

export async function askKI(prompt, { maxTokens = 1500, system } = {}) {
  const budgetState = await pruefeTagesBudget();

  let res;
  try {
    res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: config.OLLAMA_MODEL,
        prompt,
        ...(system ? { system } : {}),
        stream: false,
        options: { num_predict: maxTokens },
      }),
    });
  } catch (err) {
    ueberspringenWerfen(`Lokales KI-Modell (Ollama) nicht erreichbar - läuft "ollama serve" auf diesem Rechner? (${err.message})`);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama-Fehler ${res.status}: ${text}`);
  }
  const data = await res.json();
  aktualisiereTagesBudget(budgetState, data.prompt_eval_count, data.eval_count);
  return data.response || '';
}

// Extrahiert das erste JSON-Objekt aus einem KI-Antworttext (antwortet oft mit
// Fließtext drumherum, auch wenn im Prompt JSON verlangt wurde) - bei kleinen
// lokalen Modellen häufiger nötig als bei Claude/Gemini, da die sich seltener
// exakt an ein Antwortformat halten.
export function parseJsonFromText(text, fallback = {}) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) return fallback;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return fallback;
  }
}
