// Uebersetzung der Werbevideo-Skripte fuer den Welt-Bot (#96) und die Extra-Sprachen von #94.
import { kiJson } from './kiJson.mjs';
import { kurzHook } from './shopProdukte.mjs';
import { WELT_SPRACHEN } from './weltSprachen.mjs';

const SPRACHNAMEN = Object.fromEntries(Object.entries(WELT_SPRACHEN).map(([k, v]) => [k, v.name]));

// Uebersetzt Titel, Caption und Sprechtexte; Produktfotos bleiben gleich.
export async function uebersetzen(skript, sprache) {
  const d = await kiJson(
    `Uebersetze diese Werbevideo-Texte ins ${SPRACHNAMEN[sprache]}, natuerlich und muttersprachlich, Du-Ansprache, Laenge beibehalten, Markennamen und Preise unveraendert, Link unveraendert. ` +
      `Antworte NUR mit JSON: {"titel":"...","hook":"...","caption":"...","saetze":["..."]}\n${JSON.stringify({ titel: skript.titel, hook: skript.hook || '', caption: skript.caption, saetze: skript.szenen.map((x) => x.text) })}`,
    { maxTokens: 2500 }
  );
  const saetze = Array.isArray(d.saetze) ? d.saetze : [];
  if (saetze.length !== skript.szenen.length) throw new Error('Uebersetzung unvollstaendig');
  return { ...skript, titel: String(d.titel || skript.titel).slice(0, 120), hook: kurzHook(d.hook || d.titel || skript.titel), caption: String(d.caption || skript.caption).slice(0, 2000), szenen: skript.szenen.map((x, i) => ({ ...x, text: String(saetze[i]).slice(0, 400) })) };
}

// Uebersetzt bis zu 5 Skripte in EINER KI-Anfrage (spart das Anfrage-Limit der Gratis-KI);
// was dabei fehlt, wird einzeln nachuebersetzt.
export async function uebersetzenBuendel(skripte, sprache) {
  let d = {};
  try {
    d = await kiJson(
      `Uebersetze diese ${skripte.length} Werbevideo-Texte ins ${SPRACHNAMEN[sprache]}, natuerlich und muttersprachlich, Du-Ansprache, Laenge beibehalten, Markennamen und Preise unveraendert, Links unveraendert. ` +
        `Antworte NUR mit JSON: {"videos":[{"i":0,"titel":"...","hook":"...","caption":"...","saetze":["..."]}]} - fuer jedes Video, gleiche i, gleiche Anzahl saetze.\n` +
        JSON.stringify(skripte.map((sk, i) => ({ i, titel: sk.titel, hook: sk.hook || '', caption: sk.caption, saetze: sk.szenen.map((x) => x.text) }))),
      { maxTokens: 6000 }
    );
  } catch {
    /* einzeln nachuebersetzen */
  }
  const videos = Array.isArray(d.videos) ? d.videos : [];
  return Promise.all(skripte.map(async (sk, i) => {
    const t = videos.find((x) => Number(x?.i) === i);
    if (t && Array.isArray(t.saetze) && t.saetze.length === sk.szenen.length) {
      return { ...sk, titel: String(t.titel || sk.titel).slice(0, 120), hook: kurzHook(t.hook || t.titel || sk.titel), caption: String(t.caption || sk.caption).slice(0, 2000), szenen: sk.szenen.map((x, j) => ({ ...x, text: String(t.saetze[j]).slice(0, 400) })) };
    }
    return uebersetzen(sk, sprache).catch(() => null);
  }));
}

