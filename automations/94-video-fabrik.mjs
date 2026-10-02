// Video-Fabrik - erzeugt taeglich fertige Werbevideos mit Sprecherin und Untertiteln,
// komplett ohne API-Key: KI-Skript (kostenlose KI-Kette), Pollinations-Bilder,
// edge-tts-Stimme, ffmpeg-Schnitt. Mit Shopify-Zugang: Werbevideos zu echten
// Produkten mit echten Produktfotos. Standard: 5 Kurzvideos (9:16), optional
// ein langes Video bis 10 Minuten (VIDEO_FABRIK_LANG_MINUTEN).
//   node automations/94-video-fabrik.mjs            -> Videos nach out/ bauen
//   node automations/94-video-fabrik.mjs --feed URL -> video-feed/videos.json ergaenzen
//   node automations/94-video-fabrik.mjs --metricool URL -> in Metricool einplanen
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { config } from './lib/config.mjs';
import { videoBauen } from './lib/videoFabrik.mjs';
import { kapitelText, teaserBauen, zusammenschnittBauen } from './lib/videoExtras.mjs';
import { WELT_SPRACHEN, sprachGruppen } from './lib/weltSprachen.mjs';
import { kiText, kiJson, szenenRetten, szenenAus } from './lib/kiJson.mjs';
import { uebersetzen, uebersetzenBuendel } from './lib/uebersetzen.mjs';
import { skripteLaden, skripteSpeichern, uebersetzungenLaden, uebersetzungenSpeichern, schluessel, anwenden, auszug } from './lib/weltCache.mjs';
import { premiumAn, themaFuer, preisText } from './lib/premium.mjs';
import { kurzHook, reinText, aktiveProdukte, topListeSkript, HOOK_REGELN } from './lib/shopProdukte.mjs';
import { moderatorinAn, moderatorinEinfuegen } from './lib/moderatorin.mjs';
import { laborWinkel } from './lib/laborWinkel.mjs';
import { nachbauenEinplanen, stateLaden as pruefungLaden } from './lib/videoPruefung.mjs';
import { ANWENDUNG_REGEL, anwendungEinbauen, VERGLEICH_REGEL, vergleichEinbauen, ANFAENGE_REGEL, anfaengeEinbauen, anfaengeAblegen, skriptMitFormat, planWert, notfallSkript, werbeText, skriptBlock, ANWENDUNG_STANDARD } from './lib/skriptExtras.mjs';
// KI-Moderatorin als Bild-im-Bild in die deutschen Premium-Videos (wenn der Workflow sie eingerichtet hat).
async function mitModeratorin(v, nr) {
  if (!moderatorinAn()) return;
  try { await moderatorinEinfuegen(v.pfad, v.stimme, nr); console.log(`[94-video-fabrik] Moderatorin ${((nr - 1) % 6) + 1} eingefuegt`); } catch (err) { console.log(`[94-video-fabrik] Moderatorin fehlgeschlagen: ${String(err.message).slice(0, 120)} ... ${String(err.stderr || '').slice(-900)}`); }
}
import { karussellBauen } from './lib/karussell.mjs';

const OUT = 'out';
const MANIFEST = join(OUT, 'manifest.json');
const FEED = 'video-feed/videos.json';
const FEED_WELT = Math.min(Math.max(parseInt(process.env.FEED_WELT_MAX || '6000', 10) || 6000, 0), 30000);
const env = (k, d = '') => (process.env[k] || d).trim();

const ANZAHL_ROH = parseInt(env('VIDEO_FABRIK_ANZAHL', String(planWert('fabrikAnzahl', 5))), 10); // Engpass-Chef-Plan, Variable hat Vorrang
const ANZAHL = Math.min(Math.max(Number.isNaN(ANZAHL_ROH) ? 5 : ANZAHL_ROH, 0), 10);
// Welt-Bot (#96): bis zu 60 Produkte x 12 Varianten x 50 Sprachen (Standard 21 x 10 x 50 = ca. 10.500 Videos/Tag).
const WELT_ANZAHL = Math.min(Math.max(parseInt(env('VIDEO_FABRIK_ANZAHL', '21'), 10) || 21, 1), 60);
// Welt-Bot: mehrere Varianten je Produkt (eigene Erzaehlweise, Kulisse, Farbstil) - 21 x 10 x 50 = ~10.500 Videos/Tag.
const WELT_VARIANTEN = Math.min(Math.max(parseInt(env('VIDEO_FABRIK_VARIANTEN', '1'), 10) || 1, 1), 12);
const WINKEL = ['', 'Mini-Story in Ich-Form aus Sicht einer Kundin oder eines Kunden.', 'Top-3-Liste: drei konkrete Gruende fuer das Produkt.', 'Vorher/Nachher: erst der nervige Alltag ohne das Produkt, dann die Loesung.', 'POV-Stil ("POV: du ..."), locker und witzig.', 'Vergleich: ein gewoehnliches Produkt gegen dieses Produkt.', 'Schnelle Tipps-Form: "So nutzt du ..." mit kurzen Schritten.', 'Frage-Antwort: Beginne mit einer Frage, die viele sich stellen.', 'Ruhig und hochwertig, wie ein Premium-Markenspot.', 'Geschenkidee: fuer wen das Produkt das perfekte Geschenk ist.', 'Alltagsmoment: eine typische Situation zuhause oder im Buero.', 'Mythos vs. Wahrheit rund um das Problem, das das Produkt loest.'];
// Zeitbudget je Render-Job: danach aufhoeren, damit alles Fertige noch hochgeladen wird (Job-Limit 6 h).
const WELT_ZEIT_MIN = Math.min(Math.max(parseInt(env('WELT_ZEIT_MINUTEN', '290'), 10) || 290, 10), 330);
const LANG_MIN = Math.min(Math.max(parseFloat(env('VIDEO_FABRIK_LANG_MINUTEN', '0')) || 0, 0), 60);
const STIL = env('VIDEO_FABRIK_STIL', 'cinematic, vibrant colors, high detail, no text');
const STIMME = env('VIDEO_FABRIK_STIMME', 'de-DE-SeraphinaMultilingualNeural');
const LIFESTYLE = env('VIDEO_FABRIK_LIFESTYLE', 'nein').toLowerCase() === 'ja';
// Premium-Look fuer Produkt-Ads (Freisteller, KI-Hintergrund, Parallaxe, Wort-Untertitel, Beat); VIDEO_PREMIUM=0 schaltet ab.
const PREMIUM = premiumAn();
// Karussell-Slides zu jedem Premium-Produktvideo; VIDEO_KARUSSELL=0 schaltet ab.
const KARUSSELL = !/^(0|nein|aus|false)$/i.test(env('VIDEO_KARUSSELL'));
// Zusaetzliche Sprachversionen der Produkt-Kurzvideos, z. B. "en,es,tr" (Deutsch ist immer dabei).
const STIMMEN = Object.fromEntries(Object.entries(WELT_SPRACHEN).map(([k, v]) => [k, v.stimme]));
// "alle" = jede Sprache aus lib/weltSprachen.mjs.
const sprachListe = (text) => (text.trim().toLowerCase() === 'alle' ? Object.keys(STIMMEN) : text.toLowerCase().split(',').map((x) => x.trim()).filter((x) => STIMMEN[x]));
const EXTRA_SPRACHEN = sprachListe(env('VIDEO_FABRIK_SPRACHEN'));

