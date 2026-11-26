// Ideen-Labor (18.11., Nutzer: "jeden Tag die Views anschauen, nach den Fehlern suchen und es besser machen - jeden
// 2. Tag die Idee wechseln, wenn's klappt Jackpot, wenn nicht ändern - bei Insta und YT genauso").
// Jeder Kanal hat genau EINE laufende Idee (eine Video-Variante). Nach 2 Tagen und mind. 3 ausgewerteten Videos wird
// sie mit dem normalen Niveau des Kanals verglichen (Median der letzten 14 Tage): deutlich besser = Jackpot (bleibt),
// sonst kommt die nächste Idee dran. Fällt ein Jackpot später ab, wird auch er gewechselt.
// Reine Funktionen - ohne Netz testbar. Die Video-Bots holen sich mit ideeFuer(kanal) die Einstellungen der Idee.

export const IDEEN = [
  { id: 'akte', name: 'Akte (Standard)', was: 'Polizeibericht, Akte-Nummer, Steigerung zum Ende', flags: {} },
  { id: 'akte-direkt', name: 'Akte ohne Bericht', was: 'Geschichte startet sofort, ohne Polizeibericht vorweg', flags: { akte: null } },
  { id: 'akte-du', name: 'Akte mit Du-Hook', was: 'Erster Satz als Regel an den Zuschauer ("Wenn du …, mach nie …")', flags: { hookArt: 'du' } },
  { id: 'akte-ruhig', name: 'Akte ohne Effekte', was: 'Ohne roten Herzschlag, Zittern und Störungen', flags: { ruhig: true } },
  { id: 'klassik', name: 'Klassik', was: 'Der alte gezeichnete Stil vom Anfang', flags: { stil: 'klassik' } },
  // 22.11.: fast alle Videos hatten 0-1 Kommentare - der Erzähler legt sich am Ende fest, die Zuschauer widersprechen
  { id: 'akte-provokant', name: 'Akte mit Meinung', was: 'Schlussfrage mit eigener Meinung ("Ich hätte aufgemacht. Und du?")', flags: { provokant: true, suchbild: false } },
];
export const IDEE_TAGE = 2;          // so lange läuft jede Idee mindestens
export const MIN_VIDEOS = 3;         // so viele ausgewertete Videos braucht ein Urteil
export const JACKPOT = 1.25;         // ab +25 % über Normal: Jackpot
export const ABSTURZ = 0.8;          // ein Jackpot fällt unter 80 % von Normal: wechseln
const REIF_STD = 20;                 // jüngere Videos haben noch nicht ihre Aufrufe - zählen nicht
const TAG = 864e5;

// 26.11. Strategie-Umbau: die Serie "100 Tage KI-Firma" (#119) läuft nur noch auf zyx_7851, alle anderen machen Storys.
export const SERIE_KANAELE = ['zyx_7851'];
export const KANAELE = ['futureflowx3', 'futureflowxx', 'desk.rebel', 'purivelle.785', 'giyuuu sama'];
const vonKanal = (p, k) => String(p.konto || '').replace(/^@/, '') === k && String(p.text || '').trim() !== '';  // ohne Text = Story
const reif = (p, jetzt) => jetzt - Date.parse(p.zeit) >= REIF_STD * 3600e3;
const median = (l) => { const s = [...l].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const schnitt = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);
// doppelte Einträge (dasselbe Video mit zwei Links) nur einmal zählen
const einmal = (posts) => [...new Map(posts.map((p) => [`${p.konto}|${String(p.text || '').slice(0, 60)}`, p])).values()];

// Normales Niveau eines Kanals: Median der Aufrufe der letzten 14 Tage (ohne zu junge Videos)
export function normal(verlauf, kanal, jetzt = Date.now()) {
  const l = einmal(verlauf.filter((p) => vonKanal(p, kanal) && reif(p, jetzt) && jetzt - Date.parse(p.zeit) <= 14 * TAG));
  return Math.round(median(l.map((p) => Number(p.aufrufe) || 0)));
}

