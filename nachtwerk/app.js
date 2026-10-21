import { validateVideoFile } from "./video-validation.js";
import { exampleProject, createStoryboard, validateProject, sceneAt, captions, toSrt, aiProject, dimensions, totalDuration, formatTime, uid, VISUALS, escapeHtml, clamp } from "./core.js";
import { FilmRenderer, renderBrowser, makeDrone, preferredMime } from "./renderer.js";
import { REAL_FOOTAGE } from "./real-footage.js";
import { sortByShotNumber, inspectFilm, germanVoices } from "./director.js";
import { gpuCapabilities } from "./gpu-fx.js";
import { ACTIONS } from "./performance.js";
import { probeBrowser, formatBrowserReport } from "./browser-runtime.js";

const $ = id => document.getElementById(id);
const names = { corridor: "Der Korridor", forest: "Der Wald", house: "Das Haus", stairs: "Die Treppe", window: "Das Fenster", void: "Die Rezeption" };
let project = exampleProject(), selected = 0, currentTime = 0, playing = false, startedAt = 0, playbackStart = 0;
let frame, saveTimer, toastTimer, db, previewAudio, audioContext, stopDrone, recording, recordingStream, recordingTimer;
let bridge = null, workflow = null, exporting = false, exportAbort, currentJob = null, exportUrl;
const renderer = new FilmRenderer();
let gpuCinemaEnabled = true;
try { gpuCinemaEnabled = localStorage.getItem("nachtwerk-gpu-cinema") !== "off"; } catch {}
renderer.gpuEnabled = gpuCinemaEnabled;

const canvas = $("previewCanvas");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function updateGPUStatus() {
  const status = $("gpuStatus");
  status.textContent = "Grafikeinheit wird geprüft …";
  const result = await gpuCapabilities();
  $("gpuCinema").disabled = !result.webgl2;
  $("gpuCinema").checked = result.webgl2 && gpuCinemaEnabled;
  renderer.gpuEnabled = gpuCinemaEnabled && result.webgl2;
  status.textContent = result.webgl2
    ? `✓ WebGL2 GPU-Rendering bereit · WebGPU ${result.webgpu ? "vorhanden" : "nicht vorhanden"} · Keine Installation erforderlich.`
    : "⚠ Keine Browser-GPU verfügbar. Die normale 2D-Vorschau funktioniert weiterhin.";
  draw();
}
$("gpuCinema").checked = gpuCinemaEnabled;
$("gpuCinema").addEventListener("change", () => {
  gpuCinemaEnabled = $("gpuCinema").checked;
  renderer.gpuEnabled = gpuCinemaEnabled;
  try { localStorage.setItem("nachtwerk-gpu-cinema", gpuCinemaEnabled ? "on" : "off"); } catch {}
  $("gpuStatus").textContent = gpuCinemaEnabled ? "GPU-Kinomodus aktiv: Filmlicht, Regen und Nebel." : "GPU-Kinomodus ausgeschaltet.";
  draw();
});
$("testGPU").addEventListener("click", updateGPUStatus);
updateGPUStatus().catch(() => { $("gpuStatus").textContent = "GPU-Prüfung nicht verfügbar. Normale Vorschau bleibt nutzbar."; });


// Browser-only runtime diagnosis: this detects capabilities, NOT AI model availability.
async function checkBrowserRuntime() {
  const button = $("checkBrowserRuntime");
  button.disabled = true;
  $("browserRuntimeStatus").textContent = "Browser-Fähigkeiten werden geprüft …";
  try {
    const report = await probeBrowser();
    $("browserRuntimeStatus").textContent = formatBrowserReport(report);
    $("browserRuntimeStatus").dataset.webgpu = String(report.webgpu);
    $("exportBrowser").disabled = !report.recording;
    if (!report.recording) $("exportBrowser").title = "MediaRecorder wird von diesem Browser nicht unterstützt.";
  } catch (error) {
    $("browserRuntimeStatus").textContent = "Diagnose fehlgeschlagen: " + error.message;
  } finally { button.disabled = false; }
}
$("checkBrowserRuntime").addEventListener("click", checkBrowserRuntime);
checkBrowserRuntime();

// Import inspection is deliberately not called video generation.
let inspectedVideoUrl = null;
$("verifiedVideoInput").addEventListener("change", () => {
  const file = $("verifiedVideoInput").files?.[0];
  const result = validateVideoFile(file);
  const video = $("verifiedVideoPreview");
  const status = $("verifiedVideoStatus");
  video.pause(); video.removeAttribute("src"); video.style.display = "none";
  if (inspectedVideoUrl) URL.revokeObjectURL(inspectedVideoUrl);
  inspectedVideoUrl = null;
  status.textContent = result.reason;
  if (!result.ok) return;
  inspectedVideoUrl = URL.createObjectURL(file);
  video.src = inspectedVideoUrl;
  video.onloadedmetadata = () => {
    if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) {
      status.textContent = "Keine gültige Videospur erkannt."; return;
    }
    video.style.display = "block";
    status.textContent = `Abspielbares Video: ${video.videoWidth}×${video.videoHeight}, ${video.duration.toFixed(2)} s. KI-Ursprung und tatsächliche Motivbewegung nicht automatisch bestätigt.`;
  };
  video.onerror = () => { status.textContent = "Videodekodierung im Browser fehlgeschlagen."; video.style.display = "none"; };
});

const icon = name => '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
const scene = () => project.scenes[selected];

