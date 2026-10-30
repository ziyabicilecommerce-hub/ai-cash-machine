// Reselling-Radar-App: Kalender, Jetzt kaufen, Läden, Mehr. Daten kommen alle 10 Minuten frisch (Automation #112)
// direkt aus dem Repo - die App lädt sie beim Öffnen und alle 10 Minuten neu.
const REPO = 'ziyabicilecommerce-hub/ai-cash-machine';
const ROH = `https://raw.githubusercontent.com/${REPO}/main/automations-dashboard/reselling/`;
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const euro = (n) => (n == null ? '' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n));
const https = (u) => (/^https:\/\//.test(String(u || '')) ? u : String(u || '').startsWith('//') ? `https:${u}` : '');
const leer = (text) => el('p', 'leer-text', text);
const BERLIN = { timeZone: 'Europe/Berlin' };
const tagText = (iso) => {
  const d = new Date(iso), heute = new Date();
  const tag = (x) => new Intl.DateTimeFormat('de-DE', { ...BERLIN, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
  const uhr = d.toLocaleTimeString('de-DE', { ...BERLIN, hour: '2-digit', minute: '2-digit' });
  if (tag(d) === tag(heute)) return `Heute ${uhr}`;
  if (tag(d) === tag(new Date(heute.getTime() + 86400000))) return `Morgen ${uhr}`;
  return `${d.toLocaleDateString('de-DE', { ...BERLIN, weekday: 'short', day: '2-digit', month: '2-digit' })} ${uhr}`;
};

// Ein Eintrag: kleines Bild links, Name + Info, Preis rechts - tippen öffnet den Link
function eintrag({ bild, emoji = '🛍️', name, info, preis, preisKlasse = '', marke, tag, link }) {
  const a = el(link ? 'a' : 'div', 'eintrag');
  if (link) { a.href = link; a.target = '_blank'; a.rel = 'noopener'; }
  const b = el('div', https(bild) ? 'bild' : 'bild leer', https(bild) ? '' : emoji);
  if (https(bild)) b.style.backgroundImage = `url("${https(bild).replace(/"/g, '')}")`;
  const m = el('div', 'mitte'); m.append(el('div', 'name', name));
  if (info) m.append(el('div', 'info', info));
  if (marke) m.append(el('span', 'marke', marke));
  const r = el('div', 'rechts');
  if (tag) r.append(el('span', 'tag', tag));
  if (preis) r.append(el('div', `preis ${preisKlasse}`, preis));
  a.append(b, m, r);
  return a;
}
function chips(ziel, werte, aktiv, wahl) {
  $(ziel).replaceChildren(...werte.map((w) => { const c = el('button', `chip ${w === aktiv ? 'an' : ''}`, w); c.type = 'button'; c.onclick = () => wahl(w); return c; }));
}

// Tabs
$('nav').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('aktiv', x === b));
  document.querySelectorAll('section').forEach((s) => s.classList.toggle('aktiv', s.id === b.dataset.ziel));
  try { localStorage.setItem('tab', b.dataset.ziel); } catch {}
  window.scrollTo(0, 0);
});
try { const t = localStorage.getItem('tab'); if (t) document.querySelector(`nav button[data-ziel="${t}"]`)?.click(); } catch {}

let D = {}, LAEDEN = [], KATALOG = null;
const zustand = { saison: 'Alle', kal: 'Alle', kauf: 'Im Budget', laden: 'Alle', ladenZahl: 15, kat: 'Alle' };

// Saison: was in diesem Monat zu kaufen/verkaufen lohnt - mit Shop-Links; dazu passende Google-Suchen von heute
let SAISON = null;
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
function tippZeile(t) {
  const shops = { ...(KATALOG?.verkaufen || {}), ...(KATALOG?.shops || {}) };
  const such = (s) => shops[s]?.suche.replace('{q}', encodeURIComponent(t.q));
  const box = el('div'); box.style.margin = '0 0 12px';
  box.append(eintrag({ emoji: t.aktion === 'kaufen' ? '🛒' : '💶', name: t.name, info: t.warum, tag: t.aktion === 'kaufen' ? 'Jetzt kaufen' : 'Jetzt verkaufen' }));
  const l = el('div', 'links');
  for (const s of [...(t.kaufen || []), ...(t.verkaufen || [])]) if (shops[s]) { const a = el('a', t.aktion === 'kaufen' ? 'kauf' : 'verk2', shops[s].name); a.href = such(s); a.target = '_blank'; a.rel = 'noopener'; l.append(a); }
  box.append(l);
  return box;
}
function saison() {
  if (!SAISON) return;
  const m = Number(new Intl.DateTimeFormat('de-DE', { ...BERLIN, month: 'numeric' }).format(new Date()));
  const naechster = (m % 12) + 1;
  $('saisontitel').textContent = `🗓️ Jetzt dran im ${MONATE[m - 1]}`;
  $('saisoninfo').textContent = SAISON.hinweis;
  const tipps = SAISON.monate[m] || [];
  chips('saisonfilter', ['Alle', 'Jetzt kaufen', 'Jetzt verkaufen'], zustand.saison, (w) => { zustand.saison = w; saison(); });
  const zeig = tipps.filter((t) => zustand.saison === 'Alle' || (zustand.saison === 'Jetzt kaufen' ? t.aktion === 'kaufen' : t.aktion === 'verkaufen'));
  const gesucht = (D.trends?.ware || []).map((t) => eintrag({ emoji: '🔎', name: `${t.titel}`, info: `Wird heute viel gegoogelt (${t.menge || 'viele'} Suchen) - Preise checken!`, marke: t.kategorie,
    link: `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(t.titel)}&LH_Sold=1&LH_Complete=1` }));
  $('saison').replaceChildren(...gesucht, ...zeig.map(tippZeile));
  $('baldtitel').textContent = `Vorbereiten für ${MONATE[naechster - 1]}`;
  $('bald').replaceChildren(...(SAISON.monate[naechster] || []).map(tippZeile));
}

