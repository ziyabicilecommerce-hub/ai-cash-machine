// Shop-Produkte fuer die Video-Fabrik (#94/#96): Produkte aus den Shopify-Shops lesen (oeffentliche
// products.json, ohne Key) und das Top-5-Format (Countdown-Video je Shop) als Skript bauen.
import { kiJson } from './kiJson.mjs';

const env = (k, d = '') => (process.env[k] || d).trim();

// Hook fuer das Bild: hoechstens 7 Woerter / 42 Zeichen, an Wortgrenze gekuerzt.
export function kurzHook(text) {
  const rein = String(text).replace(/[#"]/g, '').replace(/\s+/g, ' ').trim();
  // Lieber ein ganzer erster Satz ("Ohne Band: Klimmzug ist schwer.") als ein mitten im Satz abgeschnittener Hook.
  const satz = rein.match(/^.{6,42}?[.!?](?=\s|$)/)?.[0];
  if (satz) return satz.replace(/\.$/, '');
  let h = '';
  for (const wort of rein.split(' ').filter(Boolean).slice(0, 7)) {
    if ((h + ' ' + wort).trim().length > 42) break;
    h = (h + ' ' + wort).trim();
  }
  // Kein Hook endet auf "für dein" oder "mit dem": haengende Fuellwoerter weg.
  return h.replace(/(\s+(f(ü|ue)r|mit|und|oder|zu|von|im|in|am|auf|an|bei|der|die|das|dem|den|des|ein|eine|einen|einem|dein|deine|deinen|deinem|dich|dir))+$/i, '').replace(/[\s–:,-]+$/, '');
}

// Regeln fuer die ersten 2 Sekunden (entscheiden, ob jemand weiterwischt). Gilt fuer alle Werbe-Skripte.
export const HOOK_REGELN =
  'DER ANFANG ENTSCHEIDET: Der erste gesprochene Satz ist ein Pattern-Interrupt mit hoechstens 8 Woertern - direkte Du-Ansprache als ' +
  'Warnung, Widerspruch oder Frage, die eine Wissensluecke oeffnet (Muster: "Hoer auf, so zu trainieren.", "Dein Ruecken hasst diesen Fehler.", ' +
  '"Warum fuehlt sich das so gut an?"). Verboten am Anfang: Begruessung, "Heute zeige ich", der Produktname, langsame Einleitung. ' +
  'Der Satz muss ehrlich zum Produkt passen: keine erfundenen Zahlen, Prozente, Studien oder Heilversprechen. ';

export const reinText = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const SHOPS = env('VIDEO_FABRIK_SHOPS', 'https://www.deskrebel.store,https://purivelle.store').split(',').map((u) => u.trim().replace(/\/$/, '')).filter(Boolean);

function shopName(url) {
  const host = new URL(url).hostname.replace(/^www\./, '').split('.')[0];
  return { deskrebel: 'DeskRebel', purivelle: 'Purivelle' }[host] || host.charAt(0).toUpperCase() + host.slice(1);
}

// Oeffentliche Shopify-Storefront (/products.json) - kein Key noetig.
export async function aktiveProdukte() {
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

// Top-5-Countdown je Shop: Intro, dann Platz 5 bis 1 (je 1 Satz, Rang-Badge, Preis), Outro.
export async function topListeSkript(shop, produkte) {
  const liste = produkte.slice(0, 5);
  const d = await kiJson(
    `Du bist Top-Werbetexterin fuer TikTok. Schreibe ein Countdown-Video "Top ${liste.length} von ${shop}" auf Deutsch (Du-Ansprache). ` +
      `Produkte (Platz ${liste.length} bis 1): ${liste.map((p, i) => `[${i}] ${p.title}: ${reinText(p.body_html).slice(0, 200)}`).join(' | ')}. ` +
      'Je Produkt genau 1 kurzer, knackiger Satz mit dem wichtigsten Vorteil (nur Fakten aus den Infos). Dazu ein Intro-Satz (Hook) und ein Outro mit "Link in der Bio". ' +
      HOOK_REGELN.replace('Der erste gesprochene Satz', 'Der Intro-Satz') +
      'Antworte NUR mit JSON: {"titel":"...","hook":"max. 6 Woerter","caption":"mit 3-5 Hashtags","intro":"...","saetze":["Satz zu [0]","..."],"outro":"..."}',
    { maxTokens: 1500 }
  );
  const saetze = Array.isArray(d.saetze) ? d.saetze : [];
  if (saetze.length < liste.length) throw new Error('Top-Liste unvollstaendig');
  const foto = (p) => p.images[0].src;
  const szenen = [
    { text: String(d.intro || `Die Top ${liste.length} von ${shop}!`).slice(0, 300), foto: foto(liste[0]) },
    ...liste.map((p, i) => ({ text: `Platz ${liste.length - i}: ${p.title.split(/[–-]/)[0].trim()}. ${String(saetze[i]).slice(0, 300)}`, foto: foto(p), rang: liste.length - i, preis: Number(p.variants?.[0]?.price) || 0 })),
    { text: String(d.outro || 'Alle Produkte findest du über den Link in der Bio!').slice(0, 300), foto: foto(liste.at(-1)) },
  ];
  const url = liste[0].shopUrl;
  const seed = [...shop].reduce((h, c) => (h * 31 + c.codePointAt(0)) % 1_000_000_007, 11) + new Date().getUTCDate();
  return {
    titel: String(d.titel || `Top ${liste.length} von ${shop}`).slice(0, 120), hook: kurzHook(d.hook || `Top ${liste.length} von ${shop}`),
    caption: `${String(d.caption || '').slice(0, 1500)}\n\n👉 ${url}`, hintergrund: { prompt: 'modern minimalist product display studio, soft gradient backdrop, premium lighting', seed },
    waehrung: 'EUR', shop: new URL(url).hostname.replace(/^www\./, ''), link: `${url.replace(/\/$/, '')}/`, szenen,
  };
}
