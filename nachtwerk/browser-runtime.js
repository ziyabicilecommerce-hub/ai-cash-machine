/** Browser-only capability detection. A WebGPU adapter is NOT a video model. */
export function assessBrowser(report) {
  const {secure, webgpu, webgl2, recording, storage, gpuBufferMiB} = report;
  const warnings = [];
  if (!secure) warnings.push('WebGPU erfordert HTTPS oder localhost.');
  if (!webgpu) warnings.push('Kein nutzbarer WebGPU-Adapter; browserinterne KI-Inferenz derzeit nicht möglich.');
  if (!recording) warnings.push('Dieser Browser kann den Film nicht mit MediaRecorder exportieren.');
  if (!storage) warnings.push('Projekt-Autospeicherung ist nicht bestätigt.');
  // Adapter limits do not indicate dedicated VRAM, compute throughput or model support.
  if (webgpu && gpuBufferMiB < 256) warnings.push('Niedriges WebGPU-Pufferlimit; große Modelle können scheitern.');
  return {
    mode: webgpu ? 'WebGPU vorhanden – keine Video-KI installiert' : 'Browser-Editor / Videoimport',
    browserVideoGeneration: false,
    localModelInstalled: false,
    canEdit: true,
    canExport: recording,
    warnings,
    recommendation: webgpu
      ? 'Nächster Schritt: separat getestete WebGPU-Video-Modellruntime integrieren; aktuell nur Schnitt und Videoimport.'
      : 'Für echte Generierung einen lokalen GPU-Dienst wie ComfyUI verwenden; die Bedienung bleibt im Browser.'
  };
}

export async function probeBrowser(env = globalThis) {
  const nav = env.navigator || {};
  const win = env.window || env;
  let webgl2 = false;
  try { webgl2 = !!env.document?.createElement('canvas')?.getContext('webgl2'); } catch {}
  let adapter = null;
  if (win.isSecureContext !== false && nav.gpu?.requestAdapter) {
    try { adapter = await nav.gpu.requestAdapter({powerPreference:'high-performance'}); } catch {}
  }
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  const supported = types.filter(type => {
    try { return !!env.MediaRecorder?.isTypeSupported(type); } catch { return false; }
  });
  let storage = false;
  try { storage = !!win.indexedDB; } catch {}
  const report = {
    secure: win.isSecureContext !== false,
    webgpu: !!adapter,
    webgl2,
    recording: supported.length > 0,
    formats: supported,
    storage,
    gpuBufferMiB: adapter ? Math.floor(Number(adapter.limits?.maxBufferSize || 0) / 1048576) : 0,
    maxStorageBufferMiB: adapter ? Math.floor(Number(adapter.limits?.maxStorageBufferBindingSize || 0) / 1048576) : 0,
    // navigator.deviceMemory is an approximate RAM hint, not GPU VRAM.
    ramHintGiB: Number(nav.deviceMemory) || null
  };
  return { ...report, assessment: assessBrowser(report) };
}

export function formatBrowserReport(r) {
  const value = bool => bool ? 'Ja' : 'Nein';
  return [
    `Sicherer Ursprung (HTTPS/localhost): ${value(r.secure)}`,
    `WebGPU-Adapter: ${value(r.webgpu)}`,
    `WebGL2-Effekte: ${value(r.webgl2)}`,
    `Browser-Videoexport: ${value(r.recording)}${r.formats.length ? ` (${r.formats.join(', ')})` : ''}`,
    `Lokale Projektablage (IndexedDB verfügbar): ${value(r.storage)}`,
    `WebGPU maxBufferSize: ${r.webgpu ? `${r.gpuBufferMiB} MiB (KEIN VRAM-Wert)` : 'unbekannt'}`,
    `WebGPU maxStorageBufferBindingSize: ${r.webgpu ? `${r.maxStorageBufferMiB} MiB` : 'unbekannt'}`,
    `RAM-Schätzung des Browsers: ${r.ramHintGiB ? `${r.ramHintGiB} GiB` : 'nicht verfügbar'} (KEIN VRAM-Wert)`,
    `Echte Video-KI direkt im Browser: NEIN – keine Modellruntime mitgeliefert`,
    `Modus: ${r.assessment.mode}`,
    `Empfehlung: ${r.assessment.recommendation}`,
    ...r.assessment.warnings.map(x => `Hinweis: ${x}`)
  ].join('\n');
}