function kalender() {
  const liste = D.kalender || [];
  const arten = ['Alle', ...new Set(liste.map((k) => k.kat))];
  chips('kalfilter', arten, zustand.kal, (w) => { zustand.kal = w; kalender(); });
  const zeig = liste.filter((k) => zustand.kal === 'Alle' || k.kat === zustand.kal);
  $('kal').replaceChildren(...(zeig.length ? zeig.map((k) => eintrag({
    bild: k.bild, emoji: k.kat === 'Sneaker' ? '👟' : '🃏', name: k.titel, info: k.farbe, marke: k.marke, tag: tagText(k.zeit), preis: euro(k.preis), link: https(k.link),
  })) : [leer('Gerade keine angekündigten Drops - die Liste prüft sich alle 10 Minuten neu.')]));
}

function kaufen() {
  const budget = D.budget || 40;
  const shop = (D.live?.treffer || []).map((t) => ({ ...t, typ: 'Sneaker & Klamotten' }));
  const karten = (D.pokemon?.picks || []).map((k) => ({ titel: k.name, preis: k.preis.tief ?? k.preis.trend, bild: k.bild, url: k.link, laden: `Cardmarket · ${k.set}`, typ: 'Pokémon-Karten', plus: k.prozent, nurBewegung: k.nurBewegung }));
  const alle = [...karten, ...shop];
  chips('kauffilter', ['Im Budget', 'Pokémon-Karten', 'Sneaker & Klamotten', 'Alle'], zustand.kauf, (w) => { zustand.kauf = w; kaufen(); });
  const zeig = alle.filter((t) => zustand.kauf === 'Alle' || (zustand.kauf === 'Im Budget' ? t.preis != null && t.preis <= budget : t.typ === zustand.kauf)).slice(0, 60);
  $('kaufinfo').textContent = `${alle.length} Treffer · Budget bis ${euro(budget)} · alle 10 Min. neu geprüft`;
  $('kauf').replaceChildren(...(zeig.length ? zeig.map((t) => eintrag({
    bild: t.bild, emoji: t.typ === 'Pokémon-Karten' ? '🃏' : '👟', name: t.titel, info: t.laden,
    tag: t.plus != null ? `▲ ${t.plus} %` : '', preis: euro(t.preis), preisKlasse: t.preis != null && t.preis <= budget ? 'gruen' : '', link: https(t.url),
  })) : [leer('Gerade nichts im Budget auf Lager. Wähle „Alle“ oder schau gleich nochmal.')]));
}

function laeden() {
  const arten = ['Alle', ...new Set(LAEDEN.map((l) => l.art))];
  chips('ladenfilter', arten, zustand.laden, (w) => { zustand.laden = w; zustand.ladenZahl = 15; laeden(); });
  const zeig = LAEDEN.filter((l) => zustand.laden === 'Alle' || l.art === zustand.laden);
  const emoji = { 'Spielzeug & Figuren': '🧸', 'Karten & Sammeln': '🃏', 'Technik & Games': '🎮', 'Sneaker & Klamotten': '👟', 'Bücher & Manga': '📚', 'Drogerie & Beauty': '💄', 'Second-Hand': '♻️' };
  $('ladenliste').replaceChildren(...(zeig.length ? zeig.slice(0, zustand.ladenZahl).map((l) => eintrag({
    emoji: emoji[l.art] || '🏬', name: l.name, info: [l.adresse || l.ort, l.zeiten].filter(Boolean).join(' · '), marke: l.art,
    preis: `${String(l.km).replace('.', ',')} km`, link: `https://www.google.com/maps/dir/?api=1&destination=${l.lat},${l.lon}`,
  })) : [leer('Die Läden werden gerade aus OpenStreetMap geladen.')]));
  $('mehrlaeden').hidden = zeig.length <= zustand.ladenZahl;
}
$('mehrlaeden').addEventListener('click', () => { zustand.ladenZahl += 20; laeden(); });

