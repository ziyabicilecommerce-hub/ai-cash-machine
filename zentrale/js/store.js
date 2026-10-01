// Datenhaltung: Zustand im Browser (localStorage), Beispieldaten, CSV-Import, Backup.
(function (root) {
  const SCHLUESSEL = 'zentrale.daten.v1';
  const ZA = root.ZA;

  function leer() {
    return {
      beispiel: false,
      produkte: [], bestellungen: [], konkurrenten: [], posts: [], plan: [], faq: [],
      ausgaben: {}, einstellungen: { elastizitaet: -1.5, shopName: 'Mein Shop', rabatt: 12 },
    };
  }

  function laden() {
    try {
      const roh = root.localStorage && root.localStorage.getItem(SCHLUESSEL);
      if (roh) return { ...leer(), ...JSON.parse(roh) };
    } catch (e) { /* Speicher blockiert: mit Beispieldaten weiter */ }
    return null;
  }

  function speichern(zustand) {
    try { root.localStorage && root.localStorage.setItem(SCHLUESSEL, JSON.stringify(zustand)); return true; } catch (e) { return false; }
  }

  function zufall(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Deterministische Beispieldaten: 26 Wochen Shop-Geschäft mit Wachstum und echten Kaufmustern.
  function beispielDaten(heute) {
    const r = zufall(42), wahl = (arr) => arr[Math.floor(r() * arr.length)];
    const z = leer();
    z.beispiel = true;
    z.produkte = [
      ['led', 'LED-Lichtleiste 5 m', 29.99, 7.4, 'Wohnen'],
      ['beamer', 'Mini-Beamer HD', 89.99, 38.5, 'Technik'],
      ['lade', 'Kabelloses Ladepad', 24.99, 5.9, 'Technik'],
      ['halter', 'Handyhalterung Auto', 19.99, 3.8, 'Auto'],
      ['massage', 'Massagepistole Pro', 69.99, 24.0, 'Gesundheit'],
      ['haltung', 'Haltungskorrektor', 27.99, 6.2, 'Gesundheit'],
      ['flasche', 'Smarte Trinkflasche', 34.99, 11.5, 'Gesundheit'],
      ['buerste', 'Glättbürste 2-in-1', 39.99, 12.8, 'Beauty'],
    ].map(([id, name, preis, kosten, kategorie]) => ({ id, name, preis, kosten, kategorie }));
    const paare = { led: 'beamer', beamer: 'led', lade: 'halter', halter: 'lade', massage: 'haltung', haltung: 'massage' };
    const gewicht = { led: 5, beamer: 2, lade: 4, halter: 4, massage: 2, haltung: 3, flasche: 3, buerste: 3 };
    const pool = Object.entries(gewicht).flatMap(([id, n]) => Array(n).fill(id));
    const pid = ZA.nachId(z.produkte);
    const kanaele = ['tiktok', 'tiktok', 'tiktok', 'instagram', 'instagram', 'google', 'email', 'direkt'];
    const ende = ZA.tagZahl(heute), start = ende - 181;
    const kunden = [];
    let nr = 1000;
    for (let t = start; t <= ende; t++) {
      const wachstum = 1 + ((t - start) / 182) * 1.6, wochenende = [5, 6].includes(new Date(t * ZA.TAG).getUTCDay()) ? 1.35 : 1;
      const anzahl = Math.round((1.4 + r() * 2.2) * wachstum * wochenende);
      for (let i = 0; i < anzahl; i++) {
        let kunde;
        if (kunden.length > 20 && r() < 0.28) kunde = kunden[Math.floor(Math.pow(r(), 1.8) * kunden.length)];
        else { kunde = 'K-' + String(kunden.length + 1).padStart(4, '0'); kunden.push(kunde); }
        let haupt = wahl(pool);
        const ledTeuer = (t - start) % 28 >= 14;
        if (haupt === 'led' && ledTeuer && r() < 0.32) haupt = wahl(pool.filter((x) => x !== 'led'));
        const artikel = [{ p: haupt, menge: r() < 0.12 ? 2 : 1 }];
        if (paare[haupt] && r() < 0.38) artikel.push({ p: paare[haupt], menge: 1 });
        else if (r() < 0.1) { const x = wahl(pool); if (x !== haupt) artikel.push({ p: x, menge: 1 }); }
        const preisTest = ledTeuer ? 34.99 : null;
        const pfadLaenge = 1 + (r() < 0.45 ? 1 : 0) + (r() < 0.2 ? 1 : 0);
        const pfad = Array.from({ length: pfadLaenge }, (_, k) => (k === pfadLaenge - 1 && r() < 0.35 ? 'email' : wahl(kanaele)));
        z.bestellungen.push({
          id: 'B' + nr++, datum: ZA.datumAus(t), kunde, kanal: pfad[pfad.length - 1], pfad,
          artikel: artikel.map((a) => ({ ...a, preis: a.p === 'led' && preisTest ? preisTest : pid[a.p].preis })),
        });
      }
    }
    z.ausgaben = { tiktok: 450, instagram: 320, google: 280, email: 120 };
    z.konkurrenten = [
      { id: 'k1', name: 'LumiHome', url: 'https://example.com/lumihome', produktId: 'led', preise: [{ datum: ZA.datumAus(ende - 30), preis: 32.99 }, { datum: ZA.datumAus(ende - 3), preis: 26.99 }] },
      { id: 'k2', name: 'BeamBox', url: 'https://example.com/beambox', produktId: 'beamer', preise: [{ datum: ZA.datumAus(ende - 40), preis: 99.0 }, { datum: ZA.datumAus(ende - 5), preis: 99.0 }] },
      { id: 'k3', name: 'FitGun', url: 'https://example.com/fitgun', produktId: 'massage', preise: [{ datum: ZA.datumAus(ende - 20), preis: 59.99 }, { datum: ZA.datumAus(ende - 2), preis: 54.99 }] },
    ];
    const hooks = ['POV: dein Zimmer um 22 Uhr', '3 Gründe warum', 'Niemand redet über', 'Test: 30 Tage mit', 'Unboxing', 'Vorher vs. Nachher', 'Dieser Trick spart dir', 'Ich hab es endlich getestet'];
    const plattformen = ['TikTok', 'TikTok', 'Instagram', 'Instagram', 'YouTube Shorts', 'Facebook'];
    for (let i = 0; i < 48; i++) {
      const p = wahl(z.produkte), h = wahl(hooks), pf = wahl(plattformen), stunde = wahl([8, 12, 17, 19, 20, 21, 23]);
      const stark = /POV|Vorher|Niemand/.test(h) ? 2.2 : 1, abend = stunde >= 18 && stunde < 22 ? 1.6 : 1, tt = pf === 'TikTok' ? 2.5 : 1;
      const views = Math.round((800 + r() * 4000) * stark * abend * tt);
      const rate = (0.025 + r() * 0.04) * (stark > 1 ? 1.5 : 1) * (abend > 1 ? 1.2 : 1);
      const eng = views * rate;
      z.posts.push({ id: 'P' + i, datum: ZA.datumAus(ende - Math.floor(r() * 90)), stunde, plattform: pf, titel: `${h} ${p.name}`, views, likes: Math.round(eng * 0.78), kommentare: Math.round(eng * 0.12), shares: Math.round(eng * 0.1) });
    }
    z.posts.sort((a, b) => (a.datum < b.datum ? 1 : -1));
    z.plan = [
      { id: 'pl1', datum: ZA.datumAus(ende + 1), plattform: 'TikTok', text: 'POV: dein Zimmer um 22 Uhr mit der LED-Lichtleiste', status: 'geplant' },
      { id: 'pl2', datum: ZA.datumAus(ende + 2), plattform: 'Instagram', text: 'Vorher vs. Nachher: Glättbürste 2-in-1', status: 'Idee' },
    ];
    z.faq = [
      { frage: 'Wie lange dauert der Versand?', antwort: 'Wir versenden innerhalb von 24 Stunden. Die Lieferung dauert in Deutschland 2 bis 4 Werktage.' },
      { frage: 'Kann ich zurückgeben?', antwort: 'Ja, du hast 30 Tage Rückgaberecht. Schreib uns deine Bestellnummer, dann schicken wir dir das Rücksendeetikett.' },
      { frage: 'Welche Zahlungsarten gibt es?', antwort: 'PayPal, Kreditkarte, Klarna und Apple Pay.' },
      { frage: 'Wo ist meine Bestellung?', antwort: 'Die Sendungsnummer kommt per E-Mail, sobald das Paket verschickt ist. Schau auch im Spam-Ordner nach.' },
      { frage: 'Ist die LED-Lichtleiste kürzbar?', antwort: 'Ja, alle 10 cm an den markierten Stellen. Mit App-Steuerung und 16 Millionen Farben.' },
    ];
    return z;
  }

  function csvZeilen(text) {
    const zeilen = String(text).replace(/\r/g, '').split('\n').filter((z) => z.trim());
    if (!zeilen.length) return [];
    const trenner = (zeilen[0].match(/;/g) || []).length >= (zeilen[0].match(/,/g) || []).length ? ';' : ',';
    const teile = (z) => {
      const out = []; let cur = '', q = false;
      for (let i = 0; i < z.length; i++) {
        const c = z[i];
        if (c === '"') { if (q && z[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === trenner && !q) { out.push(cur.trim()); cur = ''; } else cur += c;
      }
      out.push(cur.trim());
      return out;
    };
    const kopf = teile(zeilen[0]).map((h) => h.toLowerCase());
    return zeilen.slice(1).map((z) => { const w = teile(z), o = {}; kopf.forEach((h, i) => { o[h] = w[i] || ''; }); return o; });
  }

  function zahl(s) { const n = Number(String(s).replace(/[€\s]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }

  function datumNorm(s) {
    const t = String(s).trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
  }

  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'produkt'; }

  // Spalten: datum; kunde; produkt; menge; preis; kanal; pfad (optional, mit > getrennt); bestellung (optional)
  function bestellungenImportieren(zustand, text) {
    const zeilen = csvZeilen(text), fehler = [];
    const pnachName = {};
    for (const p of zustand.produkte) pnachName[p.name.toLowerCase()] = p;
    const gruppen = {};
    zeilen.forEach((z, i) => {
      const datum = datumNorm(z.datum), name = (z.produkt || '').trim(), preis = zahl(z.preis);
      if (!datum || !name || !preis) { fehler.push(`Zeile ${i + 2}: Datum, Produkt oder Preis fehlt`); return; }
      let p = pnachName[name.toLowerCase()];
      if (!p) {
        let id = slug(name); while (zustand.produkte.some((x) => x.id === id)) id += '-2';
        p = { id, name, preis, kosten: zahl(z.kosten) || 0, kategorie: z.kategorie || 'Import' };
        zustand.produkte.push(p); pnachName[name.toLowerCase()] = p;
      }
      const kunde = (z.kunde || z.email || 'Gast-' + (i + 2)).trim();
      const key = z.bestellung || `${datum}|${kunde}`;
      const pfad = (z.pfad || z.kanal || 'direkt').split(/>|\|/).map((x) => x.trim().toLowerCase()).filter(Boolean);
      const g = gruppen[key] || (gruppen[key] = { id: 'I' + key, datum, kunde, pfad, kanal: pfad[pfad.length - 1], artikel: [] });
      g.artikel.push({ p: p.id, menge: Math.max(1, Math.round(zahl(z.menge) || 1)), preis });
    });
    const neu = Object.values(gruppen);
    zustand.bestellungen.push(...neu);
    return { importiert: neu.length, zeilen: zeilen.length, fehler };
  }

  function backupText(zustand) { return JSON.stringify(zustand); }

  function backupLaden(text) {
    const d = JSON.parse(text);
    if (!d || !Array.isArray(d.bestellungen) || !Array.isArray(d.produkte)) throw new Error('Das ist kein Zentrale-Backup.');
    return { ...leer(), ...d };
  }

  root.ZS = { leer, laden, speichern, beispielDaten, csvZeilen, bestellungenImportieren, backupText, backupLaden, datumNorm, zahl };
})(typeof window !== 'undefined' ? window : globalThis);
