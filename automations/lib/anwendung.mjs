// Anwendungs-Szene: eine Person benutzt das Produkt - erzeugt aus dem ECHTEN Produktfoto als Vorlage
// (Bild-Bearbeitungsmodell), damit im Video wirklich das Produkt aus dem Shop zu sehen ist.
// Klappt keins der Modelle, bleibt die Szene beim normalen Produktfoto. Im Video steht klein
// "KI-Beispiel", damit niemand die Szene fuer ein echtes Kundenfoto haelt.
import { writeFileSync } from 'node:fs';

const BASIS = 'https://image.pollinations.ai/prompt';
// Reihenfolge = Vorliebe. Ueber VIDEO_ANWENDUNG_MODELLE aenderbar; VIDEO_ANWENDUNG=0 schaltet ab.
const MODELLE = (process.env.VIDEO_ANWENDUNG_MODELLE || 'kontext,gptimage,nanobanana,seedream').split(',').map((m) => m.trim()).filter(Boolean);
export const anwendungAn = () => !/^(0|nein|aus|false)$/i.test(String(process.env.VIDEO_ANWENDUNG || '').trim());

export const ANWENDUNG_REGEL =
  'Zeige in GENAU einer Szene (Index 2 oder 3, nicht die erste, nicht die letzte) ein Anwendungs-Beispiel: eine Person benutzt das Produkt ' +
  'so, wie es gedacht ist. Dafuer "anwendung": {"szene": Index, "foto": Index des Produktfotos, das am besten zeigt, wie das Produkt aussieht, ' +
  '"prompt": englischer Prompt: realistic smartphone photo, one adult person using this exact product in a typical everyday situation, fully clothed, natural light, product clearly visible}. ' +
  'Der gesprochene Satz dieser Szene beschreibt, was die Person gerade macht. ';

// Haengt die Anwendung an die passende Szene. d = KI-Antwort {szene, foto, prompt}, fotos = Produktfoto-URLs.
export function anwendungEinbauen(skript, d, fotos) {
  const n = skript.szenen.length;
  const prompt = String(d?.prompt || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!anwendungAn() || n < 4 || prompt.length < 15 || !fotos.length) return skript;
  const k = Math.min(Math.max(Number.isInteger(d.szene) ? d.szene : 2, 1), n - 2);
  const ref = fotos[Number.isInteger(d.foto) && d.foto >= 0 && d.foto < fotos.length ? d.foto : 0];
  skript.szenen[k] = { ...skript.szenen[k], anwendung: { prompt, ref } };
  return skript;
}

export function anwendungURL(prompt, ref, { breite, hoehe, model, seed }) {
  const params = new URLSearchParams({ model, image: ref, width: String(breite), height: String(hoehe), nologo: 'true', seed: String(seed) });
  return `${BASIS}/${encodeURIComponent(`${prompt}. Keep the product exactly as in the reference image (shape, color, details). Vertical 9:16 photo.`)}?${params}`;
}

// Probiert die Modelle der Reihe nach; true, sobald ein echtes Bild (> 20 KB) da ist.
export async function anwendungBild({ prompt, ref }, ziel, { breite, hoehe, seed = Math.floor(Math.random() * 1e9), laden = fetch } = {}) {
  for (const model of MODELLE) {
    try {
      const res = await laden(anwendungURL(prompt, ref, { breite, hoehe, model, seed }), { signal: AbortSignal.timeout(150000) });
      const typ = res.headers.get('content-type') || '';
      const daten = res.ok && typ.startsWith('image/') ? Buffer.from(await res.arrayBuffer()) : null;
      if (daten && daten.length > 20000) {
        writeFileSync(ziel, daten);
        console.log(`[video-fabrik] Anwendungs-Szene mit Modell ${model} erzeugt.`);
        return true;
      }
      console.log(`[video-fabrik] Anwendungs-Szene: ${model} lieferte kein Bild (${res.status} ${typ}).`);
    } catch (err) {
      console.log(`[video-fabrik] Anwendungs-Szene: ${model} fehlgeschlagen (${String(err.message).slice(0, 80)}).`);
    }
  }
  return false;
}

// Ohne/Mit im geteilten Bild: links dieselbe Situation ohne Produkt, rechts mit dem echten Produkt.
// Bewusst "OHNE" / "MIT" statt "Vorher/Nachher" - es wird kein Ergebnis versprochen, nur gezeigt,
// wie das Produkt benutzt wird. Ebenfalls als KI-Beispiel gekennzeichnet.
export const VERGLEICH_REGEL =
  'Die Problem-Szene (Index 1) wird ein Ohne/Mit-Vergleich im geteilten Bild: "vergleich": {"szene": 1, ' +
  '"ohne": englischer Prompt: realistic smartphone photo, one adult person in the typical problem situation WITHOUT the product, fully clothed, ' +
  '"mit": englischer Prompt: the same kind of person in the same setting now using this exact product, fully clothed, product clearly visible}. ' +
  'Keine uebertriebenen Ergebnisse, keine Heilversprechen. ';

export function vergleichEinbauen(skript, d, fotos) {
  const n = skript.szenen.length;
  const [ohne, mit] = [d?.ohne, d?.mit].map((x) => String(x || '').replace(/\s+/g, ' ').trim().slice(0, 400));
  if (!anwendungAn() || n < 4 || ohne.length < 15 || mit.length < 15 || !fotos.length) return skript;
  const k = Math.min(Math.max(Number.isInteger(d.szene) ? d.szene : 1, 1), n - 2);
  const { anwendung, ...rest } = skript.szenen[k];
  skript.szenen[k] = { ...rest, vergleich: { ohne, mit, ref: anwendung?.ref || fotos[0] } };
  // Liegt die Anwendungs-Szene auf derselben Szene, rueckt sie eine weiter (nie auf die letzte).
  if (anwendung && k + 1 < n - 1 && !skript.szenen[k + 1].anwendung) skript.szenen[k + 1] = { ...skript.szenen[k + 1], anwendung };
  return skript;
}