function mehr() {
  $('neu').href = `https://github.com/${REPO}/issues/new?labels=restock&title=${encodeURIComponent('Restock: ')}&body=${encodeURIComponent('Link zum Produkt (eine Zeile pro Link):\n\n')}`;
  const farbe = { 'auf Lager': 'gruen', Vorbestellung: 'gelb' };
  $('produkte').replaceChildren(...(D.produkte || []).map((p) => eintrag({
    emoji: '🔔', name: p.titel || p.laden, info: p.muster?.anzahl ? `meist ${(p.muster.tage || []).map((t) => t[0]).join('/')} ${(p.muster.stunden || []).map((t) => t[0]).join('/')}` : p.laden,
    preis: p.status, preisKlasse: farbe[p.status] || '', link: https(p.url),
  })));
}

function katalog() {
  if (!KATALOG) return;
  chips('katfilter', ['Alle', ...new Set(KATALOG.produkte.map((p) => p.kat))], zustand.kat, (w) => { zustand.kat = w; katalog(); });
  const shops = { ...KATALOG.verkaufen, ...KATALOG.shops };
  const such = (s, q) => s.suche.replace('{q}', encodeURIComponent(q));
  $('katalog').replaceChildren(...KATALOG.produkte.filter((p) => zustand.kat === 'Alle' || p.kat === zustand.kat).map((p) => {
    const box = el('div'); box.style.margin = '0 0 14px';
    box.append(eintrag({ emoji: '📦', name: p.name, info: p.warum, marke: p.kat, preis: p.ek }));
    const l = el('div', 'links');
    for (const s of p.kaufen) if (shops[s]) { const a = el('a', '', shops[s].name); a.href = such(shops[s], p.q); a.target = '_blank'; a.rel = 'noopener'; l.append(a); }
    for (const s of p.verkaufen) if (KATALOG.verkaufen[s]) { const a = el('a', 'verk', `💶 ${KATALOG.verkaufen[s].name}`); a.href = such(KATALOG.verkaufen[s], p.q); a.target = '_blank'; a.rel = 'noopener'; l.append(a); }
    box.append(l);
    return box;
  }));
}

function rechnen() {
  const ek = Number($('ek').value) || 0, vk = Number($('vk').value) || 0, vs = Number($('vs').value) || 0;
  const [proz, fix] = $('pf').value.split('|').map(Number);
  const gebuehr = vk * proz / 100 + fix, gewinn = vk - ek - vs - gebuehr;
  $('gewinn').textContent = `${gewinn >= 0 ? '+' : ''}${euro(gewinn)}`;
  $('gewinn').className = `ergebnis ${gewinn >= 10 ? 'gruen' : gewinn >= 0 ? 'gelb' : ''}`;
  $('gewinninfo').textContent = `Gebühren ${euro(gebuehr)} · ${gewinn >= 10 ? 'lohnt sich' : gewinn >= 0 ? 'knapp' : 'Verlust - Finger weg'}`;
}
['ek', 'vk', 'pf', 'vs'].forEach((id) => $(id).addEventListener('input', rechnen));
rechnen();

// Daten: zuerst frisch aus dem Repo (alle 10 Min. aktualisiert), sonst die mitgelieferte Kopie
async function json(name) {
  for (const url of [`${ROH}${name}?t=${Date.now()}`, `${name}?t=${Date.now()}`]) {
    try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) return await r.json(); } catch { /* nächste Quelle */ }
  }
  return null;
}
async function laden() {
  $('stand').textContent = 'Aktualisiere …';
  const [d, l, k, sa] = await Promise.all([json('daten.json'), LAEDEN.length ? null : json('laeden.json'), KATALOG ? null : json('katalog.json'), SAISON ? null : json('saison.json')]);
  if (d) D = d;
  if (sa) SAISON = sa;
  if (l) LAEDEN = l.laeden || [];
  if (k) KATALOG = k;
  const alter = D.stand ? Math.round((Date.now() - Date.parse(D.stand)) / 60000) : null;
  $('stand').replaceChildren(document.createTextNode(alter == null ? 'Noch keine Daten' : 'Stand: '), ...(alter == null ? [] : [el('b', '', alter < 1 ? 'gerade eben' : `vor ${alter} Min.`), document.createTextNode(' · aktualisiert sich alle 10 Min.')]));
  saison(); kalender(); kaufen(); laeden(); mehr(); katalog();
}
$('neuladen').addEventListener('click', laden);
document.addEventListener('visibilitychange', () => { if (!document.hidden) laden(); });
setInterval(laden, 10 * 60000);
laden();

$('teilen').addEventListener('click', async () => {
  const daten = { title: 'Reselling-Radar', text: 'Was sich gerade lohnt, Drops, Lager + Läden um Frankfurt/Mainz - kostenlos:', url: location.href.split('?')[0] };
  try {
    if (navigator.share) await navigator.share(daten);
    else { await navigator.clipboard.writeText(daten.url); $('teilen').textContent = '✅ Kopiert'; }
  } catch { /* abgebrochen */ }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
