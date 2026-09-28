// Minimaler MCP-Client fuer Remote-Server (Streamable HTTP). Wird vom
// Live-Check (#92) und vom Router-MCP genutzt. Sendet nie eigene Zugangsdaten.
const PROTOKOLL = '2025-06-18';
const CLIENT = { name: 'cashmachine-mcp-router', version: '1.0.0' };

const PRIVATE_HOSTS = /^(localhost|.*\.local|.*\.internal|.*\.localhost|0\.0\.0\.0|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|\[?::1\]?|\[?f[cd][0-9a-f:]*\]?|\[?fe80:[0-9a-f:]*\]?)$/i;

export function sichereZielUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (PRIVATE_HOSTS.test(u.hostname)) return null;
  if (/[{}]/.test(decodeURIComponent(u.href))) return null;
  return u.href;
}

async function leseAntwort(res, id, timeoutMs) {
  const typ = res.headers.get('content-type') || '';
  if (typ.includes('application/json')) {
    const body = await res.json();
    const liste = Array.isArray(body) ? body : [body];
    return liste.find((m) => m && m.id === id) || null;
  }
  if (!typ.includes('text/event-stream') || !res.body) return null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let puffer = '';
  const ende = Date.now() + timeoutMs;
  try {
    while (Date.now() < ende) {
      const { value, done } = await reader.read();
      if (done) break;
      puffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = puffer.indexOf('\n\n')) >= 0) {
        const block = puffer.slice(0, idx);
        puffer = puffer.slice(idx + 2);
        const daten = block.split('\n').filter((z) => z.startsWith('data:')).map((z) => z.slice(5).trim()).join('');
        if (!daten) continue;
        try {
          const msg = JSON.parse(daten);
          if (msg && msg.id === id) return msg;
        } catch {
          /* unvollstaendiger Block */
        }
      }
      if (puffer.length > 5_000_000) break;
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return null;
}

export class RemoteMcp {
  constructor(url, { timeoutMs = 15000 } = {}) {
    const sicher = sichereZielUrl(url);
    if (!sicher) throw new Error('Ziel-URL nicht erlaubt (nur oeffentliches https ohne Platzhalter).');
    this.url = sicher;
    this.timeoutMs = timeoutMs;
    this.session = '';
    this.naechsteId = 1;
  }

  async senden(method, params, { benachrichtigung = false } = {}) {
    const id = benachrichtigung ? undefined : this.naechsteId++;
    const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': PROTOKOLL };
    if (this.session) headers['mcp-session-id'] = this.session;
    const res = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', ...(id !== undefined ? { id } : {}), method, ...(params ? { params } : {}) }),
      redirect: 'error',
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.session = sid;
    if (res.status === 401 || res.status === 403 || res.headers.get('www-authenticate')) {
      const err = new Error(`Login noetig (HTTP ${res.status})`);
      err.auth = true;
      throw err;
    }
    if (benachrichtigung) {
      res.body?.cancel().catch(() => {});
      return null;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const msg = await leseAntwort(res, id, this.timeoutMs);
    if (!msg) throw new Error('Keine gueltige MCP-Antwort');
    if (msg.error) {
      const err = new Error(`MCP-Fehler: ${msg.error.message || JSON.stringify(msg.error)}`.slice(0, 300));
      if (/auth|unauthori|api.?key|token|login/i.test(err.message)) err.auth = true;
      throw err;
    }
    return msg.result;
  }

  async verbinden() {
    const info = await this.senden('initialize', { protocolVersion: PROTOKOLL, capabilities: {}, clientInfo: CLIENT });
    await this.senden('notifications/initialized', null, { benachrichtigung: true }).catch(() => {});
    return info;
  }

  async werkzeuge() {
    const alle = [];
    let cursor;
    for (let i = 0; i < 10; i++) {
      const r = await this.senden('tools/list', cursor ? { cursor } : {});
      alle.push(...(r?.tools || []));
      cursor = r?.nextCursor;
      if (!cursor) break;
    }
    return alle;
  }

  async aufrufen(name, argumente) {
    return this.senden('tools/call', { name, arguments: argumente || {} });
  }
}
