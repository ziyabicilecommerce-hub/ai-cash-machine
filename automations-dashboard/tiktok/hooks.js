// Hook-Maschine (13.11.): Thema antippen -> fertige Horror-Hooks nach den Formeln, die bei UNSEREN Videos am besten liefen
// (Trick-Radar: Du-Ansprache am Anfang x1,6, Uhrzeit x1,2, Zahl x1,1). Jeder Hook bekommt Punkte wie beim Skript-Bot.
// Dazu "Deine Hit-Hooks": die echten ersten Sätze, die gegen den Schnitt ihres Kontos am meisten geholt haben (verlauf.json).
// Läuft komplett im Browser, ohne KI und ohne Schlüssel.
(() => {
  const q = (id) => document.getElementById(id);
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  if (!q('hm-themen')) return;

  // du = Subjekt in Du-Form, neben = Aussage im Nebensatz (Verb am Ende), inv = Aussage mit Verb vorn,
  // twist = zweiter Satz (der Widerspruch), regel = Befehl (klein geschrieben)
  const THEMEN = [
    { name: 'Aufzug', du: 'dein Aufzug', neben: 'in Etage minus 4 hält', inv: 'hält mein Aufzug in Etage minus 4', twist: 'Kein Keller.', regel: 'steig nicht aus' },
    { name: 'Babyphone', du: 'dein Babyphone', neben: 'deinen Namen ruft', inv: 'ruft mein Babyphone meinen Namen', twist: 'Mein Baby liegt hier.', regel: 'antworte nicht' },
    { name: 'Türkamera', du: 'deine Türkamera', neben: 'jemanden zeigt', inv: 'zeigt meine Türkamera jemanden', twist: 'Er steht hinter mir.', regel: 'mach nicht auf' },
    { name: 'Spiegel', du: 'dein Spiegelbild', neben: 'zu spät blinzelt', inv: 'blinzelt mein Spiegelbild zu spät', twist: 'Und es lächelt.', regel: 'schau weg' },
    { name: 'Navi', du: 'dein Navi', neben: 'in den Wald führt', inv: 'führt mich mein Navi in den Wald', twist: 'Da ist keine Straße.', regel: 'fahr weiter' },
    { name: 'Gruppenchat', du: 'dein Gruppenchat', neben: 'einen zu viel hat', inv: 'schreibt im Gruppenchat einer zu viel', twist: 'Wir sind nur 5.', regel: 'antworte nicht' },
    { name: 'Oma', du: 'deine Oma', neben: 'anruft', inv: 'ruft meine Oma an', twist: 'Sie ist seit 2 Jahren tot.', regel: 'geh nicht ran' },
    { name: 'Zelt', du: 'dein Zelt', neben: 'von außen aufgeht', inv: 'geht mein Zelt von außen auf', twist: 'Wir sind allein im Wald.', regel: 'bleib im Schlafsack' },
    { name: 'Kinderzimmer', du: 'dein Kind', neben: 'mit dem Schrank redet', inv: 'redet mein Sohn mit dem Schrank', twist: 'Der Schrank antwortet.', regel: 'mach nicht auf' },
    { name: 'Handy', du: 'dein Handy', neben: 'ein Foto von dir macht', inv: 'macht mein Handy ein Foto von mir', twist: 'Es liegt im Flur.', regel: 'schau nicht hin' },
    { name: 'Hotel', du: 'dein Hotelschrank', neben: 'von innen klopft', inv: 'klopft mein Hotelschrank von innen', twist: 'Ich bin allein.', regel: 'zieh sofort um' },
    { name: 'Nachbar', du: 'dein Nachbar', neben: 'aus dem Fenster winkt', inv: 'winkt mein Nachbar mir zu', twist: 'Er ist tot.', regel: 'wink nicht zurück' },
    { name: 'Zug', du: 'dein Zug', neben: 'mitten im Wald hält', inv: 'hält mein Zug mitten im Wald', twist: 'Alle steigen aus.', regel: 'steig nicht aus' },
    { name: 'Katze', du: 'deine Katze', neben: 'in die Ecke starrt', inv: 'starrt meine Katze in die Ecke', twist: 'Heute faucht sie.', regel: 'dreh dich nicht um' },
    { name: 'Schlaf-App', du: 'deine Schlaf-App', neben: 'zwei Atmende aufnimmt', inv: 'nimmt meine Schlaf-App zwei Atmende auf', twist: 'Ich bin allein.', regel: 'hör nicht rein' },
    { name: 'Hund', du: 'dein Hund', neben: 'am Waldrand stehen bleibt', inv: 'bleibt mein Hund am Waldrand stehen', twist: 'Da steht jemand.', regel: 'geh nicht weiter' },
  ];
  const gross = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  // Formeln - die ersten zwei mit Du-Ansprache (laufen bei uns am besten), dann Ich-Hooks mit Uhrzeit/Zahl
  const FORMELN = [
    (t) => `Wenn ${t.du} um 3 Uhr ${t.neben}, ${t.regel}.`,
    (t) => `${gross(t.regel)}, wenn ${t.du} um 3 Uhr ${t.neben}.`,
    (t) => `Um 3:12 Uhr ${t.inv}. ${t.twist}`,
    (t) => `Seit 3 Nächten ${t.inv}. ${t.twist}`,
    (t) => `Heute Nacht ${t.inv}. ${t.twist}`,
  ];
  // Punkte wie der Skript-Bot (6 Regeln) + was das Trick-Radar bei uns gemessen hat
  const REGELN = [
    [(h) => h.length <= 70, 'kurz genug (höchstens 70 Zeichen)'],
    [(h) => /^(ich|mein|meine|um|im|heute|kein|wenn|seit)\b/i.test(h), 'starker Anfang'],
    [(h) => /(aber|trotzdem|nicht|kein|niemand|nur|allein|tot)/i.test(h), 'Widerspruch (aber / nicht / allein)'],
    [(h) => /\d|uhr|nacht/i.test(h), 'Uhrzeit oder Zahl'],
    [(h) => /(handy|nachricht|kamera|foto|app|chat|klingel|babyphone|navi)/i.test(h), 'Alltags-Technik'],
    [(h) => !/\?$/.test(h), 'keine Frage am Ende'],
  ];
  const punkte = (h) => {
    let p = REGELN.filter(([f]) => f(h)).length * 12;
    if (/^(wenn|steig|mach|antworte|hör|lies|schau|bleib|geh|dreh|fahr|öffne|zieh|wink)\b/i.test(h) || /\b(du|dein|deine)\b/i.test(h)) p += 14;  // Du-Ansprache x1,6
    if (/\d ?uhr|\d:\d\d/i.test(h)) p += 8;  // Uhrzeit x1,2
    if (/\d/.test(h)) p += 6;                // Zahl x1,1
    return Math.min(100, p);
  };

  let aktiv = THEMEN[0];
  function zeigen() {
    const hooks = [...new Set(FORMELN.map((f) => f(aktiv)))].filter((h) => h.length <= 70)
      .map((h) => ({ h, p: punkte(h) })).sort((a, b) => b.p - a.p);
    q('hm-liste').replaceChildren(...hooks.map(({ h, p }) => {
      const z = mk('div', `tipp ${p >= 80 ? 'gut' : ''}`);
      const kopf = mk('div', '', `${p >= 80 ? '🔥' : p >= 65 ? '👍' : '💡'} ${p}/100 · ${h.length} Zeichen`); kopf.style.opacity = '.75'; kopf.style.fontSize = '12px';
      const knoepfe = mk('div', 'knoepfe'); knoepfe.style.marginTop = '6px';
      const kopie = mk('button', 'knopf', '📋 Kopieren'); kopie.type = 'button';
      kopie.onclick = () => navigator.clipboard?.writeText(h).then(() => { kopie.textContent = '✅ Kopiert'; setTimeout(() => { kopie.textContent = '📋 Kopieren'; }, 1500); });
      const vb = mk('button', 'knopf', '🎬 In Videobot'); vb.type = 'button';
      vb.onclick = () => { const f = q('vb-hook'); if (f) { f.value = h; f.dispatchEvent(new Event('input')); f.scrollIntoView({ behavior: 'smooth', block: 'center' }); } };
      knoepfe.append(kopie, vb);
      z.append(kopf, mk('b', '', h), knoepfe);
      return z;
    }));
    for (const b of q('hm-themen').children) b.classList.toggle('an', b.textContent === aktiv.name);
  }
  q('hm-themen').replaceChildren(...THEMEN.map((t) => { const b = mk('button', 'chip', t.name); b.type = 'button'; b.onclick = () => { aktiv = t; zeigen(); }; return b; }));
  q('hm-zufall').onclick = () => { aktiv = THEMEN[Math.floor(Math.random() * THEMEN.length)]; zeigen(); };
  zeigen();

  // Deine Hit-Hooks: jeder Post gegen den Median seines Kontos in +-3 Tagen (wie das Trick-Radar im Wochenbericht)
  const median = (l) => { const s = [...l].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
  fetch(`verlauf.json?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.json()).then((v) => {
    const reif = v.filter((p) => Date.now() - new Date(p.zeit) >= 864e5 && (p.format || 'horror') === 'horror' && p.text);
    const hits = reif.map((p) => {
      const nah = reif.filter((x) => x.konto === p.konto && Math.abs(new Date(x.zeit) - new Date(p.zeit)) < 3 * 864e5).map((x) => x.aufrufe || 0);
      const m = median(nah);
      return { p, x: nah.length >= 4 && m >= 10 ? (p.aufrufe || 0) / m : 0, hook: String(p.text).trim().split(/(?<=[.!?])\s/)[0] };
    }).filter((e) => e.x >= 1.3).sort((a, b) => b.x - a.x);
    const gesehen = new Set();
    const top = hits.filter((e) => !gesehen.has(e.hook) && gesehen.add(e.hook)).slice(0, 8);
    q('hm-hits').replaceChildren(...(top.length ? top.map((e) => {
      const z = mk('div', 'tipp gut');
      z.append(mk('b', '', e.hook), mk('div', '', `x${e.x.toFixed(1)} gegen den Konto-Schnitt · ${new Intl.NumberFormat('de-DE').format(e.p.aufrufe)} Aufrufe · ${e.p.konto}`));
      z.lastChild.style.cssText = 'opacity:.75;font-size:12px;margin-top:4px';
      return z;
    }) : [mk('div', 'tipp', 'Noch zu wenig Zahlen - sobald Videos deutlich über dem Schnitt liegen, stehen ihre Hooks hier.')]));
  }).catch(() => q('hm-hits').replaceChildren(mk('div', 'tipp', 'Verlauf noch nicht da (entsteht mit dem Wochenbericht).')));
})();
