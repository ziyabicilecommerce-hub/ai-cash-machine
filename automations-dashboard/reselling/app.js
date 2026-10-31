// Reselling-Radar-App: Kalender, Jetzt kaufen, Läden, Mehr. Daten kommen alle 5 Minuten frisch (Automation #112)
// direkt aus dem Repo - die App lädt sie beim Öffnen und alle 5 Minuten neu.
const REPO = 'ziyabicilecommerce-hub/ai-cash-machine';
const ROH = `https://raw.githubusercontent.com/${REPO}/main/automations-dashboard/reselling/`;
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const euro = (n) => (n == null ? '' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n));
const https = (u) => (/^https:\/\//.test(String(u || '')) ? u : String(u || '').startsWith('//') ? `https:${u}` : '');
const leer = (text) => el('p', 'leer-text', text);
const BERLIN = { timeZone: 'Europe/Berlin' };
// In-App-Browsern (TikTok, Instagram …) gehen neue Tabs oft nicht auf - dort im selben Fenster öffnen.
const IN_APP = /Instagram|FBAN|FBAV|TikTok|musical_ly|Bytedance|Snapchat|Twitter|Line\//i.test(navigator.userAgent);
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[target="_blank"]'); if (!a || !/^https?:/.test(a.href)) return;
  e.preventDefault();
  if (IN_APP) { location.href = a.href; return; }
  const w = window.open(a.href, '_blank');  // geblockt (null) -> im selben Fenster
  if (w) { try { w.opener = null; } catch { /* egal */ } } else location.href = a.href;
});
const tagText = (iso) => {
  const d = new Date(iso), heute = new Date();
  const tag = (x) => new Intl.DateTimeFormat('de-DE', { ...BERLIN, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
  const uhr = d.toLocaleTimeString('de-DE', { ...BERLIN, hour: '2-digit', minute: '2-digit' });
  if (tag(d) === tag(heute)) return `Heute ${uhr}`;
  if (tag(d) === tag(new Date(heute.getTime() + 86400000))) return `Morgen ${uhr}`;
  return `${d.toLocaleDateString('de-DE', { ...BERLIN, weekday: 'short', day: '2-digit', month: '2-digit' })} ${uhr}`;
};

// Bild mit Ersatz-Emoji, falls es nicht lädt
// TCGdex hat neue Sets oft nicht auf Deutsch -> englisches/japanisches Bild probieren
const varianten = (u) => (/assets\.tcgdex\.net\/de\//.test(u) ? [u, u.replace('/de/', '/en/'), u.replace('/de/', '/ja/')] : [u]);
function bildBox(cls, url, emoji) {
  const b = el('div', `${cls} leer`, emoji);
  const liste = https(url) ? varianten(https(url)) : [];
  const probieren = (i) => {
    if (i >= liste.length) return;
    const img = new Image(); img.alt = ''; img.referrerPolicy = 'no-referrer';
    img.onload = () => { b.classList.remove('leer'); b.textContent = ''; b.style.backgroundImage = `url("${liste[i].replace(/"/g, '')}")`; };
    img.onerror = () => probieren(i + 1);
    img.src = liste[i];
  };
  probieren(0);
  return b;
}
// Ein Eintrag: Bild links, Name + Info, Preis rechts - tippen öffnet den Link
function eintrag({ bild, emoji = '🛍️', name, info, preis, preisKlasse = '', marke, tag, tagKlasse = '', link }) {
  const a = el(link ? 'a' : 'div', 'eintrag');
  if (link) { a.href = link; a.target = '_blank'; a.rel = 'noopener'; }
  const m = el('div', 'mitte'); m.append(el('div', 'name', name));
  if (info) m.append(el('div', 'info', info));
  if (marke) m.append(el('span', 'marke', marke));
  const r = el('div', 'rechts');
  if (tag) r.append(el('span', `tag ${tagKlasse}`, tag));
  if (preis) r.append(el('div', `preis ${preisKlasse}`, preis));
  a.append(bildBox('bild', bild, emoji), m, r);
  return a;
}
// Große Kachel fürs Karussell
function kachel({ bild, emoji = '🔥', name, preis, badge, link }) {
  const a = el(link ? 'a' : 'div', 'kachel');
  if (link) { a.href = link; a.target = '_blank'; a.rel = 'noopener'; }
  const t = el('div', 'txt'); t.append(el('div', 'n', name));
  if (preis) t.append(el('div', 'p', preis));
  a.append(bildBox('gross', bild, emoji), t);
  if (badge) a.append(el('span', 'flamme', badge));
  return a;
}
// Shop-Suchlink ({q} kodiert, {q-} mit Bindestrichen) und Shop-Knöpfe mit Logo
const suchLink = (vorlage, q) => String(vorlage).replace('{q-}', encodeURIComponent(String(q).trim().replace(/\s+/g, '-'))).replace('{q}', encodeURIComponent(q));
const alleShops = () => ({ ...(KATALOG?.verkaufen || {}), ...(KATALOG?.shops || {}) });
function shopKnoepfe(ids, q, klasse, vorsatz = '') {
  const shops = alleShops(), l = el('div', 'links');
  for (const id of ids || []) {
    const s = shops[id]; if (!s) continue;
    const a = el('a', klasse); a.href = suchLink(s.suche, q); a.target = '_blank'; a.rel = 'noopener';
    const logo = new Image(); logo.alt = ''; logo.loading = 'lazy'; logo.src = `https://www.google.com/s2/favicons?sz=64&domain=${new URL(s.suche.replace(/\{q-?\}/g, 'x')).hostname}`;
    a.append(logo, document.createTextNode(`${vorsatz}${s.name}`)); l.append(a);
  }
  return l;
}
const ersterLink = (t) => { const id = [...(t.kaufen || []), ...(t.verkaufen || [])].find((x) => alleShops()[x]); return id ? suchLink(alleShops()[id].suche, t.q) : ''; };
const bildFuer = (t) => BILDER[t.bild || t.q]?.url || '';
const flammen = (n) => '🔥'.repeat(Math.max(1, Math.min(5, n || 1)));

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

let D = {}, LAEDEN = [], KATALOG = null, HYPE = null, BILDER = {}, EVER = null;
const zustand = { hype: 'Alle', saison: 'Alle', kal: 'Alle', kauf: 'Im Budget', laden: 'Alle', ladenZahl: 15, kat: 'Alle' };

// Saison: was in diesem Monat zu kaufen/verkaufen lohnt - mit Shop-Links; dazu passende Google-Suchen von heute
let SAISON = null;
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
function tippZeile(t) {
  const kauf = t.aktion === 'kaufen';
  const box = el('div', 'gruppe');
  box.append(eintrag({ bild: bildFuer(t), emoji: kauf ? '🛒' : '💶', name: t.name, info: t.warum, tag: kauf ? 'Jetzt kaufen' : 'Jetzt verkaufen', tagKlasse: kauf ? 'kaufen' : 'verkaufen', link: ersterLink(t) }));
  box.append(shopKnoepfe(t.kaufen, t.q, 'kauf'), shopKnoepfe(t.verkaufen, t.q, 'verk', '💶 '));
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

// Sofort kaufen: Alarme vom Bot (neueste zuerst); sonst die besten Deals, die gerade gehen
function deal({ bild, emoji, titel, text, link, zeit }) {
  const d = el('div', 'deal');
  const m = el('div', 'mitte');
  m.append(el('div', 'name', titel), el('div', 'info', text));
  if (zeit) m.append(el('div', 'zeit', tagText(zeit)));
  if (link) { const k = el('a', 'kaufen-knopf', 'Jetzt kaufen →'); k.href = link; k.target = '_blank'; k.rel = 'noopener'; m.append(k); }
  const b = bildBox('bild', bild, emoji);
  if (link) { const a = el('a'); a.href = link; a.target = '_blank'; a.rel = 'noopener'; a.append(b); d.append(a, m); } else d.append(b, m);
  return d;
}
function sofort() {
  const frisch = (D.alarme || []).filter((a) => Date.now() - Date.parse(a.zeit) < 24 * 3600000);
  let liste = frisch.map((a) => ({ ...a, emoji: a.art === 'Drop' ? '👟' : a.art === 'Karte' ? '🃏' : a.art === 'Filiale' ? '🏪' : a.art === 'Deal' ? '💰' : '🆕', link: https(a.link) }));
  $('alarmtitel').textContent = liste.length ? `🚨 Sofort kaufen (${liste.length})` : '💎 Beste Deals gerade';
  $('alarminfo').textContent = liste.length ? 'Vom Bot in den letzten 24 Stunden gefunden - alle 5 Minuten neu geprüft.' : 'Gerade kein Alarm - das hier lohnt sich trotzdem jetzt:';
  if (!liste.length) {
    const karten = (D.pokemon?.picks || []).filter((k) => ['STRONG BUY', 'BUY'].includes(k.profi?.signal)).slice(0, 3)
      .map((k) => ({ titel: `${k.profi.signal}: ${k.name}`, text: `ab ${euro(k.profi.einstieg)} · +${euro(k.profi.gewinn)} nach Gebühren`, bild: k.bild, emoji: '🃏', link: https(k.link) }));
    const drops = (D.kalender || []).filter((k) => Date.parse(k.zeit) > Date.now()).slice(0, 2)
      .map((k) => ({ titel: `Drop: ${k.titel}`, text: `${tagText(k.zeit)} · ${euro(k.preis)}`, bild: k.bild, emoji: '👟', link: https(k.link) }));
    const ware = (D.live?.treffer || []).filter((t) => t.preis != null && t.preis <= (D.budget || 40) && https(t.bild)).slice(0, 3)
      .map((t) => ({ titel: t.titel, text: `${euro(t.preis)} bei ${t.laden} - auf Lager`, bild: t.bild, emoji: '👟', link: https(t.url) }));
    liste = [...karten, ...drops, ...ware];
  }
  $('alarmliste').replaceChildren(...(liste.length ? liste.map(deal) : [leer('Lädt …')]));
  if (D.push?.thema) $('ntfyabo').href = `https://ntfy.sh/${encodeURIComponent(D.push.thema)}`;
  browserMelden(frisch);
}
// Benachrichtigung im Browser/als installierte App, solange sie offen ist oder im Hintergrund läuft
function browserMelden(alarme) {
  let gesehen = ''; try { gesehen = localStorage.getItem('alarm-gesehen') || ''; } catch { /* privat */ }
  const neu = alarme.filter((a) => a.zeit > gesehen);
  if (alarme[0]) try { localStorage.setItem('alarm-gesehen', alarme[0].zeit); } catch { /* privat */ }
  if (!gesehen || !('Notification' in window) || Notification.permission !== 'granted') return;
  for (const a of neu.slice(0, 3)) {
    const n = new Notification(a.titel, { body: a.text, icon: https(a.bild) || 'icon-192.png', tag: a.schluessel });
    n.onclick = () => { window.open(a.link, '_blank'); n.close(); };
  }
}
$('browserpush').addEventListener('click', async (e) => {
  e.preventDefault(); e.stopPropagation();
  if (!('Notification' in window)) { $('browserpush').textContent = '❌ Geht hier nicht - nimm ntfy'; return; }
  const r = await Notification.requestPermission();
  $('browserpush').textContent = r === 'granted' ? '✅ An (solange die App offen ist)' : '❌ Blockiert';
});

function hype() {
  if (HYPE) {
    $('hypeinfo').textContent = HYPE.hinweis || '';
    const liste = [...HYPE.produkte].sort((a, b) => (b.hype || 0) - (a.hype || 0));
    $('hypekarussell').replaceChildren(...liste.map((p) => kachel({ bild: bildFuer(p), emoji: '🔥', name: p.name, preis: p.ek, badge: flammen(p.hype), link: ersterLink(p) })));
    chips('hypefilter', ['Alle', ...new Set(liste.map((p) => p.kat))], zustand.hype, (w) => { zustand.hype = w; hype(); });
    $('hypeliste').replaceChildren(...liste.filter((p) => zustand.hype === 'Alle' || p.kat === zustand.hype).map((p) => {
      const box = el('div', 'gruppe');
      box.append(eintrag({ bild: bildFuer(p), emoji: '🔥', name: p.name, info: p.warum, marke: p.kat, tag: flammen(p.hype), preis: p.ek, link: ersterLink(p) }));
      box.append(shopKnoepfe(p.kaufen, p.q, 'kauf'), shopKnoepfe(p.verkaufen, p.q, 'verk', '💶 '));
      return box;
    }));
  }
  const karten = (D.pokemon?.picks || []).filter((k) => k.prozent > 0).map((k) => ({ bild: k.bild, emoji: '🃏', name: k.name, preis: euro(k.preis.tief ?? k.preis.trend), badge: `▲ ${k.prozent} %`, link: https(k.link) }));
  const schuhe = (D.live?.treffer || []).filter((t) => https(t.bild)).slice(0, 12).map((t) => ({ bild: t.bild, emoji: '👟', name: t.titel, preis: euro(t.preis), badge: t.laden, link: https(t.url) }));
  const live = [...karten.slice(0, 12), ...schuhe];
  $('livekarussell').replaceChildren(...(live.length ? live.map(kachel) : [leer('Lädt gleich …')]));
}

// Erinnerung als Kalender-Termin (.ics) - 15 Minuten vorher klingelt das Handy
function erinnern(k) {
  const z = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const text = (t) => String(t || '').replace(/[,;\\]/g, ' ').replace(/\n/g, ' ');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Reselling-Radar//DE', 'BEGIN:VEVENT', `UID:${z(k.zeit)}-${text(k.titel).slice(0, 40).replace(/\s/g, '')}@radar`,
    `DTSTAMP:${z(Date.now())}`, `DTSTART:${z(k.zeit)}`, `DTEND:${z(Date.parse(k.zeit) + 30 * 60000)}`, `SUMMARY:Drop: ${text(k.titel)}`,
    `DESCRIPTION:${text(k.farbe)} ${k.preis ? `${k.preis} EUR` : ''} - ${https(k.link)}`, `URL:${https(k.link)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Drop in 15 Minuten!', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = el('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'drop.ics';
  document.body.append(a); a.click(); a.remove();
}
function kalender() {
  // Vergangene Drops ausblenden (bis 6 Stunden nach Start bleiben sie als "läuft" stehen)
  const liste = (D.kalender || []).filter((k) => Date.parse(k.zeit) > Date.now() - 6 * 3600000);
  const arten = ['Alle', ...new Set(liste.map((k) => k.kat))];
  chips('kalfilter', arten, zustand.kal, (w) => { zustand.kal = w; kalender(); });
  const zeig = liste.filter((k) => zustand.kal === 'Alle' || k.kat === zustand.kal);
  $('kal').replaceChildren(...(zeig.length ? zeig.map((k) => {
    const laeuft = Date.parse(k.zeit) <= Date.now();
    const box = el('div', 'gruppe');
    box.append(eintrag({ bild: k.bild, emoji: k.kat === 'Sneaker' ? '👟' : '🃏', name: k.titel, info: k.farbe, marke: k.marke,
      tag: laeuft ? '🟢 Läuft jetzt' : tagText(k.zeit), tagKlasse: laeuft ? 'kaufen' : '', preis: euro(k.preis), link: https(k.link) }));
    const l = el('div', 'links');
    if (https(k.link)) { const zu = el('a', 'kauf', laeuft ? '🛒 Jetzt kaufen' : '👀 Zum Drop'); zu.href = https(k.link); zu.target = '_blank'; zu.rel = 'noopener'; l.append(zu); }
    if (!laeuft) { const e = el('a', '', '⏰ Erinnern'); e.href = '#'; e.onclick = (ev) => { ev.preventDefault(); erinnern(k); }; l.append(e); }
    const sx = el('a', 'verk', '💶 Wiederverkaufswert'); sx.href = `https://stockx.com/de-de/search?s=${encodeURIComponent(k.titel)}`; sx.target = '_blank'; sx.rel = 'noopener'; l.append(sx);
    box.append(l);
    return box;
  }) : [leer('Gerade keine angekündigten Drops - die Liste prüft sich alle 5 Minuten neu.')]));
}