function toast(message) {
  $("toast").textContent = message; $("toast").classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $("toast").classList.remove("show"), 6000);
}
function showView(view) {
  for (const name of ["studio", "library", "settings"]) $(name + "View").hidden = name !== view;
  document.querySelectorAll("[data-view]").forEach(button => {
    button.classList.toggle("active", button.dataset.view === view);
    if (button.dataset.view === view) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
  });
  if (view !== "studio") pause();
  if (view === "library") renderLibrary();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("nachtwerk-studio", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("projects");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readSaved() {
  db = await openDb();
  return await new Promise((resolve, reject) => {
    const request = db.transaction("projects").objectStore("projects").get("current");
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
function save(showToast = false) {
  clearTimeout(saveTimer);
  const commit = async () => {
    try {
      if (!db) db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction("projects", "readwrite"); tx.objectStore("projects").put(project, "current");
        tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
      });
      if (showToast) toast("Projekt auf diesem Gerät gespeichert.");
      $("saveProject").title = "Auf diesem Gerät gespeichert";
    } catch {
      toast("Browserspeicher voll oder nicht verfügbar. Sichere dein Projekt als Datei.");
    }
  };
  if (showToast) return commit();
  saveTimer = setTimeout(commit, 400);
}
function download(blob, filename) {
  const link = document.createElement("a"); const url = URL.createObjectURL(blob);
  link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const filename = () => (project.title.replace(/[^a-z0-9äöüß_-]+/gi, "-").replace(/^-|-$/g, "") || "nachtwerk").slice(0, 80);
function downloadProject() { download(new Blob([JSON.stringify(project, null, 2)], { type: "application/json" }), filename() + ".nachtwerk.json"); }
function fileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error("Die Datei konnte nicht gelesen werden.")); reader.readAsDataURL(file);
  });
}
async function readMedia(file, kind) {
  if (!file) return null;
  if (file.size > 32 * 1024 * 1024) throw new Error("Bitte eine Datei bis 32 MB wählen.");
  const allowed = kind === "audio" ? /^audio\// : /^(image\/(png|jpeg|webp|gif|avif)|video\/(mp4|webm|ogg|quicktime))$/;
  if (!allowed.test(file.type)) throw new Error("Bitte ein unterstütztes " + (kind === "audio" ? "Audioformat" : "Bild- oder Videoformat") + " wählen.");
  return { name: file.name || "Aufnahme.webm", type: kind === "audio" ? "audio" : file.type.startsWith("video/") ? "video" : "image", data: await fileData(file) };
}
function renderScenes() {
  $("sceneList").innerHTML = project.scenes.map((s, i) => {
    const thumb = s.media?.type === "image" ? s.media.data : "./assets/" + s.visual + ".png";
    return '<button class="scene-card ' + (i === selected ? "selected active" : "") + '" type="button" data-scene="' + i + '" draggable="true" aria-pressed="' + (i === selected) + '" aria-label="Szene ' + (i + 1) + ': ' + escapeHtml(s.title) + '">' +
      '<img class="scene-thumb" src="' + escapeHtml(thumb) + '" alt="" loading="lazy">' +
      '<span class="scene-number">' + String(i + 1).padStart(2, "0") + '</span><span class="scene-duration">' + formatTime(s.duration) + '</span>' +
      '<span class="scene-meta"><strong>' + escapeHtml(s.title) + '</strong><small>' + (s.media ? s.media.type === "video" ? "Eigenes Video" : "Eigenes Bild" : "Illustration · " + names[s.visual]) + '</small></span></button>';
  }).join("");
  $("sceneCount").textContent = project.scenes.length + " Szenen · " + formatTime(totalDuration(project));
}
function renderEditor() {
  const s = scene();
  for (const [id, key] of [["sceneTitle", "title"], ["sceneNarration", "narration"], ["scenePrompt", "prompt"], ["sceneDuration", "duration"], ["camera", "camera"], ["visual", "visual"]]) $(id).value = s[key];
  $("sceneAction").value = ACTIONS[s.action] ? s.action : "none";
  $("mediaStatus").textContent = s.media ? s.media.name : "Original-Illustration · durch eigenes Bild oder Video ersetzbar";
  $("removeSceneMedia").disabled = !s.media;
  $("deleteScene").disabled = project.scenes.length <= 1;
  $("moveSceneLeft").disabled = selected === 0;
  $("moveSceneRight").disabled = selected === project.scenes.length - 1;
}
function renderAudio() {
  $("audioStatus").textContent = project.audio ? project.audio.name + " · wird im Film mitexportiert" : "Ohne Erzählspur: Untertitel und optional Raumklang. Eigene Stimme aufnehmen oder hochladen.";
  $("audioVolume").value = project.audioVolume;
  $("ambient").checked = project.ambient;
  $("removeAudio").hidden = !project.audio;
}
async function refresh({ all = false } = {}) {
  renderScenes(); renderEditor(); renderAudio(); renderRealFootageGuide();
  if (all) {
    $("projectTitle").value = project.title; $("storyInput").value = project.input;
    $("genre").value = project.genre; $("format").value = project.format;
    const duration = totalDuration(project); $("duration").value = duration <= 60 ? "60" : duration <= 180 ? "180" : duration <= 300 ? "300" : "600";
  }
  const d = dimensions(project.format); canvas.width = d.width; canvas.height = d.height;
  canvas.parentElement.style.aspectRatio = d.width + " / " + d.height;
  canvas.parentElement.classList.toggle("portrait-preview", project.format === "portrait");
  $("seek").max = totalDuration(project);
  currentTime = Math.min(currentTime, totalDuration(project) - .001);
  try { await renderer.load(project); draw(); } catch (error) { toast(error.message); }
}
function draw() {
  renderer.cc = captions(project);
  renderer.draw(canvas, project, currentTime, { playing });
  $("seek").value = currentTime;
  $("timecode").textContent = formatTime(currentTime) + " / " + formatTime(totalDuration(project));
  $("previewCaption").textContent = "";
}
function selectScene(index, seek = true) {
  selected = Math.max(0, Math.min(project.scenes.length - 1, index));
  if (seek) { pause(); currentTime = project.scenes.slice(0, selected).reduce((sum, s) => sum + s.duration, 0); }
  renderScenes(); renderEditor(); draw();
}
function pause() {
  if (window.speechSynthesis?.speaking) window.speechSynthesis.cancel();
  playing = false; cancelAnimationFrame(frame); renderer.stopVideos(); previewAudio?.pause();
  stopDrone?.(); stopDrone = null; audioContext?.close().catch(() => {}); audioContext = null;
  $("playPause").innerHTML = icon("play"); $("playPause").setAttribute("aria-label", "Vorschau abspielen");
}
async function play() {
  if (playing) return pause();
  if (exporting) return;
  try {
    await renderer.load(project);
    if (currentTime >= totalDuration(project) - .1) currentTime = 0;
    if (project.audio) {
      previewAudio?.pause(); previewAudio = new Audio(project.audio.data);
      previewAudio.volume = project.audioVolume; previewAudio.currentTime = currentTime;
      await previewAudio.play().catch(() => toast("Tonwiedergabe wurde vom Browser blockiert."));
    }
    if (project.ambient && (window.AudioContext || window.webkitAudioContext)) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      await audioContext.resume(); stopDrone = makeDrone(audioContext, audioContext.destination, totalDuration(project) - currentTime);
    }
    playing = true; startedAt = performance.now(); playbackStart = currentTime;
    $("playPause").textContent = "Ⅱ"; $("playPause").setAttribute("aria-label", "Vorschau pausieren");
    const tick = () => {
      currentTime = playbackStart + (performance.now() - startedAt) / 1000;
      if (currentTime >= totalDuration(project)) { currentTime = totalDuration(project) - .001; draw(); pause(); return; }
      draw(); frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  } catch (error) { pause(); toast(error.message); }
}
function renderLibrary() {
  $("assetLibrary").innerHTML = VISUALS.map(visual => '<article class="asset-card"><img src="./assets/' + visual + '.png" alt="' + names[visual] + '" loading="lazy"><div><h3>' + names[visual] + '</h3><p>Original-Illustration. Mit Kamerafahrt in deiner Szene verwenden.</p><button class="button button-quiet button-small" data-visual="' + visual + '">Für aktuelle Szene verwenden ' + icon("arrow") + '</button></div></article>').join("");
}
async function replaceProject(next) {
  pause(); project = next; selected = 0; currentTime = 0; await refresh({ all: true }); save(); showView("studio");
}
function moveScene(direction) {
  const index = selected + direction;
  if (index < 0 || index >= project.scenes.length) return;
  [project.scenes[index], project.scenes[selected]] = [project.scenes[selected], project.scenes[index]];
  selectScene(index); save();
}
function bridgeBase() {
  const url = new URL($("bridgeUrl").value.trim() || "http://127.0.0.1:8787");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Das Studio-Kit muss auf localhost oder 127.0.0.1 laufen.");
  return url.origin;
}
async function api(path, body, timeout = 130000) {
  const response = await fetch(bridgeBase() + path, {
    method: body === undefined ? "GET" : "POST", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(timeout), credentials: "omit"
  });
  const result = await response.json();
  if (!response.ok || result.error && !["error", "cancelled"].includes(result.status)) throw new Error(result.error || "Das lokale Studio konnte die Anfrage nicht ausführen.");
  return result;
}
async function connect() {
  $("connectBridge").disabled = true; $("bridgeStatus").textContent = "Verbindung wird geprüft …";
  try {
    bridge = await api("/api/health", undefined, 10000);
    const voiceStatus = bridge.piper ? "realistisch" : bridge.espeak ? "einfach" : "nicht eingerichtet";
    $("bridgeStatus").textContent = "Verbunden · MP4 " + (bridge.ffmpeg ? "bereit" : "FFmpeg fehlt") + " · Text-KI " + (bridge.ollama ? "bereit" : "nicht eingerichtet") + " · Video-KI " + (bridge.comfy ? "bereit" : "nicht eingerichtet") + " · Stimme " + voiceStatus + " · Avatar " + (bridge.animate ? "bereit" : "optional");
    if (bridge.models?.length) $("ollamaModel").innerHTML = bridge.models.map(model => '<option>' + escapeHtml(model) + '</option>').join("");
    try { localStorage.setItem("nachtwerk-bridge", bridgeBase()); } catch {}
    toast("Lokales Studio verbunden.");
  } catch (error) {
    bridge = null;
    $("bridgeStatus").textContent = "Nicht erreichbar. Starte das Kit und öffne http://127.0.0.1:8787 auf demselben Rechner. Die Online-Seite kann lokale Verbindungen blockieren.";
    toast("Studio-Kit nicht erreichbar. Die Browserfunktionen bleiben verfügbar.");
  } finally { $("connectBridge").disabled = false; }
}
async function requireBridge(feature) {
  if (!bridge) {
    showView("settings"); toast("Für " + feature + " zuerst das lokale Studio-Kit verbinden.");
    return false;
  }
  return true;
}
async function localMedia(output) {
  if (!output?.url?.startsWith("/api/media/")) throw new Error("Ungültige lokale Mediendatei.");
  const response = await fetch(bridgeBase() + output.url);
  if (!response.ok) throw new Error("Lokale Mediendatei konnte nicht geladen werden.");
  const blob = await response.blob();
  return { name: output.name || "Lokale KI-Ausgabe", type: output.type, data: await fileData(blob) };
}
async function uploadLocal(media) {
  const comma = media.data.indexOf(","); const mime = media.data.slice(5, comma).split(";")[0];
  if (!["image/png", "image/jpeg", "image/webp", "video/mp4", "video/webm", "video/quicktime", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/ogg", "audio/mp4", "audio/webm"].includes(mime)) {
    throw new Error(media.name + ": Für den lokalen Export bitte PNG/JPEG/WebP, MP4/WebM/MOV oder WAV/MP3/OGG/M4A verwenden. Alternativ im Browser exportieren.");
  }
  return await api("/api/upload", { name: media.name, mime, data: media.data.slice(comma + 1) });
}
async function withBusy(button, task, busyLabel = "Wird erstellt …") {
  if (button.disabled) return;
  const html = button.innerHTML; button.disabled = true; button.textContent = busyLabel;
  try { await task(); } catch (error) { toast(error.message || "Die Aktion ist fehlgeschlagen."); }
  finally { button.disabled = false; button.innerHTML = html; }
}
function exportState(busy, message) {
  exporting = busy;
  $("exportStatus").textContent = message;
  $("exportBrowser").disabled = busy; $("exportMp4").disabled = busy; $("closeExport").disabled = busy; $("cancelExport").hidden = !busy;
  $("studioView").inert = busy; $("libraryView").inert = busy; $("settingsView").inert = busy;
}
function readyDownload(blob) {
  if (exportUrl) URL.revokeObjectURL(exportUrl);
  exportUrl = URL.createObjectURL(blob);
  $("exportDownload").href = exportUrl; $("exportDownload").download = filename() + (blob.type.includes("mp4") ? ".mp4" : ".webm"); $("exportDownload").hidden = false;
  $("exportProgress").value = 100;
  exportState(false, "Dein Film ist fertig. Jetzt herunterladen.");
}
async function exportBrowser() {
  if (exporting) return;
  pause(); exportAbort = new AbortController(); $("exportDownload").hidden = true; $("exportProgress").value = 0;
  exportState(true, "Medien werden vorbereitet …");
  try {
    const copy = structuredClone(project);
    const result = await renderBrowser(copy, { quality: Number($("exportQuality").value), burnCaptions: $("burnCaptions").checked, signal: exportAbort.signal,
      gpuEffects: gpuCinemaEnabled,
      onProgress: progress => { $("exportProgress").value = progress * 100; $("exportStatus").textContent = "Film wird aufgenommen · " + Math.round(progress * 100) + "% · Tab im Vordergrund lassen"; } });
    readyDownload(result);
  } catch (error) { exportState(false, error.name === "AbortError" ? "Export abgebrochen. Dein Projekt bleibt erhalten." : error.message); }
  finally { exportAbort = null; }
}
async function exportLocal() {
  if (exporting) return;
  if (!bridge?.ffmpeg) { $("exportDialog").close(); showView("settings"); toast("Für MP4 zuerst das lokale Studio-Kit mit FFmpeg verbinden."); return; }
  pause(); $("exportDownload").hidden = true; $("exportProgress").value = 0;
  exportAbort = new AbortController(); exportState(true, "Medien werden an dein lokales Studio übertragen …");
  try {
    const input = structuredClone(project);
    input.format = { landscape: "16:9", portrait: "9:16", square: "1:1" }[input.format];
    input.burnCaptions = $("burnCaptions").checked;
    for (const item of input.scenes) {
      if (exportAbort.signal.aborted) throw new DOMException("Abgebrochen", "AbortError");
      if (item.media) item.mediaId = (await uploadLocal(item.media)).id;
      delete item.media;
    }
    if (input.audio) input.audioId = (await uploadLocal(input.audio)).id;
    delete input.audio;
    if (exportAbort.signal.aborted) throw new DOMException("Abgebrochen", "AbortError");
    const submitted = await api("/api/render", { project: input, quality: Number($("exportQuality").value) });
    currentJob = submitted.jobId;
    while (true) {
      if (exportAbort.signal.aborted) { await api("/api/jobs/" + currentJob + "/cancel", {}); throw new DOMException("Abgebrochen", "AbortError"); }
      const job = await api("/api/jobs/" + currentJob);
      $("exportProgress").value = job.progress;
      $("exportStatus").textContent = "Lokales MP4 wird gerendert · " + Math.round(job.progress) + "%";
      if (job.status === "done") {
        const response = await fetch(bridgeBase() + job.url);
        if (!response.ok) throw new Error("Der fertige Film konnte nicht geladen werden.");
        readyDownload(await response.blob()); break;
      }
      if (["error", "cancelled"].includes(job.status)) throw new Error(job.error || "Export abgebrochen.");
      await sleep(1000);
    }
  } catch (error) { exportState(false, error.name === "AbortError" ? "Export abgebrochen." : error.message); }
  finally { currentJob = null; exportAbort = null; }
}

// Small utility actions are kept beside the scene, also accessible without dragging.
document.querySelector(".editor-actions").insertAdjacentHTML("afterbegin", '<button id="moveSceneLeft" class="icon-button small" type="button" title="Szene nach links verschieben" aria-label="Szene nach links verschieben">←</button><button id="moveSceneRight" class="icon-button small" type="button" title="Szene nach rechts verschieben" aria-label="Szene nach rechts verschieben">→</button>');
$("audioStatus").insertAdjacentHTML("afterend", '<button id="removeAudio" class="text-button muted" type="button" hidden>Audiospur entfernen</button>');
$("sceneDuration").max = 600;
$("visual").querySelector('[value="void"]').textContent = "Die Rezeption";
$("cancelExport").hidden = true;
$("exportDialog").querySelector(".dialog-description").textContent = "Exportiere deine Szenen mit Bewegung, Untertiteln und eigener Audiospur. Sprechertext allein erzeugt noch keine Stimme.";
$("previewCanvas").parentElement.querySelector(".canvas-label").textContent = "NACHTWERK / ILLUSTRIERTE VORSCHAU";
document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
$("saveProject").addEventListener("click", () => save(true));
$("loadProject").addEventListener("click", () => $("projectFile").click());
$("downloadProject").addEventListener("click", downloadProject);
$("downloadSrt").addEventListener("click", () => download(new Blob([toSrt(project)], { type: "text/plain;charset=utf-8" }), filename() + ".srt"));
$("projectFile").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 160 * 1024 * 1024) throw new Error("Die Projektdatei ist zu groß.");
    await replaceProject(validateProject(JSON.parse(await file.text()))); toast("Projekt geöffnet.");
  } catch (error) { toast(error instanceof SyntaxError ? "Diese Datei enthält kein gültiges Projekt." : error.message); }
  event.target.value = "";
});
$("projectTitle").addEventListener("input", () => { project.title = $("projectTitle").value.trim() || "Unbenannter Film"; draw(); save(); });
$("storyInput").addEventListener("input", () => { project.input = $("storyInput").value; save(); });
$("newProject").addEventListener("click", async () => {
  if (!confirm("Neues Projekt starten? Das aktuelle Projekt vorher als Datei sichern, wenn du es behalten möchtest.")) return;
  const next = createStoryboard("Meine neue Geschichte", { duration: 60 }); next.title = "Unbenannter Film"; next.input = "";
  next.scenes = [{ id: uid(), title: "Die erste Szene", narration: "", prompt: "", visual: "corridor", camera: "push", duration: 10, media: null }];
  await replaceProject(next);
});
// Fully offline, shipped media: visible adult actor, audible German synthetic narration.
// The classic demo uses animated photographs with camera movement. The animated demo uses bundled short video scenes.
const peopleDemoLines = ["Ich dachte, es wäre ein gewöhnlicher Abend. Doch dieses Haus im Wald kannte meinen Namen.", "Im Fenster erschien ein Gesicht. Es sah aus wie ich. Aber ich stand direkt vor der Tür.", "Dann hörte ich eine Stimme flüstern: Geh nicht hinein. Die Tür ging von allein auf."];
async function bundledMedia(path, type, name) {
  const response = await fetch(`./assets/${path}`);
  if (!response.ok) throw new Error(`Demo-Datei fehlt: ${name}`);
  return { name, type, data: await fileData(await response.blob()) };
}
$("loadPeopleDemo").addEventListener("click", () => withBusy($("loadPeopleDemo"), async () => {
  if (project.source !== "example" && !confirm("Die aktuelle Geschichte durch die sprechende Personen-Demo ersetzen? Vorher als Projektdatei sichern, wenn du sie behalten möchtest.")) return;
  const [photo1, photo2, audio] = await Promise.all([
    bundledMedia("person-demo-1.jpg", "image", "Person · Porträt.jpg"),
    bundledMedia("person-demo-2.jpg", "image", "Person · Nahaufnahme.jpg"),
    bundledMedia("person-demo-voice.mp3", "audio", "Deutsche Demo-Sprecherstimme.mp3")
  ]);
  const next = createStoryboard(peopleDemoLines.join("\n\n"), { duration: 22.23, format: "landscape", genre: "thriller" });
  next.title = "Die Frau vor dem Haus · Person + Stimme";
  next.source = "example";
  next.audio = audio;
  next.ambient = false;
  next.scenes = peopleDemoLines.map((narration, i) => ({
    id: uid(), title: ["Der geheimnisvolle Wald", "Das Gesicht im Fenster", "Die Stimme"][i], narration,
    prompt: "Adult woman near a mysterious house at night, cinematic thriller, realistic human actor, coherent character, smooth camera movement",
    media: i === 1 ? photo2 : photo1, visual: "house", camera: ["push", "pan", "pull"][i], duration: 7.41,
  }));
  await replaceProject(next);
  toast("Personen-Demo geladen: Jetzt ▶ drücken. Stimme ist Teil des Videos und wird exportiert.");
}, "Demo wird geladen …"));
$("loadAnimatedDemo").addEventListener("click", () => withBusy($("loadAnimatedDemo"), async () => {
  if (project.source !== "example" && !confirm("Die aktuelle Geschichte durch die animierte Demo ersetzen? Vorher als Projekt sichern, wenn du sie behalten möchtest.")) return;
  const [clip1, clip2, clip3, audio] = await Promise.all([
    bundledMedia("person-demo-scene-1.mp4", "video", "Szene 1 · Animiert.mp4"),
    bundledMedia("person-demo-scene-2.mp4", "video", "Szene 2 · Animiert.mp4"),
    bundledMedia("person-demo-scene-3.mp4", "video", "Szene 3 · Animiert.mp4"),
    bundledMedia("person-demo-voice.mp3", "audio", "Deutsche Demo-Sprecherstimme.mp3")
  ]);
  const medias = [clip1, clip2, clip3];
  const next = createStoryboard(peopleDemoLines.join("\n\n"), { duration: 22.23, format: "landscape", genre: "thriller" });
  next.title = "Die Frau vor dem Haus · Animierte Szene + Stimme";
  next.source = "example";
  next.audio = audio;
  next.ambient = false;
  next.scenes = peopleDemoLines.map((narration, i) => ({
    id: uid(), title: ["Der geheimnisvolle Wald", "Das Gesicht im Fenster", "Die Stimme"][i], narration,
    prompt: "Adult woman near a mysterious house at night, cinematic thriller, realistic human actor, coherent character, subtle body motion, moving background, dramatic lighting",
    media: medias[i], visual: "house", camera: ["push", "left", "pull"][i], duration: 7.41,
  }));
  await replaceProject(next);
  toast("Animierte Demo geladen: Die Szenen enthalten jetzt kurze Videos plus deutsche Stimme.");
}, "Video-Demo wird geladen …"));

