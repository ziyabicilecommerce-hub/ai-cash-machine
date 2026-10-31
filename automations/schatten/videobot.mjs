// Videobot: macht aus einem einfachen Skript (Hook, Sätze, Monster-Satz, Ende) eine fertige Folge für story.py.
// Aufruf im Workflow: node videobot.mjs <issue-text-datei> <ziel.json>  -> schreibt die Folge, gibt "konto=..." aus.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

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
  if (skript?.wahl !== undefined && !(Array.isArray(skript.wahl) && skript.wahl.length === 2 && skript.wahl.every((w) => satz(w) && satz(w).length <= 18))) f.push('wahl muss zwei kurze Antworten haben (je höchstens 18 Zeichen)');
  if (skript?.posten && !KONTEN[skript.posten]) f.push(`posten muss leer oder einer von ${Object.keys(KONTEN).join(', ')} sein`);
  return f;
}

// Kurz-Modus: unsere Zuschauer bleiben im Schnitt nur 3-6 s - also höchstens 3 Sätze (Start + die letzten zwei),
// schnellere Stimme, kürzere Stille, kein zweiter Monster-Satz. Ziel ~25 s statt ~35 s, damit mehr Leute bis zur Pointe bleiben.
export function kuerzen(saetze, max = 3) {
  if (saetze.length <= max) return saetze;
  return [...saetze.slice(0, max - 2), ...saetze.slice(-2)];
}

// Aufbau, der bei uns die beste Sehdauer hatte: Schock-Hook -> ruhiger Start -> Nachricht -> immer näher -> Stille -> Jumpscare -> Twist -> Cliffhanger
export function baueFolge(skript) {
  const fehler = pruefen(skript);
  if (fehler.length) throw new Error(fehler.join('; '));
  const kurz_ = !!skript.kurz;
  const alle = skript.saetze.map((x) => satz(x)).filter(Boolean);
  const saetze = kurz_ ? kuerzen(alle) : alle;
  const szenen = [{ art: 'blitz', ...zeile(skript.hook, { schreck: true, angst: 0.85, pause: 0.1 }, 80) }];  // Hook ganz zeigen - die Pointe steht oft am Ende
  saetze.forEach((s, i) => {
    const letzte = i === saetze.length - 1, anteil = (i + 1) / saetze.length;
    if (letzte) { szenen.push({ art: 'dunkel', ...zeile(s, { dauer: kurz_ ? 3 : 4.4, ...(skript.monster ? { monster: satz(skript.monster, 80), monster_text: kurz(skript.monster) } : {}) }) }); return; }
    if (i === 1 && skript.nachricht) {
      const absender = satz(skript.absender || 'Mama', 20);
      szenen.push({ art: 'nachricht', ...zeile(s, { absender, nachricht: satz(skript.nachricht, 90), schreck: true, pause: 0.3 }) }); return;
    }
    const art = /handy|anruf|ruf|nachricht|schreibt/i.test(s) ? 'handy' : i % 2 ? 'gesicht' : 'innen';
    szenen.push({ art, ...zeile(s, { angst: Math.round(Math.min(0.75, 0.1 + anteil * 0.7) * 100) / 100, ...(art === 'gesicht' ? { augen_bei: 1.2 } : {}) }) });
  });
  szenen.push({ art: 'fratze', dauer: kurz_ ? 0.9 : 1.2, schreck: true });
  szenen.push({ art: 'ende', ...zeile(skript.ende, { schreck: true, angst: 1, blick: 1, ...(skript.monster2 && !kurz_ ? { monster: satz(skript.monster2, 80), monster_text: kurz(skript.monster2) } : {}) }) });
  const weiter = satz(skript.weiter || '', 80);
  const frage = satz(skript.frage || 'Was hättest du gemacht?', 80);
  // Kommentar-Wahl "1 oder 2": eine Zahl tippen ist leichter als einen Satz schreiben - bringt mehr Kommentare
  const wahl = Array.isArray(skript.wahl) ? skript.wahl.map((w) => satz(w, 18)) : null;
  if (!weiter && wahl) {
    szenen.push({ art: 'teil2', sprich: `${frage} Eins: ${wahl[0]}. Zwei: ${wahl[1]}.${kurz_ ? '' : ' Schreib die Zahl in die Kommentare.'}`,
      text: '', wahl, frage, pause: 0.8, cta: 'KOMMENTIER 1 ODER 2' });  // story.py zeichnet die zwei Antwort-Karten
  } else {
    // Einzel-Video ohne Fortsetzung: kein falsches "Teil 2"-Versprechen, sondern die Frage für die Kommentare
    const schluss = weiter || `${frage} Schreib es in die Kommentare.`;
    szenen.push({ art: 'teil2', ...zeile(schluss, { pause: 0.8, cta: weiter ? 'FOLG MIR FÜR TEIL 2' : 'FOLG MIR FÜR MEHR' }) });
  }
  const titel = satz(skript.titel || skript.hook, 60);
  const titelbild = kurz(skript.hook, 80);
  return {
    stimme: STIMMEN[skript.stimme] || STIMMEN.mann, tonhoehe: '+0Hz', tempo: kurz_ ? '+24%' : '+16%', ton: 'schlicht', ki_bilder: false,
    ort: skript.ort || 'haus', fahrgaeste: [], boesewicht: skript.boesewicht || 'schatten',
    held: { farbe: [44, 56, 92], oberteil: 'hoodie', kopf: 'haare', haar: [46, 34, 26], hose: [38, 44, 70] },
    titel, titelbild, titelbild_gelb: gelbVon(titelbild), teile: 1,
    caption: `${satz(skript.hook, 120)} ${frage}${wahl && !weiter ? ` 1️⃣ ${wahl[0]} oder 2️⃣ ${wahl[1]}? Zahl in die Kommentare` : ''} 👇`, szenen,
  };
}

