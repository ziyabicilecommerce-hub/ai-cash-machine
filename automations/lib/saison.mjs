// Saison-Kalender (Arsenal Tier 9): Videos greifen den aktuellen Anlass auf - Neujahrsvorsaetze, Valentinstag,
// Muttertag, Sommer, zurueck ins Buero, Black Friday, Advent ... Nur als ehrlicher Aufhaenger: keine erfundenen
// Rabatte, Aktionen oder Fristen. Bewegliche Tage (Muttertag, Black Friday) werden je Jahr berechnet.
const datum = (j, m, t) => new Date(Date.UTC(j, m - 1, t));
// n-ter Wochentag (0 = So) im Monat
const nterWochentag = (j, m, wt, n) => { const d = datum(j, m, 1); const off = (wt - d.getUTCDay() + 7) % 7; return datum(j, m, 1 + off + (n - 1) * 7); };

export function anlaesse(jahr) {
  const muttertag = nterWochentag(jahr, 5, 0, 2);
  const blackFriday = nterWochentag(jahr, 11, 5, 4);
  const v = (d, tage) => new Date(d.getTime() - tage * 864e5);
  return [
    { name: 'Neujahrsvorsätze', von: datum(jahr, 1, 1), bis: datum(jahr, 1, 20), hinweis: 'Es ist Januar - viele starten mit guten Vorsätzen. Zeige, wie das Produkt hilft, dranzubleiben (kleine tägliche Routine).', tags: ['#neujahrsvorsätze', '#dranbleiben'] },
    { name: 'Valentinstag', von: datum(jahr, 2, 1), bis: datum(jahr, 2, 14), hinweis: 'Valentinstag naht - das Produkt als ehrliche Geschenkidee für jemanden, der viel sitzt oder Sport liebt.', tags: ['#geschenkidee', '#valentinstag'] },
    { name: 'Frühling', von: datum(jahr, 3, 15), bis: datum(jahr, 4, 30), hinweis: 'Frühling - Leute wollen wieder raus und aktiv werden. Zeige das Produkt draußen oder als Start in die Saison.', tags: ['#frühling', '#neustart'] },
    { name: 'Muttertag', von: v(muttertag, 12), bis: muttertag, hinweis: 'Muttertag steht bevor - das Produkt als durchdachte Geschenkidee (Entspannung nach einem langen Tag).', tags: ['#muttertag', '#geschenkidee'] },
    { name: 'Sommer', von: datum(jahr, 6, 1), bis: datum(jahr, 8, 31), hinweis: 'Sommer und Urlaub - zeige, wie leicht das Produkt mitzunehmen ist und überall funktioniert.', tags: ['#sommer', '#unterwegs'] },
    { name: 'Zurück ins Büro', von: datum(jahr, 9, 1), bis: datum(jahr, 9, 30), hinweis: 'September - der Alltag im Büro beginnt wieder. Zeige das Produkt als kleine Pause zwischen langen Sitzphasen.', tags: ['#büroalltag', '#homeoffice'] },
    { name: 'Herbst drinnen', von: datum(jahr, 10, 1), bis: v(blackFriday, 8), hinweis: 'Herbst - mehr Zeit drinnen. Zeige eine kurze Routine für zuhause.', tags: ['#herbst', '#homeworkout'] },
    { name: 'Black Week', von: v(blackFriday, 7), bis: v(blackFriday, -3), hinweis: 'Black-Friday-Woche: Erwähne Rabatte NUR, wenn der Shop wirklich einen hat - sonst einfach als Geschenkidee vor Weihnachten.', tags: ['#geschenkidee'] },
    { name: 'Advent & Weihnachten', von: datum(jahr, 12, 1), bis: datum(jahr, 12, 24), hinweis: 'Advent - das Produkt als Geschenkidee unter 30 Euro (nur wenn der Preis stimmt) für Sportler oder Vielsitzer.', tags: ['#geschenkidee', '#weihnachten'] },
  ];
}

export function saisonJetzt(jetzt = new Date()) {
  const t = Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate());
  return anlaesse(jetzt.getUTCFullYear()).filter((a) => t >= a.von.getTime() && t <= a.bis.getTime()).at(-1) || null;
}

export const saisonHinweis = (jetzt) => { const a = saisonJetzt(jetzt); return a ? `Aktueller Anlass "${a.name}": ${a.hinweis} Greife es NUR auf, wenn es ehrlich passt; keine erfundenen Rabatte oder Fristen. ` : ''; };
