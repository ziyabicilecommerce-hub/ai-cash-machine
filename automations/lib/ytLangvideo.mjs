// YouTube-Langvideo "The Erased Files" (22.11.): einmal pro Woche werden die englischen Shorts der letzten Tage zu einem
// 6-8-Minuten-Video zusammengeschnitten (Querformat, Kapitel je Fall). Lange Videos sammeln Wiedergabezeit für das
// YouTube-Partnerprogramm - Shorts zählen dafür kaum. Reine Funktionen - ohne Netz testbar.
import { SKRIPTE_EN } from '../schatten/skripteEn.mjs';
import { slug } from '../schatten/videobot.mjs';

export const YT_KANAL = '6ae8f39ae29c69a1713e3f33';
const TAG = 864e5;

// Welche Shorts kommen rein: YouTube-Releases der letzten 8 Tage, älteste zuerst, höchstens max.
export function auswahl(releases = [], jetzt = Date.now(), max = 10) {
  return releases
    .filter((r) => String(r.tag_name || '').startsWith(`horror-${YT_KANAL}-`) && jetzt - Date.parse(r.created_at) <= 8 * TAG)
    .map((r) => ({ r, mp4: (r.assets || []).find((a) => /\.mp4$/.test(a.name)) }))
    .filter((x) => x.mp4)
    .sort((a, b) => Date.parse(a.r.created_at) - Date.parse(b.r.created_at))
    .slice(-max)
    .map(({ r, mp4 }) => ({ slug: mp4.name.replace(/\.mp4$/, ''), url: mp4.browser_download_url }));
}

// Titel und Fallnummer zu einem Short (aus den englischen Geschichten; sonst aus dem Dateinamen)
export function infoZu(s) {
  const teil2 = /-part-2$/.test(s);
  const basis = s.replace(/-part-2$/, '');
  const g = SKRIPTE_EN.find((x) => slug(x.titel) === basis);
  const titel = g?.titel || basis.split('-').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ');
  return { titel: teil2 ? `${titel} (Part 2)` : titel, nr: g?.fall_nr || 0 };
}

const zeit = (sek) => { const s = Math.floor(sek); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
// Kapitel für die Beschreibung: YouTube braucht 0:00 als erstes und mind. 3 Kapitel à 10 s
export function kapitel(teile, intro = 4) {
  let t = intro;
  const zeilen = ['0:00 Intro'];
  for (const x of teile) { zeilen.push(`${zeit(t)} ${x.nr ? `File ${String(x.nr).padStart(3, '0')} – ` : ''}${x.titel}`); t += x.dauer; }
  return zeilen;
}

export function beitragLang(folge, teile, intro = 4) {
  const titel = `The Erased Files #${folge} – ${teile.length} Scary Stories the Police Erased`.slice(0, 100);
  const text = [`${teile.length} case files. Every one of them was erased. Every one of them happened at 3 AM.`, '',
    ...kapitel(teile, intro), '', 'New files every week – subscribe if you dare.', '#horror #scarystories #creepypasta',
    '(AI-generated: images, voice and text. Fictional stories.)'].join('\n').slice(0, 4900);
  return { titel, text, metadata: { youtube: { title: titel, categoryId: '24', madeForKids: false, isAiGenerated: true, privacy: 'public' } } };
}