// Als App installieren: Hinweis passend zum Handy/Browser, verschwindet in der installierten App
function installHinweis() {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  let weg = false; try { weg = localStorage.getItem('install-weg') === '1'; } catch { /* privat */ }
  if (standalone || weg) return;
  const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua), inApp = IN_APP || /WhatsApp|GSA\//.test(ua) || (ios && !/Safari\//.test(ua));
  const box = $('install'), text = $('installtext');
  if (inApp && ios) text.innerHTML = 'Du bist im WhatsApp-/In-App-Browser. Tippe unten rechts auf <b>🧭 (in Safari öffnen)</b>, dann <b>Teilen ⬆️ → „Zum Home-Bildschirm“</b>.';
  else if (inApp) text.innerHTML = 'Du bist im In-App-Browser. Tippe oben rechts auf <b>⋮ → „Im Browser öffnen“</b>, dann <b>„App installieren“</b>.';
  else if (ios) text.innerHTML = 'Tippe unten auf <b>Teilen ⬆️</b> und dann <b>„Zum Home-Bildschirm“</b> - fertig, die App liegt neben deinen anderen Apps.';
  else text.innerHTML = 'Tippe auf <b>Installieren</b> oder im Browser-Menü <b>⋮ → „App installieren“</b>.';
  box.hidden = false;
}
let installEvent = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e; $('installknopf').hidden = false; });
$('installknopf').addEventListener('click', async (e) => { e.preventDefault(); if (!installEvent) return; installEvent.prompt(); await installEvent.userChoice; installEvent = null; $('install').hidden = true; });
$('installkopie').addEventListener('click', async (e) => { e.preventDefault(); try { await navigator.clipboard.writeText(location.href.split('?')[0]); $('installkopie').textContent = '✅ Link kopiert - in Safari/Chrome einfügen'; } catch { /* egal */ } });
$('installweg').addEventListener('click', () => { $('install').hidden = true; try { localStorage.setItem('install-weg', '1'); } catch { /* privat */ } });
installHinweis();

