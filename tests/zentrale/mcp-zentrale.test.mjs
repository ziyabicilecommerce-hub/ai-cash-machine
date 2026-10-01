// Ultimativ-MCP, Teil 4: Zentrale-Werkzeuge (Engpass-Rechnung lokal, Agenten-Start nur aus fester Liste).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WERKZEUGE4, AGENTEN, agentStarten } from '../../mcp-ultimativ/werkzeuge4.mjs';

const w = (name) => WERKZEUGE4.find((x) => x.name === name);

test('alle Zentrale-Werkzeuge haben Beschreibung und Schema', () => {
  assert.equal(WERKZEUGE4.length, 10);
  for (const x of WERKZEUGE4) { assert.ok(x.description.length > 20, x.name); assert.equal(x.inputSchema.type, 'object'); }
});

test('engpass_rechnen rechnet das NEULAND-Beispiel lokal', async () => {
  const r = await w('engpass_rechnen').fn({ auftraege: 45, schritte: [{ id: 'a', name: 'Vorbereitung', verfuegbar: 60, jeAuftrag: 1 }, { id: 'b', name: 'Bearbeitung', verfuegbar: 40, jeAuftrag: 2 }, { id: 'c', name: 'Abschluss', verfuegbar: 30, jeAuftrag: 0.75 }], von: 'a', nach: 'b', menge: 12 });
  assert.equal(JSON.stringify([r.vorher_moeglich, r.nachher_moeglich, r.veraenderung]), '[20,26,6]');
  assert.equal(r.engpass_nachher[0], 'Bearbeitung');
});

test('agent_starten: nur erlaubte Agenten, ohne Token klare Meldung, mit Token korrekter Dispatch', async () => {
  await assert.rejects(() => agentStarten({ agent: 'alles-loeschen' }), /Unbekannter Agent/);
  const alt = process.env.GITHUB_TOKEN; delete process.env.GITHUB_TOKEN;
  await assert.rejects(() => agentStarten({ agent: 'shop-doktor' }), /GITHUB_TOKEN/);
  process.env.GITHUB_TOKEN = 'test-token';
  let anfrage;
  const r = await agentStarten({ agent: 'video-fabrik', anzahl: 99, ziel: 3 }, async (url, o) => { anfrage = { url, o }; return new Response(null, { status: 204 }); });
  if (alt) process.env.GITHUB_TOKEN = alt; else delete process.env.GITHUB_TOKEN;
  assert.match(anfrage.url, /actions\/workflows\/automation-94-video-fabrik\.yml\/dispatches$/);
  assert.equal(anfrage.o.body, JSON.stringify({ ref: 'main', inputs: { anzahl: '10' } }), 'Anzahl begrenzt, fremde Eingaben verworfen');
  assert.equal(r.gestartet, 'video-fabrik');
  assert.ok(Object.keys(AGENTEN).includes('kommentar-agent'));
});