// Ergebnis der laufenden Idee: alle reifen Videos seit dem Start der Idee
// 0 Aufrufe UND 0 s Sehdauer = noch keine Zahlen (das Dashboard hängt bei TikTok bis zu einem Tag hinterher) - zählt nicht
const mitZahlen = (p) => Number(p.aufrufe) > 0 || Number(p.sehdauer) > 0;
export function ergebnis(verlauf, kanal, seit, jetzt = Date.now()) {
  const l = einmal(verlauf.filter((p) => vonKanal(p, kanal) && Date.parse(p.zeit) >= Date.parse(seit) && reif(p, jetzt) && mitZahlen(p)));
  return { n: l.length, aufrufe: Math.round(schnitt(l.map((p) => Number(p.aufrufe) || 0))), sehdauer: Math.round(schnitt(l.map((p) => Number(p.sehdauer) || 0)) * 10) / 10 };
}

// Nächste Idee: die am längsten nicht probierte (nie probierte zuerst), nie die aktuelle
export function naechsteIdee(stand) {
  const probiert = stand.verlauf || [];
  const zuletzt = (id) => Math.max(-1, ...probiert.map((v, i) => (v.idee === id ? i : -1)));
  return [...IDEEN].filter((i) => i.id !== stand.idee).sort((a, b) => zuletzt(a.id) - zuletzt(b.id))[0].id;
}

// Fehlersuche: was an den Zahlen auffällt, in Klartext
export function fehlerSuchen(verlauf, kanal, ergeb, basis, jetzt = Date.now(), botFehler0 = []) {
  const botFehler = Array.isArray(botFehler0) ? botFehler0 : [];  // daten.json: "fehler" ist eine Anzahl, keine Liste
  const f = [];
  const letzte24 = verlauf.filter((p) => vonKanal(p, kanal) && jetzt - Date.parse(p.zeit) <= TAG);
  if (!letzte24.length) f.push('Seit 24 Std. kein Video - Posten prüfen (Workflow, Buffer-Verbindung).');
  if (ergeb.n && ergeb.sehdauer > 0 && ergeb.sehdauer < 3) f.push(`Sehdauer nur ${ergeb.sehdauer} s - die Leute wischen in den ersten Sekunden weg: Anfang zu langsam oder zu leise.`);
  if (ergeb.n && basis && ergeb.aufrufe < basis * 0.5 && ergeb.sehdauer >= 4) f.push('Wer schaut, bleibt - aber kaum jemand bekommt es zu sehen: eher Uhrzeit, Abstand oder Caption als das Video.');
  const nullen = verlauf.filter((p) => vonKanal(p, kanal) && reif(p, jetzt) && jetzt - Date.parse(p.zeit) <= 3 * TAG && !(Number(p.aufrufe) > 0)).length;
  if (nullen >= 2) f.push(`${nullen} Videos der letzten 3 Tage mit 0 Aufrufen - womöglich nicht veröffentlicht oder gesperrt.`);
  for (const e of botFehler.filter((x) => String(x.konto || x.text || '').includes(kanal)).slice(0, 2)) f.push(`Bot-Fehler: ${String(e.text || e.fehler || e).slice(0, 120)}`);
  return f;
}