// GitHub-Formular (.github/ISSUE_TEMPLATE/videobot.yml): Abschnitte "### Überschrift" -> Skript-Felder
const FELDER = { 'hook': 'hook', 'geschichte': 'saetze', 'twist am ende': 'ende', 'frage an die zuschauer': 'frage', 'antwort 1': 'wahl1', 'antwort 2': 'wahl2',
  'handy-nachricht von': 'absender', 'nachricht': 'nachricht', 'monster flüstert': 'monster', 'ort': 'ort', 'bösewicht': 'boesewicht', 'stimme': 'stimme', 'länge': 'laenge', 'danach': 'posten' };
export function formularAus(text) {
  const roh = {};
  for (const teil of String(text || '').split(/^###\s+/m).slice(1)) {
    const [kopf, ...rest] = teil.split('\n');
    const feld = FELDER[kopf.trim().toLowerCase()];
    const wert = rest.join('\n').trim();
    if (feld && wert && wert !== '_No response_') roh[feld] = wert;
  }
  if (!roh.hook) throw new Error('Formular ohne Hook - bitte das Videobot-Formular benutzen');
  const s = { hook: roh.hook, saetze: String(roh.saetze || '').split('\n').map((x) => x.trim()).filter(Boolean), ende: roh.ende || '' };
  for (const k of ['frage', 'absender', 'nachricht', 'monster', 'ort', 'boesewicht', 'stimme']) if (roh[k]) s[k] = roh[k];
  if (roh.wahl1 && roh.wahl2) s.wahl = [roh.wahl1, roh.wahl2];
  s.kurz = !/^lang/i.test(roh.laenge || '');
  if (KONTEN[roh.posten]) s.posten = roh.posten;
  return s;
}

// Skript aus dem Issue-Text holen: erster ```json-Block, sonst das ausgefüllte Formular
export function skriptAus(text) {
  const m = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/);
  if (!m) return formularAus(text);
  return JSON.parse(m[1]);
}

// Autopilot: Skripte reihum auf die Konten verteilen (jedes Konto eigene Geschichten), ohne Fortsetzungs-Versprechen
export const slug = (titel) => String(titel || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// Gewinner-Bot: welche Geschichte lief auf welchem Konto wie gut (echte TikTok-Zahlen aus daten.json, Automation #103).
// Zuordnung über den Hook - jede Caption beginnt mit dem Hook der Geschichte.
export function gewinner(skripte, letzte = [], faktor = 1.2) {
  const treffer = [];
  for (const p of letzte) {
    if (!(p.aufrufe > 0) || !['horror', 'serie'].includes(p.format)) continue;
    const s = skripte.find((x) => String(p.text || '').startsWith(satz(x.hook).slice(0, 35)));
    if (s) treffer.push({ slug: slug(s.titel), konto: String(p.konto || '').replace(/^@/, ''), aufrufe: p.aufrufe, sehdauer: p.sehdauer || 0 });
  }
  const horror = letzte.filter((p) => p.aufrufe > 0 && ['horror', 'serie'].includes(p.format));
  const schnitt = horror.length ? horror.reduce((a, p) => a + p.aufrufe, 0) / horror.length : 0;
  // Punkte = Aufrufe x Sehdauer: viele Leute UND die bleiben dran
  return treffer.filter((t) => schnitt && t.aufrufe >= schnitt * faktor).sort((a, b) => b.aufrufe * (b.sehdauer || 1) - a.aufrufe * (a.sehdauer || 1));
}

// Autopilot: jedes Konto hat eigene Geschichten. Gewinner von den ANDEREN Konten kommen zuerst dran -
// was dort viral ging, bekommt auf jedem Konto eine Chance (der Workflow verhindert per Release, dass ein Konto etwas doppelt postet).
export function autopilotListe(skripte, kontoIndex, konten = 3, letzte = []) {
  const eintrag = (s) => ({ slug: slug(s.titel), skript: { ...s, weiter: '', posten: '', kurz: true } });
  const eigene = skripte.filter((_, i) => i % konten === kontoIndex).map(eintrag);
  const ich = Object.keys(KONTEN)[kontoIndex];
  const top = gewinner(skripte, letzte).filter((g) => g.konto !== ich).map((g) => g.slug);
  const vorne = [...new Set(top)].map((sl) => eintrag(skripte.find((s) => slug(s.titel) === sl)));
  return [...vorne, ...eigene.filter((e) => !top.includes(e.slug))];
}

if (process.argv[2] === '--auto') {
  // node videobot.mjs --auto <skripte.json> <konto-index> <slug> <ziel.json>
  const [, , , quelle, idx, gewuenscht, ziel] = process.argv;
  let letzte = [];
  try { letzte = JSON.parse(readFileSync(join(dirname(quelle), 'daten.json'), 'utf8')).letzte || []; } catch { /* ohne Zahlen: nur eigene Geschichten */ }
  const liste = autopilotListe(JSON.parse(readFileSync(quelle, 'utf8')).skripte, Number(idx), 3, letzte);
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
