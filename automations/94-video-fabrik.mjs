// Video-Fabrik - erzeugt taeglich fertige Werbevideos mit Sprecherin und Untertiteln,
// komplett ohne API-Key: KI-Skript (kostenlose KI-Kette), Pollinations-Bilder,
// edge-tts-Stimme, ffmpeg-Schnitt. Mit Shopify-Zugang: Werbevideos zu echten
// Produkten mit echten Produktfotos. Standard: 5 Kurzvideos (9:16), optional
// ein langes Video bis 10 Minuten (VIDEO_FABRIK_LANG_MINUTEN).
//   node automations/94-video-fabrik.mjs            -> Videos nach out/ bauen
//   node automations/94-video-fabrik.mjs --feed URL -> video-feed/videos.json ergaenzen
//   node automations/94-video-fabrik.mjs --metricool URL -> in Metricool einplanen
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './lib/config.mjs';
import { askKI } from './lib/ki.mjs';
import { videoBauen } from './lib/videoFabrik.mjs';

const OUT = 'out';
const MANIFEST = join(OUT, 'manifest.json');
const FEED = 'video-feed/videos.json';
const env = (k, d = '') => (process.env[k] || d).trim();

const ANZAHL_ROH = parseInt(env('VIDEO_FABRIK_ANZAHL', '5'), 10);
const ANZAHL = Math.min(Math.max(Number.isNaN(ANZAHL_ROH) ? 5 : ANZAHL_ROH, 0), 10);
const LANG_MIN = Math.min(Math.max(parseFloat(env('VIDEO_FABRIK_LANG_MINUTEN', '0')) || 0, 0), 60);
const STIL = env('VIDEO_FABRIK_STIL', 'cinematic, vibrant colors, high detail, no text');
const STIMME = env('VIDEO_FABRIK_STIMME', 'de-DE-SeraphinaMultilingualNeural');
const LIFESTYLE = env('VIDEO_FABRIK_LIFESTYLE', 'nein').toLowerCase() === 'ja';
// Zusaetzliche Sprachversionen der Produkt-Kurzvideos, z. B. "en,es,tr" (Deutsch ist immer dabei).
const STIMMEN = { en: 'en-US-AvaMultilingualNeural', es: 'es-ES-ElviraNeural', fr: 'fr-FR-DeniseNeural', it: 'it-IT-ElsaNeural', tr: 'tr-TR-EmelNeural', nl: 'nl-NL-FennaNeural', pl: 'pl-PL-ZofiaNeural', pt: 'pt-BR-FranciscaNeural' };
const SPRACHNAMEN = { en: 'Englisch', es: 'Spanisch', fr: 'Franzoesisch', it: 'Italienisch', tr: 'Tuerkisch', nl: 'Niederlaendisch', pl: 'Polnisch', pt: 'Portugiesisch (Brasilien)' };
const EXTRA_SPRACHEN = env('VIDEO_FABRIK_SPRACHEN').toLowerCase().split(',').map((x) => x.trim()).filter((x) => STIMMEN[x]);

function themen() {
  const liste = (env('VIDEO_FABRIK_THEMEN') || config.SOCIAL_AUTOPILOT_THEMEN || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (liste.length) return liste;
  const nische = config.SHOP_NISCHE || 'Gaming-Setup und Schreibtisch-Zubehoer';
  return [`Top-Tipps rund um ${nische}`, `Fehler, die jeder bei ${nische} macht`, `So sparst du Geld bei ${nische}`, `Trends 2026: ${nische}`, `Vorher-Nachher: ${nische}`];
}

const slug = (t) => t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'video';

function jsonAusText(text) {
  const start = text.indexOf('{');
  const ende = text.lastIndexOf('}');
  if (start < 0 || ende <= start) throw new Error('KI lieferte kein JSON');
  const roh = text.slice(start, ende + 1);
  try {
    return JSON.parse(roh);
  } catch {
    const repariert = roh
      .replace(/[\u201C\u201D\u201E]/g, '"')
      .replace(/,\s*([}\]])/g, '$1')
      .replace(/([{,]\s*)([A-Za-z_][\w]*)\s*:/g, '$1"$2":')
      .replace(/}\s*{/g, '},{')
      .replace(/"\s*\n\s*"/g, '","');
    return JSON.parse(repariert);
  }
}

