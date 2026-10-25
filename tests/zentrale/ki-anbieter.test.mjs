import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kiTextEinmal } from '../../automations/lib/kiJson.mjs';

test('KI-Kette: Cloudflare Workers AI springt ein, wenn Pollinations ausfällt (nur mit eigenem Konto)', async () => {
  const alt = { fetch: globalThis.fetch, env: { ...process.env } };
  const gefragt = [];
  globalThis.fetch = async (url) => {
    gefragt.push(String(url));
    if (String(url).includes('pollinations')) throw new Error('weg');
    if (String(url).includes('api.cloudflare.com')) return { ok: true, json: async () => ({ result: { response: '{"idee":"cf"}' } }) };
    throw new Error(`unerwartet ${url}`);
  };
  try {
    for (const k of ['GEMINI_API_KEY', 'GROQ_API_KEY', 'KI_GITHUB_MODELS', 'OLLAMA_URL']) delete process.env[k];
    Object.assign(process.env, { CF_ACCOUNT_ID: 'konto123', CF_API_TOKEN: 'geheim' });
    assert.equal(await kiTextEinmal('x', { maxTokens: 50 }), '{"idee":"cf"}');
    assert.ok(gefragt.some((u) => u.includes('/accounts/konto123/ai/run/@cf/')));
  } finally {
    globalThis.fetch = alt.fetch;
    process.env = alt.env;
  }
});
