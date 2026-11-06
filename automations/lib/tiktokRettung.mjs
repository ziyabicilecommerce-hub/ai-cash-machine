// TikTok-Rettung: die drei Konten holten zuletzt Ø 2-3 Aufrufe (gedrosselt). Plan aus der Content-Strategie:
// EIN Hauptkonto bekommt weiter alle Videos, die anderen gehen in "Schonung" (nur noch 1 Video am Tag, keine Fakten-Videos),
// bis sie sich erholt haben. Erholt = in den letzten 7 Tagen mind. 5 Videos mit Zahlen und Ø mind. 50 Aufrufe -> wieder normal.
export const HAUPTKONTO = 'futureflowx3';
export const KONTEN = ['futureflowx3', 'zyx_7851', 'futureflowxx'];
const TAG = 864e5;
const name = (k) => String(k || '').replace(/^@/, '').trim();

export function zustand(konto, verlauf = [], jetzt = Date.now(), haupt = HAUPTKONTO) {
  const k = name(konto);
  if (k === name(haupt)) return { modus: 'haupt', grund: 'Hauptkonto - bekommt alle Videos' };
  const eigene = verlauf.filter((p) => name(p.konto) === k && jetzt - new Date(p.zeit) >= TAG && jetzt - new Date(p.zeit) < 8 * TAG);
  const schnitt = eigene.length ? eigene.reduce((a, p) => a + (p.aufrufe || 0), 0) / eigene.length : 0;
  if (eigene.length >= 5 && schnitt >= 50) return { modus: 'normal', grund: `erholt (Ø ${Math.round(schnitt)} in 7 Tagen)`, schnitt };
  return { modus: 'schonung', grund: `Schonung (Ø ${Math.round(schnitt)} aus ${eigene.length} Videos, Ziel Ø 50)`, schnitt };
}

// slot: 'abend' | 'nacht' (Videobot) oder 'fakten' (Fakten-Kanal)
// bester: das Zeitfenster, das bei diesem Konto nachweislich mehr Aufrufe bringt (bestesFenster)
export function darf(modus, slot, bester = 'nacht') {
  if (modus !== 'schonung') return true;
  return slot === bester;  // Schonung: nur EIN Video im besten Fenster, keine Fakten
}

// Bestes Zeitfenster aus den letzten 14 Tagen (nur Posts mit Zahlen). Ohne genug Daten: nachts -
// dort holten die TikTok-Konten am 05.11. 753/671/252 Aufrufe.
export function bestesFenster(konto, verlauf = [], jetzt = Date.now()) {
  const k = name(konto);
  const stunde = (iso) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23' }).format(new Date(iso)));
  const g = { nacht: [], abend: [] };
  for (const p of verlauf) {
    const alt = jetzt - new Date(p.zeit);
    if (name(p.konto) === k && p.aufrufe > 0 && alt >= TAG && alt < 15 * TAG) g[slotAus(stunde(p.zeit))].push(p.aufrufe);
  }
  const schnitt = (l) => l.reduce((a, b) => a + b, 0) / l.length;
  if (g.nacht.length < 2 || g.abend.length < 2) return 'nacht';
  return schnitt(g.abend) > schnitt(g.nacht) ? 'abend' : 'nacht';
}

export const slotAus = (stundeBerlin) => (stundeBerlin >= 12 ? 'abend' : 'nacht');
