// Business-Tab: das, woran die meisten Reseller scheitern - erster Schritt, Inserieren, Buchhaltung.
// Start-Checkliste, Inventar mit eigenem Foto, Anzeigen-Generator, Gewinn-Übersicht, Finanzamt-Grenze (DAC7) und CSV-Export.
// Alles bleibt nur auf diesem Handy (localStorage). Nutzt $, el, euro, D aus app.js.
const BIZ = { key: 'radar-inventar', start: 'radar-start', filter: 'Alle', offen: null };
const PLATTFORM = {
  Kleinanzeigen: { proz: 0, fix: 0, neu: 'https://www.kleinanzeigen.de/p-anzeige-aufgeben.html' },
  Vinted: { proz: 0, fix: 0, neu: 'https://www.vinted.de/items/new' },
  'eBay privat': { proz: 0, fix: 0, neu: 'https://www.ebay.de/sl/prelist/suggest' },
  'eBay gewerblich': { proz: 11, fix: 0.35, neu: 'https://www.ebay.de/sl/prelist/suggest' },
  Cardmarket: { proz: 5, fix: 0, neu: 'https://www.cardmarket.com/de/Pokemon' },
  StockX: { proz: 9, fix: 0, neu: 'https://stockx.com/de-de/sell' },
};
const STATUS = { lager: '📦 Im Lager', gelistet: '🏷️ Inseriert', verkauft: '✅ Verkauft' };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const heuteISO = () => new Date().toISOString().slice(0, 10);

function inventar() { try { return JSON.parse(localStorage.getItem(BIZ.key)) || []; } catch { return []; } }
function speichern(liste) {
  try { localStorage.setItem(BIZ.key, JSON.stringify(liste)); return true; } catch { alert('Speicher voll - lösch ein paar alte Fotos oder exportiere als CSV.'); return false; }
}
const gewinnVon = (a) => (a.status === 'verkauft' ? r2(a.vk - a.ek - (a.versand || 0) - (a.vk * (PLATTFORM[a.plattform]?.proz || 0) / 100 + (PLATTFORM[a.plattform]?.fix || 0))) : null);

