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
export function darf(modus, slot) {
  if (modus !== 'schonung') return true;
  return slot === 'abend';  // Schonung: nur das Abend-Video, kein Nacht-Video, keine Fakten
}

export const slotAus = (stundeBerlin) => (stundeBerlin >= 12 ? 'abend' : 'nacht');
