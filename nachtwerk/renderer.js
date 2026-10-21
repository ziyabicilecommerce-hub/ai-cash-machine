import { dimensions, sceneAt, captions, clamp, totalDuration } from "./core.js";
import { GPUCinematicFX } from "./gpu-fx.js";
import { drawPerformance } from "./performance.js";

export class FilmRenderer {
  constructor() { this.images = new Map(); this.videos = new Map(); this.loading = new Map(); this.cc = []; this.projectId = null; this.gpuEnabled = false; this.gpuFX = null; this.gpuError = null; }
  async load(project) {
    this.cc = captions(project);
    await Promise.all(project.scenes.map(scene => {
      const source = scene.media?.data || "./assets/" + scene.visual + ".svg";
      const video = scene.media?.type === "video";
      const cache = video ? this.videos : this.images;
      const key = (video ? "video:" : "image:") + source;
      if (this.loading.has(key)) return this.loading.get(key);
      if (cache.has(source)) return;
      const media = video ? document.createElement("video") : new Image();
      cache.set(source, media);
      const pending = new Promise((resolve, reject) => {
        const finish = error => {
          clearTimeout(timeout);
          media.onload = media.onloadeddata = media.onerror = null;
          if (error) {
            cache.delete(source);
            if (video) { media.removeAttribute("src"); media.load(); }
            reject(error);
          } else resolve();
        };
        const timeout = setTimeout(() => finish(new Error("Ein Szenenmedium konnte nicht rechtzeitig geladen werden.")), 20000);
        media.onerror = () => finish(new Error(video ? "Ein Video konnte nicht gelesen werden." : "Ein Szenenbild konnte nicht geladen werden."));
        if (video) {
          media.muted = true; media.volume = .85; media.playsInline = true; media.preload = "auto";
          media.onloadeddata = () => finish();
        } else media.onload = () => finish();
        media.src = source;
      }).then(() => { this.loading.delete(key); }, error => { this.loading.delete(key); throw error; });
      this.loading.set(key, pending);
      return pending;
    }));
    this.projectId = project.id;
  }
  stopVideos() { for (const video of this.videos.values()) video.pause(); }
  dispose() { for (const v of this.videos.values()) { v.pause(); v.removeAttribute("src"); v.load(); } this.videos.clear(); this.images.clear(); this.gpuFX?.dispose(); this.gpuFX = null; }
  draw(canvas, project, time, { burnCaptions = true, playing = false } = {}) {
    const ctx = canvas.getContext("2d", { alpha: false });
    const w = canvas.width, h = canvas.height;
    const current = sceneAt(project, time);
    if (!current) return;
    const { scene, local } = current;
    const source = scene.media?.data || "./assets/" + scene.visual + ".svg";
    let media = this.images.get(source);
    if (scene.media?.type === "video") {
      media = this.videos.get(source);
      if (media && media.readyState >= 2) {
        const target = Number.isFinite(media.duration) && media.duration > 0 ? local % media.duration : local;
        if (Math.abs(media.currentTime - target) > 0.4 && !media.seeking) media.currentTime = Math.max(0, target);
        media.muted = !!project.audio;
        media.volume = project.audioVolume ?? .85;
        if (playing && media.paused) media.play().catch(() => {});
        if (!playing && !media.paused) media.pause();
      }
      for (const [key, other] of this.videos) if (key !== source && !other.paused) other.pause();
    }
    ctx.fillStyle = "#091213"; ctx.fillRect(0, 0, w, h);
    if (media && (media.naturalWidth || media.videoWidth)) {
      const iw = media.naturalWidth || media.videoWidth, ih = media.naturalHeight || media.videoHeight;
      const progress = clamp(local / scene.duration, 0, 1);
      const zoom = scene.camera === "push" ? 1 + progress * .08 : scene.camera === "pull" ? 1.08 - progress * .08 : scene.camera === "pan" ? 1.08 : 1;
      const scale = Math.max(w / iw, h / ih) * zoom;
      const dw = iw * scale, dh = ih * scale;
      let dx = (w - dw) / 2;
      if (scene.camera === "pan") dx += (progress - .5) * w * .055;
      ctx.drawImage(media, dx, (h - dh) / 2, dw, dh);
    }
    // In-browser procedural body rig (not photorealistic AI). Rendered in preview and browser export.
    if(scene.action && scene.action!=="none" && scene.media?.type!=="video") drawPerformance(ctx,w,h,scene.action,local,scene.duration);
    const vignette = ctx.createRadialGradient(w / 2, h * .44, h * .1, w / 2, h / 2, w * .72);
    vignette.addColorStop(0, "rgba(0,0,0,0)"); vignette.addColorStop(1, "rgba(0,0,0,.62)");
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, w, h);
    // A restrained film texture, generated locally.
    for (let i = 0; i < 90; i++) {
      const x = ((i * 137.31 + time * 73) % w);
      const y = ((i * 83.67 + time * 31) % h);
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,.035)" : "rgba(0,0,0,.06)";
      ctx.fillRect(x, y, 1, 1);
    }
    // GPU-only procedural cinema effects; works offline on a WebGL2-capable device.
    // The effect is visual compositing, not inference or animation of the actor.
    if (this.gpuEnabled && !this.gpuError) {
      try {
        if (!this.gpuFX) this.gpuFX = new GPUCinematicFX();
        this.gpuFX.draw(ctx, w, h, time, 1, project.genre === "horror" ? 1 : 0);
      } catch (error) {
        this.gpuError = error.message || "GPU nicht verfügbar";
      }
    }
    if (time < 4) {
      const alpha = Math.min(1, time / .45 + .2, (4 - time) / .7);
      ctx.save(); ctx.globalAlpha = Math.max(0, alpha);
      const shade = ctx.createLinearGradient(0, 0, 0, h * .6);
      shade.addColorStop(0, "rgba(0,0,0,.55)"); shade.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = shade; ctx.fillRect(0, 0, w, h * .6);
      ctx.textAlign = "center"; ctx.fillStyle = "#f2efe7";
      let fontSize = Math.max(22, Math.round(w * (project.format === "portrait" ? .07 : .039)));
      ctx.font = "500 " + fontSize + "px Georgia, serif";
      while (ctx.measureText(project.title).width > w * .85 && fontSize > 18) { fontSize -= 2; ctx.font = "500 " + fontSize + "px Georgia, serif"; }
      ctx.fillText(project.title, w / 2, h * .18);
      ctx.restore();
    }
    if (burnCaptions) {
      const caption = this.cc.find(c => time >= c.start && time < c.end);
      if (caption) this.drawCaption(ctx, caption.text, w, h, project.format);
    }
  }
  drawCaption(ctx, text, w, h, format) {
    const font = Math.max(16, Math.round(w * (format === "portrait" ? .038 : .023)));
    ctx.font = "500 " + font + "px system-ui, sans-serif"; ctx.textAlign = "center";
    const words = text.split(/\s+/); const lines = []; let line = "";
    for (const word of words) {
      const next = line ? line + " " + word : word;
      if (line && ctx.measureText(next).width > w * .84) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    const lh = font * 1.4; const y = h * .91 - (lines.length - 1) * lh;
    ctx.fillStyle = "rgba(0,0,0,.6)";
    const boxw = Math.min(w * .92, Math.max(...lines.map(l => ctx.measureText(l).width)) + font * 1.4);
    ctx.fillRect((w - boxw) / 2, y - font * 1.12, boxw, lines.length * lh + font * .4);
    ctx.fillStyle = "#f8f8f5";
    lines.forEach((line, i) => ctx.fillText(line, w / 2, y + i * lh));
  }
}

