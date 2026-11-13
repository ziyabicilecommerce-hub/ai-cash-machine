// Hook-Maschine (13.11.): Thema antippen -> fertige Horror-Hooks nach den Formeln, die bei UNSEREN Videos am besten liefen
// (Trick-Radar: Regel-Hook "Wenn …, geh nicht ran" x2,2, Du-Ansprache x1,8). Jeder Hook bekommt Punkte wie beim Skript-Bot.
// Dazu "Deine Hit-Hooks": die echten ersten Sätze, die gegen den Schnitt ihres Kontos am meisten geholt haben (verlauf.json).
// Läuft komplett im Browser, ohne KI und ohne Schlüssel.
(() => {
  const q = (id) => document.getElementById(id);
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  if (!q('hm-themen')) return;

  // viral = von Hand geschrieben im Stil unserer echten Hits ("Wenn dich deine eigene Nummer anruft, geh nicht ran." x2,8;
  // "Wenn es nachts an deiner Wand klopft, klopf nie zurück." x4,9; "Um 3:12 Uhr schreibt eine fremde Nummer: Falscher Knopf." x5,0).
  // u = das Unmögliche als Nebensatz ohne "Wenn", regel = kurzer Befehl, inv/twist = Ich-Hook mit Uhrzeit
  const THEMEN = [
    { name: 'Aufzug', u: 'dein Aufzug eine Etage zu tief fährt', regel: 'steig nicht aus', inv: 'hält mein Aufzug in Etage minus 4', twist: 'Kein Keller.',
      viral: ['Im Aufzug hängt ein Zettel: Drück nie die 13.', 'Wenn der Aufzug ohne dich nach unten fährt, ruf ihn nicht zurück.'] },
    { name: 'Babyphone', u: 'das Babyphone atmet und dein Baby neben dir liegt', regel: 'renn', inv: 'ruft mein Babyphone meinen Namen', twist: 'Mein Baby liegt hier.',
      viral: ['Um 3:12 Uhr flüstert das Babyphone: Er schläft jetzt.', 'Wenn dein Babyphone deinen Namen flüstert, antworte nie.'] },
    { name: 'Türkamera', u: 'deine Türkamera dich selbst vor der Tür zeigt', regel: 'mach nicht auf', inv: 'zeigt meine Türkamera jemanden', twist: 'Er steht hinter mir.',
      viral: ['Um 3 Uhr klingelt es. Die Kamera zeigt: niemand.', 'Wenn jemand klingelt und die Kamera schwarz ist, sag nichts.'] },
    { name: 'Spiegel', u: 'dein Spiegelbild zu spät blinzelt', regel: 'schau nie wieder hin', inv: 'blinzelt mein Spiegelbild zu spät', twist: 'Und es lächelt.',
      viral: ['Im Hotelbad hängt ein Zettel: Deck nachts den Spiegel ab.', 'Wenn dein Spiegelbild zuerst lächelt, lächle nicht zurück.'] },
    { name: 'Navi', u: 'dein Navi um 3 Uhr Wenden sagt', regel: 'wende nicht', inv: 'führt mich mein Navi in den Wald', twist: 'Da ist keine Straße.',
      viral: ['Um 3:12 Uhr sagt mein Navi: Bitte nicht aussteigen.', 'Wenn dein Navi deine alte Adresse kennt, fahr nicht hin.'] },
    { name: 'Gruppenchat', u: 'dein Gruppenchat einen Teilnehmer mehr hat', regel: 'lies nichts', inv: 'schreibt im Gruppenchat einer zu viel', twist: 'Wir sind nur 5.',
      viral: ['Um 3:12 Uhr schreibt jemand in unseren Chat: Er ist wach.', 'Wenn dein Gruppenchat um 3 Uhr still wird, schreib nichts.'] },
    { name: 'Oma', u: 'dich deine tote Oma anruft', regel: 'geh nicht ran', inv: 'ruft meine Oma an', twist: 'Sie ist seit 2 Jahren tot.',
      viral: ['Meine tote Oma schreibt um 3 Uhr: Mach nicht auf.', 'Wenn deine Oma nachts fragt, ob du allein bist, sag ja.'] },
    { name: 'Zelt', u: 'jemand um 3 Uhr ins Zelt flüstert: Ich bin es', regel: 'antworte nicht', inv: 'geht mein Zelt von außen auf', twist: 'Wir sind allein.',
      viral: ['Am Zeltplatz hängt ein Zettel: Antworte nachts niemandem.', 'Wenn dein Kumpel draußen um Hilfe ruft und neben dir liegt, bleib liegen.'] },
    { name: 'Kinderzimmer', u: 'dein Kind sagt, der Mann im Schrank ist nett', regel: 'zieh aus', inv: 'redet mein Sohn mit dem Schrank', twist: 'Der Schrank antwortet.',
      viral: ['Mein Sohn sagt: Der Mann im Schrank kennt dich.', 'Wenn dein Kind flüstert: Nicht jetzt, er schaut, schau nicht hin.'] },
    { name: 'Handy', u: 'du ein Selfie findest, das du nie gemacht hast', regel: 'renn', inv: 'macht mein Handy ein Foto von mir', twist: 'Es liegt im Flur.',
      viral: ['Um 3:12 Uhr schreibt eine fremde Nummer: Dreh dich nicht um.', 'Wenn dich deine eigene Nummer anruft, geh nie ran.'] },
    { name: 'Hotel', u: 'dein Hotelzimmer eine Tür mehr hat als gestern', regel: 'schlaf nicht ein', inv: 'klopft mein Hotelschrank von innen', twist: 'Ich bin allein.',
      viral: ['Im Hotel hängt ein Zettel: Öffne nachts nie den Schrank.', 'Wenn die Rezeption um 3 Uhr anruft, geh nicht ran.'] },
    { name: 'Nachbar', u: 'dein toter Nachbar dir winkt', regel: 'wink nicht zurück', inv: 'winkt mein Nachbar mir zu', twist: 'Er ist tot.',
      viral: ['Im Hausflur hängt ein Zettel: Nachts nie klingeln. Er schläft.', 'Wenn es nachts an deiner Wand klopft, klopf nie zurück.'] },
    { name: 'Zug', u: 'dein Zug an einem Bahnhof ohne Namen hält', regel: 'steig nie aus', inv: 'hält mein Zug mitten im Wald', twist: 'Alle steigen aus.',
      viral: ['Um 3:12 Uhr sagt die Durchsage meinen Namen.', 'Wenn im leeren Zug jemand neben dir Platz nimmt, schau nicht hin.'] },
    { name: 'Katze', u: 'deine Katze in die leere Ecke faucht', regel: 'dreh dich nicht um', inv: 'starrt meine Katze in die Ecke', twist: 'Heute faucht sie.',
      viral: ['Meine Katze faucht um 3 Uhr unter mein Bett.', 'Wenn deine Katze nachts auf die Tür starrt, mach nicht auf.'] },
    { name: 'Schlaf-App', u: 'deine Schlaf-App zwei Atmende aufnimmt', regel: 'hör nie rein', inv: 'nimmt meine Schlaf-App zwei Atmende auf', twist: 'Ich bin allein.',
      viral: ['Meine Schlaf-App zeigt um 3 Uhr: Sprechen erkannt.', 'Wenn deine Schlaf-App Schritte aufnimmt, schau nicht unters Bett.'] },
    { name: 'Hund', u: 'dein Hund am Waldrand nicht weitergeht', regel: 'geh auch nicht weiter', inv: 'bleibt mein Hund am Waldrand stehen', twist: 'Da steht jemand.',
      viral: ['Um 3 Uhr bellt mein Hund die Wand an. Die Wand klopft zurück.', 'Wenn dein Hund nachts das Fenster anknurrt, mach kein Licht.'] },
  ];
  // Formeln: zuerst der Regel-Hook (bei uns x2,2), dann Ich-Hook mit Uhrzeit
  const FORMELN = [
    (t) => `Wenn ${t.u}, ${t.regel}.`,
    (t) => `Wenn ${t.u}, renn.`,
    (t) => `Um 3:12 Uhr ${t.inv}. ${t.twist}`,
  ];
  // Punkte nach dem, was das Trick-Radar bei unseren Videos gemessen hat (Stand 13.11.):
  // Regel-Hook x2,2 · Du-Ansprache x1,8 · Zettel/Regel x1,1 · Uhrzeit x1,1 · dazu die Grundregeln des Skript-Bots
  const REGELN = [
    [(h) => h.length <= 70, 'kurz genug'],
    [(h) => !/\?$/.test(h), 'keine Frage am Ende'],
    [(h) => /(aber|trotzdem|nicht|nie|kein|niemand|nur|allein|tot)/i.test(h), 'Widerspruch oder Verbot'],
    [(h) => /\d|uhr|nacht/i.test(h), 'Uhrzeit oder Zahl'],
  ];
  const regelHook = (h) => /^(wenn|dankt|ruft|schreibt|steht|liegt|findest|hörst|siehst|zeigt|fragt|sagt)\b/i.test(h) && /,\s*[^,]*\b(nie|niemals|nicht|renn|lauf|kein|nichts)\b[^,]*[.!]$/i.test(h);
  const punkte = (h) => {
    let p = REGELN.filter(([f]) => f(h)).length * 10;
    if (regelHook(h)) p += 30;
    if (/^(wenn|steig|mach|antworte|hör|lies|schau|bleib|geh|dreh|fahr|öffne|zieh|wink|wende|schlaf)\b/i.test(h) || /\b(du|dich|dein|deine|deinen)\b/i.test(h)) p += 18;
    if (/:\s*\S/.test(h) || /zettel|schild/i.test(h)) p += 8;
    if (/\d ?uhr|\d:\d\d/i.test(h)) p += 4;
    return Math.min(100, p);
  };

  let aktiv = THEMEN[0];
  function zeigen() {
    const hooks = [...new Set([...aktiv.viral, ...FORMELN.map((f) => f(aktiv))])].filter((h) => h.length <= 70)
      .map((h) => ({ h, p: punkte(h) })).sort((a, b) => b.p - a.p);
    q('hm-liste').replaceChildren(...hooks.map(({ h, p }) => {
      const z = mk('div', `tipp ${p >= 80 ? 'gut' : ''}`); const warum = regelHook(h) ? ' · Regel-Hook (bei dir x2,2)' : /^wenn|\bdu\b|\bdein/i.test(h) ? ' · Du-Ansprache (x1,8)' : '';
      const kopf = mk('div', '', `${p >= 80 ? '🔥' : p >= 65 ? '👍' : '💡'} ${p}/100 · ${h.length} Zeichen${warum}`); kopf.style.opacity = '.75'; kopf.style.fontSize = '12px';
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