// Ein Tag im Labor für einen Kanal. stand = { idee, seit, basis, status, verlauf: [{idee, seit, bis, aufrufe, sehdauer, n, urteil}] }
export function tagAuswerten(stand0, verlauf, kanal, jetzt = Date.now(), botFehler = []) {
  const heute = new Date(jetzt).toISOString();
  if (!stand0?.idee) {
    const basis = normal(verlauf, kanal, jetzt);
    return { stand: { idee: IDEEN[0].id, seit: heute, basis, status: 'läuft', verlauf: [] }, urteil: 'start', fehler: [], ergeb: { n: 0, aufrufe: 0, sehdauer: 0 } };
  }
  const stand = { ...stand0, verlauf: [...(stand0.verlauf || [])] };
  const ergeb = ergebnis(verlauf, kanal, stand.seit, jetzt);
  const fehler = fehlerSuchen(verlauf, kanal, ergeb, stand.basis, jetzt, botFehler);
  const alt = (jetzt - Date.parse(stand.seit)) / TAG;
  if (alt < IDEE_TAGE || ergeb.n < MIN_VIDEOS) return { stand, urteil: 'warten', fehler, ergeb };
  const verhaeltnis = stand.basis ? ergeb.aufrufe / stand.basis : 1;
  if (verhaeltnis >= JACKPOT || (stand.status === 'jackpot' && verhaeltnis >= ABSTURZ)) {
    // Jackpot: Idee bleibt. Das neue Normal wird der Jackpot-Wert, damit ein späterer Absturz auffällt.
    return { stand: { ...stand, status: 'jackpot', basis: Math.max(stand.basis, ergeb.aufrufe) }, urteil: stand.status === 'jackpot' ? 'jackpot-hält' : 'jackpot', fehler, ergeb };
  }
  const neu = naechsteIdee(stand);
  stand.verlauf.push({ idee: stand.idee, seit: stand.seit, bis: heute, ...ergeb, basis: stand.basis, urteil: stand.status === 'jackpot' ? 'abgestürzt' : 'kein Erfolg' });
  stand.verlauf = stand.verlauf.slice(-30);
  return { stand: { ...stand, idee: neu, seit: heute, basis: normal(verlauf, kanal, jetzt) || stand.basis, status: 'läuft' }, urteil: 'gewechselt', fehler, ergeb };
}

// Für die Video-Bots: Einstellungen der laufenden Idee eines Kanals (ohne Labor-Datei: Standard)
export function ideeFuer(labor, kanal) {
  const id = labor?.kanaele?.[String(kanal || '').replace(/^@/, '')]?.idee;
  return (IDEEN.find((i) => i.id === id) || IDEEN[0]).flags;
}

// Hook passend zur Idee: 'du' = Du-Hook erzwingen, sonst wie vorher (A/B-Test entscheidet)
export function hookNachIdee(flags, skript, vorschlag) {
  if (flags.hookArt === 'du' && skript.hook2) return skript.hook2;
  return vorschlag;
}

// Frische Zahlen direkt aus Buffer (20.11.): verlauf.json hängt bis zu einem Tag hinterher, Buffer hat die Aufrufe nach
// wenigen Stunden. Macht aus Buffer-Posts Einträge im verlauf.json-Format; zusammenführen() lässt Buffer gewinnen.
const bWert = (p, typ) => Number((p.metrics || []).find((m) => m.type === typ)?.value) || 0;
export function ausBuffer(posts = [], kanaele = []) {
  const name = Object.fromEntries(kanaele.map((k) => [k.id, `@${String(k.name || '').replace(/^@/, '')}`]));
  // Stories (ohne Text, 0-6 s) sind keine Videos fürs Urteil - sie haben fast nie Aufrufe und zogen desk.rebel unter die Grenze
  return posts.filter((p) => p.status === 'sent' && String(p.text || '').trim() && name[p.channelId] && p.metricsUpdatedAt && Date.parse(p.metricsUpdatedAt) > Date.parse(p.sentAt || 0) + 3600e3)
    .map((p) => ({ zeit: p.sentAt, konto: name[p.channelId], text: String(p.text || '').split('\n')[0].replace(/#[\p{L}\p{N}_]+/gu, '').trim().slice(0, 90),
      aufrufe: bWert(p, 'views'), sehdauer: Math.round(bWert(p, 'averageTimeWatched') * 10) / 10, quelle: 'buffer' }));
}
export function zusammenfuehren(verlauf = [], frisch = []) {
  const schluessel = (p) => `${String(p.konto || '').replace(/^@/, '')}|${String(p.text || '').slice(0, 60)}`;
  const m = new Map(verlauf.map((p) => [schluessel(p), p]));
  for (const p of frisch) m.set(schluessel(p), { ...(m.get(schluessel(p)) || {}), ...p });
  return [...m.values()];
}
