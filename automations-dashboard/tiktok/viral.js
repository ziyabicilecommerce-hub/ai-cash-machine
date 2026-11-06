// Viral-Labor: was bei UNSEREN Videos funktioniert (Format-Duell, beste Uhrzeit, Top-Videos) + Hook-Tester + Caption-Baukasten.
// Liest daten.json (Automation #103). Rechnet nur mit Posts, für die TikTok schon Zahlen geliefert hat - nichts wird erfunden.
(() => {
  const q = (id) => document.getElementById(id);
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const zahl = (n) => new Intl.NumberFormat('de-DE').format(Math.round(n || 0));
  const NAMEN = { horror: '👻 Horror einzeln', serie: '📺 Horror-Serie', quiz: '❓ Quiz', mythos: '🤔 Wahr/Mythos', waswaere: '🚀 Was wäre wenn', anime: '🎌 Anime (YouTube)' };
  const BLOECKE = [['🌙 Nachts', 0, 6], ['☀️ Vormittag', 6, 12], ['🌤️ Nachmittag', 12, 18], ['🌆 Abend', 18, 24]];
  const stunde = (iso) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso)));
  const schnitt = (liste, f) => (liste.length ? liste.reduce((a, x) => a + f(x), 0) / liste.length : 0);

  function balken(titel, wert, max, extra) {
    const z = mk('div', 'vl-zeile');
    const b = mk('div', 'vl-balken'); b.style.width = `${max ? Math.max(4, (wert / max) * 100) : 0}%`;
    z.append(mk('div', 'vl-name', titel), mk('div', 'vl-spur'), mk('div', 'vl-wert', extra));
    z.children[1].append(b);
    return z;
  }

  function duell(posts) {
    const gruppen = {};
    for (const p of posts) (gruppen[p.format] ||= []).push(p);
    const zeilen = Object.entries(gruppen).map(([f, l]) => ({ f, n: l.length, aufrufe: schnitt(l, (p) => p.aufrufe), sehdauer: schnitt(l, (p) => p.sehdauer) }))
      .sort((a, b) => b.aufrufe - a.aufrufe);
    const max = Math.max(...zeilen.map((z) => z.aufrufe), 1);
    q('vl-duell').replaceChildren(...zeilen.map((z) => balken(NAMEN[z.f] || z.f, z.aufrufe, max, `${zahl(z.aufrufe)} Aufrufe · ${z.sehdauer.toFixed(1)} s · ${z.n} Videos`)));
    if (zeilen[0]) q('vl-duell').append(mk('div', 'tipp gut', `🏆 ${NAMEN[zeilen[0].f] || zeilen[0].f} holt pro Video am meisten Aufrufe - davon mehr machen.`));
  }

  // Konto-Duell: Ø Aufrufe je Konto mit Plattform - zeigt, wohin die Energie gehen sollte
  const plattform = (k) => (/desk\.rebel|purivelle/i.test(k) ? '📸 Instagram' : /giyuuu/i.test(k) ? '▶️ YouTube' : '🎵 TikTok');
  function konten(posts) {
    if (!q('vl-konten')) return;
    const gruppen = {};
    for (const p of posts) (gruppen[p.konto] ||= []).push(p);
    const zeilen = Object.entries(gruppen).map(([k, l]) => ({ k, n: l.length, aufrufe: schnitt(l, (p) => p.aufrufe) })).sort((a, b) => b.aufrufe - a.aufrufe);
    const max = Math.max(...zeilen.map((z) => z.aufrufe), 1);
    q('vl-konten').replaceChildren(...zeilen.map((z) => balken(`${plattform(z.k)} ${z.k}`, z.aufrufe, max, `${zahl(z.aufrufe)} Ø · ${z.n} Videos`)));
    const tot = zeilen.filter((z) => z.n >= 5 && z.aufrufe < 10);
    if (zeilen[0]) q('vl-konten').append(mk('div', 'tipp gut', `🏆 ${zeilen[0].k} läuft am besten - dort wirken neue Ideen zuerst.`));
    if (tot.length) q('vl-konten').append(mk('div', 'tipp', `⚠️ Unter 10 Aufrufen: ${tot.map((z) => z.k).join(', ')}. Konto wird wohl gedrosselt - in der App Kontostatus prüfen, selbst aktiv sein, Kommentare beantworten.`));
  }

  // Kommentar-Helfer: wo gerade Kommentare reinkommen + fertige Antworten zum Kopieren (abschicken machst du selbst - echt, kein Bot)
  const ANTWORTEN = [
    ['Jemand hat die Sekunde gefunden', 'Richtig 👀 Hast du auch das zweite Mal gesehen?'],
    ['„Teil 2?“', 'Teil 2 kommt, wenn das Video gut läuft 👀 Folg mir, damit du ihn nicht verpasst!'],
    ['Antwort „1“ oder „2“', 'Mutig 😨 Was meinst du – hättest du die Nacht überlebt?'],
    ['„Fake“ / „KI“', 'Ist eine erfundene Geschichte, ja 😄 Aber hättest du hingeschaut?'],
    ['„Hab Gänsehaut“', 'Dann schau mal genau auf Sekunde 3 nochmal 👀'],
  ];
  function kommentare(posts) {
    if (!q('vl-kommentare')) return;
    const neu = posts.filter((p) => p.kommentare > 0 && Date.now() - new Date(p.zeit) < 3 * 864e5).sort((a, b) => b.kommentare - a.kommentare).slice(0, 5);
    const liste = neu.length ? neu.map((p) => {
      const z = mk('div', 'tipp'); z.append(mk('b', '', `💬 ${p.kommentare} · ${p.konto}`), mk('div', '', String(p.text || '').slice(0, 80)));
      if (/^https:\/\/(www\.)?(tiktok\.com|instagram\.com|youtube\.com|youtu\.be)\//.test(p.link || '')) { const a = mk('a', '', 'Antworten ↗'); a.href = p.link; a.target = '_blank'; a.rel = 'noopener'; z.append(a); }
      return z;
    }) : [mk('div', 'tipp', 'Gerade keine neuen Kommentare - in den letzten 3 Tagen.')];
    const vorlagen = ANTWORTEN.map(([wann, text]) => {
      const z = mk('div', 'tipp gut'); const knopf = mk('button', '', '📋 Kopieren');
      knopf.onclick = async () => { try { await navigator.clipboard.writeText(text); knopf.textContent = '✅ Kopiert'; } catch { /* kein Zugriff */ } };
      z.append(mk('b', '', wann), mk('div', '', text), knopf); return z;
    });
    q('vl-kommentare').replaceChildren(...liste, mk('div', 'unter', 'Antwort-Vorlagen:'), ...vorlagen);
  }

  function uhrzeit(posts) {
    const zeilen = BLOECKE.map(([name, von, bis]) => { const l = posts.filter((p) => { const h = stunde(p.zeit); return h >= von && h < bis; }); return { name, n: l.length, aufrufe: schnitt(l, (p) => p.aufrufe) }; })
      .filter((z) => z.n);
    const max = Math.max(...zeilen.map((z) => z.aufrufe), 1);
    q('vl-zeit').replaceChildren(...zeilen.map((z) => balken(z.name, z.aufrufe, max, `${zahl(z.aufrufe)} Ø · ${z.n} Videos`)));
    const best = [...zeilen].sort((a, b) => b.aufrufe - a.aufrufe)[0];
    if (best && zeilen.length > 1) q('vl-zeit').append(mk('div', 'tipp gut', `⏰ Beste Zeit bei uns: ${best.name}. Wichtige Videos dann posten.`));
  }

  function top(posts) {
    const liste = [...posts].sort((a, b) => b.aufrufe * b.sehdauer - a.aufrufe * a.sehdauer).slice(0, 5);
    q('vl-top').replaceChildren(...liste.map((p, i) => {
      const z = mk('div', 'tipp');
      z.append(mk('b', '', `#${i + 1} ${zahl(p.aufrufe)} Aufrufe · ${p.sehdauer} s · ${p.konto}`), mk('div', '', p.text));
      if (/^https:\/\/(www\.)?(tiktok\.com|instagram\.com|youtube\.com|youtu\.be)\//.test(p.link || '')) { const a = mk('a', '', 'Ansehen ↗'); a.href = p.link; a.target = '_blank'; a.rel = 'noopener'; z.append(a); }
      return z;
    }));
  }

  // Hook-Tester: Regeln aus dem, was bei unseren Videos die Leute hält
  const REGELN = [
    [(h) => h.length > 0 && h.length <= 70, 'Kurz (in 2 s gelesen)', 'Kürzer machen - unter 70 Zeichen'],
    [(h) => /^(ich|mein|meine|um|im|heute|kein)\b/i.test(h), 'Startet nah dran („Ich …“, „Mein …“)', 'Mit „Ich …“ oder „Mein …“ anfangen - wirkt echt'],
    [(h) => /(aber|trotzdem|nicht|kein|niemand|nur|allein|tot|gibt es)/i.test(h), 'Hat einen Widerspruch', 'Widerspruch einbauen: „…, aber …“, „Ich wohne allein …“'],
    [(h) => /\d|uhr|nacht|drei/i.test(h), 'Konkretes Detail (Zahl/Uhrzeit)', 'Detail rein: Uhrzeit, Zahl („3:12 Uhr“, „Etage 13“)'],
    [(h) => /(handy|nachricht|anruf|kamera|foto|app|chat|klingel)/i.test(h), 'Alltags-Ding (Handy, Kamera, Chat)', 'Alltags-Gerät rein - jeder hat eins, jeder fühlt mit'],
    [(h) => !/^teil\s*\d/i.test(h) && !/\?$/.test(h), 'Aussage statt Frage', 'Als Aussage schreiben, nicht als Frage'],
  ];
  function hookTest() {
    const h = q('vl-hook').value.trim();
    const erg = REGELN.map(([f, gut, tipp]) => [f(h), gut, tipp]);
    const punkte = Math.round((erg.filter(([ok]) => ok).length / REGELN.length) * 100);
    q('vl-hookscore').textContent = h ? punkte : '–';
    q('vl-hookcheck').replaceChildren(...(h ? erg.map(([ok, gut, tipp]) => mk('div', `tipp ${ok ? 'gut' : ''}`, `${ok ? '✅' : '💡'} ${ok ? gut : tipp}`)) : []));
    caption();
  }

  function caption() {
    const h = q('vl-hook').value.trim(), f = q('vl-frage').value.trim(), a = q('vl-a').value.trim(), b = q('vl-b').value.trim();
    const wahl = a && b ? ` 1️⃣ ${a} oder 2️⃣ ${b}? Zahl in die Kommentare` : '';
    q('vl-caption').value = h ? `${h} ${f}${wahl} 👇\n\n#horrortok #gruselgeschichte #creepypasta #gänsehaut #horrorstory\n(KI-generiert, frei erfundene Geschichte)` : '';
  }

  // A/B-Test: Sehdauer mit und ohne Feature (erst ab je 3 Videos aussagekräftig)
  function abZeilen(ab) {
    const NAMEN = { kalt: '⏪ Kalter Einstieg', raum: '🎧 3D-Ton', suchbild: '👀 Versteckte Augen', duhook: '🫵 Du-Hook statt Ich-Hook', ki: '🖼️ KI-Bilder statt Zeichnung' };
    const zeilen = Object.entries(ab).map(([f, w]) => mk('div', 'tipp', `🧪 ${NAMEN[f] || f}: mit ${w.an.sehdauer} s (${w.an.n}) · ohne ${w.aus.sehdauer} s (${w.aus.n})${w.an.n < 3 || w.aus.n < 3 ? ' – noch zu wenig Daten' : ''}`));
    return zeilen.length ? [mk('div', 'unter', 'A/B-Test (Ø Sehdauer):'), ...zeilen] : [];
  }

  // Wochenbericht (#115): was lief, was nicht, was als Nächstes
  async function woche() {
    if (!q('vl-woche')) return;
    let b = null;
    try { b = await (await fetch(`wochenbericht.json?t=${Date.now()}`, { cache: 'no-store' })).json(); } catch { /* noch nicht erstellt */ }
    if (!b || !b.gesamt?.posts) { q('vl-woche').replaceChildren(mk('div', 'tipp', 'Der Bericht füllt sich, sobald Posts älter als 1 Tag Zahlen haben.')); return; }
    const g = b.gesamt;
    const trend = g.vorherAufrufe ? ` (Woche davor: ${zahl(g.vorherAufrufe)}${g.aufrufe >= g.vorherAufrufe ? ' 📈' : ' 📉'})` : '';
    const konten = Object.entries(b.konten).sort((x, y) => y[1].schnitt - x[1].schnitt);
    const max = Math.max(...konten.map(([, w]) => w.schnitt), 1);
    q('vl-woche').replaceChildren(
      mk('div', 'unter', `${g.posts} Posts · ${zahl(g.aufrufe)} Aufrufe${trend}`),
      ...(b.vorrat ? [mk('div', 'unter', `📚 Geschichten-Vorrat: Deutsch ${b.vorrat.de.rest} (≈ ${b.vorrat.de.tage} Tage) · Englisch ${b.vorrat.en.rest} (≈ ${b.vorrat.en.tage} Tage)`)] : []),
      ...konten.map(([k, w]) => balken(k, w.schnitt, max, `${zahl(w.schnitt)} Ø${w.vorher !== null && w.vorher !== undefined ? ` (vorher ${zahl(w.vorher)})` : ''} · ${w.n}`)),
      ...b.top.map((p, i) => { const z = mk('div', 'tipp'); z.append(mk('b', '', `🏆 #${i + 1} ${zahl(p.aufrufe)} · ${p.konto}`), mk('div', '', p.text)); return z; }),
      ...abZeilen(b.ab || {}),
      ...(b.sprachTest && (b.sprachTest.de.n || b.sprachTest.en.n) ? [mk('div', 'tipp', `🌍 Sprach-Test YouTube: Deutsch Ø ${zahl(b.sprachTest.de.schnitt)} (${b.sprachTest.de.n}) · Englisch Ø ${zahl(b.sprachTest.en.schnitt)} (${b.sprachTest.en.n})${b.sprachTest.de.n < 4 || b.sprachTest.en.n < 4 ? ' – noch zu wenig Daten' : ''}`)] : []),
      ...b.schritte.map((s) => mk('div', 'tipp gut', `👉 ${s}`)));
  }

  // Trend-Radar (#114): welche aktuellen Themen heute zu neuen Geschichten wurden
  async function trends() {
    if (!q('vl-trends')) return;
    let t = null;
    try { t = await (await fetch(`trends.json?t=${Date.now()}`, { cache: 'no-store' })).json(); } catch { /* noch nie gelaufen */ }
    if (!t) { q('vl-trends').replaceChildren(mk('div', 'tipp', 'Der Trend-Radar läuft jeden Morgen und füllt den Videobot mit neuen Geschichten.')); return; }
    const neu = t.neu || [];
    q('vl-trends').replaceChildren(
      mk('div', 'unter', `Stand ${new Date(t.stand).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} · Themen: ${(t.themen || []).map((x) => x.thema).join(' · ')}`),
      ...(neu.length ? neu.map((s) => { const z = mk('div', 'tipp gut'); z.append(mk('b', '', `${s.quelle === 'google-trends' ? '📈' : '🍂'} ${s.trend}`), mk('div', '', `„${s.titel}“ – ${s.hook}`)); return z; })
        : [mk('div', 'tipp', 'Heute keine neue Geschichte geschafft (KI aus oder Hooks zu schwach) - morgen wieder.')]));
  }

  async function start() {
    if (!q('vl-duell')) return;
    for (const id of ['vl-hook', 'vl-frage', 'vl-a', 'vl-b']) q(id).addEventListener('input', hookTest);
    q('vl-kopieren').onclick = async () => { try { await navigator.clipboard.writeText(q('vl-caption').value); q('vl-kopieren').textContent = '✅ Kopiert'; } catch { q('vl-caption').select(); } };
    q('vl-hook').value = 'Ich wohne allein. Heute stehen zwei Zahnbürsten im Glas.'; q('vl-frage').value = 'Hättest du ins Bad geschaut?'; q('vl-a').value = 'Ins Bad'; q('vl-b').value = 'Raus hier';
    hookTest();
    trends();
    woche();
    let d = null;
    try { d = await (await fetch(`daten.json?t=${Date.now()}`, { cache: 'no-store' })).json(); } catch { /* offline */ }
    const posts = (d?.letzte || []).filter((p) => p.aufrufe > 0);
    if (!posts.length) { q('vl-duell').replaceChildren(mk('div', 'tipp', 'Noch keine Zahlen - kommen 1-2 Tage nach dem Post.')); return; }
    duell(posts); kommentare(d?.letzte || []); konten(posts); uhrzeit(posts); top(posts);
  }
  start();
})();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
