// Dauerbrenner-Deals: passt ein Live-Angebot (Online-Shop) zu einem dauerhaft gefragten Produkt aus evergreen.json,
// wird der Gewinn gegen den Richtwert-Verkaufspreis gerechnet. Gleiche Regeln wie in der App (pro.js).
export const GEBUEHR = 0.1, VERSAND = 5;
export const passt = (text, suche = [], ohne = []) => {
  const t = ` ${String(text || '').toLowerCase().replace(/é/g, 'e')} `;
  return suche.some((s) => t.includes(s)) && !ohne.some((o) => t.includes(o));
};
// Sammelkarten, LEGO & Co. hält man, Sneaker & Technik flippt man sofort
export const strategie = (kat) => (['Sammelkarten', 'Figuren', 'Bücher & Medien'].includes(kat) ? 'HALTEN' : 'FLIP');
export function rechnung(e, preis) {
  const mitte = (e.vk[0] + e.vk[1]) / 2;
  const gewinn = Math.round((mitte * (1 - GEBUEHR) - preis - VERSAND) * 100) / 100;
  return { gewinn, roi: Math.round((gewinn / preis) * 100), mitte };
}
// Beste echte Deals: nur Angebote ab 60 % UVP (darunter meist Kinder-/Damengröße oder andere Variante)
export function dauerDeals(evergreen = {}, live = []) {
  const deals = [];
  for (const e of evergreen.produkte || []) {
    for (const t of live) {
      if (t.preis == null || t.preis < e.ek * 0.6 || !passt(t.titel, e.suche, e.ohne)) continue;
      deals.push({ e, t, ...rechnung(e, t.preis) });
    }
  }
  return deals.sort((a, b) => b.gewinn - a.gewinn);
}