function themen() {
  const liste = (env('VIDEO_FABRIK_THEMEN') || config.SOCIAL_AUTOPILOT_THEMEN || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (liste.length) return liste;
  const nische = config.SHOP_NISCHE || 'Gaming-Setup und Schreibtisch-Zubehoer';
  return [`Top-Tipps rund um ${nische}`, `Fehler, die jeder bei ${nische} macht`, `So sparst du Geld bei ${nische}`, `Trends 2026: ${nische}`, `Vorher-Nachher: ${nische}`];
}

const slug = (t) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'video';

function szenenPruefen(szenen) {
  return (Array.isArray(szenen) ? szenen : [])
    .map((s) => ({ text: String(s.text || '').replace(/\s+/g, ' ').trim().slice(0, 600), bild: String(s.bild || s.bild_prompt || '').trim().slice(0, 400) }))
    .filter((s) => s.text.length > 5 && s.bild.length > 5);
}

async function kurzSkript(thema) {
  const d = await kiJson(
    `Schreibe ein Skript fuer ein 40-60 Sekunden Social-Media-Video (TikTok/Reels/Shorts) auf Deutsch zum Thema "${thema}" fuer den Shop "${config.SHOP_NAME}". ` +
      'Starker Hook in Szene 1, 6 bis 8 Szenen, jede Szene 1-2 kurze gesprochene Saetze, am Ende ein Call-to-Action. ' +
      'Antworte NUR mit JSON: {"titel":"...","caption":"kurze Caption mit 3-5 Hashtags","szenen":[{"text":"gesprochener Text","bild":"englischer Bild-Prompt, konkrete Szene"}]}',
    { maxTokens: 1800 }
  );
  return { titel: String(d.titel || thema).slice(0, 120), caption: String(d.caption || thema).slice(0, 2000), szenen: szenenPruefen(szenenAus(d)).slice(0, 10) };
}

async function szenenPortion(prompt) {
  try {
    return szenenPruefen((await kiJson(prompt, { maxTokens: 2500 })).szenen);
  } catch {
    try {
      return szenenPruefen(szenenRetten(await kiText(prompt, { maxTokens: 2500 })));
    } catch {
      return [];
    }
  }
}

// Geschaetzte Sprechdauer: edge-tts spricht Deutsch mit rund 2,3 Woertern pro Sekunde.
const sprechSekunden = (szenen) => szenen.reduce((n, s) => n + s.text.split(/\s+/).length / 2.3 + 0.35, 0);

// Schreibt Kapitel fuer Kapitel, bis die Wunschlaenge (nach Sprechdauer) wirklich erreicht ist.
async function langSkript(thema, minuten) {
  const zielSek = minuten * 60;
  const ziel = Math.round(zielSek / 15);
  const gliederung = await kiJson(
    `Plane ein ${minuten}-Minuten-YouTube-Video auf Deutsch zum Thema "${thema}". Antworte NUR mit JSON: {"titel":"...","caption":"Beschreibung mit Hashtags","kapitel":["Kapitel 1", "..."]} mit 5 bis 12 Kapiteln. Es ist KEIN Werbevideo: keine Produkte, keine Shop-Erwaehnung, reiner Unterhaltungs-/Wissensinhalt.`,
    { maxTokens: 800 }
  );
  const kapitel = (gliederung.kapitel || []).map(String).slice(0, 12);
  if (!kapitel.length) throw new Error('Keine Kapitel erhalten');
  const proKapitel = Math.max(3, Math.round(ziel / kapitel.length));
  const sekProKapitel = zielSek / kapitel.length;
  const szenen = [];
  for (const [ki, k] of kapitel.entries()) {
    const imKapitel = [];
    const position = ki === 0 ? 'Das ist das ERSTE Kapitel: fuehre in das Thema ein.' : ki === kapitel.length - 1 ? 'Das ist das LETZTE Kapitel: hier darf das Video zum Abschluss kommen.' : 'Das ist ein Kapitel in der MITTE: erzaehle weiter, beende das Video NICHT, kein Abschied, kein Fazit.';
    for (let versuch = 0; sprechSekunden(imKapitel) < sekProKapitel * 0.97 && versuch < Math.ceil(proKapitel / 5) * 2 + 4; versuch++) {
      const n = Math.max(2, Math.min(5, Math.ceil((sekProKapitel - sprechSekunden(imKapitel)) / 15)));
      const bisher = imKapitel.length ? ` Bisher gesagt (nicht wiederholen, nahtlos weitererzaehlen): "${imKapitel.map((x) => x.text).join(' ').slice(-600)}"` : '';
      imKapitel.push(...(await szenenPortion(
        `Video "${gliederung.titel}". Kapitel ${ki + 1} von ${kapitel.length}: "${k}". ${position} Schreibe die naechsten ${n} Szenen: je 3-4 ruhig gesprochene, klare und verstaendliche Saetze, AUSSCHLIESSLICH auf Deutsch (kein Englisch), echte deutsche Woerter, fehlerfreie Rechtschreibung, du-Form, ca. 15 Sekunden. Der Bild-Prompt (Englisch) beschreibt ein eindrucksvolles, jugendfreies Bild ohne Text.${bisher} ` +
          'Antworte NUR mit JSON: {"szenen":[{"text":"...","bild":"englischer Bild-Prompt"}]}'
      )).slice(0, n));
    }
    // In 8er-Portionen, sonst schneidet das Gratis-Modell bei langen Kapiteln die Antwort ab.
    for (let j = 0; j < imKapitel.length; j += 8) await korrekturLesen(imKapitel.slice(j, j + 8), gliederung.titel);
    console.log(`[94-video-fabrik] Kapitel "${k.slice(0, 50)}": ${imKapitel.length} Szenen, ca. ${Math.round(sprechSekunden(imKapitel) / 60)} Min.`);
    if (imKapitel.length) imKapitel[0].kapitel = k.slice(0, 80);
    szenen.push(...imKapitel);
  }
  if (szenen.length < Math.max(5, ziel * 0.4)) throw new Error(`Zu wenige Szenen (${szenen.length}/${ziel})`);
  console.log(`[94-video-fabrik] Skript: ${szenen.length} Szenen, ca. ${Math.round(sprechSekunden(szenen) / 60)} von ${minuten} Min.`);
  return { titel: String(gliederung.titel || thema).slice(0, 120), caption: String(gliederung.caption || thema).slice(0, 4000), szenen };
}

async function korrekturLesen(szenen, produktName) {
  try {
    const d = await kiJson(
      `Du bist Lektorin. Korrigiere diese deutschen Sprechtexte zu "${produktName}": Rechtschreibung, Grammatik, erfundene oder sinnlose Woerter durch passende echte Woerter ersetzen, englische Saetze ins Deutsche uebersetzen, Du-Form, natuerlich gesprochen. Inhalt und Laenge beibehalten. ` +
        `Antworte NUR mit JSON: {"saetze":["...", ...]} in derselben Reihenfolge.\n${JSON.stringify(szenen.map((s) => s.text))}`,
      { maxTokens: 1200 }
    );
    const saetze = Array.isArray(d.saetze) ? d.saetze : [];
    if (saetze.length === szenen.length) saetze.forEach((t, i) => { if (typeof t === 'string' && t.trim().length > 3) szenen[i].text = t.trim().slice(0, 400); });
  } catch {
    /* Original behalten */
  }
}

// Zwei Anlaeufe: das Gratis-Modell liefert gelegentlich nur 1-2 Szenen.
async function produktSkript(p, winkel = '') {
  let skript;
  for (let versuch = 0; versuch < 2; versuch++) {
    try { skript = await produktSkriptEinmal(p, winkel); } catch (err) { console.log(`[94-video-fabrik] KI weg (${String(err.message).slice(0, 80)}) - Notfall-Skript aus dem Shop-Text`); return { ...ausDaten(notfallSkript(p), p), ohneKi: true }; }
    if (skript.szenen.length >= 5) break;
  }
  return skript.szenen.length >= 5 ? skript : (console.log( // zu kurz (kleine lokale KI): lieber ehrliches Notfall-Skript als 10-s-Video
`[94-video-fabrik] KI-Skript zu kurz (${skript.szenen.length} Szenen) - Notfall-Skript`), { ...ausDaten(notfallSkript(p), p), ohneKi: true });
}

async function produktSkriptEinmal(p, winkel = '') {
  const preis = p.variants?.[0]?.price;
  const link = `${p.shopUrl}/products/${p.handle}`;
  const fotos = p.images.map((b) => b.src);
  const d = await kiJson(
    `Du bist Top-Werbetexterin fuer TikTok/Reels-Ads. Schreibe ein 25-40 Sekunden Werbe-Skript auf Deutsch, sprich die Zuschauer mit "du" an (niemals "Sie"), fuer das Produkt "${p.title}" aus dem Shop "${p.shopName}". ` +
      `Produktinfos: ${reinText(p.body_html).slice(0, 700)}${preis ? ` Preis: ${preis} EUR.` : ''} ` +
      HOOK_REGELN + ANWENDUNG_REGEL + VERGLEICH_REGEL + ANFAENGE_REGEL + 'Aufbau: 1) dieser Hook-Satz, 2) Problem, 3) 2-3 konkrete Vorteile des Produkts, 4) Call-to-Action ("Link in der Bio"). 5 bis 7 Szenen, pro Szene 1 kurzer gesprochener Satz. Nichts erfinden, was nicht in den Produktinfos steht. ' +
      'Nutze NUR Eigenschaften, die woertlich in den Produktinfos stehen - keine erfundenen Features, Zahlen oder Versprechen. Keine Floskeln. ' +
      (winkel ? `Erzaehlweise dieser Variante: ${winkel} ` : '') +
      (LIFESTYLE
        ? `Es gibt ${fotos.length} Produktfotos (Index 0-${fotos.length - 1}). Pro Szene entweder "foto": Index ODER "bild": englischer Prompt fuer ein passendes, jugendfreies Lifestyle-Bild (vollstaendig bekleidete Personen). Mindestens die Haelfte der Szenen mit Produktfoto. `
        : `Es gibt ${fotos.length} Produktfotos (Index 0-${fotos.length - 1}). Pro Szene "foto": Index des passendsten Produktfotos. `) +
      'Dazu "hintergrund": englischer Bild-Prompt (max. 12 Woerter) fuer eine leere, edle Umgebung, die zum Einsatzort des Produkts passt - ohne Produkt, ohne Personen, ohne Text. ' +
      'Antworte NUR mit JSON, "szenen" ZUERST (5-7 Eintraege): {"szenen":[{"text":"...","foto":0}],"titel":"...","hook":"Text-Overlay fuer Sekunde 0-3, 2-5 Woerter, weckt Neugier (Frage/Warnung/Widerspruch), NICHT der Produktname","caption":"Caption mit 3-5 Hashtags","hintergrund":"...","anwendung":{"szene":2,"foto":0,"prompt":"...","schritte":["...","...","..."]},"vergleich":{"szene":1,"ohne":"...","mit":"..."},"anfaenge":[{"typ":"frage","satz":"...","hook":"..."}]}',
    { maxTokens: 1800 }
  );
  const skript = ausDaten(d, p);
  if (skript.szenen.length < 5) console.log(`[94-video-fabrik] KI-Antwort mit ${skript.szenen.length} Szenen - Schlüssel: ${Object.keys(d || {}).join(',') || '-'} · ${JSON.stringify(d).slice(0, 300)}`);
  await korrekturLesen(skript.szenen, p.title);
  return skript;
}

// Weitere Varianten eines Produkts in EINER KI-Anfrage (spart bei 10 Varianten 90 % der Anfragen -
// die kostenlosen KI-Dienste drosseln sonst). Variante 1 kommt einzeln und korrekturgelesen.
async function variantenSkripte(p, winkelListe) {
  const preis = p.variants?.[0]?.price;
  const fotos = p.images.map((b) => b.src);
  const d = await kiJson(
    `Du bist Top-Werbetexterin fuer TikTok/Reels-Ads. Schreibe ${winkelListe.length} VERSCHIEDENE 25-40 Sekunden Werbe-Skripte auf Deutsch (Du-Ansprache) fuer "${p.title}" aus dem Shop "${p.shopName}". ` +
      `Produktinfos: ${reinText(p.body_html).slice(0, 700)}${preis ? ` Preis: ${preis} EUR.` : ''} Nutze NUR Eigenschaften aus den Produktinfos, nichts erfinden. ` +
      HOOK_REGELN + ANWENDUNG_REGEL + `Je Skript 5-7 Szenen mit je 1 kurzen Satz, jede Variante mit eigenem Hook-Satz am Anfang, "Link in der Bio" am Ende. Es gibt ${fotos.length} Produktfotos (Index 0-${fotos.length - 1}), pro Szene "foto": Index. ` +
      `Erzaehlweisen in dieser Reihenfolge: ${winkelListe.map((w, i) => `${i + 1}) ${w}`).join(' ')} ` +
      'Je Skript "hintergrund": englischer Bild-Prompt (max. 12 Woerter) fuer eine leere, edle Umgebung ohne Produkt, Personen oder Text - jedes Skript eine andere Umgebung. ' +
      'Antworte NUR mit JSON: {"varianten":[{"titel":"...","hook":"2-5 Woerter Neugier-Overlay, nicht der Produktname","caption":"mit 3-5 Hashtags","hintergrund":"...","szenen":[{"text":"...","foto":0}],"anwendung":{"szene":2,"foto":0,"prompt":"..."}}]}',
    { maxTokens: Math.min(1200 * winkelListe.length, 8000) }
  );
  return (Array.isArray(d.varianten) ? d.varianten : []).map((v) => ausDaten(v, p)).filter((x) => x.szenen.length >= 3);
}

