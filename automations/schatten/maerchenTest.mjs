// Test-Teil (23.11., Nutzer: "bau ein Test-Teil ... genau so wie Breadfolk"): Format übernehmen, Geschichte eigen.
// Eigene Welt: Kerzen-Menschen ("Wachsleute"). Dunkle Mutter-Kind-Geschichte mit Schockbild in Sekunde 1, Pixar-Look,
// gleiches Titelbild für jeden Teil (Serie). Jede Szene versucht einen echten KI-Clip (VIDEO_KI_ALLE=ja: Hugging-Face-
// Spaces Wan/LTX, Zhipu CogVideoX-Flash mit ZHIPU_API_KEY) - sonst KI-Bild mit 3D-Kamerafahrt.
//   node automations/schatten/maerchenTest.mjs <ordner>
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const LOOK = 'Pixar style 3D animation still, cute stylized characters, cinematic warm lighting, highly detailed, dramatic, no text, no watermark';
// Dieselbe Figurenbeschreibung in jedem Bild - so sehen Mutter und Kind überall gleich aus
const MAMA = 'a tall candle-woman made of soft cream-colored wax with a gentle face, big sad brown eyes, a small orange flame burning on top of her head like hair, wearing a patched grey apron';
const KIND = 'a small candle-boy made of light blue wax with big round eyes, a tiny flickering flame on his head, wearing a knitted red scarf';
const RAUM = 'tiny poor wooden attic room in winter, frost on the window, snow outside';

export const TEIL1 = {
  titel: 'Die Kerzenmutter – Teil 1',
  hook: 'Jede Nacht wird meine Mama ein Stück kleiner.',
  szenen: [
    { text: 'Jede Nacht wird meine Mama ein Stück kleiner.', bild: `${MAMA}, noticeably shorter, melted wax dripping down her body, standing in a dark ${RAUM}, ${KIND} looking up at her worried` },
    { text: 'Wir wohnen unterm Dach. Im Winter wird es hier so kalt, dass mein Docht fast ausgeht.', bild: `${KIND} shivering in a tiny bed under a thin blanket, his flame almost out, ${RAUM}` },
    { text: 'Dann setzt sich Mama zu mir. Und brennt.', bild: `${MAMA} sitting close to the bed, her head flame burning big and bright, warming ${KIND}, warm golden light filling the ${RAUM}` },
    { text: 'Am Morgen sind Wachstropfen auf dem Boden. Und Mama ist wieder kürzer.', bild: `close up of melted wax puddles on the wooden floor next to the bed, morning light, ${RAUM}` },
    { text: 'Ich frage sie, warum. Sie lächelt nur und sagt: Mir ist nicht kalt.', bild: `${MAMA} kneeling and smiling softly at ${KIND}, her body clearly shorter than before, tears of wax on her cheeks, ${RAUM}` },
    { text: 'Heute Nacht ist sie nur noch so groß wie ich.', bild: `${MAMA} now as small as ${KIND}, both standing face to face, she holds his hands, her flame weak, dark ${RAUM}, emotional` },
    { text: 'Sie hält ihren Docht an meinen. Und flüstert: Jetzt bist du dran, warm zu bleiben.', bild: `extreme close up: the mother candle touching her wick to the boy's wick, passing her flame, glowing sparks, emotional, dark background` },
    { text: 'Wenn ihr wissen wollt, was am Morgen auf dem Boden lag: Teil 2 kommt morgen.', bild: `${KIND} alone in the ${RAUM} at dawn, his flame now big and bright, looking down at something on the floor, cliffhanger, mysterious` },
  ],
};

async function main() {
  const ordner = resolve(process.argv[2] || 'out');
  mkdirSync(ordner, { recursive: true });
  const { videoBauen } = await import('../lib/videoFabrik.mjs');
  const v = await videoBauen({ titel: TEIL1.titel, szenen: TEIL1.szenen, cta: 'TEIL 2 MORGEN' }, join(ordner, 'bau'), {
    format: 'hoch', hook: TEIL1.hook, premium: true, sprache: 'de', stimme: 'de-DE-SeraphinaMultilingualNeural', stil: LOOK, kiClips: true });
  copyFileSync(v.pfad, join(ordner, 'kerzenmutter-1.mp4'));
  writeFileSync(join(ordner, 'info.json'), JSON.stringify({ titel: TEIL1.titel, dauer: Math.round(v.dauer), szenen: v.szenen }, null, 1));
  console.log(`[maerchen] fertig: ${TEIL1.titel} (${Math.round(v.dauer)} s)`);
}

if (process.argv[1]?.endsWith('maerchenTest.mjs')) main().catch((e) => { console.error(`[maerchen] ${String(e.message).slice(0, 300)}`); process.exit(1); });