// Pollinations "openai-fast" (GPT-OSS 20B) laeuft ohne Key und schreibt deutlich
// besseres Deutsch als das Standardmodell der KI-Kette; askKI bleibt Rueckfall.
async function kiText(prompt, { maxTokens = 1500 } = {}) {
  try {
    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'openai-fast', messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }),
      signal: AbortSignal.timeout(120000),
    });
    const d = await res.json();
    const text = d?.choices?.[0]?.message?.content || '';
    if (res.ok && text && !/reached its budget|enough credits|enter\.pollinations\.ai/i.test(text)) return text;
  } catch {
    /* Rueckfall auf askKI */
  }
  return askKI(prompt, { maxTokens });
}

// Fragt die KI bis zu 3-mal, falls das JSON unbrauchbar ist.
async function kiJson(prompt, opts) {
  let letzter;
  for (let versuch = 0; versuch < 3; versuch++) {
    try {
      return jsonAusText(await kiText(versuch ? `${prompt}\nWICHTIG: Gib ausschliesslich gueltiges JSON zurueck, doppelte Anfuehrungszeichen, keine Kommentare.` : prompt, opts));
    } catch (err) {
      letzter = err;
    }
  }
  throw letzter;
}

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

// Holt einzelne Szenen-Objekte aus kaputtem KI-Text (z. B. abgeschnittenes JSON).
function szenenRetten(text) {
  const treffer = String(text).match(/\{[^{}]*"text"\s*:\s*"[^"]*"[^{}]*\}/g) || [];
  const szenen = [];
  for (const t of treffer) {
    try {
      szenen.push(jsonAusText(t));
    } catch {
      /* einzelne Szene unbrauchbar */
    }
  }
  return szenen;
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

async function langSkript(thema, minuten) {
  const ziel = Math.round((minuten * 60) / 15);
  const gliederung = await kiJson(
    `Plane ein ${minuten}-Minuten-YouTube-Video auf Deutsch zum Thema "${thema}". Antworte NUR mit JSON: {"titel":"...","caption":"Beschreibung mit Hashtags","kapitel":["Kapitel 1", "..."]} mit 5 bis 12 Kapiteln. Es ist KEIN Werbevideo: keine Produkte, keine Shop-Erwaehnung, reiner Unterhaltungs-/Wissensinhalt.`,
    { maxTokens: 800 }
  );
  const kapitel = (gliederung.kapitel || []).map(String).slice(0, 12);
  if (!kapitel.length) throw new Error('Keine Kapitel erhalten');
  const proKapitel = Math.max(3, Math.round(ziel / kapitel.length));
  const szenen = [];
  for (const [ki, k] of kapitel.entries()) {
    const imKapitel = [];
    const position = ki === 0 ? 'Das ist das ERSTE Kapitel: fuehre in das Thema ein.' : ki === kapitel.length - 1 ? 'Das ist das LETZTE Kapitel: hier darf das Video zum Abschluss kommen.' : 'Das ist ein Kapitel in der MITTE: erzaehle weiter, beende das Video NICHT, kein Abschied, kein Fazit.';
    for (let versuch = 0; imKapitel.length < proKapitel && versuch < Math.ceil(proKapitel / 5) + 2; versuch++) {
      const n = Math.min(5, proKapitel - imKapitel.length);
      const bisher = imKapitel.length ? ` Bisher gesagt (nicht wiederholen, nahtlos weitererzaehlen): "${imKapitel.map((x) => x.text).join(' ').slice(-600)}"` : '';
      imKapitel.push(...(await szenenPortion(
        `Video "${gliederung.titel}". Kapitel ${ki + 1} von ${kapitel.length}: "${k}". ${position} Schreibe die naechsten ${n} Szenen: je 3-4 ruhig gesprochene, klare und verstaendliche Saetze, AUSSCHLIESSLICH auf Deutsch (kein Englisch), echte deutsche Woerter, fehlerfreie Rechtschreibung, du-Form, ca. 15 Sekunden. Der Bild-Prompt (Englisch) beschreibt ein eindrucksvolles, jugendfreies Bild ohne Text.${bisher} ` +
          'Antworte NUR mit JSON: {"szenen":[{"text":"...","bild":"englischer Bild-Prompt"}]}'
      )).slice(0, n));
    }
    await korrekturLesen(imKapitel, gliederung.titel);
    console.log(`[94-video-fabrik] Kapitel "${k.slice(0, 50)}": ${imKapitel.length}/${proKapitel} Szenen`);
    szenen.push(...imKapitel);
  }
  if (szenen.length < Math.max(5, ziel * 0.4)) throw new Error(`Zu wenige Szenen (${szenen.length}/${ziel})`);
  return { titel: String(gliederung.titel || thema).slice(0, 120), caption: String(gliederung.caption || thema).slice(0, 4000), szenen: szenen.slice(0, ziel + 6) };
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

async function produktSkript(p) {
  const preis = p.variants?.[0]?.price;
  const link = `${p.shopUrl}/products/${p.handle}`;
  const fotos = p.images.map((b) => b.src);
  const d = await kiJson(
    `Du bist Top-Werbetexterin fuer TikTok/Reels-Ads. Schreibe ein 25-40 Sekunden Werbe-Skript auf Deutsch, sprich die Zuschauer mit "du" an (niemals "Sie"), fuer das Produkt "${p.title}" aus dem Shop "${p.shopName}". ` +
      `Produktinfos: ${reinText(p.body_html).slice(0, 700)}${preis ? ` Preis: ${preis} EUR.` : ''} ` +
      'Aufbau: 1) Hook, der in 2 Sekunden fesselt, 2) Problem, 3) 2-3 konkrete Vorteile des Produkts, 4) Call-to-Action ("Link in der Bio"). 5 bis 7 Szenen, pro Szene 1 kurzer gesprochener Satz. Nichts erfinden, was nicht in den Produktinfos steht. ' +
      'Nutze NUR Eigenschaften, die woertlich in den Produktinfos stehen - keine erfundenen Features, Zahlen oder Versprechen. Keine Floskeln. ' +
      (LIFESTYLE
        ? `Es gibt ${fotos.length} Produktfotos (Index 0-${fotos.length - 1}). Pro Szene entweder "foto": Index ODER "bild": englischer Prompt fuer ein passendes, jugendfreies Lifestyle-Bild (vollstaendig bekleidete Personen). Mindestens die Haelfte der Szenen mit Produktfoto. `
        : `Es gibt ${fotos.length} Produktfotos (Index 0-${fotos.length - 1}). Pro Szene "foto": Index des passendsten Produktfotos. `) +
      'Antworte NUR mit JSON: {"titel":"...","caption":"Caption mit 3-5 Hashtags","szenen":[{"text":"...","foto":0}]}',
    { maxTokens: 1500 }
  );
  const szenen = (Array.isArray(d.szenen) ? d.szenen : []).map((s, i) => {
    const text = String(s.text || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    const idx = Number.isInteger(s.foto) && s.foto >= 0 && s.foto < fotos.length ? s.foto : null;
    const bild = LIFESTYLE ? String(s.bild || '').trim().slice(0, 300) : '';
    return { text, foto: idx !== null ? fotos[idx] : bild ? '' : fotos[i % fotos.length], bild };
  }).filter((s) => s.text.length > 3).slice(0, 8);
  if (szenen.length && !szenen[0].foto) szenen[0].foto = fotos[0];
  await korrekturLesen(szenen, p.title);
  const caption = `${String(d.caption || p.title).slice(0, 1800)}${link ? `\n\n👉 ${link}` : ''}`;
  return { titel: String(d.titel || p.title).slice(0, 120), caption, szenen };
}

// Uebersetzt Titel, Caption und Sprechtexte; Produktfotos bleiben gleich.
async function uebersetzen(skript, sprache) {
  const d = await kiJson(
    `Uebersetze diese Werbevideo-Texte ins ${SPRACHNAMEN[sprache]}, natuerlich und muttersprachlich, Du-Ansprache, Laenge beibehalten, Markennamen und Preise unveraendert, Link unveraendert. ` +
      `Antworte NUR mit JSON: {"titel":"...","caption":"...","saetze":["..."]}\n${JSON.stringify({ titel: skript.titel, caption: skript.caption, saetze: skript.szenen.map((x) => x.text) })}`,
    { maxTokens: 2500 }
  );
  const saetze = Array.isArray(d.saetze) ? d.saetze : [];
  if (saetze.length !== skript.szenen.length) throw new Error('Uebersetzung unvollstaendig');
  return { titel: String(d.titel || skript.titel).slice(0, 120), caption: String(d.caption || skript.caption).slice(0, 2000), szenen: skript.szenen.map((x, i) => ({ ...x, text: String(saetze[i]).slice(0, 400) })) };
}

function ablegen(manifest, v, skript, a, nummer, sprache) {
  const basis = `${new Date().toISOString().slice(0, 10)}-${nummer}-${sprache === 'de' ? '' : `${sprache}-`}${slug(skript.titel)}`;
  copyFileSync(v.pfad, join(OUT, 'videos', `${basis}.mp4`));
  let vorschau = '';
  if (v.vorschau) {
    vorschau = `${basis}.jpg`;
    copyFileSync(v.vorschau, join(OUT, 'videos', vorschau));
  }
  manifest.push({ datei: `${basis}.mp4`, vorschau, sprache, titel: skript.titel, caption: skript.caption, thema: a.thema, format: a.format, dauer: Math.round(v.dauer), szenen: v.szenen });
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

  const manifest = [];
  for (const [i, a] of auftraege.entries()) {
    const start = Date.now();
    try {
      const skript = a.produkt ? await produktSkript(a.produkt) : a.minuten ? await langSkript(a.thema, a.minuten) : await kurzSkript(a.thema);
      if (skript.szenen.length < 3) throw new Error('Skript zu kurz');
      const hook = a.format === 'hoch' ? skript.titel : '';
      const v = await videoBauen(skript, join(OUT, `arbeit-${i}`), { format: a.format, stimme: STIMME, stil: STIL, hook });
      ablegen(manifest, v, skript, a, i + 1, 'de');
      console.log(`[94-video-fabrik] ✓ ${manifest.at(-1).datei} (${Math.round(v.dauer)} s, ${v.szenen} Szenen, ${Math.round((Date.now() - start) / 1000)} s Bauzeit)`);
      if (a.produkt) {
        for (const sprache of EXTRA_SPRACHEN) {
          try {
            const uebersetzt = await uebersetzen(skript, sprache);
            const vs = await videoBauen(uebersetzt, join(OUT, `arbeit-${i}-${sprache}`), { format: a.format, stimme: STIMMEN[sprache], stil: STIL, hook: uebersetzt.titel });
            ablegen(manifest, vs, uebersetzt, a, i + 1, sprache);
            console.log(`[94-video-fabrik] ✓ ${manifest.at(-1).datei} (${sprache})`);
          } catch (err) {
            console.log(`[94-video-fabrik] ✗ ${sprache}-Version von "${a.thema}": ${err.message}`);
          }
        }
      }
    } catch (err) {
      console.log(`[94-video-fabrik] ✗ "${a.thema}": ${err.message}`);
    }
  }
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  console.log(`[94-video-fabrik] ${manifest.length}/${auftraege.length} Videos fertig`);
  if (!manifest.length) process.exit(1);
}

function feedErgaenzen(basisUrl) {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const feed = existsSync(FEED) ? JSON.parse(readFileSync(FEED, 'utf8')) : { videos: [] };
  const basis = basisUrl.replace(/\/$/, '');
  const neu = manifest.map((m) => ({ ...m, url: `${basis}/${encodeURIComponent(m.datei)}`, vorschauUrl: m.vorschau ? `${basis}/${encodeURIComponent(m.vorschau)}` : '', erstellt: new Date().toISOString() }));
  feed.videos = [...neu, ...(feed.videos || [])].slice(0, 300);
  feed.stand = new Date().toISOString();
  mkdirSync('video-feed', { recursive: true });
  writeFileSync(FEED, JSON.stringify(feed, null, 1));
  console.log(`[94-video-fabrik] Feed: ${neu.length} neue, ${feed.videos.length} insgesamt`);
}

// Naechster Zeitpunkt HH:MM Berliner Ortszeit (Metricool bekommt die Zone separat).
function slotBerlin(stunde, minute) {
  const teile = (d) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((p) => [p.type, p.value]));
  const jetzt = teile(new Date());
  const minutenJetzt = Number(jetzt.hour) * 60 + Number(jetzt.minute);
  const tag = stunde * 60 + minute > minutenJetzt + 15 ? teile(new Date()) : teile(new Date(Date.now() + 86400000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${tag.year}-${tag.month}-${tag.day}T${pad(stunde)}:${pad(minute)}:00`;
}

async function metricoolPlanen(basisUrl) {
  if (!config.METRICOOL_API_TOKEN || !config.METRICOOL_USER_ID || !config.METRICOOL_BLOG_ID) {
    console.log('[94-video-fabrik] Metricool-Secrets fehlen - Videos liegen im Video-Feed, Posten uebersprungen.');
    return;
  }
  const { medienURLNormalisieren, beitragPlanen } = await import('./lib/metricool.mjs');
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const providers = (config.METRICOOL_PROVIDERS || 'instagram,tiktok,youtube').split(',').map((s) => s.trim()).filter(Boolean);
  const autoPublish = String(config.SOCIAL_AUTOPILOT_AUTO_PUBLISH || '').trim().toLowerCase() === 'ja';
  const stunden = [9, 12, 15, 18, 21, 20];
  for (const [i, m] of manifest.filter((x) => (x.sprache || 'de') === 'de').entries()) {
    try {
      const datumISO = slotBerlin(stunden[i % stunden.length], (i * 7) % 60);
      const mediaId = await medienURLNormalisieren(`${basisUrl.replace(/\/$/, '')}/${encodeURIComponent(m.datei)}`);
      const nur = m.format === 'quer' ? providers.filter((p) => p === 'youtube') : providers;
      if (!nur.length) continue;
      await beitragPlanen({ providers: nur, text: `${m.titel}\n\n${m.caption}`, mediaId, datumISO, draft: !autoPublish, instagramTyp: 'REEL' });
      console.log(`[94-video-fabrik] Metricool: "${m.titel}" fuer ${datumISO} ${autoPublish ? 'geplant' : 'als Entwurf'}`);
    } catch (err) {
      console.log(`[94-video-fabrik] Metricool-Fehler bei "${m.titel}": ${err.message}`);
    }
  }
}

const [modus, arg] = process.argv.slice(2);
(modus === '--feed' ? Promise.resolve(feedErgaenzen(arg)) : modus === '--metricool' ? metricoolPlanen(arg) : bauen()).catch((err) => {
  console.error('[94-video-fabrik] Fehler:', err.message);
  process.exit(1);
});