function ausDaten(d, p) {
  const preis = p.variants?.[0]?.price;
  const link = `${p.shopUrl}/products/${p.handle}`;
  const fotos = p.images.map((b) => b.src);
  const szenen = szenenAus(d).map((s, i) => {
    const text = String(s.text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    const idx = Number.isInteger(s.foto) && s.foto >= 0 && s.foto < fotos.length ? s.foto : null;
    const bild = LIFESTYLE ? String(s.bild || '').trim().slice(0, 300) : '';
    return { text, foto: idx !== null ? fotos[idx] : bild ? '' : fotos[i % fotos.length], bild };
  }).filter((s) => s.text.length > 3).slice(0, 8);
  if (szenen.length && !szenen[0].foto) szenen[0].foto = fotos[0];
  const caption = `${String(d.caption || p.title).slice(0, 1800)}${link ? `\n\n👉 ${link}` : ''}`;
  // Fester Seed je Produkt: derselbe KI-Hintergrund in allen Sprachen und an allen Tagen.
  const seed = [...String(p.handle || p.title)].reduce((h, c) => (h * 31 + c.codePointAt(0)) % 1_000_000_007, 7);
  const hintergrund = { prompt: String(d.hintergrund || `elegant minimal setting for ${p.title}`).replace(/\s+/g, ' ').trim().slice(0, 300), seed };
  const shop = (() => { try { return new URL(p.shopUrl).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  return anfaengeEinbauen(vergleichEinbauen(anwendungEinbauen({ titel: String(d.titel || p.title).slice(0, 120), hook: kurzHook(d.hook || d.titel || p.title), caption, hintergrund, preis: Number(preis) || 0, waehrung: 'EUR', shop, link, szenen }, d.anwendung?.prompt ? d.anwendung : ANWENDUNG_STANDARD, fotos), d.vergleich, fotos), d.anfaenge);
}

async function ablegen(manifest, v, skript, a, nummer, sprache) {
  const basis = `${new Date().toISOString().slice(0, 10)}-${nummer}-${sprache === 'de' ? '' : `${sprache}-`}${slug(skript.titel)}`;
  copyFileSync(v.pfad, join(OUT, 'videos', `${basis}.mp4`));
  let vorschau = '';
  if (v.vorschau) {
    vorschau = `${basis}.jpg`;
    copyFileSync(v.vorschau, join(OUT, 'videos', vorschau));
  }
  const kapitel = kapitelText(v.kapitel || []);
  const caption = kapitel ? `${skript.caption}\n\nKapitel:\n${kapitel}` : skript.caption;
  const eintrag = { datei: `${basis}.mp4`, vorschau, sprache, titel: skript.titel, caption, thema: a.thema, format: a.format, dauer: Math.round(v.dauer), szenen: v.szenen, gruppe: basis, hookTyp: skript.hookTyp || '', winkel: skript.winkelName || '', formatName: skript.formatName || '', stil: skript.stilName || '', werbetext: werbeText(skript).slice(0, 1500), ...anfaengeAblegen(v, basis, join(OUT, 'videos')) };
  // Karussell: 4 Bild-Slides (4:5) aus denselben Ebenen - Hook, 2 Vorteile, Preis + CTA.
  // Nur fuer die erste Variante, damit ein Release unter 1.000 Dateien bleibt.
  if (KARUSSELL && v.ebenen && skript.szenen.length >= 3 && !skript.variante) {
    try {
      const sz = skript.szenen.map((x) => x.text);
      const slides = karussellBauen({
        ebenen: v.ebenen, thema: themaFuer(skript.hintergrund?.seed), sprache, ordner: dirname(v.pfad),
        texte: { hook: skript.hook || skript.titel, vorteile: sz.slice(1, -1).slice(0, 2), cta: sz.at(-1), preis: preisText(skript.preis, sprache, skript.waehrung), shop: skript.shop },
      });
      eintrag.karussell = slides.map((pfad, k) => { const name = `${basis}-k${k + 1}.jpg`; copyFileSync(pfad, join(OUT, 'videos', name)); return name; });
    } catch (err) {
      console.log(`[94-video-fabrik] Karussell fehlgeschlagen: ${String(err.message).slice(0, 150)}`);
    }
  }
  if (!a.minuten) return void manifest.push(eintrag);
  // Lange Videos: Untertitel-Datei fuer YouTube und ein 9:16-Teaser fuer Shorts/Reels/TikTok.
  if (v.untertitel && existsSync(v.untertitel)) {
    eintrag.untertitel = `${basis}.srt`;
    copyFileSync(v.untertitel, join(OUT, 'videos', eintrag.untertitel));
  }
  manifest.push(eintrag);
  try {
    await teaserBauen(v.pfad, join(OUT, 'videos', `${basis}-teaser.mp4`));
    manifest.push({ datei: `${basis}-teaser.mp4`, vorschau: '', sprache, titel: `${skript.titel} (Teaser)`, caption: `Das ganze Video (${Math.round(v.dauer / 60)} Min.) jetzt auf YouTube!\n\n${skript.caption}`.slice(0, 2000), thema: a.thema, format: 'hoch', dauer: 55, szenen: 0, teaser: true });
  } catch (err) {
    console.log(`[94-video-fabrik] Teaser fehlgeschlagen: ${String(err.message).slice(0, 150)}`);
  }
}

async function bauen() {
  mkdirSync(join(OUT, 'videos'), { recursive: true });
  const liste = themen();
  const tag = Math.floor(Date.now() / 86400000);
  const produkte = await aktiveProdukte();
  let auftraege = produkte.length
    ? Array.from({ length: Math.min(ANZAHL, produkte.length) }, (_, i) => { const p = produkte[(tag * ANZAHL + i) % produkte.length]; return { thema: p.title, produkt: p, format: 'hoch' }; })
    : Array.from({ length: ANZAHL }, (_, i) => ({ thema: liste[(tag * ANZAHL + i) % liste.length], format: 'hoch' }));
  // Vom Video-Prüfer aussortierte Produkte werden zuerst neu gebaut.
  if (produkte.length) auftraege = nachbauenEinplanen(auftraege, produkte, pruefungLaden().nachbauen);
  console.log(`[94-video-fabrik] ${produkte.length ? `${produkte.length} Produkte gefunden - Produkt-Ads` : 'kein Shopify-Zugang - Themen-Videos'}, ${auftraege.length} Videos geplant`);
  if (LANG_MIN > 0) auftraege.push({ thema: liste[tag % liste.length], format: 'quer', minuten: LANG_MIN });

  // Ersatzprodukte: scheitert ein Produkt, springt das naechste ein, damit das Tagesziel steht.
  const reserve = produkte.filter((p) => !auftraege.some((a) => a.produkt === p));
  const manifest = [];
  for (const [i, a] of auftraege.entries()) {
    const start = Date.now();
    try {
      // Getesteten Gewinner-Hook aus dem Werbe-Labor nutzen, falls frisch vorhanden.
      const skript = a.produkt ? await skriptMitFormat(a.produkt, laborWinkel(a.produkt), produktSkript) : a.minuten ? await langSkript(a.thema, a.minuten) : await kurzSkript(a.thema);
      if (skript.szenen.length < 3) throw new Error('Skript zu kurz');
      const hook = a.format === 'hoch' ? skript.hook || kurzHook(skript.titel) : '';
      const v = await videoBauen(skript, join(OUT, `arbeit-${i}`), { format: a.format, stimme: STIMME, stil: STIL, hook, bildAlle: a.minuten > 20 ? 2 : 1, musik: a.minuten ? 'ruhig' : '', premium: PREMIUM && !!a.produkt, anfaenge: a.format === 'hoch' ? skript.anfaenge || [] : [] });
      if (PREMIUM && a.produkt) for (const x of [v, ...(v.varianten || [])]) await mitModeratorin(x, i + 1 + tag);
      await ablegen(manifest, v, skript, a, i + 1, 'de');
      console.log(`[94-video-fabrik] ✓ ${manifest.filter((m) => !m.teaser).at(-1).datei} (${Math.round(v.dauer)} s, ${v.szenen} Szenen, ${Math.round((Date.now() - start) / 1000)} s Bauzeit)`);
      if (a.produkt) {
        for (const sprache of EXTRA_SPRACHEN) {
          try {
            const uebersetzt = await uebersetzen(skript, sprache);
            const vs = await videoBauen(uebersetzt, join(OUT, `arbeit-${i}-${sprache}`), { format: a.format, stimme: STIMMEN[sprache], stil: STIL, hook: uebersetzt.hook, premium: PREMIUM, sprache });
            await ablegen(manifest, vs, uebersetzt, a, i + 1, sprache);
            console.log(`[94-video-fabrik] ✓ ${manifest.at(-1).datei} (${sprache})`);
          } catch (err) {
            console.log(`[94-video-fabrik] ✗ ${sprache}-Version von "${a.thema}": ${err.message}`);
          }
        }
      }
    } catch (err) {
      console.log(`[94-video-fabrik] ✗ "${a.thema}": ${err.message}`);
      if (a.produkt && reserve.length && !a.ersatz) {
        const p = reserve.shift();
        auftraege.push({ thema: p.title, produkt: p, format: a.format, ersatz: true });
        console.log(`[94-video-fabrik] Ersatz: "${p.title}"`);
      }
    }
  }
  // Top-5-Countdown je Shop (neues Format): taeglich andere 5 Produkte je Shop.
  for (const shop of PREMIUM ? [...new Set(produkte.map((p) => p.shopName))] : []) {
    const eigene = produkte.filter((p) => p.shopName === shop);
    if (eigene.length < 3) continue;
    const auswahl = Array.from({ length: Math.min(5, eigene.length) }, (_, k) => eigene[(tag * 5 + k) % eigene.length]);
    try {
      const skript = await topListeSkript(shop, auswahl);
      const v = await videoBauen(skript, join(OUT, `arbeit-top-${shop}`), { format: 'hoch', stimme: STIMME, hook: skript.hook, premium: true, sprache: 'de' });
      await mitModeratorin(v, shop.length + tag);
      await ablegen(manifest, v, skript, { thema: `Top 5 ${shop}`, format: 'hoch' }, `top5-${shop.toLowerCase()}`, 'de');
      console.log(`[94-video-fabrik] ✓ Top-5 ${shop} (${Math.round(v.dauer)} s)`);
    } catch (err) {
      console.log(`[94-video-fabrik] ✗ Top-5 ${shop}: ${String(err.message).slice(0, 150)}`);
    }
  }
  // Tages-Highlights aus den deutschen Produkt-Ads (Hook-Sekunden hintereinander).
  const ads = manifest.filter((m) => m.sprache === 'de' && m.format === 'hoch' && !m.teaser);
  if (ads.length >= 3) {
    try {
      const datei = `${new Date().toISOString().slice(0, 10)}-highlights.mp4`;
      const dauer = await zusammenschnittBauen(ads.map((m) => join(OUT, 'videos', m.datei)), join(OUT, 'videos', datei));
      manifest.push({ datei, vorschau: ads[0].vorschau, sprache: 'de', titel: `Die ${ads.length} Highlights des Tages`, caption: `Heute neu: ${ads.map((m) => m.thema).join(' · ').slice(0, 1500)}\n\n#Produkte #Highlights #Shopping`, thema: 'highlights', format: 'hoch', dauer, szenen: ads.length });
      console.log(`[94-video-fabrik] ✓ ${datei} (${dauer} s)`);
    } catch (err) {
      console.log(`[94-video-fabrik] Highlights fehlgeschlagen: ${String(err.message).slice(0, 150)}`);
    }
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1)); // erst nach Top-5/Highlights - sonst fehlen sie in Pruefer und Feed
  console.log(`[94-video-fabrik] ${manifest.filter((m) => !m.teaser).length}/${auftraege.length} Videos fertig (+ ${manifest.filter((m) => m.teaser).length} Teaser)`);
  if (!manifest.length) process.exit(1);
}

function feedErgaenzen(basisUrl) {
  // Ohne Manifest (z. B. Podcast-Lauf) gibt es keine neuen Videos - nur alte Eintraege pflegen.
  if (!existsSync(MANIFEST)) { mkdirSync(OUT, { recursive: true }); writeFileSync(MANIFEST, '[]'); } // z. B. im Poster-Lauf gibt es out/ nicht
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const feed = existsSync(FEED) ? JSON.parse(readFileSync(FEED, 'utf8')) : { videos: [] };
  const basis = basisUrl.replace(/\/$/, '');
  // m.basis: eigenes Release je Welt-Bot-Gruppe (ein Release fasst hoechstens 1.000 Dateien).
  const neu = manifest.map((m) => { const b = String(m.basis || basis).replace(/\/$/, ''); return { ...m, url: `${b}/${encodeURIComponent(m.datei)}`, vorschauUrl: m.vorschau ? `${b}/${encodeURIComponent(m.vorschau)}` : '', erstellt: new Date().toISOString() }; });
  // Geloeschte Releases (z. B. alte Marathon-Videos) aus dem Feed entfernen.
  const weg = env('FEED_ENTFERNEN_TAGS').split(',').map((t) => t.trim()).filter(Boolean);
  const alt = (feed.videos || []).filter((v) => !weg.some((t) => String(v.url || '').includes(`/download/${t}/`)));
  // Getrennte Kontingente: Deutsch/sprachfreie Videos (die der Direkt-Poster postet) duerfen nie von
  // den ~10.000 Welt-Videos pro Tag verdraengt werden. Welt-Eintraege mit gekuerzter Caption (Dateigroesse).
  // Nichts Neues und nichts entfernt: Datei nicht neu schreiben (sonst waechst das Repo bei jedem Lauf).
  if (!neu.length && alt.length === (feed.videos || []).length) return console.log('[94-video-fabrik] Feed unveraendert');
  const haupt = (v) => ['de', 'int'].includes(v.sprache || 'de');
  const alle = [...neu, ...alt];
  const welt = alle.filter((v) => !haupt(v)).slice(0, FEED_WELT).map((v) => ({ ...v, caption: String(v.caption || '').slice(0, 400) }));
  feed.videos = [...alle.filter(haupt).slice(0, 2000), ...welt].sort((x, y) => String(y.erstellt || '').localeCompare(String(x.erstellt || '')));
  feed.stand = new Date().toISOString();
  mkdirSync('video-feed', { recursive: true });
  writeFileSync(FEED, JSON.stringify(feed));
  console.log(`[94-video-fabrik] Feed: ${neu.length} neue, ${feed.videos.length} insgesamt`);
}


// Welt-Bot (#96), Schritt 1: deutsche Produkt-Skripte des Tages fuer alle Sprach-Jobs festlegen.
async function skripteSchreiben() {
  mkdirSync(OUT, { recursive: true });
  const produkte = await aktiveProdukte();
  if (!produkte.length) throw new Error('Keine Produkte gefunden');
  const tag = Math.floor(Date.now() / 86400000);
  const auswahl = Array.from({ length: Math.min(WELT_ANZAHL, produkte.length) }, (_, i) => produkte[(tag * 7 + i) % produkte.length]);
  const fertig = [];
  // Gedaechtnis: fertige Skripte je Produkt werden WELT_SKRIPT_TAGE lang wiederverwendet (keine KI noetig).
  const cache = skripteLaden();
  const maxAlter = Math.max(1, parseInt(env('WELT_SKRIPT_TAGE', '14'), 10) || 14) * 86400000;
  const frisch = (e, n) => e && Date.now() - e.erstellt < maxAlter && (e.skripte || []).length >= n;
  // Zeitbudget: danach geht es mit den fertigen Skripten weiter (statt dass der Job abbricht und alles verloren ist).
  const bis = Date.now() + Math.max(10, parseInt(env('WELT_SKRIPT_MIN', '110'), 10) || 110) * 60000;
  let kiAus = 0; // Anfragen hintereinander gescheitert, weil die Gratis-KI ausgelastet ist
  let ausGedaechtnis = 0;
  // Nacheinander: die Gratis-KI drosselt parallele Anfragen (429). Je Produkt 2 Anfragen.
  for (const [i, p] of auswahl.entries()) {
    const id = `p:${p.handle || p.title}`;
    let liste = [];
    if (frisch(cache[id], WELT_VARIANTEN)) {
      liste = cache[id].skripte;
      ausGedaechtnis++;
    } else if (Date.now() < bis && kiAus < 3) {
      try {
        const erste = await produktSkript(p);
        if (erste.szenen.length >= 3) liste.push(erste);
      } catch (err) {
        if (/nicht verf|429|daily|leere Antwort/i.test(String(err.message))) kiAus++;
        console.log(`[94-video-fabrik] ✗ "${p.title}" Variante 1: ${String(err.message).slice(0, 160)}`);
      }
      // Ist die Gratis-KI 2x hintereinander ausgelastet, nur noch Variante 1 je Produkt (spart die langen Wartezeiten).
      if (WELT_VARIANTEN > 1 && kiAus < 2 && liste.length) {
        try {
          liste.push(...(await variantenSkripte(p, WINKEL.slice(1, WELT_VARIANTEN))));
          kiAus = 0;
        } catch (err) {
          if (/nicht verf|429|daily|leere Antwort/i.test(String(err.message))) kiAus++;
          console.log(`[94-video-fabrik] ✗ "${p.title}" weitere Varianten: ${String(err.message).slice(0, 160)}`);
        }
      }
      // Nur speichern, wenn es mehr ist als das, was schon im Gedaechtnis liegt.
      if (liste.length && liste.length >= (cache[id]?.skripte || []).length) cache[id] = { erstellt: Date.now(), skripte: liste };
      else if (cache[id]?.skripte?.length) liste = cache[id].skripte; // KI aus: aeltere Skripte weiterbenutzen
    } else if (cache[id]?.skripte?.length) {
      liste = cache[id].skripte;
      ausGedaechtnis++;
    }
    // Neuer Hintergrund jeden Tag (Tages-Seed) - auch wenn der Text aus dem Gedaechtnis kommt.
    liste.slice(0, WELT_VARIANTEN).forEach((original, v) => {
      const skript = structuredClone(original);
      skript.hintergrund = { ...skript.hintergrund, seed: (skript.hintergrund?.seed || 0) + v * 7919 + tag * 104729 };
      skript.variante = v;
      fertig.push({ k: i * 100 + v, thema: p.title, skript });
    });
    console.log(`[94-video-fabrik] Welt-Skripte "${p.title}": ${Math.min(liste.length, WELT_VARIANTEN)}/${WELT_VARIANTEN} Varianten`);
  }
  // Top-5-Countdowns je Shop laufen auch durch alle 50 Sprachen (Gedaechtnis: 7 Tage je Shop).
  for (const [j, shop] of [...new Set(auswahl.map((p) => p.shopName))].entries()) {
    const eigene = produkte.filter((p) => p.shopName === shop);
    if (eigene.length < 3) continue;
    const id = `top5:${shop}`;
    try {
      if (!(cache[id] && Date.now() - cache[id].erstellt < 7 * 86400000)) {
        cache[id] = { erstellt: Date.now(), skripte: [await topListeSkript(shop, Array.from({ length: Math.min(5, eigene.length) }, (_, x) => eigene[(tag * 5 + x) % eigene.length]))] };
      }
      fertig.push({ k: 900000 + j, thema: `Top 5 ${shop}`, skript: structuredClone(cache[id].skripte[0]) });
      console.log(`[94-video-fabrik] Welt-Skript Top-5 ${shop}`);
    } catch (err) {
      if (cache[id]?.skripte?.length) fertig.push({ k: 900000 + j, thema: `Top 5 ${shop}`, skript: structuredClone(cache[id].skripte[0]) });
      console.log(`[94-video-fabrik] ✗ Top-5 ${shop}: ${String(err.message).slice(0, 160)}`);
    }
  }
  skripteSpeichern(cache, OUT);
  console.log(`[94-video-fabrik] Gedaechtnis: ${ausGedaechtnis} Produkte ohne KI, ${Object.keys(cache).length} Eintraege gespeichert`);
  const skripte = fertig.sort((x, y) => x.k - y.k).map(({ thema, skript }, i) => ({ nr: i + 1, thema, skript }));
  if (!skripte.length) throw new Error('Kein einziges Skript');
  writeFileSync(join(OUT, 'skripte.json'), JSON.stringify(skripte, null, 1));
  let codes = EXTRA_SPRACHEN.length ? EXTRA_SPRACHEN : Object.keys(STIMMEN);
  // Stimmenliste von edge-tts (im Workflow erzeugt): nur Sprachen, deren Stimme es wirklich gibt.
  if (existsSync(join(OUT, 'stimmen.txt'))) {
    const vorhanden = readFileSync(join(OUT, 'stimmen.txt'), 'utf8');
    const fehlt = codes.filter((c) => !vorhanden.includes(STIMMEN[c]));
    if (fehlt.length) console.log(`[94-video-fabrik] Stimme nicht gefunden, uebersprungen: ${fehlt.join(', ')}`);
    if (fehlt.length < codes.length) codes = codes.filter((c) => !fehlt.includes(c));
  }
  // So viele Sprachen je Job, dass ein Job ca. 250 Videos baut (bei vielen Varianten: 1 Sprache je Job).
  const gruppen = sprachGruppen(codes, Math.max(1, Math.min(5, Math.floor(250 / skripte.length))));
  writeFileSync(join(OUT, 'gruppen.json'), JSON.stringify(gruppen));
  console.log(`[94-video-fabrik] ${skripte.length} Skripte, ${codes.length} Sprachen in ${gruppen.length} Gruppen = ${skripte.length * codes.length} Videos`);
}

// Welt-Bot (#96), Schritt 2: die Skripte in die Sprachen dieses Jobs uebersetzen und vertonen.
async function sprachenRendern(liste) {
  mkdirSync(join(OUT, 'videos'), { recursive: true });
  const skripte = JSON.parse(readFileSync(join(OUT, 'skripte.json'), 'utf8'));
  const manifest = [];
  const ende = Date.now() + WELT_ZEIT_MIN * 60000;
  const gueltig = new Set(skripte.map((x) => schluessel(x.skript)));
  for (const sprache of sprachListe(liste)) {
    const gedaechtnis = uebersetzungenLaden(sprache);
    let kiAus = 0;
    for (let b = 0; b < skripte.length && Date.now() < ende; b += 5) {
      const teil = skripte.slice(b, b + 5);
      // Erst ins Gedaechtnis schauen - nur was fehlt, geht an die Gratis-KI.
      const aus = teil.map((x) => anwenden(x.skript, gedaechtnis[schluessel(x.skript)], kurzHook));
      const fehlt = teil.filter((_, j) => !aus[j]);
      const neu = fehlt.length && kiAus < 2 ? await uebersetzenBuendel(fehlt.map((x) => x.skript), sprache) : [];
      if (fehlt.length && !neu.some(Boolean)) kiAus++; else if (neu.some(Boolean)) kiAus = 0;
      fehlt.forEach((x, j) => { if (neu[j]) gedaechtnis[schluessel(x.skript)] = auszug(neu[j]); });
      let n = 0;
      const uebersetzungen = aus.map((u) => u || neu[n++] || null);
      for (const [j, { nr, thema }] of teil.entries()) {
        const arbeit = join(OUT, `welt-${nr}-${sprache}`);
        try {
          const uebersetzt = uebersetzungen[j];
          if (!uebersetzt) throw new Error('Uebersetzung fehlgeschlagen');
          // Werbe-Check VOR dem Rendern: eine Uebersetzung kann Heilversprechen o. ae. einschleppen - dann gar nicht erst bauen
          // (spart Renderzeit) und nicht im Gedaechtnis lassen, sonst scheitert sie jeden Tag erneut.
          const gesperrt = skriptBlock(uebersetzt);
          if (gesperrt.length) { delete gedaechtnis[schluessel(teil[j].skript)]; throw new Error(`Werbe-Check: ${gesperrt.map((t) => `„${t.stelle}“`).join(', ')}`); }
          const v = await videoBauen(uebersetzt, arbeit, { format: 'hoch', stimme: STIMMEN[sprache], stil: STIL, hook: uebersetzt.hook, premium: PREMIUM, sprache });
          await ablegen(manifest, v, uebersetzt, { thema, format: 'hoch' }, nr, sprache);
          console.log(`[94-video-fabrik] ✓ ${sprache}: ${manifest.at(-1).datei}`);
        } catch (err) {
          console.log(`[94-video-fabrik] ✗ ${sprache} "${thema}": ${String(err.message).slice(0, 200)}`);
        }
        // Arbeitsordner sofort loeschen - bei ~105 Videos pro Runner wird sonst die Platte voll.
        rmSync(arbeit, { recursive: true, force: true });
      }
    }
    uebersetzungenSpeichern(sprache, gedaechtnis, gueltig, OUT);
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  console.log(`[94-video-fabrik] ${manifest.length} Welt-Videos fertig${Date.now() >= ende ? ' (Zeitbudget erreicht, Rest uebersprungen)' : ''}`);
}

const [modus, arg] = process.argv.slice(2);
const MODI = { '--feed': () => feedErgaenzen(arg), '--metricool': async () => (await import('./lib/metricoolPlanen.mjs')).metricoolPlanen(arg), '--skripte': skripteSchreiben, '--sprachen': () => sprachenRendern(arg || '') };
Promise.resolve((MODI[modus] || bauen)()).catch((err) => {
  console.error('[94-video-fabrik] Fehler:', err.message);
  process.exit(1);
});
