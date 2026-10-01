// Werbe-Labor: Hooks mit verschiedenen Kauf-Psychologien entwerfen, von einer simulierten Test-Jury
// bewerten lassen, Gewinner gegen den häufigsten Einwand nachschärfen. Die Jury ist ein interner
// Test (Simulation) und wird nie als Kunde oder Bewertung ausgegeben. Läuft im Browser und in Node.
(function (root) {
  const WINKEL = [
    { id: 'neugier', name: 'Neugier-Lücke', regel: 'Wecke eine Frage, die man nur durch Weiterschauen beantwortet bekommt.' },
    { id: 'schmerz', name: 'Problem trifft', regel: 'Sprich ein konkretes Alltagsproblem an, das das Produkt löst.' },
    { id: 'vorher', name: 'Vorher/Nachher', regel: 'Zeige den Unterschied zwischen dem Zustand ohne und mit dem Produkt.' },
    { id: 'identitaet', name: 'Identität', regel: 'Sprich eine Gruppe an, zu der der Zuschauer gehören will („Für alle, die …“).' },
    { id: 'beweis', name: 'Live-Beweis', regel: 'Kündige eine Vorführung an, die die Wirkung sofort sichtbar macht.' },
    { id: 'zeit', name: 'Zeitgewinn', regel: 'Betone, wie viel Zeit oder Aufwand das Produkt spart.' },
    { id: 'preis', name: 'Preis-Wert', regel: 'Stelle den Preis einem echten Vergleich gegenüber (nur mit echten Zahlen aus den Produktinfos).' },
    { id: 'gegner', name: 'Gemeinsamer Gegner', regel: 'Benenne das, was den Zuschauer nervt, als Gegner, den das Produkt besiegt.' },
  ];

  // 10 Käufer-Typen, gewichtet auf 100 Test-Personen. Nur für die Simulation.
  const JURY = [
    { id: 'schnaeppchen', name: 'Schnäppchenjägerin, 24', gewicht: 14, achtet: 'Preis, Rabatt, Versandkosten' },
    { id: 'skeptiker', name: 'Skeptiker, 41', gewicht: 12, achtet: 'Beweise, Qualität, Rückgabe' },
    { id: 'trend', name: 'Trend-Käuferin, 19', gewicht: 12, achtet: 'Ob es cool aussieht und neu ist' },
    { id: 'praktiker', name: 'Praktiker, 35', gewicht: 11, achtet: 'Ob es ein echtes Problem löst' },
    { id: 'eltern', name: 'Mutter von zwei Kindern, 38', gewicht: 10, achtet: 'Sicherheit, Zeitersparnis, Alltag' },
    { id: 'gamer', name: 'Gamer, 22', gewicht: 9, achtet: 'Setup, Optik, Leistung' },
    { id: 'gesund', name: 'Fitness-Fan, 29', gewicht: 9, achtet: 'Wirkung, Gesundheit, Routine' },
    { id: 'premium', name: 'Gutverdiener, 47', gewicht: 8, achtet: 'Qualität, Marke, Design' },
    { id: 'geschenk', name: 'Geschenk-Sucher, 31', gewicht: 8, achtet: 'Ob es sich als Geschenk eignet' },
    { id: 'impuls', name: 'Impulskäufer, 26', gewicht: 7, achtet: 'Ob es sofort Lust macht' },
  ];

  const zuText = (p) => String(p || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

  function produktKurz(p) {
    const v = (p.variants || [])[0] || {};
    const preis = Number(p.preis ?? v.price) || null, vergleich = Number(v.compare_at_price) || null;
    return { titel: p.title || p.name, info: zuText(p.body_html || p.info).slice(0, 600), preis, vergleich: vergleich && preis && vergleich > preis ? vergleich : null };
  }

  function hookPrompt(p) {
    const k = produktKurz(p);
    return `Du bist die beste Performance-Werbetexterin für TikTok, Reels und Shorts. Produkt: "${k.titel}". Infos: ${k.info}` +
      `${k.preis ? ` Preis: ${k.preis} EUR.` : ''}${k.vergleich ? ` Vorher: ${k.vergleich} EUR.` : ''}\n` +
      `Schreibe genau ${WINKEL.length} Hooks auf Deutsch (Du-Ansprache), je einen pro Kauf-Psychologie:\n` +
      WINKEL.map((w, i) => `${i + 1}. ${w.name}: ${w.regel}`).join('\n') +
      '\nRegeln: maximal 9 Wörter, gesprochen in unter 2 Sekunden, konkret statt Floskeln. Nur Eigenschaften aus den Infos, keine erfundenen Zahlen, ' +
      'keine erfundene Knappheit, keine erfundenen Kunden oder Bewertungen. Antworte NUR mit JSON: {"hooks":["...", "..."]}';
  }

  function juryPrompt(p, hooks) {
    const k = produktKurz(p);
    return `Simuliere ehrlich, wie diese 10 Käufer-Typen auf Werbe-Hooks für "${k.titel}"${k.preis ? ` (${k.preis} EUR)` : ''} reagieren. ` +
      `Kurz-Infos: ${k.info.slice(0, 300)}\nKäufer-Typen:\n${JURY.map((j, i) => `${i + 1}. ${j.name} – achtet auf: ${j.achtet}`).join('\n')}\n` +
      `Hooks:\n${hooks.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n` +
      'Gib für JEDEN Käufer-Typ und JEDEN Hook die Kaufabsicht 0-10 (10 = würde sofort kaufen). Sei streng und realistisch, die meisten Werte liegen zwischen 2 und 7. ' +
      'Nenne pro Käufer-Typ den wichtigsten Grund, NICHT zu kaufen (max. 8 Wörter). ' +
      'Antworte NUR mit JSON: {"werte":[[Zahlen für Hook 1..n] je Käufer-Typ in obiger Reihenfolge],"einwaende":["Grund je Käufer-Typ"]}';
  }

  function schaerfPrompt(p, hook, einwand) {
    const k = produktKurz(p);
    return `Werbe-Hook für "${k.titel}": "${hook}". Häufigster Grund, nicht zu kaufen: "${einwand}". Infos: ${k.info.slice(0, 400)}\n` +
      'Schreibe den Hook so um, dass er den Einwand gleich mit ausräumt, ohne langsamer zu werden. Dazu einen kurzen Satz für Szene 2, der den Einwand ehrlich beantwortet ' +
      '(nur mit Fakten aus den Infos). Und eine Bild-Schlagzeile mit maximal 5 Wörtern. Nichts erfinden. ' +
      'Antworte NUR mit JSON: {"hook":"...","antwort":"...","schlagzeile":"..."}';
  }

  function hooksLesen(d) {
    const liste = (d && Array.isArray(d.hooks) ? d.hooks : []).map((h) => String(h || '').replace(/^\s*(\d{1,2}[.)]\s+|[-•*]\s+)/, '').replace(/^["„“'\s]+|["“”'\s]+$/g, '').trim()).filter((h) => h.length >= 6 && h.length <= 120);
    return [...new Set(liste)].slice(0, WINKEL.length);
  }

  // Heuristik ohne KI: konkrete, kurze, direkte Hooks gewinnen. Liefert 0-10.
  function heuristik(hook, k) {
    const h = hook.toLowerCase(), w = h.split(/\s+/).filter(Boolean).length;
    let s = 5;
    if (w <= 7) s += 1; if (w > 10) s -= 1.5;
    if (/\b(du|dein|deine|dir|dich)\b/.test(h)) s += 1;
    if (/\d/.test(h)) s += 0.7;
    if (/\?$/.test(h.trim())) s += 0.5;
    if (/(niemand|keiner|warum|so einfach|endlich|nie wieder|statt)/.test(h)) s += 0.8;
    if (/(beste|unglaublich|revolution|krass|mega|einzigartig)/.test(h)) s -= 0.8;
    if (k && k.titel && h.includes(String(k.titel).toLowerCase().split(' ')[0])) s += 0.3;
    return Math.max(0, Math.min(10, Math.round(s * 10) / 10));
  }

  // Wertet die Jury-Matrix aus: gewichtete Kaufabsicht je Hook, Gewinner, häufigster Einwand.
  function auswerten(hooks, jury, k) {
    const werte = jury && Array.isArray(jury.werte) && jury.werte.length === JURY.length ? jury.werte : null;
    const summeGewicht = JURY.reduce((s, j) => s + j.gewicht, 0);
    const ergebnisse = hooks.map((hook, i) => {
      let punkte, quelle = 'Jury';
      const proTyp = JURY.map((j, t) => {
        const v = werte && Array.isArray(werte[t]) ? Number(werte[t][i]) : NaN;
        return Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : null;
      });
      if (proTyp.every((v) => v !== null)) punkte = proTyp.reduce((s, v, t) => s + v * JURY[t].gewicht, 0) / summeGewicht;
      else { punkte = heuristik(hook, k); quelle = 'Regeln'; }
      const kaeufer = proTyp.every((v) => v !== null) ? proTyp.reduce((s, v, t) => s + (v >= 7 ? JURY[t].gewicht : 0), 0) : null;
      return { hook, winkel: WINKEL[i] ? WINKEL[i].name : 'Frei', punkte: Math.round(punkte * 10) / 10, kaeufer, proTyp, quelle };
    }).sort((a, b) => b.punkte - a.punkte);
    const gewinner = ergebnisse[0] || null;
    let einwand = null;
    if (gewinner && jury && Array.isArray(jury.einwaende)) {
      const kandidaten = JURY.map((j, t) => ({ j, v: gewinner.proTyp[t], e: String(jury.einwaende[t] || '').trim() })).filter((x) => x.e && x.v !== null && x.v < 7);
      kandidaten.sort((a, b) => b.j.gewicht - a.j.gewicht);
      if (kandidaten[0]) einwand = { text: kandidaten[0].e.slice(0, 120), von: kandidaten[0].j.name };
    }
    return { ergebnisse, gewinner, einwand };
  }

  // Ganzer Durchlauf mit austauschbarer KI-Funktion: ki(prompt, maxTokens) -> Objekt (JSON).
  async function labor(p, ki) {
    const k = produktKurz(p);
    let hooks = [];
    try { hooks = hooksLesen(await ki(hookPrompt(p), 900)); } catch (e) { /* weiter mit Ersatz */ }
    const ersatz = hooks.length < 3;
    if (ersatz) hooks = ersatzHooks(k);
    let jury = null;
    try { jury = await ki(juryPrompt(p, hooks), 1400); } catch (e) { /* Regeln statt Jury */ }
    const a = auswerten(hooks, jury, k);
    let final = { hook: a.gewinner.hook, antwort: null, schlagzeile: null };
    if (a.einwand) {
      try {
        const s = await ki(schaerfPrompt(p, a.gewinner.hook, a.einwand.text), 500);
        if (s && typeof s.hook === 'string' && s.hook.trim().length >= 6) final = { hook: s.hook.trim().slice(0, 120), antwort: String(s.antwort || '').trim().slice(0, 200) || null, schlagzeile: String(s.schlagzeile || '').trim().slice(0, 40) || null };
      } catch (e) { /* Gewinner unverändert */ }
    }
    return { produkt: k.titel, preis: k.preis, ...a, final, ersatz, erstellt: new Date().toISOString() };
  }

  // Kurzname für gesprochene Hooks: Teil vor „–“/„|“/„:“, höchstens 3 Wörter.
  function kurzName(titel) {
    const t = String(titel || '').split(/\s[–|:-]\s|[|:]/)[0].trim();
    return t.split(/\s+/).slice(0, 3).join(' ') || 'das hier';
  }

  function ersatzHooks(k) {
    const t = kurzName(k.titel);
    return [`Warum hat dir niemand ${t} gezeigt?`, `Dein Alltag ohne ${t}: anstrengend.`, `Vorher vs. nachher mit ${t}`, `Für alle, die es satt haben`, `Schau, was ${t} in 5 Sekunden macht`, `So sparst du dir jeden Tag Zeit`];
  }

  // Erzählweise für die Video-Fabrik aus einem Labor-Ergebnis.
  // Nur von der Test-Jury gewonnene Hooks gehen an die Fabrik. Ohne Jury (KI gedrosselt) schreibt die
  // Fabrik ihr eigenes KI-Skript – das ist besser als eine Regel- oder Vorlagen-Entscheidung.
  function fabrikWinkel(e) {
    if (!e || e.ersatz || !e.gewinner || e.gewinner.quelle !== 'Jury' || !e.final || !e.final.hook) return '';
    return `Beginne GENAU mit diesem getesteten Hook als erstem Satz: "${e.final.hook}". ` +
      (e.final.antwort ? `Szene 2 räumt diesen Einwand ehrlich aus: "${e.final.antwort}". ` : '') +
      `Kauf-Psychologie: ${e.gewinner ? e.gewinner.winkel : ''}. ` +
      (e.final.schlagzeile ? `Als "hook" (Bild-Schlagzeile) nimm: "${e.final.schlagzeile}". ` : '');
  }

  root.ZLabor = { WINKEL, JURY, produktKurz, hookPrompt, juryPrompt, schaerfPrompt, hooksLesen, heuristik, auswerten, labor, fabrikWinkel, kurzName };
})(typeof window !== 'undefined' ? window : globalThis);
