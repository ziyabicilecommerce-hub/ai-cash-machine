// Eigene KI direkt im GitHub-Lauf (Ollama + offenes Modell, Standard qwen2.5:3b): kein Schluessel, kein Konto,
// kein Tageslimit, keine Kosten. Langsamer und etwas schwaecher als die Cloud-Dienste - deshalb das letzte
// Sicherheitsnetz, wenn Pollinations/LLM7 (und Gemini/Groq ohne Schluessel) ausfallen.
// Eingerichtet von .github/actions/ki-lokal (setzt OLLAMA_URL und OLLAMA_MODELL).
const env = (k) => (process.env[k] || '').trim();
export const lokalBereit = () => Boolean(env('OLLAMA_URL'));

export async function kiLokal(prompt, { maxTokens = 1500, system, laden = fetch } = {}) {
  if (!lokalBereit()) throw new Error('Lokale KI nicht eingerichtet (OLLAMA_URL fehlt)');
  const json = /\bJSON\b/.test(prompt);
  const res = await laden(`${env('OLLAMA_URL').replace(/\/$/, '')}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(15 * 60000),
    body: JSON.stringify({
      model: env('OLLAMA_MODELL') || 'qwen2.5:3b', stream: false, ...(json ? { format: 'json' } : {}),
      options: { num_predict: Math.min(maxTokens, Number(env('OLLAMA_MAX_TOKENS')) || 3000), temperature: 0.7, num_ctx: 8192 },
      messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }],
    }),
  });
  const d = await res.json().catch(() => ({}));
  const text = d?.message?.content || '';
  if (!res.ok || !text.trim()) throw new Error(`Lokale KI ${res.status}: ${String(d?.error || 'leere Antwort').slice(0, 120)}`);
  return { antwort: text, usage: { prompt_tokens: d.prompt_eval_count || 0, completion_tokens: d.eval_count || 0 } };
}
