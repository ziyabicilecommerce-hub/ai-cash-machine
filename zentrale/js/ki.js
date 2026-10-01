// Kostenlose KI ohne Schlüssel: erst Pollinations, dann LLM7. Wirft, wenn beide nicht erreichbar sind,
// damit jede Funktion auf ihren Offline-Weg zurückfallen kann.
(function (root) {
  const DIENSTE = [
    { name: 'Pollinations', url: 'https://text.pollinations.ai/openai', modell: 'openai', kopf: {} },
    { name: 'LLM7', url: 'https://api.llm7.io/v1/chat/completions', modell: 'default', kopf: { Authorization: 'Bearer unused' } },
  ];
  const gesperrt = new Set();

  async function eineAnfrage(d, system, nachrichten, maxTokens) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch(d.url, {
        method: 'POST', signal: ctrl.signal,
        headers: { 'content-type': 'application/json', ...d.kopf },
        body: JSON.stringify({ model: d.modell, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...nachrichten] }),
      });
      if (!res.ok) throw new Error(`${d.name}: HTTP ${res.status}`);
      const data = await res.json();
      const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      if (!text || /enough credits|reached its budget|enter\.pollinations\.ai/i.test(text)) throw new Error(`${d.name}: keine Antwort`);
      return text.trim();
    } finally { clearTimeout(timer); }
  }

  async function frage(system, nachrichten, maxTokens = 700) {
    const fehler = [];
    for (const d of DIENSTE) {
      if (gesperrt.has(d.name)) continue;
      try { return { text: await eineAnfrage(d, system, nachrichten, maxTokens), dienst: d.name }; } catch (e) {
        fehler.push(String(e.message || e));
        if (e instanceof TypeError) gesperrt.add(d.name);
      }
    }
    throw new Error('KI gerade nicht erreichbar (' + fehler.join('; ') + ')');
  }

  root.ZKI = { frage };
})(typeof window !== 'undefined' ? window : globalThis);
