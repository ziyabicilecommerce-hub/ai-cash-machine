// Rechen-Kern der Zentrale: reine Funktionen ohne DOM, damit sie in Node testbar sind.
(function (root) {
  const TAG = 86400000;

  function tagZahl(datum) { return Math.floor(Date.parse(datum + 'T00:00:00Z') / TAG); }
  function datumAus(tagNr) { return new Date(tagNr * TAG).toISOString().slice(0, 10); }
  function runde(x, stellen = 2) { const f = 10 ** stellen; return Math.round(x * f) / f; }
  function summe(arr) { return arr.reduce((s, x) => s + x, 0); }

  function bestellWert(b) { return summe(b.artikel.map((a) => a.menge * a.preis)); }

  function bestellKosten(b, produkteNachId) {
    return summe(b.artikel.map((a) => a.menge * ((produkteNachId[a.p] && produkteNachId[a.p].kosten) || 0)));
  }

  function nachId(liste) { const m = {}; for (const x of liste) m[x.id] = x; return m; }

  function heuteAus(bestellungen) {
    if (!bestellungen.length) return datumAus(Math.floor(Date.now() / TAG));
    return bestellungen.reduce((m, b) => (b.datum > m ? b.datum : m), bestellungen[0].datum);
  }

  function imZeitraum(bestellungen, bis, tage) {
    const ende = tagZahl(bis), start = ende - tage + 1;
    return bestellungen.filter((b) => { const t = tagZahl(b.datum); return t >= start && t <= ende; });
  }

  function kennzahlen(bestellungen, produkte) {
    const pid = nachId(produkte);
    const umsatz = summe(bestellungen.map(bestellWert));
    const kosten = summe(bestellungen.map((b) => bestellKosten(b, pid)));
    const proKunde = {};
    for (const b of bestellungen) proKunde[b.kunde] = (proKunde[b.kunde] || 0) + 1;
    const kunden = Object.keys(proKunde).length;
    const wiederkaeufer = Object.values(proKunde).filter((n) => n > 1).length;
    return {
      umsatz: runde(umsatz),
      bestellungen: bestellungen.length,
      warenkorb: bestellungen.length ? runde(umsatz / bestellungen.length) : 0,
      kunden,
      rohertrag: runde(umsatz - kosten),
      margeProzent: umsatz ? runde(((umsatz - kosten) / umsatz) * 100, 1) : 0,
      wiederkaufRate: kunden ? runde((wiederkaeufer / kunden) * 100, 1) : 0,
    };
  }

  // Wochenreihe ab Montag, Lücken werden mit 0 gefüllt.
  function wochenReihe(bestellungen) {
    if (!bestellungen.length) return [];
    const montag = (t) => t - ((t + 3) % 7);
    const werte = {};
    let min = Infinity, max = -Infinity;
    for (const b of bestellungen) {
      const w = montag(tagZahl(b.datum));
      werte[w] = (werte[w] || 0) + bestellWert(b);
      min = Math.min(min, w); max = Math.max(max, w);
    }
    const reihe = [];
    for (let w = min; w <= max; w += 7) reihe.push({ woche: datumAus(w), umsatz: runde(werte[w] || 0) });
    return reihe;
  }

  function regression(xs, ys) {
    const n = xs.length;
    if (n < 2) return { a: ys[0] || 0, b: 0, r2: 0, sd: 0 };
    const mx = summe(xs) / n, my = summe(ys) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    const b = sxx ? sxy / sxx : 0, a = my - b * mx;
    const res = summe(xs.map((x, i) => (ys[i] - (a + b * x)) ** 2));
    return { a, b, r2: syy ? 1 - res / syy : 0, sd: Math.sqrt(res / Math.max(n - 2, 1)) };
  }

  // Lineare Prognose mit 80%-Band auf abgeschlossenen Wochen.
  function prognose(reihe, wochen = 8) {
    const basis = reihe;
    if (basis.length < 3) return { punkte: [], trendProWoche: 0, r2: 0 };
    const xs = basis.map((_, i) => i), ys = basis.map((r) => r.umsatz);
    const m = regression(xs, ys);
    const letzte = tagZahl(basis[basis.length - 1].woche);
    const punkte = [];
    for (let i = 1; i <= wochen; i++) {
      const x = basis.length - 1 + i, wert = Math.max(0, m.a + m.b * x), band = 1.28 * m.sd;
      punkte.push({ woche: datumAus(letzte + 7 * i), wert: runde(wert), min: runde(Math.max(0, wert - band)), max: runde(wert + band) });
    }
    return { punkte, trendProWoche: runde(m.b), r2: runde(m.r2, 2), summe: runde(summe(punkte.map((p) => p.wert))) };
  }

  // Warenkorb-Analyse: Support, Konfidenz und Lift für Produktpaare.
  function koKaeufe(bestellungen) {
    const n = bestellungen.length, einzel = {}, paare = {};
    for (const b of bestellungen) {
      const ids = [...new Set(b.artikel.map((a) => a.p))].sort();
      for (const id of ids) einzel[id] = (einzel[id] || 0) + 1;
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const k = ids[i] + '|' + ids[j];
        paare[k] = (paare[k] || 0) + 1;
      }
    }
    const liste = Object.entries(paare).map(([k, anzahl]) => {
      const [a, b] = k.split('|');
      const lift = n ? (anzahl * n) / (einzel[a] * einzel[b]) : 0;
      return { a, b, anzahl, support: runde(anzahl / n, 4), konfAB: runde(anzahl / einzel[a], 3), konfBA: runde(anzahl / einzel[b], 3), lift: runde(lift, 2) };
    });
    return { einzel, paare: liste.sort((x, y) => y.lift * y.anzahl - x.lift * x.anzahl) };
  }

  function empfehlungenFuer(produktId, analyse, max = 3) {
    return analyse.paare
      .filter((p) => (p.a === produktId || p.b === produktId) && p.anzahl >= 2)
      .map((p) => ({ produkt: p.a === produktId ? p.b : p.a, konfidenz: p.a === produktId ? p.konfAB : p.konfBA, lift: p.lift, anzahl: p.anzahl }))
      .sort((x, y) => y.konfidenz * y.lift - x.konfidenz * x.lift)
      .slice(0, max);
  }

  function bundleVorschlaege(analyse, produkte, rabatt = 0.12, max = 5) {
    const pid = nachId(produkte);
    return analyse.paare
      .filter((p) => p.anzahl >= 3 && p.lift > 1 && pid[p.a] && pid[p.b])
      .slice(0, max)
      .map((p) => {
        const A = pid[p.a], B = pid[p.b];
        const einzeln = A.preis + B.preis, preis = Math.floor(einzeln * (1 - rabatt)) + 0.99;
        const kosten = (A.kosten || 0) + (B.kosten || 0);
        return { a: A, b: B, anzahl: p.anzahl, lift: p.lift, einzeln: runde(einzeln), preis: runde(preis), marge: runde(preis - kosten), margeProzent: runde(((preis - kosten) / preis) * 100, 1) };
      });
  }

  // Mittelrang bei Gleichstand, sonst landen z. B. alle Einmalkäufer im oberen Quintil.
  function quintil(wert, sortiert) {
    if (sortiert.length < 2) return 3;
    let kleiner = 0, gleich = 0;
    for (const x of sortiert) { if (x < wert) kleiner++; else if (x === wert) gleich++; }
    const rang = (kleiner + gleich / 2) / sortiert.length;
    return Math.min(5, Math.max(1, Math.ceil(rang * 5)));
  }

  // RFM-Segmente plus Abwanderungsrisiko (Tage seit Kauf geteilt durch üblichen Kaufabstand).
  function kundenAnalyse(bestellungen, heute) {
    const h = tagZahl(heute || heuteAus(bestellungen)), k = {};
    for (const b of bestellungen) {
      const t = tagZahl(b.datum), e = k[b.kunde] || (k[b.kunde] = { kunde: b.kunde, tage: [], umsatz: 0 });
      e.tage.push(t); e.umsatz += bestellWert(b);
    }
    const liste = Object.values(k).map((e) => {
      e.tage.sort((a, b) => a - b);
      const erste = e.tage[0], letzte = e.tage[e.tage.length - 1], anzahl = e.tage.length;
      const abstand = anzahl > 1 ? (letzte - erste) / (anzahl - 1) : null;
      return { kunde: e.kunde, anzahl, umsatz: runde(e.umsatz), seitTagen: h - letzte, ersterKauf: datumAus(erste), letzterKauf: datumAus(letzte), abstand: abstand === null ? null : runde(abstand, 1) };
    });
    const rS = liste.map((x) => -x.seitTagen).sort((a, b) => a - b);
    const fS = liste.map((x) => x.anzahl).sort((a, b) => a - b);
    const mS = liste.map((x) => x.umsatz).sort((a, b) => a - b);
    const typAbstand = median(liste.filter((x) => x.abstand).map((x) => x.abstand)) || 45;
    for (const x of liste) {
      x.r = quintil(-x.seitTagen, rS); x.f = quintil(x.anzahl, fS); x.m = quintil(x.umsatz, mS);
      x.risiko = runde(x.seitTagen / (x.abstand || typAbstand), 2);
      x.segment = segmentFuer(x);
      const aktivTage = Math.max(tagZahl(x.letzterKauf) - tagZahl(x.ersterKauf), 30);
      const bleibe = x.risiko > 3 ? 0.15 : x.risiko > 1.5 ? 0.5 : 0.85;
      x.wert12m = runde((x.umsatz / aktivTage) * 365 * bleibe * (x.anzahl > 1 ? 1 : 0.35));
    }
    const segmente = {};
    for (const x of liste) {
      const s = segmente[x.segment] || (segmente[x.segment] = { segment: x.segment, kunden: 0, umsatz: 0 });
      s.kunden++; s.umsatz = runde(s.umsatz + x.umsatz);
    }
    return { kunden: liste.sort((a, b) => b.umsatz - a.umsatz), segmente: Object.values(segmente).sort((a, b) => b.umsatz - a.umsatz), typAbstand: runde(typAbstand, 1) };
  }

  function segmentFuer(x) {
    if (x.anzahl === 1) return x.r >= 4 ? 'Neu' : x.r >= 3 ? 'Gelegentlich' : x.r >= 2 ? 'Schläft ein' : 'Verloren';
    if (x.r >= 4 && x.f >= 4) return 'Champions';
    if (x.r >= 3) return 'Treu';
    return 'Gefährdet';
  }

  function median(arr) {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b), m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  const MODELLE = {
    erster: (n) => Array.from({ length: n }, (_, i) => (i === 0 ? 1 : 0)),
    letzter: (n) => Array.from({ length: n }, (_, i) => (i === n - 1 ? 1 : 0)),
    linear: (n) => Array.from({ length: n }, () => 1 / n),
    zeitverfall: (n) => { const g = Array.from({ length: n }, (_, i) => 2 ** i); const s = summe(g); return g.map((x) => x / s); },
    position: (n) => {
      if (n === 1) return [1];
      if (n === 2) return [0.5, 0.5];
      return Array.from({ length: n }, (_, i) => (i === 0 || i === n - 1 ? 0.4 : 0.2 / (n - 2)));
    },
  };

  // Verteilt den Umsatz jeder Bestellung auf die Kontaktpunkte ihres Kaufpfads.
  function attribution(bestellungen, modell, ausgabenProMonat = {}) {
    const gew = MODELLE[modell] || MODELLE.linear, k = {};
    for (const b of bestellungen) {
      const pfad = b.pfad && b.pfad.length ? b.pfad : [b.kanal || 'direkt'], w = gew(pfad.length), wert = bestellWert(b);
      pfad.forEach((kanal, i) => {
        const e = k[kanal] || (k[kanal] = { kanal, umsatz: 0, bestellungen: 0, kontakte: 0 });
        e.umsatz += wert * w[i]; e.bestellungen += w[i]; e.kontakte++;
      });
    }
    let monate = 1;
    if (bestellungen.length) {
      const tage = bestellungen.map((b) => tagZahl(b.datum));
      monate = Math.max(1, (Math.max(...tage) - Math.min(...tage) + 1) / 30.4);
    }
    return Object.values(k).map((e) => {
      const kosten = (Number(ausgabenProMonat[e.kanal]) || 0) * monate;
      return { kanal: e.kanal, umsatz: runde(e.umsatz), bestellungen: runde(e.bestellungen, 1), kontakte: e.kontakte, kosten: runde(kosten), roas: kosten ? runde(e.umsatz / kosten, 2) : null };
    }).sort((a, b) => b.umsatz - a.umsatz);
  }

  // Elastizität aus Preistests: Wochen werden nach Preis gebündelt, verglichen wird der Anteil des
  // Produkts an allen Bestellungen (neutralisiert allgemeines Wachstum), dann log-log-Regression.
  function elastizitaetSchaetzen(bestellungen, produktId) {
    const proWoche = {};
    for (const b of bestellungen) {
      const w = Math.floor(tagZahl(b.datum) / 7), e = proWoche[w] || (proWoche[w] = { menge: 0, umsatz: 0, alle: 0 });
      e.alle++;
      for (const a of b.artikel) if (a.p === produktId) { e.menge += a.menge; e.umsatz += a.menge * a.preis; }
    }
    const stufen = {};
    for (const e of Object.values(proWoche)) {
      if (!e.menge) continue;
      const k = (e.umsatz / e.menge).toFixed(2), s = stufen[k] || (stufen[k] = { preis: Number(k), menge: 0, alle: 0, wochen: 0 });
      s.menge += e.menge; s.alle += e.alle; s.wochen++;
    }
    const gute = Object.values(stufen).filter((s) => s.wochen >= 3 && s.menge >= 15);
    if (gute.length < 2) return null;
    const m = regression(gute.map((s) => Math.log(s.preis)), gute.map((s) => Math.log(s.menge / s.alle)));
    if (!(m.b < -0.2) || m.b < -6) return null;
    return { wert: runde(m.b, 2), stufen: gute.length, wochen: summe(gute.map((s) => s.wochen)) };
  }

  // Gewinnmaximaler Preis bei konstanter Elastizität e < -1: p* = Kosten * e / (1 + e).
  function preisEmpfehlung(produkt, elastizitaet) {
    const e = elastizitaet, k = produkt.kosten || 0, p = produkt.preis;
    const margeJetzt = p - k;
    if (!(e < -1.05) || !k) return { optimal: null, hinweis: k ? 'Elastizität über -1: höherer Preis bringt mehr Gewinn, vorsichtig testen.' : 'Einkaufspreis fehlt.' };
    let opt = (k * e) / (1 + e);
    opt = Math.min(opt, p * 1.25); opt = Math.max(opt, p * 0.8);
    opt = Math.floor(opt) + 0.99;
    const mengenFaktor = (opt / p) ** e;
    const gewinnAenderung = margeJetzt > 0 ? ((opt - k) * mengenFaktor) / margeJetzt - 1 : null;
    return { optimal: runde(opt), mengenAenderung: runde((mengenFaktor - 1) * 100, 1), gewinnAenderung: gewinnAenderung === null ? null : runde(gewinnAenderung * 100, 1) };
  }

  function konkurrenzLage(konkurrenten, produkte) {
    const pid = nachId(produkte);
    return konkurrenten.map((k) => {
      const preise = [...(k.preise || [])].sort((a, b) => (a.datum < b.datum ? -1 : 1));
      const letzter = preise[preise.length - 1], vorher = preise[preise.length - 2];
      const mein = pid[k.produktId];
      const diff = letzter && mein ? runde(((mein.preis - letzter.preis) / letzter.preis) * 100, 1) : null;
      let lage = 'ok';
      if (diff !== null && diff > 10) lage = 'teurer';
      else if (diff !== null && diff < -10) lage = 'günstiger';
      const aenderung = letzter && vorher ? runde(((letzter.preis - vorher.preis) / vorher.preis) * 100, 1) : null;
      return { ...k, mein, letzter, aenderung, diff, lage, alarm: aenderung !== null && aenderung <= -5 };
    });
  }

  const STOPP = new Set('der die das und mit für von ein eine zu in im ist so wie auf den dem du ich wir es dein deine dir mein meine uhr über nach vor the a to of and for is in on how my your this that'.split(' '));

  function contentAnalyse(posts) {
    const mitRate = posts.filter((p) => p.views > 0).map((p) => ({ ...p, rate: (p.likes + p.kommentare + p.shares) / p.views }));
    const gruppe = (fn) => {
      const g = {};
      for (const p of mitRate) { const k = fn(p), e = g[k] || (g[k] = { key: k, posts: 0, views: 0, rate: 0 }); e.posts++; e.views += p.views; e.rate += p.rate; }
      return Object.values(g).map((e) => ({ ...e, belastbar: e.posts >= 3, rate: runde((e.rate / e.posts) * 100, 2), viewsSchnitt: Math.round(e.views / e.posts) }))
        .sort((a, b) => (b.belastbar - a.belastbar) || (b.rate - a.rate));
    };
    const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const sortiert = [...mitRate].sort((a, b) => b.rate - a.rate), topN = Math.max(1, Math.ceil(sortiert.length / 4));
    const woerter = (liste) => {
      const c = {};
      for (const p of liste) for (const w of new Set(String(p.titel).toLowerCase().match(/[a-zäöüß0-9#]{3,}/g) || [])) if (!STOPP.has(w)) c[w] = (c[w] || 0) + 1;
      return c;
    };
    const top = woerter(sortiert.slice(0, topN)), rest = woerter(sortiert.slice(topN));
    const starkeWoerter = Object.entries(top).filter(([, n]) => n >= 2)
      .map(([w, n]) => ({ wort: w, top: n, rest: rest[w] || 0, staerke: runde(n / topN / (((rest[w] || 0) + 0.5) / Math.max(sortiert.length - topN, 1)), 1) }))
      .sort((a, b) => b.staerke - a.staerke).slice(0, 8);
    return {
      rateGesamt: mitRate.length ? runde((summe(mitRate.map((p) => p.rate)) / mitRate.length) * 100, 2) : 0,
      plattformen: gruppe((p) => p.plattform),
      wochentage: gruppe((p) => WT[new Date(p.datum + 'T00:00:00Z').getUTCDay()]),
      uhrzeiten: gruppe((p) => { const h = Number(p.stunde) || 0; return h < 10 ? '06–10' : h < 14 ? '10–14' : h < 18 ? '14–18' : h < 22 ? '18–22' : '22–06'; }),
      top: sortiert.slice(0, 5),
      starkeWoerter,
    };
  }

  root.ZA = {
    TAG, tagZahl, datumAus, runde, summe, median, nachId, heuteAus, imZeitraum, bestellWert,
    kennzahlen, wochenReihe, regression, prognose, koKaeufe, empfehlungenFuer, bundleVorschlaege,
    kundenAnalyse, attribution, MODELLE, elastizitaetSchaetzen, preisEmpfehlung, konkurrenzLage, contentAnalyse,
  };
})(typeof window !== 'undefined' ? window : globalThis);
