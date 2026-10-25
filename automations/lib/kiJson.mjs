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
    try { return JSON.parse(abgeschnittenSchliessen(text.slice(start))); } catch { /* weiter mit Reparatur */ }
    const repariert = roh
      .replace(/[\u201C\u201D\u201E]/g, '"')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([A-Za-z_][\w]*)\s*:/g, '$1"$2":')
      .replace(/}\s*{/g, '},{')
      .replace(/"\s*\n\s*"/g, '","');
    return JSON.parse(repariert);
  }
}

// Abgeschnittenes JSON (kleine KI, Token-Limit): bis zum letzten vollstaendigen Element behalten und
// offene Klammern schliessen - so bleiben die fertigen Szenen erhalten statt "0 Szenen".
export function abgeschnittenSchliessen(text) {
  const stapel = [];
  let inText = false, esc = false, schnitt = -1, offen = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inText) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inText = false; continue; }
    if (c === '"') inText = true;
    else if (c === '{' || c === '[') stapel.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') { stapel.pop(); if (!stapel.length) return text.slice(0, i + 1); schnitt = i + 1; offen = [...stapel]; }
    else if (c === ',') { schnitt = i; offen = [...stapel]; }
  }
  if (schnitt < 0) throw new Error('KI lieferte kein JSON');
  return text.slice(0, schnitt).replace(/,\s*$/, '') + offen.reverse().join('');
}

// Szenen aus der KI-Antwort - auch wenn die KI andere Namen nimmt ("scenes", "skript.szenen")
// oder die Szenen nur als Texte liefert.
export function szenenAus(d) {
  const liste = [d?.szenen, d?.scenes, d?.Szenen, d?.skript?.szenen, d?.script?.scenes, d?.video?.szenen].find(Array.isArray) || (Array.isArray(d) ? d : []);
  return liste.map((x) => (typeof x === 'string' ? { text: x } : { ...x, text: x?.text ?? x?.satz ?? x?.sprechtext ?? x?.voiceover ?? x?.sprecher ?? '' }));
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

// Kostenlose KI-Kette: GitHub Models (im Actions-Lauf, falls an) -> Pollinations (mit Gratis-Schluessel POLLINATIONS_TOKEN stabiler, ohne Schluessel
// gedrosselt) -> Google Gemini (Gratis-Kontingent, GEMINI_API_KEY) -> Groq (Gratis-Kontingent, GROQ_API_KEY)
// -> Cloudflare Workers AI (Gratis-Kontingent, CF_ACCOUNT_ID + CF_API_TOKEN)
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

// GitHub Models: Gratis-KI direkt von GitHub - in jedem Actions-Lauf mit dem eingebauten GITHUB_TOKEN
// (Workflow-Recht "models: read"), ohne Anmeldung und ohne eigenen Schlüssel. Tageslimit pro Konto - danach weiter.
// Einschalten: Repo-Variable KI_GITHUB_MODELS=an (wird in den Workflows durchgereicht).
async function githubModels(prompt, maxTokens) {
  const res = await fetch('https://models.github.ai/inference/chat/completions', {
    method: 'POST', signal: AbortSignal.timeout(90000),
    headers: { 'content-type': 'application/json', accept: 'application/vnd.github+json', authorization: `Bearer ${envK('GITHUB_TOKEN')}` },
    body: JSON.stringify({ model: envK('GITHUB_MODELS_MODELL') || 'openai/gpt-4.1-mini', messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }),
  });
  const d = await res.json().catch(() => ({}));
  const text = d?.choices?.[0]?.message?.content || '';
  if (!res.ok || !text) throw new Error(`GitHub Models ${res.status}: ${String(d?.error?.message || d?.message || '').slice(0, 120)}`);
  return text;
}
export const githubModelsBereit = () => !!(envK('GITHUB_TOKEN') && envK('GITHUB_ACTIONS'));

// Cloudflare Workers AI: Gratis-Kontingent pro Tag (Konto + CF_ACCOUNT_ID/CF_API_TOKEN als Secret).
async function cloudflareText(prompt, maxTokens) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(envK('CF_ACCOUNT_ID'))}/ai/run/${envK('CF_TEXT_MODELL') || '@cf/meta/llama-3.3-70b-instruct-fp8-fast'}`, {
    method: 'POST', signal: AbortSignal.timeout(120000),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${envK('CF_API_TOKEN')}` },
    body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }),
  });
  const d = await res.json().catch(() => ({}));
  const text = typeof d?.result?.response === 'string' ? d.result.response : (d?.result?.response ? JSON.stringify(d.result.response) : '');
  if (!res.ok || !text) throw new Error(`Cloudflare ${res.status}: ${String(d?.errors?.[0]?.message || '').slice(0, 120)}`);
  return text;
}

export async function kiTextEinmal(prompt, { maxTokens = 1500 } = {}) {
  // Test 25.10.: models.github.ai antwortete mit "200 OK" ohne Inhalt - deshalb nur mit Repo-Variable KI_GITHUB_MODELS=an.
  if (githubModelsBereit() && /^(1|ja|true|an)$/i.test(envK('KI_GITHUB_MODELS'))) {
    try { return await githubModels(prompt, Math.min(maxTokens, 4000)); } catch (err) { console.log(`[ki] ${String(err.message).slice(0, 140)} - nächster Anbieter`); }
  }
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
    console.log(`[ki] Pollinations ${res.status}: ${String(text || d?.error?.message || d?.error || '').slice(0, 120)} - nächster Anbieter`);
  } catch (err) {
    console.log(`[ki] Pollinations: ${String(err.message).slice(0, 120)} - nächster Anbieter`);
  }
  for (const [name, fn] of [['GEMINI_API_KEY', gemini], ['GROQ_API_KEY', groq], ['CF_API_TOKEN', cloudflareText]]) {
    if (!envK(name) || (name === 'CF_API_TOKEN' && !envK('CF_ACCOUNT_ID'))) continue;
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
