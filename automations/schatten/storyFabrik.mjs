// Story-Fabrik (26.11., Nutzer: "nimm alles auseinander und bau, was genau solche Storys erschafft").
// Bauplan aus der Analyse erfolgreicher KI-Animationsserien (Format übernehmen, Figuren/Welt/Geschichte EIGEN):
//  - eigene Welt aus belebten Gegenständen mit unverwechselbarer Silhouette (hier: Kerzen-Menschen aus Wachs)
//  - Familien-Drama mit Tabu-Bruch + Geld als Motiv + glamouröser Bösewicht -> starke Gefühle, viele Kommentare
//  - Schock-Bild in Sekunde 1, Schnitt alle 2-4 s, viele Gesichts-Nahaufnahmen, Detail-Einschübe (Geld, Hände)
//  - jede Figur in jeder Einstellung gleich (Figurenblatt als Referenz), Pixar-Look, echte Bewegung pro Einstellung
//  - Serie: gleiches Titelbild für jeden Teil, Cliffhanger am Ende, "Teil 2"
// Produktion: Bilder flux_3_image mit Figurenblatt-Referenz, Clips kling3_0 (Higgsfield), Schnitt higgs-schnitt.yml.
//   node automations/schatten/storyFabrik.mjs pruefen <folge.json>
//   node automations/schatten/storyFabrik.mjs plan <folge.json>     -> offene Higgsfield-Aufträge (Bilder, dann Clips)
import { readFileSync } from 'node:fs';

export const FORMAT = {
  einstellungen: [10, 16],      // so viele Schnitte pro Teil
  textMax: 80,                  // gesprochener Satz pro Einstellung (~3-4 s)
  hookMax: 70,
  bildModell: { model: 'flux_3_image', aspect_ratio: '9:16', resolution: '1k' },
  clipModell: { model: 'kling3_0', mode: 'std', sound: 'off', duration: 3, aspect_ratio: '9:16' },
  look: 'Pixar-style 3D animated film still, vertical 9:16, cinematic lighting, highly detailed, expressive big eyes, no text, no watermark',
};

// {MAMA} usw. im Bild-Prompt -> Figurenbeschreibung einsetzen und deren Figurenblatt als Referenz mitgeben
export function figurenIn(prompt = '', figuren = {}) {
  return Object.keys(figuren).filter((k) => String(prompt).includes(`{${k}}`));
}
export function promptBauen(prompt, figuren = {}) {
  let p = String(prompt);
  for (const [k, f] of Object.entries(figuren)) p = p.replaceAll(`{${k}}`, `the exact ${f.beschreibung} from the reference image`);
  return `${p}. ${FORMAT.look}`;
}

export function pruefen(ep) {
  const f = [];
  const sz = ep?.szenen || [];
  const [min, max] = FORMAT.einstellungen;
  if (sz.length < min || sz.length > max) f.push(`${sz.length} Einstellungen - Format verlangt ${min}-${max}`);
  if (!ep?.serie || !ep?.titel) f.push('Serie und Titel fehlen (gleiches Titelbild für jeden Teil)');
  if (!ep?.hook || ep.hook.length > FORMAT.hookMax) f.push(`Hook fehlt oder länger als ${FORMAT.hookMax} Zeichen`);
  if (sz[0] && sz[0].text !== ep.hook) f.push('Einstellung 1 muss der Hook sein (Schock in Sekunde 1)');
  sz.forEach((s, i) => {
    if (!String(s.text || '').trim()) f.push(`Einstellung ${i + 1}: kein Text`);
    if (String(s.text || '').length > FORMAT.textMax) f.push(`Einstellung ${i + 1}: Text zu lang (${s.text.length} > ${FORMAT.textMax})`);
    if (!s.bild && !s.bildPrompt) f.push(`Einstellung ${i + 1}: weder Bild noch Bild-Prompt`);
    for (const k of (String(s.bildPrompt || '').match(/\{([A-Z]+)\}/g) || []).map((x) => x.slice(1, -1))) {
      if (!ep.figuren?.[k]) f.push(`Einstellung ${i + 1}: unbekannte Figur {${k}}`);
      else if (!ep.figuren[k].blattJob && !ep.figuren[k].blattPrompt) f.push(`Figur ${k}: weder Figurenblatt noch Prompt dafür`);
    }
  });
  const letzte = String(sz.at(-1)?.text || '');
  if (!/teil\s*\d|…|\.\.\./i.test(letzte)) f.push('Letzte Einstellung braucht einen Cliffhanger ("…" oder "Teil 2")');
  return f;
}

// Offene Aufträge: erst fehlende Figurenblätter, dann Szenenbilder, dann Clips (Clip braucht das fertige Bild)
export function plan(ep) {
  const figuren = ep.figuren || {};
  const blaetter = Object.entries(figuren).filter(([, f]) => !f.blattJob && f.blattPrompt)
    .map(([k, f]) => ({ figur: k, params: { ...FORMAT.bildModell, prompt: `Character reference sheet, full body, front view, plain warm grey background: ${f.blattPrompt}. ${FORMAT.look}` } }));
  const bilder = [];
  const clips = [];
  (ep.szenen || []).forEach((s, i) => {
    const namen = figurenIn(s.bildPrompt, figuren);
    const fehlt = namen.filter((k) => !figuren[k].blattJob);
    if (!s.bild && s.bildPrompt) {
      bilder.push({ index: i + 1, wartetAuf: fehlt, params: { ...FORMAT.bildModell, prompt: promptBauen(s.bildPrompt, figuren),
        medias: [...new Set(namen.map((k) => figuren[k].blattJob).filter(Boolean))].map((value) => ({ role: 'image_references', value })) } });
    } else if (s.bild && !s.clip && s.bildJob) {
      clips.push({ index: i + 1, params: { ...FORMAT.clipModell, prompt: `${s.clipPrompt || 'subtle natural movement, slow camera push-in'}, Pixar animation`,
        medias: [{ role: 'start_image', value: s.bildJob }] } });
    }
  });
  const kosten = blaetter.length * 2 + bilder.length * 2 + (clips.length + bilder.length) * 4.5;
  return { blaetter, bilder, clips, schaetzungCredits: kosten, erzeugungen: blaetter.length + bilder.length * 2 + clips.length };
}

if (process.argv[1]?.endsWith('storyFabrik.mjs')) {
  const [, , befehl, datei] = process.argv;
  const ep = JSON.parse(readFileSync(datei, 'utf8'));
  if (befehl === 'pruefen') {
    const f = pruefen(ep);
    console.log(f.length ? f.map((x) => `✗ ${x}`).join('\n') : `✓ ${ep.titel}: Format erfüllt (${ep.szenen.length} Einstellungen)`);
    process.exit(f.length ? 1 : 0);
  }
  if (befehl === 'plan') console.log(JSON.stringify(plan(ep), null, 1));
}
