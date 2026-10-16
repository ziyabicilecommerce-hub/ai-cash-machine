// Eigene Clips: der Dateiname entscheidet, zu welchem Video der Clip passt; jeder nur einmal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eigenenClipWaehlen, woerter } from '../../automations/lib/eigeneClips.mjs';

test('passender eigener Clip wird über den Dateinamen gefunden', () => {
  const dateien = ['schwarzes-loch.mp4', 'biene-zeitlupe.mp4', 'vulkan.mov', 'notizen.txt'];
  assert.equal(eigenenClipWaehlen(dateien, 'Sturz ins Schwarze Loch. Was passiert, wenn du in ein Schwarzes Loch fällst?'), 'schwarzes-loch.mp4');
  assert.equal(eigenenClipWaehlen(dateien, 'Wenn alle Bienen verschwinden'), 'biene-zeitlupe.mp4');
  assert.equal(eigenenClipWaehlen(dateien, 'Der Supervulkan bricht aus'), 'vulkan.mov');
  assert.equal(eigenenClipWaehlen(dateien, 'Ein Tag als Faultier'), null);
  assert.equal(eigenenClipWaehlen(dateien, 'Sturz ins Schwarze Loch', ['schwarzes-loch.mp4']), null, 'jeder Clip nur einmal');
  assert.ok(!woerter('Was passiert, wenn').length, 'Füllwörter zählen nicht');
});
