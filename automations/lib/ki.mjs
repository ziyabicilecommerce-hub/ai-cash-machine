// Google Gemini statt bezahltem Claude - gleiche Rolle (Text-/JSON-
// Generierung für alle Automationen), aber über die dauerhaft kostenlose
// Gemini-API-Stufe (Rate-Limit statt Kosten). Kein eigener Server, keine
// laufenden Kosten - Key kostenlos unter aistudio.google.com/apikey.
import { config, ueberspringenWerfen } from './config.mjs';
import { loadState, saveState } from './state.mjs';
import { notifyTelegram } from './telegram.mjs';
import { notifyWhatsapp } from './whatsapp.mjs';

const BUDGET_STATE_NAME = 'gemini-budget-state';
const API_VERSION = 'v1beta';

function heute() {
  return new Date().toISOString().slice(0, 10);
}

// Tages-Token-Budget über alle Automationen hinweg, damit ein Bug (z.B. eine
// Endlosschleife) oder ungewöhnlich hohe Shop-Aktivität nicht unbemerkt weit
// über die kostenlose Gemini-Stufe hinaus läuft. GEMINI_MAX_TOKENS_PRO_TAG=''
// bzw. '0' deaktiviert das Limit komplett.
async function pruefeTagesBudget() {
  const limit = parseInt(config.GEMINI_MAX_TOKENS_PRO_TAG, 10);
  if (!limit) return null;

  let state = loadState(BUDGET_STATE_NAME);
  if (state.datum !== heute()) {
    state = { datum: heute(), tokenHeute: 0, limitBenachrichtigt: false };
  }

  if (state.tokenHeute >= limit) {
    if (!state.limitBenachrichtigt) {
      const text = `⚠️ Gemini-Tageslimit erreicht: ${state.tokenHeute} von ${limit} Tokens heute verbraucht. Weitere KI-Aufrufe pausieren bis morgen (GEMINI_MAX_TOKENS_PRO_TAG anpassen, falls das zu niedrig ist).`;
      await Promise.all([notifyTelegram(text), notifyWhatsapp(text)]);
      state.limitBenachrichtigt = true;
      saveState(BUDGET_STATE_NAME, state);
    }
    ueberspringenWerfen('Gemini-Tageslimit erreicht (GEMINI_MAX_TOKENS_PRO_TAG) - Aufruf übersprungen.');
  }

  return state;
}

function aktualisiereTagesBudget(state, usageMetadata) {
  if (!state || !usageMetadata) return;
  state.tokenHeute += (usageMetadata.promptTokenCount || 0) + (usageMetadata.candidatesTokenCount || 0);
  saveState(BUDGET_STATE_NAME, state);
}

export async function askKI(prompt, { maxTokens = 1500, system } = {}) {
  if (!config.GEMINI_API_KEY) {
    ueberspringenWerfen('GEMINI_API_KEY-Secret ist nicht gesetzt - kostenlosen Key unter aistudio.google.com/apikey holen und in GitHub → Settings → Secrets and variables → Actions eintragen (siehe automations/README.md).');
  }
  const budgetState = await pruefeTagesBudget();

  const res = await fetch(
    `https://generativelanguage.googleapis.com/${API_VERSION}/models/${config.GEMINI_MODEL}:generateContent?key=${config.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API Fehler ${res.status}: ${text}`);
  }
  const data = await res.json();
  aktualisiereTagesBudget(budgetState, data.usageMetadata);
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || '').join('');
}

// Extrahiert das erste JSON-Objekt aus einem KI-Antworttext (antwortet oft mit
// Fließtext drumherum, auch wenn im Prompt JSON verlangt wurde).
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
