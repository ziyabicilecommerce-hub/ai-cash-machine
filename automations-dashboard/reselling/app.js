// Reselling-Radar-App: liest daten.json (stündlich von Automation #112 erzeugt) und zeigt sie in fünf Tabs.
const REPO = 'ziyabicilecommerce-hub/ai-cash-machine';
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const euro = (n) => (n == null ? '–' : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n));
const uhr = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–');
const https = (u) => (/^https:\/\//.test(String(u || '')) ? u : '');
const leer = (text) => el('p', 'leer', text);

function link(href, text) { const a = el('a', '', text); a.href = https(href); a.target = '_blank'; a.rel = 'noopener'; return a; }

// Tabs unten wie in einer App
$('nav').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('nav button').forEach((x) => x.classList.toggle('aktiv', x === b));
  document.querySelectorAll('section').forEach((s) => s.classList.toggle('aktiv', s.id === b.dataset.ziel));
  try { localStorage.setItem('tab', b.dataset.ziel); } catch {}
  window.scrollTo(0, 0);
});
try { const t = localStorage.getItem('tab'); if (t) document.querySelector(`nav button[data-ziel="${t}"]`)?.click(); } catch {}

function heiss(trends) {
  const ware = trends?.ware || [];
  $('ware').replaceChildren(...(ware.length ? ware.map((t) => {
    const k = el('div', 'karte');
    k.append(el('div', 'titel', t.titel), el('span', 'chip gut', t.kategorie));
    if (t.menge) k.append(el('span', 'chip', `${t.menge} Suchen`));
    k.append(el('div', 'klein', 'Im Trend heißt: Preise auf Kleinanzeigen/eBay jetzt checken, bevor alle verkaufen.'));
    return k;
  }) : [leer('Gerade nichts Kaufbares in den Top-Suchen. Schau in ein paar Stunden wieder rein.')]));
  $('top').replaceChildren(...((trends?.top || []).map((t) => { const k = el('div', 'karte'); k.append(el('div', 'titel', t.titel), el('div', 'klein', t.menge ? `${t.menge} Suchen` : '')); return k; })));
}

function karten(poke, budget) {
  $('budgetinfo').textContent = `Bis ${euro(budget)} kaufbar, Preis steigt gerade (Schnitt der letzten 7 Tage gegen 30 Tage). Preise von Cardmarket.`;
  const picks = poke?.picks || [];
  if (picks.some((k) => k.nurBewegung)) $('budgetinfo').textContent += ' Gerade steigt nichts stark - das hier bewegt sich am meisten nach oben.';
  $('picks').replaceChildren(...(picks.length ? picks.map((k) => {
    const box = el('div', 'karte'); const z = el('div', 'zeile');
    if (https(k.bild)) { const i = el('img'); i.src = k.bild; i.alt = k.name; i.loading = 'lazy'; z.append(i); }
    const mitte = el('div'); mitte.append(el('div', 'titel', k.name), el('div', 'klein', `${k.set} · ${k.nummer} · ${k.seltenheit}`));
    const p = el('div', 'preis'); p.append(el('b', k.nurBewegung ? 'gelb' : 'hoch', `▲ ${k.prozent} %`), el('div', 'klein', `ab ${euro(k.preis.tief)}`), el('div', 'klein', `Trend ${euro(k.preis.trend)}`));
    z.append(mitte, p); box.append(z);
    if (https(k.link)) box.append(link(k.link, 'Auf Cardmarket ansehen'));
    return box;
  }) : [leer('Gerade keine steigenden Karten im Budget gefunden.')]));
  const phase = { vorverkauf: 'warn', hype: 'schlecht', kaufzeit: 'gut', halten: 'gut' };
  $('sets').replaceChildren(...((poke?.sets || []).map((s) => {
    const k = el('div', 'karte');
    k.append(el('div', 'titel', s.name), el('span', `chip ${phase[s.phase] || ''}`, { vorverkauf: 'Vorverkauf', hype: 'Release-Hype', kaufzeit: 'Kaufzeit', halten: 'Halten' }[s.phase] || '?'), el('span', 'chip', `seit ${s.release}`), el('div', 'klein', s.rat));
    return k;
  })));
}

