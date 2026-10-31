// Pro-Ansicht wie ein Trading-Terminal: Ticker, Markt-Stimmung, Signale mit Kurs-Chart, Gewinn nach Gebühren und ein eigenes Depot.
// Nutzt die Helfer aus app.js ($, el, euro, https, bildBox, leer) und die Daten D.
const PRO = { sort: 'Score', depotKey: 'radar-depot' };
const FARBE = { 'STRONG BUY': 'sb', BUY: 'b', HOLD: 'h', PASS: 'p' };
const prozentText = (n) => `${n > 0 ? '▲' : n < 0 ? '▼' : '•'} ${Math.abs(n)} %`;

// Mini-Chart als SVG: grün wenn gestiegen, rot wenn gefallen
function sparkline(werte, breite = 84, hoehe = 30) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${breite} ${hoehe}`); svg.setAttribute('class', 'spark');
  const w = werte.filter((x) => typeof x === 'number');
  if (w.length < 2) return svg;
  const min = Math.min(...w), max = Math.max(...w), spanne = max - min || 1;
  const pkt = w.map((v, i) => [(i / (w.length - 1)) * (breite - 4) + 2, hoehe - 3 - ((v - min) / spanne) * (hoehe - 6)]);
  const farbe = w.at(-1) >= w[0] ? '#3ef2a0' : '#ff5c7a';
  const flaeche = document.createElementNS(ns, 'path');
  flaeche.setAttribute('d', `M${pkt.map((p) => p.join(',')).join(' L')} L${pkt.at(-1)[0]},${hoehe} L${pkt[0][0]},${hoehe} Z`);
  flaeche.setAttribute('fill', `${farbe}22`);
  const linie = document.createElementNS(ns, 'polyline');
  linie.setAttribute('points', pkt.map((p) => p.join(',')).join(' '));
  linie.setAttribute('fill', 'none'); linie.setAttribute('stroke', farbe); linie.setAttribute('stroke-width', '2'); linie.setAttribute('stroke-linejoin', 'round');
  svg.append(flaeche, linie);
  return svg;
}
// Echter stündlicher Verlauf, sonst 30-Tage-Schnitt -> 7-Tage-Schnitt -> Trend
const kursReihe = (k) => (k.kurs?.length >= 3 ? k.kurs : [k.preis.schnitt30, k.preis.schnitt7, k.preis.trend]);

function depot() { try { return JSON.parse(localStorage.getItem(PRO.depotKey)) || []; } catch { return []; } }
function depotSpeichern(liste) { try { localStorage.setItem(PRO.depotKey, JSON.stringify(liste)); } catch { /* privat/voll */ } }

function ticker() {
  const picks = D.pokemon?.picks || [];
  const band = $('ticker');
  if (!picks.length) { band.hidden = true; return; }
  const inhalt = el('div', 'band');
  for (const runde of [0, 1]) for (const k of picks.slice(0, 15)) {  // doppelt, damit das Band nahtlos läuft
    const s = el('span', k.prozent >= 0 ? 'auf' : 'ab', `${k.name} ${euro(k.preis.trend)} ${prozentText(k.prozent)}`);
    if (runde) s.setAttribute('aria-hidden', 'true');
    inhalt.append(s);
  }
  band.hidden = false; band.replaceChildren(inhalt);
}

function kpi(wert, text, klasse = '') { const d = el('div', 'kpi'); d.append(el('b', klasse, wert), el('span', '', text)); return d; }

function pro() {
  ticker();
  const picks = (D.pokemon?.picks || []).filter((k) => k.profi);
  const st = D.pokemon?.statistik || {};
  // Markt-Stimmung aus allen Karten im Budget
  const auf = st.steigend || 0, ab = st.fallend || 0, gesamt = st.imBudget || 0, seit = Math.max(0, gesamt - auf - ab);
  const lage = auf > ab * 1.5 ? ['BULLISH 🐂', 'gruen'] : ab > auf * 1.5 ? ['BEARISH 🐻', 'rot'] : ['NEUTRAL ⚖️', 'gelb'];
  $('stimmung').replaceChildren(el('div', `lage ${lage[1]}`, lage[0]), (() => {
    const bar = el('div', 'balken');
    for (const [n, c] of [[auf, 'g'], [seit, 'n'], [ab, 'r']]) { const t = el('i', c); t.style.flex = String(n || 0.0001); bar.append(t); }
    return bar;
  })(), el('p', 'klein', `${auf} steigen · ${seit} seitwärts · ${ab} fallen (von ${gesamt} Karten im Budget, Cardmarket)`));
  const kaufSignale = picks.filter((k) => ['STRONG BUY', 'BUY'].includes(k.profi.signal));
  const roi = picks.length ? Math.round(picks.reduce((s, k) => s + k.profi.roi, 0) / picks.length) : 0;
  const bester = picks.reduce((b, k) => (!b || k.profi.gewinn > b.profi.gewinn ? k : b), null);
  const woche = (D.kalender || []).filter((k) => Date.parse(k.zeit) - Date.now() < 7 * 86400000).length;
  $('kpis').replaceChildren(kpi(String(kaufSignale.length), 'Kauf-Signale', 'gruen'), kpi(`${roi} %`, 'Ø ROI'),
    kpi(bester ? `+${euro(bester.profi.gewinn)}` : '–', 'Bester Trade', 'gruen'), kpi(String(woche), 'Drops 7 Tage'));

  const sortierer = { Score: (k) => k.profi.score, ROI: (k) => k.profi.roi, Gewinn: (k) => k.profi.gewinn, Momentum: (k) => k.profi.momentum };
  chips('prosort', Object.keys(sortierer), PRO.sort, (w) => { PRO.sort = w; pro(); });
  const liste = [...picks].sort((a, b) => sortierer[PRO.sort](b) - sortierer[PRO.sort](a));
  $('signale').replaceChildren(...(liste.length ? liste.map(signalZeile) : [leer('Gerade kein Trade mit Gewinn nach Gebühren - Geduld ist auch eine Position.')]));
  depotZeigen();
  dauerbrenner();
}

function signalZeile(k) {
  const p = k.profi;
  const z = el('div', 'signal');
  const a = el('a', 'oben'); a.href = https(k.link); a.target = '_blank'; a.rel = 'noopener';
  const m = el('div', 'mitte');
  m.append(el('div', 'name', k.name), el('div', 'info', `${k.set} · ${k.seltenheit || 'Karte'}`));
  const r = el('div', 'rechts'); r.append(el('span', `sig ${FARBE[p.signal]}`, p.signal), el('div', 'score', `Score ${p.score}`));
  a.append(bildBox('bild', k.bild, '🃏'), m, r);
  const zahlen = el('div', 'zahlen');
  const feld = (t, w, c = '') => { const f = el('div'); f.append(el('span', '', t), el('b', c, w)); return f; };
  zahlen.append(sparkline(kursReihe(k)), feld('Einstieg', euro(p.einstieg)), feld('Ziel', euro(p.ziel)),
    feld('Gewinn', `${p.gewinn >= 0 ? '+' : ''}${euro(p.gewinn)}`, p.gewinn >= 0 ? 'gruen' : 'rot'), feld('ROI', `${p.roi} %`, p.roi >= 0 ? 'gruen' : 'rot'),
    feld('7T/30T', prozentText(p.momentum), p.momentum >= 0 ? 'gruen' : 'rot'));
  const knopf = el('button', 'mini', '＋ Depot'); knopf.type = 'button';
  knopf.onclick = () => {
    const ek = Number(String(prompt(`Zu welchem Preis hast du „${k.name}“ gekauft? (€)`, String(p.einstieg)) || '').replace(',', '.'));
    if (!ek) return;
    depotSpeichern([...depot(), { id: k.id, name: k.name, bild: k.bild, link: k.link, ek, kurs: k.preis.trend, datum: new Date().toISOString() }]);
    depotZeigen(); knopf.textContent = '✓ Im Depot';
  };
  z.append(a, zahlen, knopf);
  return z;
}

// Depot: eigene Käufe mit aktuellem Marktwert (Trend nach Gebühren) und Gewinn/Verlust - bleibt nur auf diesem Handy
function depotZeigen() {
  const liste = depot();
  const aktuell = Object.fromEntries((D.pokemon?.picks || []).map((k) => [k.id, k.preis.trend]));
  let ein = 0, wert = 0;
  const zeilen = liste.map((d, i) => {
    const kurs = aktuell[d.id] ?? d.kurs;
    if (aktuell[d.id]) d.kurs = aktuell[d.id];
    const netto = Math.round((kurs * 0.95 - 1.5) * 100) / 100, pl = Math.round((netto - d.ek) * 100) / 100;
    ein += d.ek; wert += netto;
    const z = eintrag({ bild: d.bild, emoji: '🃏', name: d.name, info: `Einstand ${euro(d.ek)} · Markt ${euro(kurs)}`, preis: `${pl >= 0 ? '+' : ''}${euro(pl)}`, preisKlasse: pl >= 0 ? 'gruen' : 'rot', link: https(d.link) });
    const weg = el('button', 'mini weg', '✕'); weg.type = 'button'; weg.setAttribute('aria-label', 'Aus dem Depot entfernen');
    weg.onclick = (e) => { e.preventDefault(); depotSpeichern(depot().filter((_, j) => j !== i)); depotZeigen(); };
    z.querySelector('.rechts').append(weg);
    return z;
  });
  depotSpeichern(liste);
  const pl = Math.round((wert - ein) * 100) / 100;
  $('depotsumme').replaceChildren(...(liste.length ? [kpi(euro(ein), 'Einsatz'), kpi(euro(wert), 'Wert netto'), kpi(`${pl >= 0 ? '+' : ''}${euro(pl)}`, 'Gewinn/Verlust', pl >= 0 ? 'gruen' : 'rot')] : []));
  $('depot').replaceChildren(...(zeilen.length ? zeilen : [leer('Noch leer - tippe bei einem Signal auf „＋ Depot“, wenn du gekauft hast.')]));
}

// Dauerbrenner: Sachen, die immer gefragt sind - Richtwert Einkauf/Verkauf und wo es GERADE zu haben ist
// (online auf Lager, angekündigte Drops, dm-Filialen im Umkreis mit Stückzahl).
const passt = (text, suche, ohne = []) => { const t = ` ${String(text || '').toLowerCase().replace(/é/g, 'e')} `; return suche.some((s) => t.includes(s)) && !ohne.some((o) => t.includes(o)); };
function verfuegbar(e) {
  const wo = [];
  for (const t of (D.live?.treffer || []).filter((x) => passt(x.titel, e.suche, e.ohne)).sort((a, b) => (a.preis ?? 999) - (b.preis ?? 999)).slice(0, 3)) {
    wo.push({ text: `🛒 ${t.laden.replace(/\.(com|de)$/, '')} ${euro(t.preis)} · ${String(t.titel).slice(0, 26)}`, link: https(t.url), preis: t.preis });
  }
  for (const k of (D.kalender || []).filter((x) => passt(x.titel, e.suche, e.ohne) && Date.parse(x.zeit) > Date.now() - 6 * 3600000).slice(0, 2)) {
    wo.push({ text: `👟 Drop ${tagText(k.zeit)} ${euro(k.preis)}`, link: https(k.link), preis: k.preis });
  }
  for (const p of (D.filial?.produkte || []).filter((x) => x.vorrat?.length && passt(x.name, e.suche, e.ohne)).slice(0, 2)) {
    const n = p.vorrat[0];
    wo.push({ text: `🏪 ${n.name} ${String(n.km).replace('.', ',')} km${n.menge ? ` · ${n.menge} St.` : ''}${p.vorrat.length > 1 ? ` (+${p.vorrat.length - 1} Filialen)` : ''} · ${euro(p.preis)}`,
      link: `https://www.google.com/maps/dir/?api=1&destination=${n.lat},${n.lon}`, preis: p.preis });
  }
  return wo;
}
function dauerbrenner() {
  if (!EVER) return;
  $('dauerinfo').textContent = `${EVER.hinweis} „Einkauf ab“ ist das günstigste Angebot im Radar - kann auch eine Kinder-/Damengröße sein, Größe prüfen.`;
  PRO.dauerKat ||= 'Alle';
  chips('dauerfilter', ['Alle', ...new Set(EVER.produkte.map((e) => e.kat))], PRO.dauerKat, (w) => { PRO.dauerKat = w; dauerbrenner(); });
  const karten = EVER.produkte.filter((e) => PRO.dauerKat === 'Alle' || e.kat === PRO.dauerKat).map((e) => {
    const wo = verfuegbar(e);
    // Angebote unter 60 % vom normalen Preis sind oft Kinder-/Damengrößen oder andere Varianten - zählen nicht für den Gewinn
    const guenstig = Math.min(...wo.map((w) => w.preis).filter((x) => x != null && x >= e.ek * 0.6), e.ek);
    const mitte = (e.vk[0] + e.vk[1]) / 2, gewinn = Math.round((mitte * 0.9 - guenstig - 5) * 100) / 100;  // ~10 % Gebühren + 5 € Versand
    return { e, wo, guenstig, gewinn };
  }).sort((a, b) => b.wo.length - a.wo.length || b.gewinn - a.gewinn);
  $('dauerbrenner').replaceChildren(...karten.map(({ e, wo, guenstig, gewinn }) => {
    const z = el('div', 'signal');
    const kopf = el('div', 'oben');
    const m = el('div', 'mitte'); m.append(el('div', 'name', e.name), el('div', 'info', e.tipp));
    const r = el('div', 'rechts');
    r.append(el('span', `sig ${gewinn >= 15 ? 'sb' : gewinn >= 0 ? 'b' : 'p'}`, gewinn >= 15 ? 'LOHNT' : gewinn >= 0 ? 'KNAPP' : 'NUR SALE'), el('div', 'score', e.kat));
    kopf.append(bildBox('bild', BILDER[e.bild]?.url, '♾️'), m, r);
    const zahlen = el('div', 'zahlen');
    const feld = (t, w, c = '') => { const f = el('div'); f.append(el('span', '', t), el('b', c, w)); return f; };
    zahlen.style.gridTemplateColumns = 'repeat(3,1fr)';
    zahlen.append(feld(wo.some((w) => w.preis != null) ? 'Einkauf ab' : 'Einkauf ca.', euro(guenstig)), feld('Verkauf für', `${e.vk[0]}–${e.vk[1]} €`, 'gruen'),
      feld('Gewinn ca.', `${gewinn >= 0 ? '+' : ''}${euro(gewinn)}`, gewinn >= 0 ? 'gruen' : 'rot'));
    const l = el('div', 'links'); l.style.margin = '10px 0 0';
    if (wo.length) for (const w of wo) { const a = el('a', 'kauf', w.text); a.href = w.link; a.target = '_blank'; a.rel = 'noopener'; l.append(a); }
    else l.append(el('span', 'klein', 'Gerade nirgends im Radar - Restock-Alarm im Business-Tab setzen.'));
    const vk = el('a', 'verk', '💶 Verkaufte Preise'); vk.href = `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(e.suche[0])}&LH_Sold=1&LH_Complete=1`; vk.target = '_blank'; vk.rel = 'noopener'; l.append(vk);
    z.append(kopf, zahlen, l);
    return z;
  }));
}