// Foto vom Handy klein rechnen (max. 360 px), damit hunderte Artikel in den Speicher passen
function fotoKlein(datei) {
  return new Promise((ok) => {
    if (!datei) return ok('');
    const img = new Image(), url = URL.createObjectURL(datei);
    img.onload = () => {
      const f = Math.min(1, 360 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * f); c.height = Math.round(img.height * f);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => ok('');
    img.src = url;
  });
}

// Anzeigen-Text, der wirklich verkauft: klarer Titel, Zustand, Größe, Versand, Hashtags (Vinted)
function anzeige(a, plattform) {
  const titel = [a.name, a.groesse && `Gr. ${a.groesse}`, a.zustand].filter(Boolean).join(' · ');
  const preis = a.ziel || Math.ceil((a.ek * 1.35) / 5) * 5;
  const tags = String(`${a.name} ${a.kat || ''}`).toLowerCase().split(/[^a-z0-9äöüß]+/).filter((w) => w.length > 2).slice(0, 6).map((w) => `#${w}`).join(' ');
  const zeilen = [titel, '', `✅ Zustand: ${a.zustand || 'neu'}${a.zustand === 'Neu & OVP' ? ' - originalverpackt, ungeöffnet' : ''}`, a.groesse ? `📏 Größe: ${a.groesse}` : '',
    '📦 Versand versichert möglich (DHL/Hermes), Abholung in Hattersheim/Frankfurt nach Absprache', '💬 Bei Fragen gern schreiben - schnelle Antwort.',
    plattform === 'Kleinanzeigen' ? 'Privatverkauf, keine Garantie oder Rücknahme.' : '', plattform === 'Vinted' ? `\n${tags}` : ''].filter((z) => z !== '');
  return { titel, text: zeilen.join('\n'), preis };
}

function kopieren(text, knopf) {
  const fertig = () => { const alt = knopf.textContent; knopf.textContent = '✅ Kopiert'; setTimeout(() => { knopf.textContent = alt; }, 1500); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(fertig, () => prompt('Kopieren:', text));
  else prompt('Kopieren:', text);
}

// Start-Checkliste: der erste Schritt, an dem die meisten scheitern - Häkchen setzen sich teils automatisch
function checkliste() {
  let st = {}; try { st = JSON.parse(localStorage.getItem(BIZ.start)) || {}; } catch { /* leer */ }
  const inv = inventar();
  const schritte = [
    ['budget', 'Budget festlegen: nur Geld, das du 2 Monate nicht brauchst (Start: 50–150 €)', false],
    ['push', 'Push-Alarm abonnieren (ntfy) - damit du Deals nicht verpasst', false],
    ['deal', 'Ersten Deal aussuchen: Hype-Tab oder „Sofort kaufen“ - verkaufte Preise auf eBay checken', false],
    ['kauf', 'Ersten Artikel kaufen und hier ins Inventar eintragen', inv.length > 0],
    ['inserat', 'Erste Anzeige raus (Anzeigen-Generator unten)', inv.some((a) => a.status !== 'lager')],
    ['verkauf', 'Erster Verkauf - Gewinn steht automatisch in der Übersicht', inv.some((a) => a.status === 'verkauft')],
  ];
  const fertig = schritte.filter(([id, , auto]) => auto || st[id]).length;
  $('startbalken').style.width = `${Math.round((fertig / schritte.length) * 100)}%`;
  $('starttext').textContent = fertig === schritte.length ? '🏆 Alles erledigt - du bist Reseller. Jetzt skalieren!' : `${fertig} von ${schritte.length} Schritten`;
  $('startliste').replaceChildren(...schritte.map(([id, text, auto]) => {
    const l = el('label', 'schritt'); const c = el('input'); c.type = 'checkbox'; c.checked = auto || !!st[id]; c.disabled = auto;
    c.onchange = () => { st[id] = c.checked; try { localStorage.setItem(BIZ.start, JSON.stringify(st)); } catch { /* privat */ } checkliste(); };
    l.append(c, el('span', '', text)); return l;
  }));
}

function uebersicht(inv) {
  const jahr = String(new Date().getFullYear());
  const verkauft = inv.filter((a) => a.status === 'verkauft');
  const gebunden = r2(inv.filter((a) => a.status !== 'verkauft').reduce((s, a) => s + a.ek, 0));
  const umsatz = r2(verkauft.reduce((s, a) => s + a.vk, 0)), gewinn = r2(verkauft.reduce((s, a) => s + gewinnVon(a), 0));
  const einsatz = verkauft.reduce((s, a) => s + a.ek, 0);
  const tage = verkauft.filter((a) => a.verkauftAm && a.gekauft).map((a) => (Date.parse(a.verkauftAm) - Date.parse(a.gekauft)) / 86400000);
  const kpi2 = (w, t, k = '') => { const d = el('div', 'kpi'); d.append(el('b', k, w), el('span', '', t)); return d; };
  $('bizkpis').replaceChildren(kpi2(`${gewinn >= 0 ? '+' : ''}${euro(gewinn)}`, 'Gewinn (verkauft)', gewinn >= 0 ? 'gruen' : 'rot'), kpi2(euro(umsatz), 'Umsatz'),
    kpi2(einsatz ? `${Math.round((gewinn / einsatz) * 100)} %` : '–', 'ROI'), kpi2(euro(gebunden), 'Kapital im Lager'),
    kpi2(tage.length ? `${Math.round(tage.reduce((s, t) => s + t, 0) / tage.length)} T.` : '–', 'Ø bis Verkauf'), kpi2(String(inv.filter((a) => a.status === 'lager').length), 'Noch nicht inseriert', 'gelb'));
  // DAC7: Plattformen melden ab 30 Verkäufen ODER 2.000 € Umsatz pro Jahr ans Finanzamt
  const proPf = {};
  for (const a of verkauft.filter((x) => String(x.verkauftAm || '').startsWith(jahr))) { proPf[a.plattform] ??= { n: 0, eur: 0 }; proPf[a.plattform].n++; proPf[a.plattform].eur += a.vk; }
  $('dac7').replaceChildren(...(Object.keys(proPf).length ? Object.entries(proPf).map(([pf, w]) => {
    const anteil = Math.min(100, Math.max((w.n / 30) * 100, (w.eur / 2000) * 100));
    const z = el('div', 'dac'); const bar = el('div', 'dacbar'); const fill = el('i'); fill.style.width = `${anteil}%`; if (anteil >= 80) fill.className = 'warn'; bar.append(fill);
    z.append(el('div', '', `${pf}: ${w.n}/30 Verkäufe · ${euro(r2(w.eur))}/2.000 €`), bar); return z;
  }) : [el('p', 'klein', `Noch keine Verkäufe ${jahr}. Ab 30 Verkäufen oder 2.000 € pro Plattform wird ans Finanzamt gemeldet - dann Gewerbe prüfen.`)]));
}

function artikelZeile(a, i) {
  const box = el('div', 'artikel');
  const kopf = el('div', 'artkopf');
  const b = el('div', a.bild ? 'bild' : 'bild leer', a.bild ? '' : '📦'); if (a.bild) b.style.backgroundImage = `url("${a.bild}")`;
  const m = el('div', 'mitte'); m.append(el('div', 'name', a.name), el('div', 'info', [STATUS[a.status], a.groesse && `Gr. ${a.groesse}`, a.zustand].filter(Boolean).join(' · ')));
  const g = gewinnVon(a);
  const r = el('div', 'rechts'); r.append(el('div', 'preis', euro(a.ek)), el('div', `gz ${g == null ? '' : g >= 0 ? 'gruen' : 'rot'}`, g == null ? 'Einkauf' : `${g >= 0 ? '+' : ''}${euro(g)}`));
  kopf.append(b, m, r); kopf.onclick = () => { BIZ.offen = BIZ.offen === a.id ? null : a.id; business(); };
  box.append(kopf);
  if (BIZ.offen !== a.id) return box;
  // Aufgeklappt: Anzeige erstellen, Status ändern, verkaufen, löschen
  const werk = el('div', 'werkzeug');
  const pfWahl = el('select'); for (const pf of Object.keys(PLATTFORM)) pfWahl.append(new Option(pf, pf, false, pf === (a.plattform || 'Kleinanzeigen')));
  const vorschau = el('textarea', 'anzeigetext'); vorschau.rows = 7;
  const preisInfo = el('p', 'klein');
  const neu = () => { const t = anzeige(a, pfWahl.value); vorschau.value = t.text; preisInfo.textContent = `Preisvorschlag: ${euro(t.preis)} (Einkauf + ~35 %) - vorher „verkauft“-Preise checken.`; };
  pfWahl.onchange = neu; neu();
  const knoepfe = el('div', 'links');
  const k1 = el('a', 'kauf', '📋 Text kopieren'); k1.href = '#'; k1.onclick = (e) => { e.preventDefault(); kopieren(vorschau.value, k1); };
  const k2 = el('a', '', '🚀 Inserat öffnen'); k2.href = '#';
  k2.onclick = (e) => { e.preventDefault(); kopieren(vorschau.value, k1); a.status = a.status === 'lager' ? 'gelistet' : a.status; a.plattform = pfWahl.value; aendern(i, a); if (!window.open(PLATTFORM[pfWahl.value].neu, '_blank')) location.href = PLATTFORM[pfWahl.value].neu; };
  const k3 = el('a', 'verk', '🔎 Verkaufte Preise'); k3.href = `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(a.name)}&LH_Sold=1&LH_Complete=1`; k3.target = '_blank'; k3.rel = 'noopener';
  knoepfe.append(k1, k2, k3);
  werk.append(el('label', '', 'Anzeige für'), pfWahl, vorschau, preisInfo, knoepfe);
  if (a.status !== 'verkauft') {
    const vk = el('input'); vk.type = 'number'; vk.inputMode = 'decimal'; vk.placeholder = 'Verkaufspreis (€)';
    const vs = el('input'); vs.type = 'number'; vs.inputMode = 'decimal'; vs.placeholder = 'Versand, den du zahlst (€)';
    const ok = el('button', 'knopf', '✅ Als verkauft eintragen'); ok.type = 'button';
    ok.onclick = () => { if (!Number(vk.value)) return vk.focus(); Object.assign(a, { status: 'verkauft', vk: r2(vk.value), versand: r2(vs.value), plattform: pfWahl.value, verkauftAm: heuteISO() }); aendern(i, a); };
    werk.append(el('label', '', 'Verkauft?'), vk, vs, ok);
  }
  const weg = el('button', 'mini weg', '🗑️ Löschen'); weg.type = 'button';
  weg.onclick = () => { if (confirm(`„${a.name}“ wirklich löschen?`)) { const l = inventar(); l.splice(i, 1); speichern(l); business(); } };
  werk.append(weg);
  box.append(werk);
  return box;
}
function aendern(i, a) { const l = inventar(); l[i] = a; speichern(l); business(); }

function business() {
  const inv = inventar();
  checkliste(); uebersicht(inv);
  chips('bizfilter', ['Alle', ...Object.values(STATUS)], BIZ.filter, (w) => { BIZ.filter = w; business(); });
  const zeig = inv.map((a, i) => [a, i]).filter(([a]) => BIZ.filter === 'Alle' || STATUS[a.status] === BIZ.filter).reverse();
  $('inventar').replaceChildren(...(zeig.length ? zeig.map(([a, i]) => artikelZeile(a, i)) : [leer('Noch nichts im Inventar - trag oben deinen ersten Kauf ein.')]));
}

$('neuartikel').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, ek = r2(f.ek.value);
  if (!f.titel.value.trim() || !ek) return;
  const a = { id: Date.now().toString(36), name: f.titel.value.trim().slice(0, 120), ek, groesse: f.groesse.value.trim().slice(0, 20), zustand: f.zustand.value,
    kat: f.kat.value, gekauft: f.datum.value || heuteISO(), status: 'lager', bild: await fotoKlein(f.foto.files[0]) };
  if (speichern([...inventar(), a])) { f.reset(); f.datum.value = heuteISO(); BIZ.offen = a.id; business(); }
});
$('neuartikel').datum.value = heuteISO();
$('csv').addEventListener('click', () => {
  const kopf = ['Artikel', 'Kategorie', 'Größe', 'Zustand', 'Gekauft am', 'Einkauf €', 'Status', 'Plattform', 'Verkauft am', 'Verkauf €', 'Versand €', 'Gebühren €', 'Gewinn €'];
  const zeilen = inventar().map((a) => {
    const geb = a.status === 'verkauft' ? r2(a.vk * (PLATTFORM[a.plattform]?.proz || 0) / 100 + (PLATTFORM[a.plattform]?.fix || 0)) : '';
    return [a.name, a.kat, a.groesse, a.zustand, a.gekauft, a.ek, STATUS[a.status], a.plattform || '', a.verkauftAm || '', a.vk ?? '', a.versand ?? '', geb, gewinnVon(a) ?? '']
      .map((v) => `"${(typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '')).replace(/"/g, '""')}"`).join(';');
  });
  const link = el('a'); link.href = URL.createObjectURL(new Blob([`﻿${[kopf.join(';'), ...zeilen].join('\n')}`], { type: 'text/csv' }));
  link.download = `reselling-${heuteISO()}.csv`; document.body.append(link); link.click(); link.remove();
});
business();