function restock(daten) {
  const body = encodeURIComponent('Link zum Produkt (eine Zeile pro Link):\n\n');
  // Titel "Restock: ..." reicht - Freunde ohne Rechte am Repo koennen kein Label setzen
  $('neu').href = `https://github.com/${REPO}/issues/new?labels=restock&title=${encodeURIComponent('Restock: ')}&body=${body}`;
  const farbe = { 'auf Lager': 'gut', Vorbestellung: 'warn', ausverkauft: 'schlecht' };
  $('produkte').replaceChildren(...((daten.produkte || []).length ? daten.produkte.map((p) => {
    const k = el('div', 'karte');
    k.append(el('div', 'titel', p.titel || p.laden), el('span', `chip ${farbe[p.status] || ''}`, p.status), el('span', 'chip', p.laden));
    const m = p.muster || {};
    k.append(el('div', 'klein', m.anzahl ? `Kam bisher meist: ${(m.tage || []).map((t) => t[0]).join(', ')} um ${(m.stunden || []).map((t) => t[0]).join(', ')} (${m.anzahl} Restocks)` : 'Noch kein Restock gesehen. Das Muster lernt die App mit der Zeit.'));
    k.append(link(p.url, 'Zum Shop'));
    return k;
  }) : [leer('Noch keine Produkte. Tippe auf „Produkt beobachten“ und füge einen Link ein.')]));
  $('restocks').replaceChildren(...((daten.restocks || []).length ? daten.restocks.map((r) => { const k = el('div', 'karte'); k.append(el('div', 'titel', r.titel), el('div', 'klein', uhr(r.zeit)), link(r.url, 'Zum Shop')); return k; }) : [leer('Noch keine Restocks erkannt.')]));
}

function rechnen() {
  const ek = Number($('ek').value) || 0, vk = Number($('vk').value) || 0, vs = Number($('vs').value) || 0;
  const [proz, fix] = $('pf').value.split('|').map(Number);
  const gebuehr = vk * proz / 100 + fix;
  const gewinn = vk - ek - vs - gebuehr;
  $('gewinn').textContent = `${gewinn >= 0 ? '+' : ''}${euro(gewinn)}`;
  $('gewinn').className = `ergebnis ${gewinn >= 10 ? 'hoch' : gewinn >= 0 ? 'gelb' : 'runter'}`;
  const marge = ek ? Math.round((gewinn / ek) * 100) : 0;
  $('gewinninfo').textContent = `Gebühren ${euro(gebuehr)} · Rendite ${marge} % · ${gewinn >= 10 ? 'lohnt sich' : gewinn >= 0 ? 'knapp, lohnt kaum' : 'Verlust - Finger weg'}`;
}
['ek', 'vk', 'pf', 'vs'].forEach((id) => $(id).addEventListener('input', rechnen));
rechnen();

fetch(`daten.json?t=${Date.now()}`).then((r) => r.json()).then((d) => {
  $('stand').textContent = `Stand: ${uhr(d.stand)} · aktualisiert sich jede Stunde`;
  heiss(d.trends); karten(d.pokemon, d.budget || 40); restock(d);
}).catch(() => { $('stand').textContent = 'Keine Verbindung - zeige gespeicherte Daten, sobald vorhanden.'; restock({}); });

$('teilen').addEventListener('click', async () => {
  const daten = { title: 'Reselling-Radar', text: 'Was gerade hoch geht + Restock-Alarm, kostenlos:', url: location.href.split('?')[0] };
  try {
    if (navigator.share) await navigator.share(daten);
    else { await navigator.clipboard.writeText(daten.url); $('teilen').textContent = '✅ Link kopiert – jetzt in WhatsApp einfügen'; }
  } catch { /* Teilen abgebrochen */ }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
