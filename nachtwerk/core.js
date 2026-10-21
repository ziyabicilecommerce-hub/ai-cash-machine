export const MAX_DURATION = 600;
export const VISUALS = ["corridor", "forest", "house", "stairs", "window", "void"];
export const CAMERAS = ["push", "pan", "static", "pull"];
export const PERFORMANCES = ["none","walk","enter","search","startle","phone","flee","freeze"];
export const uid = () => globalThis.crypto?.randomUUID?.() || "scene-" + Math.random().toString(36).slice(2);
export const clamp = (x, min, max) => Math.max(min, Math.min(max, Number(x) || 0));
export const escapeHtml = (x) => String(x ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const formatTime = (seconds) => {
  const n = Math.max(0, Math.floor(seconds || 0));
  return String(Math.floor(n / 60)).padStart(2, "0") + ":" + String(n % 60).padStart(2, "0");
};
export const totalDuration = (p) => p.scenes.reduce((sum, s) => sum + Number(s.duration), 0);
const sceneLength = (total, count, index) => (Math.round(total * 100 * (index + 1) / count) - Math.round(total * 100 * index / count)) / 100;
export const dimensions = (format, quality = 720) => {
  const size = Number(quality) === 480 ? 480 : 720;
  if (format === "portrait") return { width: size, height: Math.round(size * 16 / 9 / 2) * 2 };
  if (format === "square") return { width: size, height: size };
  return { width: Math.round(size * 16 / 9 / 2) * 2, height: size };
};
export function sceneAt(project, time) {
  let start = 0;
  for (let i = 0; i < project.scenes.length; i++) {
    const scene = project.scenes[i];
    if (time < start + scene.duration || i === project.scenes.length - 1) {
      return { scene, index: i, start, local: clamp(time - start, 0, scene.duration) };
    }
    start += scene.duration;
  }
  return null;
}

const story = [
  ["Die Ankunft", "Der letzte Bus setzte mich kurz vor Mitternacht am Waldrand ab. Mein Handy hatte keinen Empfang. Zwischen den Bäumen sah ich das grüne Licht eines Motels. Über der Tür stand: Zimmer frei. Ich hätte weitergehen sollen.", "forest", "A narrow road through a misty pine forest at midnight. A distant motel sign glows green. Cinematic suspense, no people, slow push in."],
  ["Zimmer 17", "An der Rezeption lag ein Schlüssel bereit. Zimmer siebzehn. Daneben ein Zettel: Nach zwei Uhr bitte nicht auf die Durchsagen antworten. Ich lachte, bis ich bemerkte, dass das Datum auf dem Zettel von morgen war.", "house", "An isolated motel in the forest at night. One illuminated window, rain and distant fog. Analog film, slow lateral camera movement."],
  ["Die erste Stimme", "Um zwei Uhr dreizehn knackte der Lautsprecher im Flur. Eine freundliche Stimme sagte meinen Namen. Dann bat sie mich, zur Rezeption zu kommen. Es klang genau wie meine Mutter. Meine Mutter war seit sieben Jahren tot.", "corridor", "A deserted motel corridor, a small speaker above the door. Warm ceiling lamps flicker, distant green light, subtle cinematic push in."],
  ["Die Treppe", "Ich blieb sitzen. Draußen ging jemand langsam die Treppe hinauf. Eine Stufe. Eine Pause. Noch eine Stufe. Dann blieb es still. Unter meiner Tür verschwand das Licht, als würde jemand direkt davorstehen.", "stairs", "An empty concrete stairwell in an old motel. Hard practical light and deep shadows. A still frame with a very slow zoom, quiet dread."],
  ["Das Fenster", "Im Fenster sah ich mein eigenes Spiegelbild. Doch während ich stillstand, hob es den Arm. Es zeigte hinter mich. Ich drehte mich nicht um. Stattdessen fragte ich leise: Was willst du? Der Lautsprecher über meinem Bett erwachte.", "window", "Rain on a dark motel window. The reflection of an empty room, a single amber light. Slow cinematic pull back, psychological horror without gore."],
  ["Die Antwort", "Die Stimme klang jetzt wie ich. Sie sagte: Danke. Wir haben so lange auf deine Antwort gewartet. Im Flur gingen nacheinander alle Türen auf. Hinter jeder Tür lief dasselbe Gespräch. Meine Frage. Dann dieses Danke.", "void", "An abandoned motel reception at night, an old intercom and a row of room keys. Green light behind frosted glass, analog cinematic texture."],
  ["Kein Ausgang", "Ich rannte zur Treppe. Unten öffnete ich die Eingangstür und stand wieder vor Zimmer siebzehn. Auf dem Boden lag mein Schlüssel. Der Zettel daneben trug jetzt meine Handschrift: Nach zwei Uhr bitte nicht auf die Durchsagen antworten.", "corridor", "An endless motel corridor, repeated identical doors, one doorway glowing softly. Empty architecture, disorienting perspective, slow push in."],
  ["Die letzte Durchsage", "Heute Nacht kommt wieder ein Bus. Ich sehe seine Lichter zwischen den Bäumen. Gleich wird jemand den Schlüssel nehmen. Ich versuche noch immer, ihn zu warnen. Aber durch den Lautsprecher kommt nur ein einziger Satz: Bitte kommen Sie zur Rezeption.", "forest", "A forest road disappearing into thick night fog, two distant bus headlights. Quiet ominous atmosphere, restrained film grain, slow pull back."]
];

export function exampleProject() {
  return {
    version: 1, id: uid(), title: "Die letzte Durchsage", genre: "horror", format: "landscape",
    input: "Ein verlassenes Motel. Eine Durchsage mit einer vertrauten Stimme. Und eine Regel, die niemand brechen darf.",
    ambient: true, audioVolume: 0.85, audio: null, source: "example",
    scenes: story.map((s, i) => ({ id: uid(), title: s[0], narration: s[1], visual: s[2], prompt: s[3], camera: i % 3 === 0 ? "push" : i % 3 === 1 ? "pan" : "pull", duration: 15, media: null, action: "none" }))
  };
}

export function createStoryboard(input, options = {}) {
  const text = String(input || "").trim();
  if (!text) throw new Error("Beschreibe eine Idee oder füge deine Geschichte ein.");
  if (text.length > 50000) throw new Error("Bitte auf höchstens 50.000 Zeichen kürzen.");
  const duration = clamp(options.duration || 180, 10, MAX_DURATION);
  const genre = ["horror", "thriller", "fantasy", "documentary"].includes(options.genre) ? options.genre : "horror";
  const paragraphs = text.split(/\n\s*\n/).map(t => t.trim()).filter(Boolean);
  let pieces;
  let source = "script";
  if (text.length < 220 && paragraphs.length === 1) {
    source = "outline";
    const beats = genre === "documentary"
      ? ["Die Ausgangsfrage", "Der Schauplatz", "Die Vorgeschichte", "Eine neue Perspektive", "Die entscheidende Beobachtung", "Das Ergebnis"]
      : ["Die Ankunft", "Das erste Zeichen", "Die Warnung", "Die Entdeckung", "Der Wendepunkt", "Die Entscheidung", "Die Konsequenz", "Das letzte Bild"];
    pieces = beats.map((beat, i) => ({
      title: beat,
      narration: i === 0 ? text : "",
      prompt: text + ". Szene " + (i + 1) + ": " + beat + ". " + (genre === "horror" ? "Atmospheric horror, cinematic lighting, quiet suspense, no gore." : genre === "fantasy" ? "Magical realism, cinematic lighting, atmospheric fantasy." : "Cinematic composition, natural lighting, clear visual storytelling.")
    }));
  } else {
    const sentences = paragraphs.length > 1 ? paragraphs : (text.match(/[^.!?]+[.!?]+(?:["”»])?|[^.!?]+$/g) || [text]).map(t => t.trim());
    const targetCount = Math.min(60, Math.max(1, Math.ceil(duration / 15)));
    const limit = Math.max(160, Math.ceil(text.length / targetCount));
    const chunks = [];
    let chunk = "";
    for (const sentence of sentences) {
      if (chunk && chunk.length + sentence.length > limit) { chunks.push(chunk); chunk = ""; }
      chunk += (chunk ? " " : "") + sentence;
    }
    if (chunk) chunks.push(chunk);
    // Large paragraphs also need bounded scene counts and readable captions.
    const bounded = chunks.length > 60 ? chunks.slice(0, 59).concat(chunks.slice(59).join(" ")) : chunks;
    pieces = bounded.map((part, i) => ({
      title: "Szene " + String(i + 1).padStart(2, "0"),
      narration: part,
      prompt: part + ". Cinematic " + genre + " scene, coherent setting, atmospheric lighting."
    }));
  }
  const each = duration / pieces.length;
  if (each < 2) throw new Error("Für diese Szenenanzahl bitte eine längere Zieldauer wählen.");
  return {
    version: 1, id: uid(), title: source === "outline" ? text.slice(0, 58) : "Meine Geschichte", genre,
    format: ["landscape", "portrait", "square"].includes(options.format) ? options.format : "landscape",
    input: text, source, ambient: true, audioVolume: 0.85, audio: null,
    scenes: pieces.map((part, i) => ({ id: uid(), ...part, duration: sceneLength(duration, pieces.length, i), visual: VISUALS[i % VISUALS.length], camera: CAMERAS[i % CAMERAS.length], media: null, action: "none" }))
  };
}

function safeMedia(media, audio = false) {
  if (!media || typeof media !== "object") return null;
  const data = String(media.data || "");
  const allowed = audio ? /^data:audio\/[\w.+-]+(?:;[^,]*)?;base64,[A-Za-z0-9+/=\s]+$/ : /^data:(?:image\/(?:png|jpeg|webp|gif|avif)|video\/(?:mp4|webm|ogg|quicktime))(?:;[^,]*)?;base64,[A-Za-z0-9+/=\s]+$/;
  if (!allowed.test(data)) throw new Error("Ein Medium im Projekt hat ein nicht unterstütztes Format.");
  if (data.length > 90_000_000) throw new Error("Ein Medium im Projekt ist zu groß.");
  return { name: String(media.name || "Medium").slice(0, 240), type: audio ? "audio" : data.startsWith("data:video/") ? "video" : "image", data };
}
export function validateProject(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.scenes) || !raw.scenes.length || raw.scenes.length > 120) throw new Error("Diese Datei ist kein gültiges Nachtwerk-Projekt.");
  if (raw.version !== 1) throw new Error("Diese Projektversion wird noch nicht unterstützt.");
  const scenes = raw.scenes.map((s, i) => {
    if (!s || typeof s !== "object") throw new Error("Eine Szene ist beschädigt.");
    const duration = Number(s.duration);
    if (!Number.isFinite(duration) || duration < 2 || duration > 600) throw new Error("Szenendauer muss zwischen 2 und 600 Sekunden liegen.");
    return { id: uid(), title: String(s.title || "Szene " + (i + 1)).slice(0, 120), narration: String(s.narration || "").slice(0, 12000), prompt: String(s.prompt || "").slice(0, 12000),
      duration, visual: VISUALS.includes(s.visual) ? s.visual : "corridor", camera: CAMERAS.includes(s.camera) ? s.camera : "push", action: PERFORMANCES.includes(s.action) ? s.action : "none", media: safeMedia(s.media) };
  });
  if (scenes.reduce((sum, s) => sum + s.duration, 0) > MAX_DURATION + 1e-8) throw new Error("Das Projekt darf höchstens zehn Minuten lang sein.");
  return { version: 1, id: String(raw.id || uid()).slice(0, 100), title: String(raw.title || "Meine Geschichte").slice(0, 120),
    input: String(raw.input || "").slice(0, 50000), genre: ["horror", "thriller", "fantasy", "documentary"].includes(raw.genre) ? raw.genre : "horror",
    format: ["landscape", "portrait", "square"].includes(raw.format) ? raw.format : "landscape", source: ["script", "outline", "example", "ollama", "real-footage-guide"].includes(raw.source) ? raw.source : "script",
    ambient: Boolean(raw.ambient), audioVolume: clamp(raw.audioVolume ?? 0.85, 0, 1), audio: safeMedia(raw.audio, true), scenes };
}
export function captions(project) {
  const list = [];
  let start = 0;
  for (const scene of project.scenes) {
    const words = scene.narration.trim().split(/\s+/).filter(Boolean);
    const groups = [];
    for (let i = 0; i < words.length; i += 14) groups.push(words.slice(i, i + 14).join(" "));
    groups.forEach((text, i) => list.push({ start: start + scene.duration * i / groups.length, end: start + scene.duration * (i + 1) / groups.length, text }));
    start += scene.duration;
  }
  return list;
}
export function toSrt(project) {
  const stamp = seconds => {
    const ms = Math.round(seconds * 1000);
    return String(Math.floor(ms / 3600000)).padStart(2, "0") + ":" + String(Math.floor(ms / 60000) % 60).padStart(2, "0") + ":" + String(Math.floor(ms / 1000) % 60).padStart(2, "0") + "," + String(ms % 1000).padStart(3, "0");
  };
  return captions(project).map((c, i) => (i + 1) + "\n" + stamp(c.start) + " --> " + stamp(c.end) + "\n" + c.text + "\n").join("\n");
}
export function aiProject(response, previous) {
  if (!response || !Array.isArray(response.scenes) || response.scenes.length === 0) throw new Error("Das lokale Modell hat kein gültiges Storyboard geliefert.");
  const target = Math.min(MAX_DURATION, totalDuration(previous));
  const scenes = response.scenes.slice(0, 60);
  if (target / scenes.length < 2) throw new Error("Das Modell hat zu viele Szenen für die gewählte Filmlänge geliefert. Bitte erneut versuchen oder die Dauer erhöhen.");
  return validateProject({ ...previous, title: response.title || previous.title, source: "ollama", audio: null, scenes: scenes.map((s, i) => ({
    title: s.title || "Szene " + (i + 1), narration: s.narration || "", prompt: s.prompt || s.narration || "",
    visual: VISUALS.includes(s.visual) ? s.visual : VISUALS[i % VISUALS.length], camera: CAMERAS.includes(s.camera) ? s.camera : "push",
    duration: sceneLength(target, scenes.length, i), media: null, action: "none"
  })) });
}
