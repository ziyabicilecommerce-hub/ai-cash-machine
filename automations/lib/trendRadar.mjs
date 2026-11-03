// Trend-Radar (#114): findet Themen, die gerade gefragt sind, und macht daraus neue Horror-Geschichten für den Videobot.
// Quellen (alle kostenlos, ohne Schlüssel): Google-Trends Deutschland (nur harmlose Alltagsthemen), Reddit-Horror-Titel
// als Inspiration (nie kopieren) und ein Saison-Kalender als sichere Grundlage. Reine Funktionen - ohne Netz testbar.

// Nur Alltagsthemen, die sich für Gänsehaut eignen - nie echte Unglücke, Personen, Politik oder Marken.
const SICHER = /(halloween|vollmond|neumond|nebel|sturm|gewitter|schnee|glatteis|stromausfall|zeitumstellung|winterzeit|sommerzeit|weihnachtsmarkt|adventskalender|silvester|feuerwerk|freitag der 13|blutmond|sonnenfinsternis|polarlicht|nordlicht|hitzewelle|eisregen|kältewelle|warnapp|cell broadcast|probealarm|warntag|sirene|funkloch|wlan|update)/i;
const TABU = /(tot|tote|getötet|stirbt|gestorben|mord|unfall|anschlag|krieg|opfer|vermisst|polizei|prozess|wahl|partei|kanzler|präsident|trump|putin|selbstmord|suizid|missbrauch|kind|schule|amok|bombe|terror)/i;

export function rssTitel(xml = '') {
  return [...String(xml).matchAll(/<item>[\s\S]*?<title>(?:<!\[CDATA\[)?([^<\]]+)/g)].map((m) => m[1].trim()).filter(Boolean);
}
export function redditTitel(json) {
  return (json?.data?.children || []).map((c) => String(c?.data?.title || '').trim()).filter((t) => t && t.length < 140);
}

// Google-Trends: nur sichere Alltagsthemen durchlassen
export const sichereTrends = (titel = []) => titel.filter((t) => SICHER.test(t) && !TABU.test(t)).slice(0, 5);
// Reddit: nur als Stimmung/Idee - ohne heikle Wörter, gekürzt
export const inspiration = (titel = []) => titel.filter((t) => !TABU.test(t)).slice(0, 8).map((t) => t.slice(0, 80));

// Saison-Kalender: immer verfügbare, zur Jahreszeit passende Grusel-Themen (Monat 1-12)
const SAISON = {
  1: ['Glatteis vor der Haustür', 'Neujahrsnachricht von einer unbekannten Nummer', 'Schnee, der nachts Fußspuren bekommt'],
  2: ['Karnevalsmaske, die nicht abgeht', 'Eiskalter Februarmorgen ohne Strom', 'Valentinsbrief ohne Absender'],
  3: ['Zeitumstellung: eine Stunde fehlt', 'Frühlingssturm klopft ans Fenster', 'Ostern-Schokohase, der immer wieder auftaucht'],
  4: ['Aprilscherz, der kein Scherz ist', 'Gewitter und das Licht geht aus', 'Nachbar mäht nachts den Rasen'],
  5: ['Maifeuer im Wald', 'Grillabend, ein Gast zu viel', 'Pollen, die flüstern'],
  6: ['Kürzeste Nacht des Jahres', 'Badesee, in dem etwas schwimmt', 'Freibad nach Ladenschluss'],
  7: ['Hitzewelle und der Ventilator dreht sich allein', 'Sommergewitter im Zelt', 'Urlaubsfoto mit einer Person zu viel'],
  8: ['Sternschnuppennacht', 'Leerer Campingplatz', 'Ferienwohnung mit verschlossenem Zimmer'],
  9: ['Der letzte Bus fährt woandershin', 'Nebel im Maisfeld', 'Herbststurm und das Telefon klingelt'],
  10: ['Halloween: jemand klingelt ohne Kostüm', 'Zeitumstellung: eine Stunde zu viel', 'Kürbis, der am Morgen anders schaut'],
  11: ['Novembernebel auf der Landstraße', 'Laternenumzug, eine Laterne zu viel', 'Erster Frost am Fenster, von innen'],
  12: ['Adventskalender mit einem Türchen zu viel', 'Weihnachtsmarkt nach Mitternacht', 'Silvesterrakete, die zurückkommt'],
};
export const saisonThemen = (monat = new Date().getMonth() + 1) => SAISON[monat] || SAISON[10];

// Themen für heute: echte Trends zuerst, dann Saison; Reddit nur als Stimmung dazu. Ohne doppelte.
export function themenHeute({ trends = [], reddit = [], monat, anzahl = 3 } = {}) {
  const liste = [...sichereTrends(trends), ...saisonThemen(monat)];
  const themen = [...new Set(liste)].slice(0, anzahl);
  const stimmung = inspiration(reddit);
  return themen.map((thema, i) => ({ thema, inspiration: stimmung[i] || '', quelle: i < sichereTrends(trends).length ? 'google-trends' : 'saison' }));
}
