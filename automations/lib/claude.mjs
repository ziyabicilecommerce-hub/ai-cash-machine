import { config } from './config.mjs';
import { loadState, saveState } from './state.mjs';
import { notifyTelegram } from './telegram.mjs';
import { notifyWhatsapp } from './whatsapp.mjs';

const BUDGET_STATE_NAME = 'claude-budget-state';

function heute() {
  return new Date().toISOString().slice(0, 10);
}

// Tages-Token-Budget über alle Automationen hinweg, damit ein Bug (z.B. eine
// Endlosschleife) oder ungewöhnlich hohe Shop-Aktivität nicht unbemerkt sehr
// viele Anthropic-Credits verbrauchen kann. CLAUDE_MAX_TOKENS_PRO_TAG='' bzw.
// '0' deaktiviert das Limit komplett.
async function pruefeTagesBudget() {
  const limit = parseInt(config.CLAUDE_MAX_TOKENS_PRO_TAG, 10);
  if (!limit) return null;

  let state = loadState(BUDGET_STATE_NAME);
  if (state.datum !== heute()) {
    state = { datum: heute(), tokenHeute: 0, limitBenachrichtigt: false };
  }

  if (state.tokenHeute >= limit) {
    if (!state.limitBenachrichtigt) {
      const text = `⚠️ Claude-Tageslimit erreicht: ${state.tokenHeute} von ${limit} Tokens heute verbraucht. Weitere Claude-Aufrufe pausieren bis morgen (CLAUDE_MAX_TOKENS_PRO_TAG anpassen, falls das zu niedrig ist).`;
      await Promise.all([notifyTelegram(text), notifyWhatsapp(text)]);
      state.limitBenachrichtigt = true;
      saveState(BUDGET_STATE_NAME, state);
    }
    throw new Error('Claude-Tageslimit erreicht (CLAUDE_MAX_TOKENS_PRO_TAG) - Aufruf übersprungen.');
  }

  return state;
}

function aktualisiereTagesBudget(state, usage) {
  if (!state || !usage) return;
  state.tokenHeute += (usage.input_tokens || 0) + (usage.output_tokens || 0);
  saveState(BUDGET_STATE_NAME, state);
}

export async function askClaude(prompt, { maxTokens = 1500, system, model = 'claude-sonnet-5' } = {}) {
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY-Secret ist nicht gesetzt - bitte in GitHub → Settings → Secrets and variables → Actions eintragen (siehe setup/ App oder automations/README.md).');
  }
  const budgetState = await pruefeTagesBudget();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API Fehler ${res.status}: ${text}`);
  }
  const data = await res.json();
  aktualisiereTagesBudget(budgetState, data.usage);
  const block = (data.content || []).find((b) => b.type === 'text');
  return block ? block.text : '';
}

// Extrahiert das erste JSON-Objekt aus einem Claude-Antworttext (Claude antwortet oft mit
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
