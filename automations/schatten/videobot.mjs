// Videobot: macht aus einem einfachen Skript (Hook, Sätze, Monster-Satz, Ende) eine fertige Folge für story.py.
// Aufruf im Workflow: node videobot.mjs <issue-text-datei> <ziel.json>  -> schreibt die Folge, gibt "konto=..." aus.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ORTE = ['zug', 'flugzeug', 'haus', 'wald', 'aufzug'];
export const BOESE = ['schatten', 'gremlin', 'frau', 'hirsch'];
export const KONTEN = { futureflowx3: '6ac7cb606a5c39ccb6535fab', zyx_7851: '6ac7cae66a5c39ccb6535c40', futureflowxx: '6ac7ca226a5c39ccb65356a5' };
const STIMMEN = { mann: 'de-DE-FlorianMultilingualNeural', frau: 'de-DE-SeraphinaMultilingualNeural' };

const satz = (s, max = 160) => String(s || '').replace(/[<>{}`$\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
// Bildschirmtext: Großbuchstaben, höchstens ~42 Zeichen an einer Wortgrenze
function kurz(s, max = 42) {
  const t = satz(s).toUpperCase();
  if (t.length <= max) return t;
  return `${t.slice(0, max).replace(/\s+\S*$/, '')} …`;
}
const gelbVon = (t) => String(t).replace(/[^A-ZÄÖÜß0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3).sort((a, b) => b.length - a.length)[0] || '';
const zeile = (s, extra = {}, max = 42) => { const text = kurz(s, max); return { sprich: satz(s), text, gelb: gelbVon(text), pause: 0.15, ...extra }; };

// Skript prüfen - kommt aus einem öffentlichen Issue, also streng begrenzen
export function pruefen(skript) {
  const f = [];
  if (!satz(skript?.hook)) f.push('hook fehlt');
  const saetze = (Array.isArray(skript?.saetze) ? skript.saetze : []).map((x) => satz(x)).filter(Boolean);
  if (saetze.length < 3) f.push('mindestens 3 Sätze');
  if (saetze.length > 8) f.push('höchstens 8 Sätze');
  if (!satz(skript?.ende)) f.push('ende fehlt');
  if (skript?.ort && !ORTE.includes(skript.ort)) f.push(`ort muss einer von ${ORTE.join(', ')} sein`);
  if (skript?.boesewicht && !BOESE.includes(skript.boesewicht)) f.push(`boesewicht muss einer von ${BOESE.join(', ')} sein`);
  if (skript?.posten && !KONTEN[skript.posten]) f.push(`posten muss leer oder einer von ${Object.keys(KONTEN).join(', ')} sein`);
  return f;
}

// Aufbau, der bei uns die beste Sehdauer hatte: Schock-Hook -> ruhiger Start -> Nachricht -> immer näher -> Stille -> Jumpscare -> Twist -> Cliffhanger
export function baueFolge(skript) {
  const fehler = pruefen(skript);
  if (fehler.length) throw new Error(fehler.join('; '));
  const saetze = skript.saetze.map((x) => satz(x)).filter(Boolean);
  const szenen = [{ art: 'blitz', ...zeile(skript.hook, { schreck: true, angst: 0.85, pause: 0.1 }, 80) }];  // Hook ganz zeigen - die Pointe steht oft am Ende
  saetze.forEach((s, i) => {
    const letzte = i === saetze.length - 1, anteil = (i + 1) / saetze.length;
    if (letzte) { szenen.push({ art: 'dunkel', ...zeile(s, { dauer: 4.4, ...(skript.monster ? { monster: satz(skript.monster, 80), monster_text: kurz(skript.monster) } : {}) }) }); return; }
    if (i === 1 && skript.nachricht) {
      const absender = satz(skript.absender || 'Mama', 20);
      szenen.push({ art: 'nachricht', ...zeile(s, { absender, nachricht: satz(skript.nachricht, 90), schreck: true, pause: 0.3 }) }); return;
    }
    const art = /handy|anruf|ruf|nachricht|schreibt/i.test(s) ? 'handy' : i % 2 ? 'gesicht' : 'innen';
    szenen.push({ art, ...zeile(s, { angst: Math.round(Math.min(0.75, 0.1 + anteil * 0.7) * 100) / 100, ...(art === 'gesicht' ? { augen_bei: 1.2 } : {}) }) });
  });
  szenen.push({ art: 'fratze', dauer: 1.2, schreck: true });
  szenen.push({ art: 'ende', ...zeile(skript.ende, { schreck: true, angst: 1, blick: 1, ...(skript.monster2 ? { monster: satz(skript.monster2, 80), monster_text: kurz(skript.monster2) } : {}) }) });
  const weiter = satz(skript.weiter || '', 80);
  // Einzel-Video ohne Fortsetzung: kein falsches "Teil 2"-Versprechen, sondern die Frage für die Kommentare
  const schluss = weiter || `${satz(skript.frage || 'Was hättest du gemacht?', 80)} Schreib es in die Kommentare.`;
  szenen.push({ art: 'teil2', ...zeile(schluss, { pause: 0.8, cta: weiter ? 'FOLG MIR FÜR TEIL 2' : 'FOLG MIR FÜR MEHR' }) });
  const titel = satz(skript.titel || skript.hook, 60);
  const titelbild = kurz(skript.hook, 80);
  return {
    stimme: STIMMEN[skript.stimme] || STIMMEN.mann, tonhoehe: '+0Hz', tempo: '+16%', ton: 'schlicht', ki_bilder: false,
    ort: skript.ort || 'haus', fahrgaeste: [], boesewicht: skript.boesewicht || 'schatten',
    held: { farbe: [44, 56, 92], oberteil: 'hoodie', kopf: 'haare', haar: [46, 34, 26], hose: [38, 44, 70] },
    titel, titelbild, titelbild_gelb: gelbVon(titelbild), teile: 1,
    caption: `${satz(skript.hook, 120)} ${satz(skript.frage || 'Was hättest du gemacht?', 80)} 👇`, szenen,
  };
}

// Skript aus dem Issue-Text holen: erster ```json-Block
export function skriptAus(text) {
  const m = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/);
  if (!m) throw new Error('Kein ```json-Block im Issue gefunden');
  return JSON.parse(m[1]);
}

// Autopilot: Skripte reihum auf die Konten verteilen (jedes Konto eigene Geschichten), ohne Fortsetzungs-Versprechen
export const slug = (titel) => String(titel || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function autopilotListe(skripte, kontoIndex, konten = 3) {
  return skripte.map((s, i) => ({ s, i })).filter(({ i }) => i % konten === kontoIndex).map(({ s }) => ({ slug: slug(s.titel), skript: { ...s, weiter: '', posten: '' } }));
}

if (process.argv[2] === '--auto') {
  // node videobot.mjs --auto <skripte.json> <konto-index> <slug> <ziel.json>
  const [, , , quelle, idx, gewuenscht, ziel] = process.argv;
  const liste = autopilotListe(JSON.parse(readFileSync(quelle, 'utf8')).skripte, Number(idx));
  if (!gewuenscht) { console.log(liste.map((x) => x.slug).join('\n')); process.exit(0); }
  const treffer = liste.find((x) => x.slug === gewuenscht);
  if (!treffer) { console.error(`unbekannt: ${gewuenscht}`); process.exit(1); }
  writeFileSync(ziel, JSON.stringify(baueFolge(treffer.skript), null, 1));
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [quelle, ziel] = process.argv.slice(2);
  try {
    const skript = skriptAus(readFileSync(quelle, 'utf8'));
    writeFileSync(ziel, JSON.stringify(baueFolge(skript), null, 1));
    console.log(`konto=${skript.posten || ''}`);
    console.log(`kanal=${KONTEN[skript.posten] || ''}`);
  } catch (e) { console.error(`FEHLER: ${e.message}`); process.exit(1); }
}