// dm-Filialen im Umkreis: welche gefragten Produkte wo vorrätig sind (alle 15 Min. geprüft)
function filialen() {
  const f = D.filial;
  if (!f?.produkte) { $('filialliste').replaceChildren(leer('Der Filial-Radar startet gerade - gleich sind die ersten Bestände da.')); return; }
  const mitVorrat = f.produkte.filter((p) => p.vorrat?.length).sort((a, b) => b.vorrat.length - a.vorrat.length);
  $('filialinfo').textContent = `${f.filialen} dm-Filialen im 50-km-Umkreis · ${mitVorrat.length} gefragte Produkte vorrätig · ${tagText(f.stand)}`;
  $('filialliste').replaceChildren(...(mitVorrat.length ? mitVorrat.slice(0, 20).map((p) => {
    const box = el('div', 'gruppe'), n = p.vorrat[0];
    box.append(eintrag({ bild: p.bild, emoji: '🏪', name: p.name, info: `${n.name} · ${String(n.km).replace('.', ',')} km${n.menge ? ` · ${n.menge} Stück` : ''} - in ${p.vorrat.length} Filiale(n)`, tag: '🟢 Vorrätig', tagKlasse: 'kaufen', preis: euro(p.preis), link: https(p.link) }));
    const l = el('div', 'links');
    for (const v of p.vorrat.slice(0, 4)) { const a = el('a', 'kauf', `📍 ${v.name} ${String(v.km).replace('.', ',')} km`); a.href = `https://www.google.com/maps/dir/?api=1&destination=${v.lat},${v.lon}`; a.target = '_blank'; a.rel = 'noopener'; l.append(a); }
    box.append(l);
    return box;
  }) : [leer('Gerade nichts Gefragtes in den dm-Filialen im Umkreis vorrätig.')]));
}

