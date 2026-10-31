// Radar-Telefonzelle: Firma antippen -> die Zelle klingelt -> der Bot "geht ran" und sagt, was die Firma gerade hat
// (mit Bildern und Kauf-Links). Läden in der Nähe mit Telefonnummer kann man echt anrufen.
// Nutzt die Helfer und Daten aus app.js (D, KATALOG, HYPE, LAEDEN, eintrag, bildFuer, suchLink, ...).
const ZELLE = { sprechen: false, laeuft: null };
try { ZELLE.sprechen = localStorage.getItem('zelle-ton') === '1'; } catch { /* privat */ }

const domainVon = (url) => { try { return new URL(String(url).replace(/\{q-?\}/g, 'x')).hostname.replace(/^www\./, ''); } catch { return ''; } };
const logo = (domain) => `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;

// Wer ist im Telefonbuch? Live-Shops (echter Lagerstand), Nike (Drops), Cardmarket (Signale), große Shops (Direktsuche), Läden mit Telefon
function telefonbuch() {
  const liste = [
    { id: 'nike', name: 'Nike SNKRS', domain: 'nike.com', art: 'Drops' },
    { id: 'cardmarket', name: 'Cardmarket', domain: 'cardmarket.com', art: 'Karten' },
  ];
  for (const laden of new Set((D.live?.treffer || []).map((t) => t.laden))) liste.push({ id: `live:${laden}`, name: laden.replace(/\.(com|de)$/, ''), domain: laden, art: 'Live-Lager', laden });
  for (const [id, s] of Object.entries(KATALOG?.shops || {})) if (!['nike', 'pokemoncenter'].includes(id)) liste.push({ id: `shop:${id}`, name: s.name, domain: domainVon(s.suche), art: 'Shop', shop: id });
  liste.push({ id: 'vorort', name: 'Läden in der Nähe', domain: '', art: 'Echt anrufen', emoji: '☎️' });
  return liste;
}

// Die Antwort der "Firma": kurzer Satz + Ergebnisse als Einträge mit Bild und Link
function antwort(k) {
  const budget = D.budget || 40;
  if (k.id === 'nike') {
    const drops = (D.kalender || []).filter((d) => d.kat === 'Sneaker' && Date.parse(d.zeit) > Date.now() - 6 * 3600000).slice(0, 6);
    return { satz: drops.length ? `Hallo, hier Nike! Als Nächstes droppen ${drops.length} Paare - der erste: ${drops[0].titel}, ${tagText(drops[0].zeit)}.` : 'Hallo, hier Nike. Gerade ist kein Drop angekündigt.',
      eintraege: drops.map((d) => ({ bild: d.bild, emoji: '👟', name: d.titel, info: d.farbe, tag: tagText(d.zeit), preis: euro(d.preis), link: https(d.link) })) };
  }
  if (k.id === 'cardmarket') {
    const picks = (D.pokemon?.picks || []).filter((p) => p.profi && p.profi.signal !== 'PASS').slice(0, 6);
    return { satz: picks.length ? `Cardmarket hier. Top-Deal gerade: ${picks[0].name} - ${picks[0].profi.signal}, plus ${euro(picks[0].profi.gewinn)} nach Gebühren.` : 'Cardmarket hier. Gerade kein Deal mit Gewinn nach Gebühren.',
      eintraege: picks.map((p) => ({ bild: p.bild, emoji: '🃏', name: p.name, info: `ab ${euro(p.profi.einstieg)} · Ziel ${euro(p.profi.ziel)}`, tag: p.profi.signal, tagKlasse: 'kaufen', preis: `+${euro(p.profi.gewinn)}`, preisKlasse: 'gruen', link: https(p.link) })) };
  }
  if (k.laden) {
    const ware = (D.live?.treffer || []).filter((t) => t.laden === k.laden).sort((a, b) => (a.preis ?? 999) - (b.preis ?? 999));
    const imBudget = ware.filter((t) => t.preis != null && t.preis <= budget).length;
    return { satz: `${k.name} am Apparat! Wir haben ${ware.length} Hype-Teile auf Lager, ${imBudget} davon bis ${budget} Euro.`,
      eintraege: ware.slice(0, 8).map((t) => ({ bild: t.bild, emoji: '👟', name: t.titel, info: 'auf Lager', preis: euro(t.preis), preisKlasse: t.preis <= budget ? 'gruen' : '', link: https(t.url) })) };
  }
  if (k.shop) {
    const s = KATALOG.shops[k.shop];
    const passend = [...(HYPE?.produkte || []), ...(KATALOG?.produkte || [])].filter((p) => (p.kaufen || []).includes(k.shop));
    const gesehen = new Set();
    const eintraege = passend.filter((p) => !gesehen.has(p.q) && gesehen.add(p.q)).slice(0, 8)
      .map((p) => ({ bild: bildFuer(p), emoji: '🛍️', name: p.name, info: `Direkt bei ${s.name} suchen`, preis: p.ek, link: suchLink(s.suche, p.q) }));
    return { satz: `${s.name} hier. Ins Lager lassen wir den Bot nicht schauen - aber hier sind die gefragten Sachen direkt bei uns zum Bestellen.`, eintraege };
  }
  const mitTel = LAEDEN.filter((l) => l.tel).slice(0, 12);
  return { satz: mitTel.length ? `Hier sind ${mitTel.length} Läden in deiner Nähe mit Telefonnummer - einfach antippen und fragen, ob sie was da haben.` : 'Die Telefonnummern der Läden werden gerade geladen - schau gleich nochmal rein.',
    eintraege: mitTel.map((l) => ({ emoji: '☎️', name: l.name, info: [l.adresse || l.ort, l.zeiten].filter(Boolean).join(' · '), marke: l.art, preis: `${String(l.km).replace('.', ',')} km`, link: `tel:${l.tel}` })) };
}

function sagen(text) {
  if (!ZELLE.sprechen || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = 'de-DE'; u.rate = 1.05;
  speechSynthesis.speak(u);
}

function anrufen(k) {
  clearTimeout(ZELLE.laeuft);
  const zelle = $('zellefigur'), lcd = $('zellelcd'), chat = $('zellechat');
  zelle.classList.remove('spricht'); zelle.classList.add('klingelt');
  lcd.textContent = `☎ ${k.name} … tuut … tuut`;
  chat.replaceChildren(el('div', 'blase ich', `Hallo ${k.name}, was habt ihr gerade da?`));
  $('zellefigur').scrollIntoView({ behavior: 'smooth', block: 'start' });
  ZELLE.laeuft = setTimeout(() => {
    const a = antwort(k);
    zelle.classList.remove('klingelt'); zelle.classList.add('spricht');
    lcd.textContent = `🟢 Verbunden: ${k.name}`;
    chat.append(el('div', 'blase sie', a.satz), ...(a.eintraege.length ? a.eintraege.map(eintrag) : []));
    sagen(a.satz);
  }, 1400);
}

function kontakte() {
  const such = ($('zellesuche').value || '').toLowerCase();
  $('zellebuch').replaceChildren(...telefonbuch().filter((k) => !such || `${k.name} ${k.art}`.toLowerCase().includes(such)).map((k) => {
    const b = el('button', 'kontakt'); b.type = 'button';
    if (k.domain) { const i = new Image(); i.alt = ''; i.loading = 'lazy'; i.onerror = () => i.replaceWith(el('span', 'emo', '🏢')); i.src = logo(k.domain); b.append(i); } else b.append(el('span', 'emo', k.emoji || '📞'));
    b.append(el('b', '', k.name), el('small', '', k.art));
    b.onclick = () => anrufen(k);
    return b;
  }));
}

function zelleAuf(auf) {
  $('zelle').hidden = !auf;
  document.body.style.overflow = auf ? 'hidden' : '';
  if (auf) { kontakte(); $('zellelcd').textContent = 'Wen rufen wir an?'; $('zellefigur').classList.remove('klingelt', 'spricht'); }
  else if ('speechSynthesis' in window) speechSynthesis.cancel();
}
$('zellefab').addEventListener('click', () => zelleAuf(true));
$('zellezu').addEventListener('click', () => zelleAuf(false));
$('zellesuche').addEventListener('input', kontakte);
$('zelleton').textContent = ZELLE.sprechen ? '🔊' : '🔇';
$('zelleton').addEventListener('click', () => {
  ZELLE.sprechen = !ZELLE.sprechen; $('zelleton').textContent = ZELLE.sprechen ? '🔊' : '🔇';
  try { localStorage.setItem('zelle-ton', ZELLE.sprechen ? '1' : '0'); } catch { /* privat */ }
});
