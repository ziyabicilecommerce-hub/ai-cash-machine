// Eigene KI im GitHub-Lauf: springt ein, wenn die Gratis-Cloud-Dienste weg sind.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kiLokal, lokalBereit } from '../../automations/lib/kiLokal.mjs';

test('kiLokal spricht Ollama an, JSON-Modus bei JSON-Prompts, Laenge gedeckelt', async () => {
  process.env.OLLAMA_URL = 'http://127.0.0.1:11434/';
  let anfrage;
  const laden = async (url, o) => { anfrage = { url, body: JSON.parse(o.body) }; return new Response(JSON.stringify({ message: { content: '{"a":1}' }, prompt_eval_count: 5, eval_count: 7 })); };
  const r = await kiLokal('Antworte NUR mit JSON', { maxTokens: 8000, laden });
  assert.equal(anfrage.url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(anfrage.body.format, 'json');
  assert.equal(anfrage.body.options.num_predict, 3000);
  assert.equal(anfrage.body.stream, false);
  assert.deepEqual([r.antwort, r.usage.completion_tokens], ['{"a":1}', 7]);
  await kiLokal('Schreib einen Satz', { laden });
  assert.equal(anfrage.body.format, undefined);
  await assert.rejects(kiLokal('x', { laden: async () => new Response('{}', { status: 500 }) }), /Lokale KI 500/);
});

test('askKI: Pollinations 402 + LLM7-Limit -> eigene KI antwortet', async () => {
  process.env.OLLAMA_URL = 'http://127.0.0.1:11434';
  process.env.POLLINATIONS_MAX_TOKENS_PRO_TAG = '0';
  const echt = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('pollinations')) return new Response('{}', { status: 402 });
    if (String(url).includes('llm7')) return new Response('{"error":"Daily token quota exceeded"}', { status: 429 });
    if (String(url).includes('11434')) return new Response(JSON.stringify({ message: { content: 'Hallo aus der eigenen KI' } }));
    return echt(url);
  };
  try {
    const { askKI } = await import('../../automations/lib/ki.mjs');
    assert.equal(await askKI('Sag hallo'), 'Hallo aus der eigenen KI');
  } finally { globalThis.fetch = echt; delete process.env.OLLAMA_URL; }
  assert.equal(lokalBereit(), false);
});
