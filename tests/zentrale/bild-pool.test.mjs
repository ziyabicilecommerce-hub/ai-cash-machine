import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// Prüft die Schnittstellen-Erkennung des Bild-Pools mit nachgebauten view_api-Antworten (ohne Internet).
const py = (info) => execFileSync('python3', ['-c', `import json,sys; sys.path.insert(0,'scripts'); import bild_pool; print(bild_pool.endpunkt_von(json.loads(sys.argv[1])))`, JSON.stringify(info)]).toString().trim();

test('Bild-Pool: erkennt Text-zu-Bild-Endpunkte, nicht Bild-Bearbeitung', () => {
  const flux = { named_endpoints: { '/infer': { parameters: [{ parameter_name: 'prompt', component: 'Textbox' }, { parameter_name: 'seed', component: 'Slider' }], returns: [{ component: 'Image' }, { component: 'Number' }] } } };
  assert.equal(py(flux), '/infer');
  const galerie = { named_endpoints: { '/generate': { parameters: [{ parameter_name: 'prompt', component: 'Textbox' }], returns: [{ component: 'Gallery' }] } } };
  assert.equal(py(galerie), '/generate');
  const bearbeiten = { named_endpoints: { '/edit': { parameters: [{ parameter_name: 'image', component: 'Image' }, { parameter_name: 'prompt', component: 'Textbox' }], returns: [{ component: 'Image' }] } } };
  assert.equal(py(bearbeiten), 'None');
  assert.equal(py({ named_endpoints: { '/chat': { parameters: [{ parameter_name: 'prompt' }], returns: [{ component: 'Textbox' }] } } }), 'None');
});
