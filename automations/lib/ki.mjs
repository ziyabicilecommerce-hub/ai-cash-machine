// Kostenloser KI-Dienst (Pollinations, text.pollinations.ai) statt einer
// externen API mit Key (Claude/Gemini) - läuft server-seitig bei Pollinations
// selbst, komplett ohne API-Key, ohne Account, ohne Anmeldung irgendwo. Bis
// vor kurzem lief das über Ollama direkt im GitHub-Actions-Job (langsamer,
// schwächere Qualität, brauchte eine lokale Modell-Installation vor jedem
// Lauf) - Pollinations ist echte, live bestätigt funktionierende
// Cloud-Inferenz, deshalb schneller und ohne Installations-Overhead.
import { config, ueberspringenWerfen } from './config.mjs';
import { loadState, saveState } from './state.mjs';
import { notifyTelegram } from './telegram.mjs';
import { notifyWhatsapp } from './whatsapp.mjs';

const POLLINATIONS_URL = 'https://text.pollinations.ai/openai';
const BUDGET_STATE_NAME = 'pollinations-budget-state';

function heute() {
  return new Date().toISOString().slice(0, 10);
}

// Kein echtes Kosten-Limit (Pollinations ist kostenlos) - reines
// Sicherheitsnetz gegen einen Bug (z.B. eine Endlosschleife), der sonst
// unbemerkt sehr viele KI-Aufrufe auslösen könnte. POLLINATIONS_MAX_TOKENS_PRO_TAG=''
// bzw. '0' deaktiviert das Limit komplett.
async function pruefeTagesBudget() {
  const limit = parseInt(config.POLLINATIONS_MAX_TOKENS_PRO_TAG, 10);
  if (!limit) return null;

  let state = loadState(BUDGET_STATE_NAME);
  if (state.datum !== heute()) {
    state = { datum: heute(), tokenHeute: 0, limitBenachrichtigt: false };
  }

  if (state.tokenHeute >= limit) {
    if (!state.limitBenachrichtigt) {
      const text = `⚠️ Tages-Sicherheitslimit erreicht: ${state.tokenHeute} von ${limit} Tokens heute über den kostenlosen KI-Dienst generiert. Weitere KI-Aufrufe pausieren bis morgen (POLLINATIONS_MAX_TOKENS_PRO_TAG anpassen, falls das zu niedrig ist) - reines Sicherheitsnetz gegen Bugs, kein echtes Kostenlimit.`;
      await Promise.all([notifyTelegram(text), notifyWhatsapp(text)]);
      state.limitBenachrichtigt = true;
      saveState(BUDGET_STATE_NAME, state);
    }
    ueberspringenWerfen('Tages-Sicherheitslimit erreicht (POLLINATIONS_MAX_TOKENS_PRO_TAG) - Aufruf übersprungen.');
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

  const body = JSON.stringify({
    model: 'openai',
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content: prompt },
    ],
    max_tokens: maxTokens,
  });

  // Anonyme Nutzung ist laut Pollinations rate-limitiert (~1 Anfrage/15s) -
  // ein einzelner 429 heißt nicht "kaputt", nur "kurz warten".
  let res;
  for (let versuch = 0; versuch < 2; versuch++) {
    try {
      res = await fetch(POLLINATIONS_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      });
    } catch (err) {
      ueberspringenWerfen(`Kostenloser KI-Dienst (Pollinations) nicht erreichbar - Netzwerkproblem im GitHub-Actions-Job? (${err.message})`);
    }
    if (res.status === 429 && versuch === 0) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      continue;
    }
    break;
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pollinations-Fehler ${res.status}: ${text}`);
  }
  const data = await res.json();
  const antwort = data.choices?.[0]?.message?.content || '';
  // Pollinations liefert bei fehlendem Guthaben HTTP 200 mit einer
  // Fehlermeldung im normalen Antworttext statt eines Fehlerstatus - ohne
  // diese Prüfung würde die Fehlermeldung ungeprüft in echte Shop-Texte
  // (Kundenmails, Produktbeschreibungen usw.) landen.
  if (/enough credits/i.test(antwort)) {
    throw new Error('Pollinations meldet fehlendes Guthaben (Antwort enthielt "enough credits" statt echtem Text).');
  }
  aktualisiereTagesBudget(budgetState, data.usage?.prompt_tokens, data.usage?.completion_tokens);
  return antwort;
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
