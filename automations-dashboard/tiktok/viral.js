// Viral-Labor: was bei UNSEREN Videos funktioniert (Format-Duell, beste Uhrzeit, Top-Videos) + Hook-Tester + Caption-Baukasten.
// Liest daten.json (Automation #103). Rechnet nur mit Posts, für die TikTok schon Zahlen geliefert hat - nichts wird erfunden.
(() => {
  const q = (id) => document.getElementById(id);
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const zahl = (n) => new Intl.NumberFormat('de-DE').format(Math.round(n || 0));
  const NAMEN = { horror: '👻 Horror einzeln', serie: '📺 Horror-Serie', quiz: '❓ Quiz', mythos: '🤔 Wahr/Mythos', waswaere: '🚀 Was wäre wenn' };
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
      if (/^https:\/\/(www\.)?tiktok\.com\//.test(p.link || '')) { const a = mk('a', '', 'Ansehen ↗'); a.href = p.link; a.target = '_blank'; a.rel = 'noopener'; z.append(a); }
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

  async function start() {
    if (!q('vl-duell')) return;
    for (const id of ['vl-hook', 'vl-frage', 'vl-a', 'vl-b']) q(id).addEventListener('input', hookTest);
    q('vl-kopieren').onclick = async () => { try { await navigator.clipboard.writeText(q('vl-caption').value); q('vl-kopieren').textContent = '✅ Kopiert'; } catch { q('vl-caption').select(); } };
    q('vl-hook').value = 'Ich wohne allein. Heute stehen zwei Zahnbürsten im Glas.'; q('vl-frage').value = 'Hättest du ins Bad geschaut?'; q('vl-a').value = 'Ins Bad'; q('vl-b').value = 'Raus hier';
    hookTest();
    let d = null;
    try { d = await (await fetch(`daten.json?t=${Date.now()}`, { cache: 'no-store' })).json(); } catch { /* offline */ }
    const posts = (d?.letzte || []).filter((p) => p.aufrufe > 0);
    if (!posts.length) { q('vl-duell').replaceChildren(mk('div', 'tipp', 'Noch keine Zahlen - kommen 1-2 Tage nach dem Post.')); return; }
    duell(posts); uhrzeit(posts); top(posts);
  }
  start();
})();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
