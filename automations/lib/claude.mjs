import { config } from './config.mjs';

export async function askClaude(prompt, { maxTokens = 1500, system, model = 'claude-sonnet-5' } = {}) {
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
