// Testet den Ultimativ-MCP ueber stdio: node scripts/mcp-ultimativ-test.mjs '[["werkzeug",{...}]]'
import { spawn } from 'node:child_process';
const p = spawn('node', ['mcp-ultimativ/server.mjs'], { cwd: process.cwd() });
let puffer = ''; const warte = new Map();
p.stdout.on('data', (d) => { puffer += d; let i; while ((i = puffer.indexOf('\n')) >= 0) { const m = JSON.parse(puffer.slice(0, i)); puffer = puffer.slice(i + 1); warte.get(m.id)?.(m); } });
let n = 0; const rpc = (method, params) => new Promise((r) => { const id = ++n; warte.set(id, r); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const init = await rpc('initialize', { protocolVersion: '2025-06-18' }); console.log('init:', init.result.serverInfo.name);
const liste = await rpc('tools/list'); console.log('werkzeuge:', liste.result.tools.length, liste.result.tools.map((t) => t.name).join(', '));
const tests = process.argv.slice(2).length ? JSON.parse(process.argv[2]) : [];
for (const [name, args] of tests) {
  const r = await rpc('tools/call', { name, arguments: args });
  console.log(`— ${name}: ${r.result.isError ? 'FEHLER ' : ''}${(r.result.content.at(-1).text || '').replace(/\s+/g, ' ').slice(0, 220)}`);
}
p.kill();
