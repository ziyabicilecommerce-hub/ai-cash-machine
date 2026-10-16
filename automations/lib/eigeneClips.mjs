// Eigene KI-Clips (#100): Du machst gratis per Hand Clips (Kling, Bing Video Creator, Google Flow ...) und lädst sie
// in den Ordner eigene-clips/ hoch. Der Dateiname sagt, wozu der Clip passt (z. B. "schwarzes-loch.mp4",
// "vulkan-ausbruch.mp4", "biene.mp4"). Die Fabrik nimmt den passenden Clip als Hook (erste Szene) - jeden nur einmal.
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const ORDNER = 'eigene-clips';
const norm = (t) => String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ');
// Wörter ab 4 Buchstaben, Füllwörter raus.
const FUELL = new Set(['wenn', 'passiert', 'waere', 'eine', 'einen', 'einem', 'einer', 'dich', 'deinem', 'deine', 'durch', 'heute', 'clip', 'video', 'final', 'kling', 'bing', 'flow', 'hook']);
export const woerter = (t) => [...new Set(norm(t).split(' ').filter((w) => w.length >= 4 && !FUELL.has(w)))];

// dateien: Dateinamen; text: Titel + Frage + Bild-Prompt; benutzt: schon verwendete Dateien. -> Dateiname oder null
export function eigenenClipWaehlen(dateien, text, benutzt = []) {
  // Teilwörter zählen auch (deutsche Komposita: "vulkan" passt zu "supervulkan").
  const ziel = woerter(text);
  let best = null;
  for (const d of dateien.filter((x) => /\.(mp4|mov|webm)$/i.test(x) && !benutzt.includes(x))) {
    const treffer = woerter(d.replace(/\.[a-z0-9]+$/i, '')).filter((w) => ziel.some((z) => z.includes(w) || w.includes(z))).length;
    if (treffer && (!best || treffer > best.treffer)) best = { d, treffer };
  }
  return best?.d || null;
}

export const eigeneClipDateien = () => (existsSync(ORDNER) ? readdirSync(ORDNER) : []);
export const clipPfad = (datei) => join(ORDNER, datei);
