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

// Pollinations "openai-fast" (GPT-OSS 20B) laeuft ohne Key und schreibt deutlich
// besseres Deutsch als das Standardmodell der KI-Kette; askKI bleibt Rueckfall.
export async function kiText(prompt, { maxTokens = 1500 } = {}) {
  try {
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai-fast', messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }),
      signal: AbortSignal.timeout(120000),
    });
    const d = await res.json();
    const text = d?.choices?.[0]?.message?.content || '';
    if (res.ok && text && !/reached its budget|enough credits|enter\.pollinations\.ai/i.test(text)) return text;
  } catch {
    /* Rueckfall auf askKI */
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
