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
import { kapitelText, teaserBauen } from './lib/videoExtras.mjs';
import { WELT_SPRACHEN, sprachGruppen } from './lib/weltSprachen.mjs';
import { kiText, kiJson, szenenRetten } from './lib/kiJson.mjs';
import { premiumAn, themaFuer, preisText } from './lib/premium.mjs';
import { karussellBauen } from './lib/karussell.mjs';

const OUT = 'out';
const MANIFEST = join(OUT, 'manifest.json');
const FEED = 'video-feed/videos.json';
const env = (k, d = '') => (process.env[k] || d).trim();

const ANZAHL_ROH = parseInt(env('VIDEO_FABRIK_ANZAHL', '5'), 10);
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
const SPRACHNAMEN = Object.fromEntries(Object.entries(WELT_SPRACHEN).map(([k, v]) => [k, v.name]));
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
  return { titel: String(d.titel || thema).slice(0, 120), caption: String(d.caption || thema).slice(0, 2000), szenen: szenenPruefen(d.szenen).slice(0, 10) };
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

// Hook fuer das Bild: hoechstens 5 Woerter / 32 Zeichen, an Wortgrenze gekuerzt.
function kurzHook(text) {
  let h = '';
  for (const wort of String(text).replace(/[#"]/g, '').split(/\s+/).filter(Boolean).slice(0, 5)) {
    if ((h + ' ' + wort).trim().length > 32) break;
    h = (h + ' ' + wort).trim();
  }
  return h.replace(/[\s–:,-]+$/, '');
}

const reinText = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const SHOPS = env('VIDEO_FABRIK_SHOPS', 'https://www.deskrebel.store,https://purivelle.store').split(',').map((u) => u.trim().replace(/\/$/, '')).filter(Boolean);

function shopName(url) {
  const host = new URL(url).hostname.replace(/^www\./, '').split('.')[0];
  return { deskrebel: 'DeskRebel', purivelle: 'Purivelle' }[host] || host.charAt(0).toUpperCase() + host.slice(1);
}

// Oeffentliche Shopify-Storefront (/products.json) - kein Key noetig.
async function aktiveProdukte() {
  const alle = [];
  for (const shop of SHOPS) {
    try {
      const res = await fetch(`${shop}/products.json?limit=250`, { signal: AbortSignal.timeout(30000), headers: { 'user-agent': 'Mozilla/5.0 (video-fabrik)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      const liste = (d.products || []).filter((p) => (p.images || []).length).map((p) => ({ ...p, shopUrl: shop, shopName: shopName(shop) }));
      console.log(`[94-video-fabrik] ${shopName(shop)}: ${liste.length} Produkte mit Fotos`);
      alle.push(liste);
    } catch (err) {
      console.log(`[94-video-fabrik] ${shop} nicht lesbar (${err.message})`);
    }
  }
  // abwechselnd aus allen Shops mischen
  const gemischt = [];
  for (let i = 0; alle.some((l) => i < l.length); i++) for (const l of alle) if (l[i]) gemischt.push(l[i]);
  return gemischt;
}

// Zweiter Durchgang: Rechtschreibung/Grammatik/Wortwahl pruefen, Du-Form,
// Produktname korrekt. Bei Fehlern bleiben die Originaltexte erhalten.
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
    skript = await produktSkriptEinmal(p, winkel);
    if (skript.szenen.length >= 3) break;
  }
  return skript;
}

async function produktSkriptEinmal(p, winkel = '') {
  const preis = p.variants?.[0]?.price;
  const link = `${p.shopUrl}/products/${p.handle}`;
  const fotos = p.images.map((b) => b.src);
  const d = await kiJson(
    `Du bist Top-Werbetexterin fuer TikTok/Reels-Ads. Schreibe ein 25-40 Sekunden Werbe-Skript auf Deutsch, sprich die Zuschauer mit "du" an (niemals "Sie"), fuer das Produkt "${p.title}" aus dem Shop "${p.shopName}". ` +
      `Produktinfos: ${reinText(p.body_html).slice(0, 700)}${preis ? ` Preis: ${preis} EUR.` : ''} ` +
      'Aufbau: 1) Hook, der in 2 Sekunden fesselt, 2) Problem, 3) 2-3 konkrete Vorteile des Produkts, 4) Call-to-Action ("Link in der Bio"). 5 bis 7 Szenen, pro Szene 1 kurzer gesprochener Satz. Nichts erfinden, was nicht in den Produktinfos steht. ' +
      'Nutze NUR Eigenschaften, die woertlich in den Produktinfos stehen - keine erfundenen Features, Zahlen oder Versprechen. Keine Floskeln. ' +
      (winkel ? `Erzaehlweise dieser Variante: ${winkel} ` : '') +
      (LIFESTYLE
        ? `Es gibt ${fotos.length} Produktfotos (Index 0-${fotos.length - 1}). Pro Szene entweder "foto": Index ODER "bild": englischer Prompt fuer ein passendes, jugendfreies Lifestyle-Bild (vollstaendig bekleidete Personen). Mindestens die Haelfte der Szenen mit Produktfoto. `
        : `Es gibt ${fotos.length} Produktfotos (Index 0-${fotos.length - 1}). Pro Szene "foto": Index des passendsten Produktfotos. `) +
      'Dazu "hintergrund": englischer Bild-Prompt (max. 12 Woerter) fuer eine leere, edle Umgebung, die zum Einsatzort des Produkts passt - ohne Produkt, ohne Personen, ohne Text. ' +
      'Antworte NUR mit JSON: {"titel":"...","hook":"knallige Schlagzeile, maximal 5 Woerter","caption":"Caption mit 3-5 Hashtags","hintergrund":"...","szenen":[{"text":"...","foto":0}]}',
    { maxTokens: 1500 }
  );
  const skript = ausDaten(d, p);
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
      `Je Skript 5-7 Szenen mit je 1 kurzen Satz, Hook am Anfang, "Link in der Bio" am Ende. Es gibt ${fotos.length} Produktfotos (Index 0-${fotos.length - 1}), pro Szene "foto": Index. ` +
      `Erzaehlweisen in dieser Reihenfolge: ${winkelListe.map((w, i) => `${i + 1}) ${w}`).join(' ')} ` +
      'Je Skript "hintergrund": englischer Bild-Prompt (max. 12 Woerter) fuer eine leere, edle Umgebung ohne Produkt, Personen oder Text - jedes Skript eine andere Umgebung. ' +
      'Antworte NUR mit JSON: {"varianten":[{"titel":"...","hook":"max. 5 Woerter","caption":"mit 3-5 Hashtags","hintergrund":"...","szenen":[{"text":"...","foto":0}]}]}',
    { maxTokens: Math.min(1200 * winkelListe.length, 8000) }
  );
  return (Array.isArray(d.varianten) ? d.varianten : []).map((v) => ausDaten(v, p)).filter((x) => x.szenen.length >= 3);
}

function ausDaten(d, p) {
  const preis = p.variants?.[0]?.price;
  const link = `${p.shopUrl}/products/${p.handle}`;
  const fotos = p.images.map((b) => b.src);
  const szenen = (Array.isArray(d.szenen) ? d.szenen : []).map((s, i) => {
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
  return { titel: String(d.titel || p.title).slice(0, 120), hook: kurzHook(d.hook || d.titel || p.title), caption, hintergrund, preis: Number(preis) || 0, waehrung: 'EUR', shop, szenen };
}

// Uebersetzt Titel, Caption und Sprechtexte; Produktfotos bleiben gleich.
async function uebersetzen(skript, sprache) {
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
async function uebersetzenBuendel(skripte, sprache) {
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
  const eintrag = { datei: `${basis}.mp4`, vorschau, sprache, titel: skript.titel, caption, thema: a.thema, format: a.format, dauer: Math.round(v.dauer), szenen: v.szenen };
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
  const auftraege = produkte.length
    ? Array.from({ length: Math.min(ANZAHL, produkte.length) }, (_, i) => { const p = produkte[(tag * ANZAHL + i) % produkte.length]; return { thema: p.title, produkt: p, format: 'hoch' }; })
    : Array.from({ length: ANZAHL }, (_, i) => ({ thema: liste[(tag * ANZAHL + i) % liste.length], format: 'hoch' }));
  console.log(`[94-video-fabrik] ${produkte.length ? `${produkte.length} Produkte gefunden - Produkt-Ads` : 'kein Shopify-Zugang - Themen-Videos'}, ${auftraege.length} Videos geplant`);
  if (LANG_MIN > 0) auftraege.push({ thema: liste[tag % liste.length], format: 'quer', minuten: LANG_MIN });

  // Ersatzprodukte: scheitert ein Produkt, springt das naechste ein, damit das Tagesziel steht.
  const reserve = produkte.filter((p) => !auftraege.some((a) => a.produkt === p));
  const manifest = [];
  for (const [i, a] of auftraege.entries()) {
    const start = Date.now();
    try {
      const skript = a.produkt ? await produktSkript(a.produkt) : a.minuten ? await langSkript(a.thema, a.minuten) : await kurzSkript(a.thema);
      if (skript.szenen.length < 3) throw new Error('Skript zu kurz');
      const hook = a.format === 'hoch' ? skript.hook || kurzHook(skript.titel) : '';
      const v = await videoBauen(skript, join(OUT, `arbeit-${i}`), { format: a.format, stimme: STIMME, stil: STIL, hook, bildAlle: a.minuten > 20 ? 2 : 1, musik: a.minuten ? 'ruhig' : '', premium: PREMIUM && !!a.produkt });
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
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  console.log(`[94-video-fabrik] ${manifest.filter((m) => !m.teaser).length}/${auftraege.length} Videos fertig (+ ${manifest.filter((m) => m.teaser).length} Teaser)`);
  if (!manifest.length) process.exit(1);
}

function feedErgaenzen(basisUrl) {
  // Ohne Manifest (z. B. Podcast-Lauf) gibt es keine neuen Videos - nur alte Eintraege pflegen.
  if (!existsSync(MANIFEST)) writeFileSync(MANIFEST, '[]');
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const feed = existsSync(FEED) ? JSON.parse(readFileSync(FEED, 'utf8')) : { videos: [] };
  const basis = basisUrl.replace(/\/$/, '');
  // m.basis: eigenes Release je Welt-Bot-Gruppe (ein Release fasst hoechstens 1.000 Dateien).
  const neu = manifest.map((m) => { const b = String(m.basis || basis).replace(/\/$/, ''); return { ...m, url: `${b}/${encodeURIComponent(m.datei)}`, vorschauUrl: m.vorschau ? `${b}/${encodeURIComponent(m.vorschau)}` : '', erstellt: new Date().toISOString() }; });
  // Geloeschte Releases (z. B. alte Marathon-Videos) aus dem Feed entfernen.
  const weg = env('FEED_ENTFERNEN_TAGS').split(',').map((t) => t.trim()).filter(Boolean);
  const alt = (feed.videos || []).filter((v) => !weg.some((t) => String(v.url || '').includes(`/download/${t}/`)));
  feed.videos = [...neu, ...alt].slice(0, 3000);
  feed.stand = new Date().toISOString();
  mkdirSync('video-feed', { recursive: true });
  writeFileSync(FEED, JSON.stringify(feed, null, 1));
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
  // Nacheinander: die Gratis-KI drosselt parallele Anfragen (429). Je Produkt 2 Anfragen.
  for (const [i, p] of auswahl.entries()) {
    const liste = [];
    try {
      const erste = await produktSkript(p);
      if (erste.szenen.length >= 3) liste.push(erste);
    } catch (err) {
      console.log(`[94-video-fabrik] ✗ "${p.title}" Variante 1: ${String(err.message).slice(0, 160)}`);
    }
    if (WELT_VARIANTEN > 1) {
      try {
        liste.push(...(await variantenSkripte(p, WINKEL.slice(1, WELT_VARIANTEN))));
      } catch (err) {
        console.log(`[94-video-fabrik] ✗ "${p.title}" weitere Varianten: ${String(err.message).slice(0, 160)}`);
      }
    }
    liste.slice(0, WELT_VARIANTEN).forEach((skript, v) => {
      if (v) skript.hintergrund = { ...skript.hintergrund, seed: skript.hintergrund.seed + v * 7919 };
      skript.variante = v;
      fertig.push({ k: i * 100 + v, thema: p.title, skript });
    });
    console.log(`[94-video-fabrik] Welt-Skripte "${p.title}": ${Math.min(liste.length, WELT_VARIANTEN)}/${WELT_VARIANTEN} Varianten`);
  }
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
  for (const sprache of sprachListe(liste)) {
    for (let b = 0; b < skripte.length && Date.now() < ende; b += 5) {
      const teil = skripte.slice(b, b + 5);
      const uebersetzungen = await uebersetzenBuendel(teil.map((x) => x.skript), sprache);
      for (const [j, { nr, thema }] of teil.entries()) {
        const arbeit = join(OUT, `welt-${nr}-${sprache}`);
        try {
          const uebersetzt = uebersetzungen[j];
          if (!uebersetzt) throw new Error('Uebersetzung fehlgeschlagen');
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