export function preferredMime() {
  if (!globalThis.MediaRecorder) return null;
  for (const mime of ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus", "video/webm", "video/mp4"]) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}
export function makeDrone(context, destination, duration = 600) {
  const gain = context.createGain(); gain.gain.value = .09; gain.connect(destination);
  const bass = context.createOscillator(); bass.type = "sine"; bass.frequency.value = 55;
  const upper = context.createOscillator(); upper.type = "sine"; upper.frequency.value = 82.6;
  const topGain = context.createGain(); topGain.gain.value = .22; upper.connect(topGain); topGain.connect(gain);
  bass.connect(gain);
  const lfo = context.createOscillator(); lfo.frequency.value = .12;
  const lfoGain = context.createGain(); lfoGain.gain.value = .025; lfo.connect(lfoGain); lfoGain.connect(gain.gain);
  const now = context.currentTime;
  gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(.09, now + 1.5);
  if (duration > 3) { gain.gain.setValueAtTime(.09, now + duration - 1.5); gain.gain.linearRampToValueAtTime(0, now + duration); }
  for (const osc of [bass, upper, lfo]) osc.start();
  return () => { for (const osc of [bass, upper, lfo]) { try { osc.stop(); } catch {} } gain.disconnect(); };
}
export async function renderBrowser(project, { quality = 720, burnCaptions = true, gpuEffects = false, signal, onProgress = () => {} } = {}) {
  if (!HTMLCanvasElement.prototype.captureStream || !globalThis.MediaRecorder) throw new Error("Dieser Browser unterstützt keinen direkten Videoexport. Nutze Chrome/Edge am Computer oder den lokalen MP4-Export.");
  const mime = preferredMime();
  if (mime === null) throw new Error("Videoaufnahme ist in diesem Browser nicht verfügbar.");
  const canvas = document.createElement("canvas");
  const size = dimensions(project.format, quality); canvas.width = size.width; canvas.height = size.height;
  const renderer = new FilmRenderer();
  renderer.gpuEnabled = !!gpuEffects;
  const duration = totalDuration(project);
  let stream, context, wakeLock, stopDrone, audioSource, recorder, frame;
  try {
    await renderer.load(project);
    if (signal?.aborted) throw new DOMException("Export abgebrochen.", "AbortError");
    renderer.draw(canvas, project, 0, { burnCaptions });
    stream = canvas.captureStream(24);
    const sceneVideoAudio = !project.audio && project.scenes.some(s => s.media?.type === "video");
    if (project.audio || project.ambient || sceneVideoAudio) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) throw new Error("Dieser Browser kann die Tonspur nicht exportieren.");
      context = new AudioContext(); await context.resume();
      const out = context.createMediaStreamDestination();
      if (project.audio) {
        const data = await (await fetch(project.audio.data)).arrayBuffer();
        const buffer = await context.decodeAudioData(data);
        audioSource = context.createBufferSource(); audioSource.buffer = buffer;
        const volume = context.createGain(); volume.gain.value = project.audioVolume ?? .85;
        audioSource.connect(volume); volume.connect(out);
      }
      if (sceneVideoAudio) {
        // The preview plays embedded MP4 sound. A canvas capture does not carry that sound,
        // so route the media elements through WebAudio into the recording stream.
        for (const video of renderer.videos.values()) {
          const source = context.createMediaElementSource(video);
          const level = context.createGain(); level.gain.value = project.audioVolume ?? .85;
          source.connect(level); level.connect(out);
        }
      }
      for (const track of out.stream.getAudioTracks()) stream.addTrack(track);
      // Start the ambient bed with the recorder, after the voice has decoded.
      if (project.ambient) stopDrone = () => {};
      context.recordingDestination = out;
    }
    try { wakeLock = await navigator.wakeLock?.request("screen"); } catch {}
    const chunks = [];
    recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: Number(quality) === 480 ? 1800000 : 3500000 });
    const result = new Promise((resolve, reject) => {
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      recorder.onerror = () => reject(new Error("Der Browser konnte das Video nicht fertigstellen."));
      recorder.onstop = () => {
        if (signal?.aborted) return reject(new DOMException("Export abgebrochen.", "AbortError"));
        const blob = new Blob(chunks, { type: recorder.mimeType || mime || "video/webm" });
        if (!blob.size) return reject(new Error("Der Browser hat keine Videodaten aufgenommen. Bitte den lokalen MP4-Export verwenden."));
        resolve(blob);
      };
    });
    const abort = () => { if (recorder.state !== "inactive") recorder.stop(); };
    signal?.addEventListener("abort", abort, { once: true });
    // Cancellation can happen while audio is decoding or a wake lock is requested.
    // Check again after registering the listener, before any recording starts.
    try {
      if (signal?.aborted) throw new DOMException("Export abgebrochen.", "AbortError");
      recorder.start(500);
      audioSource?.start();
      if (project.ambient) stopDrone = makeDrone(context, context.recordingDestination, duration);
      const started = performance.now();
      const tick = () => {
        const elapsed = (performance.now() - started) / 1000;
        renderer.draw(canvas, project, Math.min(elapsed, duration - .001), { burnCaptions, playing: true });
        onProgress(Math.min(1, elapsed / duration));
        if (elapsed >= duration) { if (recorder.state !== "inactive") recorder.stop(); }
        else if (recorder.state !== "inactive") frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      return await result;
    } finally { signal?.removeEventListener("abort", abort); }
  } finally {
    cancelAnimationFrame(frame);
    if (recorder?.state === "recording") recorder.stop();
    stopDrone?.();
    try { audioSource?.stop(); } catch {}
    stream?.getTracks().forEach(t => t.stop());
    await context?.close().catch(() => {});
    await wakeLock?.release().catch(() => {});
    renderer.dispose();
  }
}
