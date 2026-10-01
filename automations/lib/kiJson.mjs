// Gemeinsame KI-Helfer fuer die Video-Automationen (#94, #95): Text ohne Key,
// JSON robust aus KI-Antworten holen und kaputtes JSON reparieren.
import { askKI } from './ki.mjs';

export function jsonAusText(text) {
  const start = text.indexOf('{');
  const ende = text.lastIndexOf('}');
  if (start < 0 || ende <= start) throw new Error('KI lieferte kein JSON');
  const roh = text.slice(start, ende + 1);
  try {
    return JSON.parse(roh);
  } catch {
    const repariert = roh
      .replace(/[\u201C\u201D\u201E]/g, '"')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([A-Za-z_][\w]*)\s*:/g, '$1"$2":')
      .replace(/}\s*{/g, '},{')
      .replace(/"\s*\n\s*"/g, '","');
    return JSON.parse(repariert);
  }
}

// Die Gratis-Dienste drosseln gleichzeitige Anfragen (429) - daher eine Warteschlange:
// immer nur eine Anfrage auf einmal, bei "Retry after N" warten und neu versuchen.
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
let kette = Promise.resolve();
export function kiText(prompt, opts) {
  const lauf = kette.then(() => kiTextMitWarten(prompt, opts));
  kette = lauf.catch(() => {});
  return lauf;
}

async function kiTextMitWarten(prompt, opts) {
  for (let versuch = 0; ; versuch++) {
    try {
      return await kiTextEinmal(prompt, opts);
    } catch (err) {
      const m = String(err.message).match(/429|retry after (\d+)/i);
      // Tageslimit/Kontingent aufgebraucht: Warten bringt nichts - sofort aufgeben.
      if (/daily|quota|budget|credits/i.test(String(err.message))) throw err;
      if (!m || versuch >= 5) throw err;
      const sek = Number(String(err.message).match(/retry after (\d+)/i)?.[1]) || 15 * (versuch + 1);
      await warte((sek + 2) * 1000);
    }
  }
}

// Kostenlose KI-Kette: Pollinations (mit Gratis-Schluessel POLLINATIONS_TOKEN stabiler, ohne Schluessel
// gedrosselt) -> Google Gemini (Gratis-Kontingent, GEMINI_API_KEY) -> Groq (Gratis-Kontingent, GROQ_API_KEY)
// -> askKI (bisherige Gratis-Kette). Faellt einer aus oder ist sein Tageskontingent leer, springt der naechste ein.
const envK = (k) => (process.env[k] || '').trim();

async function gemini(prompt, maxTokens) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${envK('GEMINI_MODELL') || 'gemini-2.5-flash'}:generateContent?key=${encodeURIComponent(envK('GEMINI_API_KEY'))}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: maxTokens, thinkingConfig: { thinkingBudget: 0 } } }),
  });
  const d = await res.json();
  const text = d?.candidates?.[0]?.content?.parts?.map((x) => x.text || '').join('') || '';
  if (!res.ok || !text) throw new Error(`Gemini ${res.status}: ${String(d?.error?.message || '').slice(0, 120)}`);
  return text;
}

async function groq(prompt, maxTokens) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${envK('GROQ_API_KEY')}` }, signal: AbortSignal.timeout(120000),
    body: JSON.stringify({ model: envK('GROQ_MODELL') || 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }),
  });
  const d = await res.json();
  const text = d?.choices?.[0]?.message?.content || '';
  if (!res.ok || !text) throw new Error(`Groq ${res.status}: ${String(d?.error?.message || '').slice(0, 120)}`);
  return text;
}

export async function kiTextEinmal(prompt, { maxTokens = 1500 } = {}) {
  try {
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(envK('POLLINATIONS_TOKEN') ? { authorization: `Bearer ${envK('POLLINATIONS_TOKEN')}` } : {}) },
      body: JSON.stringify({ model: 'openai-fast', messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }),
      signal: AbortSignal.timeout(120000),
    });
    const d = await res.json();
    const text = d?.choices?.[0]?.message?.content || '';
    if (res.ok && text && !/reached its budget|enough credits|enter\.pollinations\.ai/i.test(text)) return text;
  } catch {
    /* naechster Anbieter */
  }
  for (const [name, fn] of [['GEMINI_API_KEY', gemini], ['GROQ_API_KEY', groq]]) {
    if (!envK(name)) continue;
    try { return await fn(prompt, maxTokens); } catch (err) { console.log(`[ki] ${String(err.message).slice(0, 140)} - nächster Anbieter`); }
  }
  return askKI(prompt, { maxTokens });
}

// Fragt die KI bis zu 3-mal, falls das JSON unbrauchbar ist.
export async function kiJson(prompt, opts) {
  let letzter;
  for (let versuch = 0; versuch < 3; versuch++) {
    try {
      return jsonAusText(await kiText(versuch ? `${prompt}\nWICHTIG: Gib ausschliesslich gueltiges JSON zurueck, doppelte Anfuehrungszeichen, keine Kommentare.` : prompt, opts));
    } catch (err) {
      letzter = err;
    }
  }
  throw letzter;
}

// Holt einzelne Szenen-Objekte aus kaputtem KI-Text (z. B. abgeschnittenes JSON).
export function szenenRetten(text) {
  const treffer = String(text).match(/\{[^{}]*"text"\s*:\s*"[^"]*"[^{}]*\}/g) || [];
  const szenen = [];
  for (const t of treffer) {
    try {
      szenen.push(jsonAusText(t));
    } catch {
      /* einzelne Szene unbrauchbar */
    }
  }
  return szenen;
}