const suspenseDemoLines = ["Um 3 Uhr 17 klingelte mein Telefon. Auf dem Display stand meine eigene Nummer.", "Als ich ranging, hörte ich nur meinen Atem. Dann flüsterte dieselbe Stimme: Sieh nicht hinter dich.", "Ich drehte mich trotzdem um. Im Fenster stand jemand, der genauso aussah wie ich."];
$("loadSuspenseDemo").addEventListener("click", () => withBusy($("loadSuspenseDemo"), async () => {
  if (project.source !== "example" && !confirm("Die aktuelle Geschichte durch die spannende Demo ersetzen? Vorher als Projekt sichern, wenn du sie behalten möchtest.")) return;
  const [clip1, clip2, clip3, audio] = await Promise.all([
    bundledMedia("person-demo-scene-1.mp4", "video", "Szene 1 · Suspense.mp4"),
    bundledMedia("person-demo-scene-2.mp4", "video", "Szene 2 · Suspense.mp4"),
    bundledMedia("person-demo-scene-3.mp4", "video", "Szene 3 · Suspense.mp4"),
    bundledMedia("person-demo-voice.mp3", "audio", "Deutsche Demo-Sprecherstimme.mp3")
  ]);
  const medias = [clip1, clip2, clip3];
  const next = createStoryboard(suspenseDemoLines.join("\n\n"), { duration: 22.23, format: "portrait", genre: "thriller" });
  next.title = "Anruf aus der Nacht";
  next.source = "example";
  next.audio = audio;
  next.ambient = true;
  next.scenes = suspenseDemoLines.map((narration, i) => ({
    id: uid(),
    title: ["Der Anruf", "Die Warnung", "Das Fensterbild"][i],
    narration,
    prompt: "Photorealistic woman, suspense thriller, moving shadows, cinematic lighting, intense mood, coherent face and outfit, unsettling mystery",
    media: medias[i],
    visual: "house",
    camera: ["push", "left", "pull"][i],
    duration: 7.41,
  }));
  await replaceProject(next);
  toast("Spannende Thriller-Demo geladen. Vorschau starten oder exportieren.");
}, "Thriller-Demo wird geladen …"));
const actionMovie = [
  { title:"01 · Der Weg zum Haus", narration:"Da vorne ... das Haus. Die Tür steht offen.", visual:"house", action:"walk", duration:4.5 },
  { title:"02 · Die Tür", narration:"Warum ist hier niemand?", visual:"house", action:"enter", duration:4.5 },
  { title:"03 · Ein Geräusch", narration:"Was war das?!", visual:"corridor", action:"startle", duration:4.5 },
  { title:"04 · Der Notruf", narration:"Hallo? Polizei? Bitte schicken Sie jemanden! Ich bin im Haus am Wald. Hier ist noch jemand!", visual:"corridor", action:"phone", duration:7.5 },
  { title:"05 · Hinter dir", narration:"Bitte ... kommen Sie schnell. Ich bin schon hier.", visual:"corridor", action:"freeze", duration:4.5 },
];
// Realfilmmodus: echte lizenzierte Aufnahmen werden manuell über die Quellseiten heruntergeladen.
// Kein Videodownload-API-Key, keine fremde Identität und keine vorgetäuschten KI-Schauspieler.
function renderRealFootageGuide() {
  const current = project.source === "real-footage-guide";
  $("realFootageGuide").hidden = !current;
  if (!current) return;
  $("realFootageGuide").innerHTML = REAL_FOOTAGE.map((entry, i) => {
    const imported = project.scenes[i]?.media?.type === "video";
    return `<div class="real-shot"><div class="real-shot-info"><strong>${i + 1}. ${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.description)}</small><small>${imported ? "✓ Video in Szene geladen" : "Noch kein echtes Video geladen"}</small></div><div class="real-shot-actions"><a href="${escapeHtml(entry.url)}" target="_blank" rel="noopener noreferrer" class="button button-quiet button-small">Kostenlosen Clip öffnen ↗</a><button type="button" class="button button-quiet button-small" data-real-import="${i}">Video auswählen</button></div></div>`;
  }).join("");
  const count = project.scenes.filter(s => s.media?.type === "video").length;
  $("realFootageFeedback").textContent = `${count} von ${REAL_FOOTAGE.length} Szenen haben ein echtes Video. Pexels-Clips selbst herunterladen und anschließend importieren.`;
}
function showFilmReport() {
  const result = inspectFilm(project);
  const summary = `${result.scenes} Szenen · ${result.clips} echte Clips · ${result.stills} eigene Bilder · ${Math.round(result.seconds)} Sekunden`;
  const notes = result.problems.length ? result.problems : ["Alle wichtigen Medien vorhanden. Die tatsächliche Qualität hängt von deinen ausgewählten Clips und der Stimme ab."];
  $("realFilmCheck").hidden = false;
  $("realFilmCheck").innerHTML = `<strong>${escapeHtml(summary)}</strong><ul>${notes.map(note => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`;
}
$("checkFilm").addEventListener("click", showFilmReport);
$("bulkVideoFiles").addEventListener("change", async event => {
  const input = event.target;
  const files = sortByShotNumber(input.files);
  input.value = "";
  if (!files.length) return;
  if (project.source !== "real-footage-guide") return toast("Zuerst die Realfilm-Vorlage laden.");
  if (files.length > project.scenes.length) return toast(`Bitte höchstens ${project.scenes.length} Clips wählen. Aufnahmen in Reihenfolge der Szenen benennen.`);
  if (project.scenes.some(s => s.media) && !confirm("Bereits verwendete Szenenvideos können überschrieben werden. Fortfahren?")) return;
  const targetProject = project;
  try {
    // Decode all before writing any: a corrupt or oversized clip must not destroy existing footage.
    const imported = [];
    for (let i = 0; i < files.length; i++) {
      const media = await readMedia(files[i]);
      if (!media || media.type !== "video") throw new Error(`${files[i].name}: Bitte eine MP4-, MOV- oder WebM-Datei wählen.`);
      imported.push(media);
    }
    if (project !== targetProject) throw new Error("Projekt wurde während des Imports gewechselt. Bitte erneut versuchen.");
    pause();
    imported.forEach((media, i) => { project.scenes[i].media = media; });
    await refresh(); save(); showFilmReport();
    toast(`${imported.length} echte Videoaufnahmen den ersten ${imported.length} Szenen zugeordnet.`);
  } catch (error) { toast(error.message || "Videoimport fehlgeschlagen."); }
});
$("loadRealFootage").addEventListener("click", async () => {
  if (project.source !== "example" && project.source !== "real-footage-guide" && !confirm("Aktuelles Projekt durch die Realfilm-Vorlage ersetzen? Vorher als Projektdatei sichern.")) return;
  const next = createStoryboard(REAL_FOOTAGE.map(s => s.narration).join("\n\n"), {duration:27, format:"portrait", genre:"thriller"});
  next.title = "DIE TÜR STEHT OFFEN · Realfilm";
  next.source = "real-footage-guide";
  next.audio = null;
  next.ambient = false;
  next.scenes = REAL_FOOTAGE.map(s => ({id:uid(),title:s.title,narration:s.narration,visual:s.visual,camera:s.camera,
    duration:s.duration,action:"none",media:null,prompt:`Real footage: ${s.description}. No illustration. Import downloaded footage from ${s.url}`}));
  await replaceProject(next);
  renderRealFootageGuide();
  toast("Vorlage bereit. Öffne die kostenlosen Quellen und lade die Videos einzeln in deine 5 Szenen.");
});
$("realFootageGuide").addEventListener("click", (event) => {
  const button = event.target.closest("[data-real-import]");
  if (!button) return;
  const i = Number(button.dataset.realImport);
  if (!Number.isInteger(i) || project.source !== "real-footage-guide" || i < 0 || i >= project.scenes.length) return;
  selectScene(i);
  $("sceneMedia").click();
});
$("loadActionMovie").addEventListener("click", () => withBusy($("loadActionMovie"), async () => {
  if(project.source !== "example" && !confirm("Aktuelles Projekt durch den Action-Testfilm ersetzen? Vorher als Projektdatei sichern.")) return;
  const names = actionMovie.map((_,i)=>`action-film-${i+1}.mp4`);
  const scenesMedia = await Promise.all(names.map((name,i)=>bundledMedia(name,"video",`Bewegte Szene ${i+1}.mp4`)));
  const next = createStoryboard(actionMovie.map(s=>s.narration).join("\n\n"),{duration:25.5,format:"landscape",genre:"thriller"});
  next.title="DIE TÜR WAR OFFEN · Ein Nachtwerk-Thriller";next.source="example";next.ambient=false;next.audio=null;
  next.scenes=actionMovie.map((s,i)=>({id:uid(),title:s.title,narration:s.narration,visual:s.visual,
    prompt:`A frightened adult woman ${s.action}, cinematic suspense, consistent character`, camera:"static",
    duration:s.duration,action:s.action,media:scenesMedia[i]}));
  await replaceProject(next);
  toast("Action-Film geladen: Gehen, Eintreten, Erschrecken, Polizei rufen. Auf ▶ drücken – Ton ist in den Szenenvideos.");
},"Action-Film wird geladen …"));
function refreshDeviceVoices() {
  const voices = germanVoices(window.speechSynthesis?.getVoices?.() || []);
  const select = $("browserVoice"), previous = select.value;
  select.innerHTML = '<option value="">Automatisch beste deutsche Stimme wählen</option>' + voices.map((v, i) =>
    `<option value="${i}">${escapeHtml(v.name)} · ${escapeHtml(v.lang || "Deutsch")}${v.localService ? " · Gerät" : ""}</option>`).join("");
  if (previous && voices[Number(previous)]) select.value = previous;
  return voices;
}
if ("speechSynthesis" in window) {
  refreshDeviceVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", refreshDeviceVoices);
}
function speakText(text) {
  if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) return toast("Auf diesem Gerät ist kein Browser-Vorlesen verfügbar. Bitte eine Sprecheraufnahme hochladen oder lokal erzeugen.");
  if (window.speechSynthesis.speaking) { window.speechSynthesis.cancel(); return toast("Sprachprobe gestoppt."); }
  text = String(text || "").trim().slice(0, 3000);
  if (!text) return toast("Schreibe zuerst einen Sprechertext.");
  pause();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "de-DE";
  utterance.rate = Number($("voicePace").value) || .95;
  const voices = refreshDeviceVoices();
  const chosen = $("browserVoice").value;
  utterance.voice = voices[chosen ? Number(chosen) : 0] || null;
  window.speechSynthesis.speak(utterance);
  toast("Deutsche Sprachprobe läuft. Die Stimme wird so nicht exportiert.");
}
$("speakScene").addEventListener("click", () => speakText(scene().narration));
$("speakPreview").addEventListener("click", () => speakText(project.scenes.map(s => s.narration).filter(Boolean).join(" ")));
$("loadExample").addEventListener("click", async () => {
  if (project.source !== "example" && !confirm("Dein aktuelles Projekt durch die Beispielgeschichte ersetzen? Sichere es bei Bedarf zuerst als Projektdatei.")) return;
  await replaceProject(exampleProject()); toast("Beispielgeschichte geladen. Die Stimme kannst du selbst aufnehmen.");
});
$("buildStoryboard").addEventListener("click", () => withBusy($("buildStoryboard"), async () => {
  if (project.scenes.some(s => s.media) && !confirm("Das neue Storyboard ersetzt die aktuellen Szenen und ihre Medien. Fortfahren?")) return;
  const next = createStoryboard($("storyInput").value, { duration: Number($("duration").value), genre: $("genre").value, format: $("format").value });
  await replaceProject(next);
  toast(next.source === "outline" ? "Szenengerüst erstellt. Fülle die Erzählung selbst aus oder verbinde ein lokales KI-Modell." : "Dein Drehbuch wurde in Szenen aufgeteilt.");
}));
$("format").addEventListener("change", () => { pause(); project.format = $("format").value; refresh(); save(); });
$("genre").addEventListener("change", () => { project.genre = $("genre").value; save(); });
$("playPause").addEventListener("click", play);
$("seek").addEventListener("input", () => { pause(); currentTime = Number($("seek").value); draw(); });
$("sceneList").addEventListener("click", event => { const card = event.target.closest("[data-scene]"); if (card) selectScene(Number(card.dataset.scene)); });
let dragging = null;
$("sceneList").addEventListener("dragstart", event => { const card = event.target.closest("[data-scene]"); if (card) { dragging = Number(card.dataset.scene); event.dataTransfer.setData("text/plain", String(dragging)); } });
$("sceneList").addEventListener("dragover", event => { if (dragging !== null) event.preventDefault(); });
$("sceneList").addEventListener("drop", event => {
  event.preventDefault(); const card = event.target.closest("[data-scene]"); if (!card || dragging === null) return;
  const dest = Number(card.dataset.scene), moved = project.scenes.splice(dragging, 1)[0]; project.scenes.splice(dest, 0, moved); dragging = null; selectScene(dest); save();
});
$("sceneList").addEventListener("dragend", () => { dragging = null; });
$("moveSceneLeft").addEventListener("click", () => moveScene(-1));
$("moveSceneRight").addEventListener("click", () => moveScene(1));
$("addScene").addEventListener("click", () => {
  const remaining = 600 - totalDuration(project);
  if (remaining < 2 || project.scenes.length >= 120) return toast("Die maximale Filmlänge von zehn Minuten oder 120 Szenen ist erreicht.");
  project.scenes.push({ id: uid(), title: "Neue Szene", narration: "", prompt: "", visual: "corridor", camera: "push", duration: Math.min(10, remaining), media: null });
  selectScene(project.scenes.length - 1); refresh(); save();
});
$("duplicateScene").addEventListener("click", () => {
  if (totalDuration(project) + scene().duration > 600 || project.scenes.length >= 120) return toast("Die Kopie würde die maximale Filmlänge überschreiten.");
  project.scenes.splice(selected + 1, 0, { ...structuredClone(scene()), id: uid(), title: scene().title + " · Kopie" }); selected++; refresh(); selectScene(selected); save();
});
$("deleteScene").addEventListener("click", () => {
  if (project.scenes.length <= 1) return;
  project.scenes.splice(selected, 1); selected = Math.min(selected, project.scenes.length - 1); refresh(); selectScene(selected); save();
});
for (const [id, key] of [["sceneTitle", "title"], ["sceneNarration", "narration"], ["scenePrompt", "prompt"]]) $(id).addEventListener("input", () => {
  scene()[key] = $(id).value; if (key === "title") renderScenes(); draw(); save();
});
$("sceneDuration").addEventListener("change", () => {
  const value = Number($("sceneDuration").value), max = 600 - totalDuration(project) + scene().duration;
  if (!Number.isFinite(value) || value < 2 || value > max + .001) { $("sceneDuration").value = scene().duration; return toast("Die Szene muss mindestens 2 Sekunden dauern. Der Film darf höchstens 10 Minuten lang sein."); }
  pause(); scene().duration = value; refresh(); save();
});
for (const id of ["visual", "camera", "sceneAction"]) $(id).addEventListener("change", () => { scene()[id === "sceneAction" ? "action" : id] = $(id).value; refresh(); save(); });
$("sceneMedia").addEventListener("change", async event => {
  const target = scene();
  try { const media = await readMedia(event.target.files[0]); if (media && project.scenes.includes(target)) { target.media = media; await refresh(); save(); toast("Medium in deiner Szene gespeichert."); } }
  catch (error) { toast(error.message); } event.target.value = "";
});
$("removeSceneMedia").addEventListener("click", () => { scene().media = null; refresh(); save(); });
$("assetLibrary").addEventListener("click", event => {
  const button = event.target.closest("[data-visual]"); if (!button) return;
  scene().visual = button.dataset.visual; scene().media = null; refresh(); save(); showView("studio"); toast("Motiv in aktueller Szene verwendet.");
});
$("audioFile").addEventListener("change", async event => {
  const target = project;
  try { const media = await readMedia(event.target.files[0], "audio"); if (media && project === target) { pause(); project.audio = media; renderAudio(); save(); } }
  catch (error) { toast(error.message); } event.target.value = "";
});
$("removeAudio").addEventListener("click", () => { pause(); project.audio = null; renderAudio(); save(); });
$("audioVolume").addEventListener("input", () => { project.audioVolume = Number($("audioVolume").value); if (previewAudio) previewAudio.volume = project.audioVolume; save(); });
$("ambient").addEventListener("change", () => { pause(); project.ambient = $("ambient").checked; save(); });
$("recordVoice").addEventListener("click", async () => {
  pause();
  const target = project;
  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("Aufnahme hier nicht unterstützt. Du kannst eine Audiodatei hochladen.");
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(t => MediaRecorder.isTypeSupported(t));
    recording = new MediaRecorder(recordingStream, mime ? { mimeType: mime } : {});
    const chunks = [];
    recording.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recording.onstop = async () => {
      clearTimeout(recordingTimer); recordingStream.getTracks().forEach(track => track.stop());
      $("recordVoice").hidden = false; $("stopRecording").hidden = true;
      const blob = new Blob(chunks, { type: recording.mimeType || "audio/webm" });
      try {
        if (!blob.size) throw new Error("Die Aufnahme war leer.");
        if (project !== target) throw new Error("Das Projekt wurde während der Aufnahme gewechselt. Bitte im richtigen Projekt erneut aufnehmen.");
        project.audio = { name: "Meine Erzählung" + (blob.type.includes("mp4") ? ".m4a" : ".webm"), type: "audio", data: await fileData(blob) };
        renderAudio(); save(); toast("Deine Stimme ist aufgenommen und wird mitexportiert.");
      } catch (error) { toast(error.message); }
    };
    recording.start(); $("recordVoice").hidden = true; $("stopRecording").hidden = false;
    $("audioStatus").textContent = "Aufnahme läuft. Lies deine Erzählung ein. Maximal 10 Minuten.";
    recordingTimer = setTimeout(() => { if (recording.state === "recording") recording.stop(); }, 600000);
  } catch (error) { recordingStream?.getTracks().forEach(track => track.stop()); toast(error.name === "NotAllowedError" ? "Mikrofonzugriff nicht erlaubt. Nutze alternativ eine Audiodatei." : error.message); }
});
$("stopRecording").addEventListener("click", () => { if (recording?.state === "recording") recording.stop(); });
$("connectBridge").addEventListener("click", connect);
$("bridgeUrl").addEventListener("input", () => { bridge = null; $("bridgeStatus").textContent = "Adresse geändert. Verbindung erneut testen."; });
$("comfyWorkflow").addEventListener("change", async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error("Workflow darf höchstens 2 MB groß sein.");
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Object.values(parsed).every(n => n && typeof n.class_type === "string" && n.inputs)) throw new Error("Bitte einen ComfyUI-Workflow im API-Format auswählen.");
    workflow = parsed; toast("Workflow geladen. Platzhalter {{prompt}} übernimmt die Szenenbeschreibung.");
    event.target.closest("label").querySelector("small").textContent = file.name;
  } catch (error) { toast(error instanceof SyntaxError ? "Die Workflow-Datei ist kein gültiges JSON." : error.message); }
});
$("writeWithAi").addEventListener("click", () => withBusy($("writeWithAi"), async () => {
  if (!await requireBridge("KI-Geschichten")) return;
  if (!bridge.ollama) throw new Error("Ollama ist noch nicht erreichbar. Starte ein lokales Modell und verbinde neu.");
  const target = project;
  const result = await api("/api/story", { idea: $("storyInput").value, genre: $("genre").value, duration: Number($("duration").value), model: $("ollamaModel").value });
  if (project !== target) throw new Error("Die Geschichte gehört zum vorherigen Projekt. Bitte erneut erzeugen.");
  const base = { ...project, scenes: [{ ...project.scenes[0], duration: Number($("duration").value) }] };
  await replaceProject(aiProject(result, base)); toast("Dein lokales Modell hat die Geschichte erstellt.");
}, "Lokales Modell schreibt …"));
async function makeSceneVoice(targetScene) {
  const text = (targetScene?.narration || "").trim();
  if (!text) throw new Error("Schreibe zuerst einen Sprechertext in die aktuelle Szene.");
  return await api("/api/narrate", { text, language: "de" });
}
async function animateSceneWithAudio(targetScene, audioMeta, busyButton) {
  if (!bridge?.animate) throw new Error("Im lokalen Kit ist noch keine Portrait-/Lip-Sync-Integration konfiguriert. Siehe Einstellungen → Stimme & Avatar.");
  if (!targetScene.media || targetScene.media.type !== "image") throw new Error("Die aktuelle Szene braucht zuerst ein Bild. Die Funktion verwandelt Bild + Stimme in ein Video.");
  const img = await uploadLocal(targetScene.media);
  const result = await api("/api/animate", { imageId: img.id, audioId: audioMeta.id, mode: "auto" }, 600000);
  const media = await localMedia(result);
  if (project.scenes.includes(targetScene)) {
    targetScene.media = media;
    await refresh();
    save();
  }
  if (busyButton) toast("Sprechende Szene übernommen. Prüfe Vorschau und Export.");
}
$("generateVoice").addEventListener("click", () => withBusy($("generateVoice"), async () => {
  if (!await requireBridge("eine KI-Erzählstimme")) return;
  if (!bridge.piper && !bridge.espeak) throw new Error("Im Kit ist noch keine Stimme eingerichtet. Installiere Piper oder espeak-ng, oder nimm deine Stimme auf.");
  const target = project;
  const result = await api("/api/narrate", { text: project.scenes.map(s => s.narration).join("\n\n"), language: "de" });
  const media = await localMedia(result);
  if (project !== target) throw new Error("Die Stimme gehört zum vorherigen Projekt. Bitte erneut erzeugen.");
  pause(); project.audio = media; renderAudio(); save(); toast("Lokale Erzählstimme hinzugefügt. Prüfe die Szenendauer passend zur Stimme.");
}, "Stimme wird erzeugt …"));
$("animatePortrait").addEventListener("click", () => withBusy($("animatePortrait"), async () => {
  if (!await requireBridge("eine sprechende Szene")) return;
  if (!bridge.animate) throw new Error("Im lokalen Kit ist noch keine Portrait-/Lip-Sync-Integration konfiguriert. Siehe Einstellungen → Stimme & Avatar.");
  const targetScene = scene();
  if (!targetScene.media || targetScene.media.type !== "image") throw new Error("Wähle zuerst in der aktuellen Szene ein Bild aus. Die Funktion verwandelt Bild + Stimme in ein Video.");
  if (!project.audio) throw new Error("Füge zuerst eine Audiospur hinzu oder erzeuge eine lokale Stimme.");
  const img = await uploadLocal(targetScene.media);
  const aud = await uploadLocal(project.audio);
  const result = await api("/api/animate", { imageId: img.id, audioId: aud.id, mode: "auto" }, 600000);
  const media = await localMedia(result);
  if (!project.scenes.includes(targetScene)) throw new Error("Die erzeugte Szene gehört zum vorherigen Projekt. Bitte erneut ausführen.");
  targetScene.media = media; await refresh(); save(); toast("Sprechende Szene übernommen. Prüfe Vorschau und Export.");
}, "Szene wird animiert …"));
$("autoTalkingScene").addEventListener("click", () => withBusy($("autoTalkingScene"), async () => {
  if (!await requireBridge("eine automatisch sprechende Szene")) return;
  const targetScene = scene();
  const voice = await makeSceneVoice(targetScene);
  await animateSceneWithAudio(targetScene, voice, $("autoTalkingScene"));
  toast("Aktuelle Szene automatisch vertont und animiert.");
}, "Szene spricht gleich …"));
$("autoAnimateAll").addEventListener("click", () => withBusy($("autoAnimateAll"), async () => {
  if (!await requireBridge("automatische Szenenanimation")) return;
  const imageScenes = project.scenes.filter(s => s.media?.type === "image" && (s.narration || "").trim());
  if (!imageScenes.length) throw new Error("Es gibt keine Bild-Szenen mit Sprechertext. Lade Bilder und trage Text ein.");
  if (!confirm(`Jetzt ${imageScenes.length} Bild-Szenen nacheinander automatisch vertonen und animieren? Das kann einige Minuten dauern.`)) return;
  let done = 0;
  for (const s of imageScenes) {
    const voice = await makeSceneVoice(s);
    await animateSceneWithAudio(s, voice);
    done += 1;
    $("audioStatus").textContent = `Automatische Szenenanimation: ${done}/${imageScenes.length} fertig.`;
  }
  await refresh();
  toast(`${done} Szenen automatisch in sprechende Videos verwandelt.`);
}, "Alle Szenen werden animiert …"));
$("generateSceneAi").addEventListener("click", () => withBusy($("generateSceneAi"), async () => {
  if (!await requireBridge("KI-Szenen")) return;
  if (!bridge.comfy) throw new Error("ComfyUI ist nicht erreichbar. Starte ComfyUI und verbinde das Kit erneut.");
  if (!workflow) { showView("settings"); throw new Error("Lade zuerst deinen ComfyUI-Workflow im API-Format."); }
  const targetScene = scene(), size = dimensions(project.format, 480);
  size.width = Math.max(32, Math.floor(size.width / 32) * 32);
  size.height = Math.max(32, Math.floor(size.height / 32) * 32);
  const job = await api("/api/comfy", { workflow, prompt: targetScene.prompt, seed: Math.floor(Math.random() * 2147483647), width: size.width, height: size.height });
  toast("ComfyUI generiert die Szene auf deinem Rechner. Das kann mehrere Minuten dauern.");
  for (let attempts = 0; attempts < 900; attempts++) {
    const status = await api("/api/comfy/" + job.promptId);
    if (status.status === "error") throw new Error(status.error);
    if (status.status === "done") {
      const output = status.outputs.find(o => o.type === "video");
      if (!output) throw new Error("Workflow fertig, aber kein echtes Video gespeichert. Nutze einen Video-Speicherknoten (z. B. VHS_VideoCombine) statt SaveImage.");
      const media = await localMedia(output);
      if (!project.scenes.includes(targetScene)) throw new Error("Die erzeugte Szene gehört zum vorherigen Projekt. Sie bleibt im lokalen Kit gespeichert.");
      targetScene.media = media; await refresh(); save(); toast("Echtes generiertes Video wurde übernommen."); return;
    }
    await sleep(2000);
  }
  throw new Error("Die Szene läuft länger als 30 Minuten. Prüfe den Auftrag in ComfyUI.");
}, "ComfyUI generiert …"));
$("openExport").addEventListener("click", () => {
  pause();
  if (project.source === "real-footage-guide") {
    const check = inspectFilm(project);
    if (check.missing.length && !confirm(`Noch ${check.missing.length} Realfilm-Szenen ohne Videoclip. Beim Export werden dort Illustrationen angezeigt. Trotzdem exportieren?`)) return;
  }
  $("exportDialog").showModal();
});
$("closeExport").addEventListener("click", () => { if (!exporting) $("exportDialog").close(); });
$("exportDialog").addEventListener("cancel", event => { if (exporting) event.preventDefault(); });
$("exportBrowser").addEventListener("click", exportBrowser);
$("exportMp4").addEventListener("click", exportLocal);
$("cancelExport").addEventListener("click", () => { exportAbort?.abort(); $("exportStatus").textContent = "Export wird beendet …"; });
window.addEventListener("beforeunload", event => { if (exporting || recording?.state === "recording") { event.preventDefault(); event.returnValue = ""; } });
document.addEventListener("visibilitychange", () => {
  if (document.hidden && playing) pause();
  if (document.hidden && exporting && !currentJob) {
    exportAbort?.abort();
    $("exportStatus").textContent = "Browser-Export angehalten: Der Tab muss sichtbar bleiben. Bitte erneut starten.";
  }
});
document.addEventListener("keydown", event => {
  if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) || $("exportDialog").open) return;
  if (event.code === "Space" && !$("studioView").hidden) { event.preventDefault(); play(); }
});