function kaufen() {
  const budget = D.budget || 40;
  const shop = (D.live?.treffer || []).map((t) => ({ ...t, typ: 'Sneaker & Klamotten' }));
  const karten = (D.pokemon?.picks || []).map((k) => ({ titel: k.name, preis: k.preis.tief ?? k.preis.trend, bild: k.bild, url: k.link, laden: `Cardmarket · ${k.set}`, typ: 'Pokémon-Karten', plus: k.prozent, nurBewegung: k.nurBewegung }));
  const alle = [...karten, ...shop];
  chips('kauffilter', ['Im Budget', 'Pokémon-Karten', 'Sneaker & Klamotten', 'Alle'], zustand.kauf, (w) => { zustand.kauf = w; kaufen(); });
  const zeig = alle.filter((t) => zustand.kauf === 'Alle' || (zustand.kauf === 'Im Budget' ? t.preis != null && t.preis <= budget : t.typ === zustand.kauf)).slice(0, 60);
  $('kaufinfo').textContent = `${alle.length} Treffer · Budget bis ${euro(budget)} · alle 5 Min. neu geprüft`;
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
  $('katalog').replaceChildren(...KATALOG.produkte.filter((p) => zustand.kat === 'Alle' || p.kat === zustand.kat).map((p) => {
    const box = el('div', 'gruppe');
    box.append(eintrag({ bild: bildFuer(p), emoji: '📦', name: p.name, info: p.warum, marke: p.kat, preis: p.ek, link: ersterLink(p) }));
    box.append(shopKnoepfe(p.kaufen, p.q, 'kauf'), shopKnoepfe(p.verkaufen.filter((v) => KATALOG.verkaufen[v]), p.q, 'verk', '💶 '));
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

// Daten: zuerst frisch aus dem Repo (alle 5 Min. aktualisiert), sonst die mitgelieferte Kopie
async function json(name) {
  for (const url of [`${ROH}${name}?t=${Date.now()}`, `${name}?t=${Date.now()}`]) {
    try { const r = await fetch(url, { cache: 'no-store' }); if (r.ok) return await r.json(); } catch { /* nächste Quelle */ }
  }
  return null;
}
async function laden() {
  $('stand').textContent = 'Aktualisiere …';
  const [d, l, k, sa, h, bi, ev] = await Promise.all([json('daten.json'), LAEDEN.length ? null : json('laeden.json'), KATALOG ? null : json('katalog.json'), SAISON ? null : json('saison.json'), json('hype.json'), json('bilder.json'), EVER ? null : json('evergreen.json')]);
  if (d) D = d;
  if (sa) SAISON = sa;
  if (l) LAEDEN = l.laeden || [];
  if (k) KATALOG = k;
  if (h) HYPE = h;
  if (ev) EVER = ev;
  if (bi) BILDER = bi.bilder || {};
  const alter = D.stand ? Math.round((Date.now() - Date.parse(D.stand)) / 60000) : null;
  $('stand').replaceChildren(document.createTextNode(alter == null ? 'Noch keine Daten' : 'Stand: '), ...(alter == null ? [] : [el('b', '', alter < 1 ? 'gerade eben' : `vor ${alter} Min.`), document.createTextNode(' · Bot prüft alle 5 Min.')]));
  sofort(); filialen(); hype(); if (typeof pro === 'function') pro(); saison(); kalender(); kaufen(); laeden(); mehr(); katalog();
}
$('neuladen').addEventListener('click', laden);
document.addEventListener('visibilitychange', () => { if (!document.hidden) laden(); });
setInterval(laden, 5 * 60000);
laden();

$('teilen').addEventListener('click', async () => {
  const daten = { title: 'Reselling-Radar', text: 'Was sich gerade lohnt, Drops, Lager + Läden um Frankfurt/Mainz - kostenlos:', url: location.href.split('?')[0] };
  try {
    if (navigator.share) await navigator.share(daten);
    else { await navigator.clipboard.writeText(daten.url); $('teilen').textContent = '✅ Kopiert'; }
  } catch { /* abgebrochen */ }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