// Viral & Character Lab: deterministic offline writing aids, no claim of trend prediction.
const viralHooks = {
  mystery: ["Niemand glaubte mir, bis diese Aufnahme auftauchte.", "Alles sah normal aus. Bis ich das Detail im Hintergrund bemerkte.", "Drei Minuten später war nichts mehr wie zuvor."],
  facts: ["Das klingt erfunden – aber die Geschichte dahinter überrascht.", "Ein kleines Detail verändert die ganze Geschichte.", "Die meisten übersehen genau diesen Hinweis."],
  cinema: ["Eine Entscheidung. Eine Nacht. Keine zweite Chance.", "Was würdest du tun, wenn die Zeit abläuft?", "Manche Geheimnisse bleiben nicht begraben."],
  story: ["Ich dachte, es wäre ein ganz gewöhnlicher Tag.", "Diese eine Nachricht hat alles verändert.", "Am Ende verstand ich, warum sie nie zurückkam."]
};
const cinematicStyles = {
  realistic: "photorealistic adult human, natural skin texture, realistic anatomy, cinematic lighting, 35mm lens, shallow depth of field, believable facial expressions",
  animation: "high-quality stylized 3D animated feature film, expressive character animation, cinematic lighting, consistent character design",
  anime: "cinematic anime illustration, detailed backgrounds, consistent character design, dynamic framing",
  noir: "film noir, dramatic shadows, cinematic chiaroscuro, moody atmosphere, high contrast"
};
function viralSubject() {
  return ($("storyInput").value.trim() || project.input || project.title || "Eine geheimnisvolle Begegnung").trim().slice(0, 220);
}
function viralHookText() {
  const style = $("viralStyle").value;
  const hooks = viralHooks[style];
  return hooks[Math.floor(Math.random() * hooks.length)];
}
$("viralHook").addEventListener("click", async () => {
  const hook = viralHookText();
  const idea = viralSubject();
  $("storyInput").value = `${hook}\n\n${idea}\n\nErzähle die Geschichte mit einem klaren Konflikt, steigender Spannung und einer überraschenden, nachvollziehbaren Auflösung. Zeige den wichtigsten visuellen Moment früh. Schreibe kurze, gut sprechbare Sätze.`;
  $("format").value = "portrait";
  $("duration").value = "60";
  $("viralFeedback").textContent = "Hook eingesetzt · 9:16 und 60 Sekunden vorausgewählt. Klicke jetzt auf »Storyboard erstellen«.";
  toast("Viral-Hook vorbereitet. Erstelle jetzt dein Storyboard.");
});
$("viralPrompts").addEventListener("click", () => {
  const profile = $("characterProfile").value.trim().slice(0, 1000);
  const style = cinematicStyles[$("visualMood").value];
  const scenes = project.scenes;
  if (!scenes?.length) return toast("Erstelle zuerst ein Storyboard.");
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const subject = (s.narration || s.title || viralSubject()).slice(0, 500);
    s.prompt = `${style}. ${profile ? `Same recurring character in every scene: ${profile}. Preserve identical face, hairstyle, outfit and proportions. ` : ""}Scene ${i + 1}: ${subject}. Detailed environment, cinematic composition, coherent lighting, subtle natural movement, no text overlays, no watermark. Maintain visual continuity with adjacent scenes.`;
  }
  renderEditor(); save();
  $("viralFeedback").textContent = `${scenes.length} Szenen haben jetzt individuelle Bildprompts${profile ? " mit einheitlichem Figurenprofil" : ""}. Öffne eine Szene und nutze ComfyUI für echte Generierung.`;
  toast("KI-Bildprompts für alle Szenen vorbereitet.");
});
$("viralCopy").addEventListener("click", async () => {
  const title = (project.title || viralSubject()).slice(0, 85);
  const platform = $("viralPlatform").value;
  const tags = platform === "shorts" ? "#Shorts #Storytime #Kino" : platform === "reels" ? "#Reels #Storytelling #Cinema" : "#Storytime #FilmTok #Story";
  const text = `${title}\n\n${viralHookText()}\n\n${tags} #Nachtwerk`;
  try { await navigator.clipboard.writeText(text); toast("Titel, Hook und Hashtags kopiert."); }
  catch { $("viralFeedback").textContent = text; toast("Text unten angezeigt, da die Zwischenablage nicht verfügbar ist."); }
});

async function init() {
  try { const saved = await readSaved(); if (saved) project = validateProject(saved); }
  catch { toast("Lokaler Speicher nicht verfügbar. Projektdateien lassen sich trotzdem öffnen und sichern."); }
  try { $("bridgeUrl").value = localStorage.getItem("nachtwerk-bridge") || (["localhost", "127.0.0.1"].includes(location.hostname) ? location.origin : "http://127.0.0.1:8787"); } catch {}
  await refresh({ all: true }); renderLibrary();
  if (preferredMime() === null) $("exportBrowser").title = "Dieser Browser unterstützt keine Videoaufnahme. Nutze das lokale Studio-Kit.";
  if (["127.0.0.1", "localhost"].includes(location.hostname)) connect();
  document.documentElement.dataset.ready = "true";
}
init();
