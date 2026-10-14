// Buchhaltungs-Bot (#105): reine Rechen- und Text-Funktionen (ohne Netz testbar).
// Pro Bestellung: Brutto, Netto, MwSt., Versand, Rabatt, geschätzte Gebühren/Wareneinsatz/Gewinn.
// Pro Monat: Summen + CSV für den Steuerberater. Bewusst OHNE Kundennamen/Adressen/E-Mails.
import { createHash } from 'node:crypto';

const zahl = (x) => Math.round((Number(x) || 0) * 100) / 100;
export const euro = (x, waehrung = 'EUR') => new Intl.NumberFormat('de-DE', { style: 'currency', currency: waehrung || 'EUR' }).format(zahl(x));
// Bestell-IDs nur als Hash im (öffentlichen) Zustand speichern.
export const kennung = (id) => createHash('sha256').update(String(id)).digest('hex').slice(0, 16);

export function erstattet(order) {
  return zahl((order.refunds || []).flatMap((r) => r.transactions || [])
    .filter((t) => t.kind === 'refund' && t.status === 'success')
    .reduce((s, t) => s + Number(t.amount || 0), 0));
}

// annahmen: { produktkostenProzent, gebuehrProzent, gebuehrFixCent }
export function bestellungBuchen(order, annahmen = {}) {
  const brutto = zahl(order.current_total_price ?? order.total_price);
  const mwst = zahl(order.current_total_tax ?? order.total_tax);
  const versand = zahl((order.shipping_lines || []).reduce((s, l) => s + Number(l.discounted_price ?? l.price ?? 0), 0));
  const rabatt = zahl(order.current_total_discounts ?? order.total_discounts);
  const netto = zahl(brutto - mwst);
  const zurueck = erstattet(order);
  const gebuehren = brutto > 0 ? zahl(brutto * (Number(annahmen.gebuehrProzent) || 0) / 100 + (Number(annahmen.gebuehrFixCent) || 0) / 100) : 0;
  const ware = zahl((netto - versand) * (Number(annahmen.produktkostenProzent) || 0) / 100);
  const saetze = [...new Set((order.tax_lines || []).map((t) => Math.round(Number(t.rate || 0) * 1000) / 10))].filter((r) => r > 0);
  return {
    datum: String(order.created_at || '').slice(0, 10),
    nummer: order.name || `#${order.order_number || order.id}`,
    status: order.financial_status || '',
    waehrung: order.currency || 'EUR',
    brutto, netto, mwst, versand, rabatt, erstattet: zurueck, gebuehren, ware,
    gewinn: zahl(netto - zurueck - gebuehren - ware),
    saetze,
    zahlart: (order.payment_gateway_names || []).join('+') || '',
    land: order.shipping_address?.country_code || order.billing_address?.country_code || '',
    artikel: (order.line_items || []).filter((l) => l.quantity > 0).map((l) => ({ titel: l.title, menge: l.quantity, preis: zahl(l.price) })),
  };
}

// Nur echte, bezahlte Bestellungen zählen (keine Tests, keine stornierten).
export const zaehlt = (o) => !o.test && !o.cancelled_at && !['voided', 'pending', 'authorized'].includes(o.financial_status);

export function summieren(buchungen) {
  const s = { anzahl: buchungen.length, brutto: 0, netto: 0, mwst: 0, versand: 0, rabatt: 0, erstattet: 0, gebuehren: 0, ware: 0, gewinn: 0, mwstNachSatz: {}, laender: {} };
  for (const b of buchungen) {
    for (const k of ['brutto', 'netto', 'mwst', 'versand', 'rabatt', 'erstattet', 'gebuehren', 'ware', 'gewinn']) s[k] = zahl(s[k] + b[k]);
    const satz = b.saetze.length ? b.saetze.join('/') + ' %' : 'ohne';
    s.mwstNachSatz[satz] = zahl((s.mwstNachSatz[satz] || 0) + b.mwst);
    if (b.land) s.laender[b.land] = (s.laender[b.land] || 0) + 1;
  }
  return s;
}

const csvFeld = (x) => {
  const t = String(x ?? '');
  return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const dez = (x) => zahl(x).toFixed(2).replace('.', ',');
// CSV mit Semikolon + Dezimalkomma (öffnet sich in deutschem Excel/Numbers direkt richtig).
export function csvBauen(buchungen) {
  const kopf = ['Datum', 'Bestellnummer', 'Status', 'Währung', 'Brutto', 'Netto', 'MwSt', 'MwSt-Satz', 'Versand', 'Rabatt', 'Erstattet', 'Gebühren (geschätzt)', 'Wareneinsatz (geschätzt)', 'Gewinn (geschätzt)', 'Zahlart', 'Land'];
  const zeilen = buchungen.map((b) => [b.datum, b.nummer, b.status, b.waehrung, dez(b.brutto), dez(b.netto), dez(b.mwst), b.saetze.join('/'), dez(b.versand), dez(b.rabatt), dez(b.erstattet), dez(b.gebuehren), dez(b.ware), dez(b.gewinn), b.zahlart, b.land]);
  return '﻿' + [kopf, ...zeilen].map((z) => z.map(csvFeld).join(';')).join('\r\n') + '\r\n';
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const zeile = (k, v, fett = false) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${esc(k)}</td><td style="padding:4px 0;text-align:right${fett ? ';font-weight:700' : ''}">${esc(v)}</td></tr>`;
const HINWEIS = '<p style="color:#888;font-size:12px">Gebühren, Wareneinsatz und Gewinn sind Schätzungen (Einstellungen PRODUKTKOSTEN_PROZENT, ZAHLUNGSGEBUEHR_PROZENT). Keine Steuerberatung - die Rechnungen selbst liegen in Shopify.</p>';

export function bestellMail(b, { shop = 'Shop', adminUrl = '', monat = null } = {}) {
  const w = b.waehrung;
  const artikel = b.artikel.map((a) => `<li>${a.menge}× ${esc(a.titel)} (${esc(euro(a.preis, w))})</li>`).join('');
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px">
<h2 style="margin:0 0 8px">💰 Neue Bestellung ${esc(b.nummer)} - ${esc(shop)}</h2>
<p style="margin:0 0 12px;color:#555">${esc(b.datum)} · ${esc(b.zahlart || 'Zahlart unbekannt')} · ${esc(b.land || '?')}</p>
<ul>${artikel}</ul>
<table style="border-collapse:collapse;width:100%">${[
    zeile('Umsatz brutto', euro(b.brutto, w), true), zeile(`davon MwSt.${b.saetze.length ? ` (${b.saetze.join('/')} %)` : ''}`, euro(b.mwst, w)),
    zeile('Umsatz netto', euro(b.netto, w)), zeile('Versand', euro(b.versand, w)), zeile('Rabatt', euro(b.rabatt, w)),
    zeile('Zahlungsgebühren (geschätzt)', '−' + euro(b.gebuehren, w)), zeile('Wareneinsatz (geschätzt)', '−' + euro(b.ware, w)),
    zeile('Gewinn (geschätzt)', euro(b.gewinn, w), true),
  ].join('')}</table>
${monat ? `<p style="margin-top:14px">📅 Dieser Monat bisher: <b>${monat.anzahl}</b> Bestellungen · <b>${esc(euro(monat.brutto, w))}</b> brutto · Gewinn ca. <b>${esc(euro(monat.gewinn, w))}</b></p>` : ''}
${adminUrl ? `<p><a href="${esc(adminUrl)}">Bestellung in Shopify öffnen</a></p>` : ''}${HINWEIS}</div>`;
  return { betreff: `💰 ${shop}: Bestellung ${b.nummer} - ${euro(b.brutto, w)}`, html };
}

export function monatsMail(summe, { shop = 'Shop', monat = '', waehrung = 'EUR' } = {}) {
  const w = waehrung;
  const saetze = Object.entries(summe.mwstNachSatz).map(([k, v]) => zeile(`MwSt. ${k}`, euro(v, w))).join('');
  const laender = Object.entries(summe.laender).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join(' · ');
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px">
<h2 style="margin:0 0 8px">📊 Monatsabrechnung ${esc(monat)} - ${esc(shop)}</h2>
<table style="border-collapse:collapse;width:100%">${[
    zeile('Bestellungen', String(summe.anzahl), true), zeile('Umsatz brutto', euro(summe.brutto, w), true), zeile('Umsatz netto', euro(summe.netto, w)),
    zeile('MwSt. gesamt', euro(summe.mwst, w)),
  ].join('')}${saetze}${[
    zeile('Versand eingenommen', euro(summe.versand, w)), zeile('Rabatte', euro(summe.rabatt, w)), zeile('Erstattungen', '−' + euro(summe.erstattet, w)),
    zeile('Zahlungsgebühren (geschätzt)', '−' + euro(summe.gebuehren, w)), zeile('Wareneinsatz (geschätzt)', '−' + euro(summe.ware, w)),
    zeile('Gewinn vor Werbung (geschätzt)', euro(summe.gewinn, w), true),
  ].join('')}</table>
${laender ? `<p style="color:#555">Länder: ${esc(laender)}</p>` : ''}
<p>📎 Im Anhang: alle Bestellungen als CSV (Excel), direkt an den Steuerberater weiterleitbar.</p>${HINWEIS}</div>`;
  return { betreff: `📊 ${shop}: Monatsabrechnung ${monat} - ${euro(summe.brutto, w)} Umsatz`, html };
}

// Vormonat (deutsche Zeit) als "YYYY-MM" + großzügiges Abfrage-Fenster; gefiltert wird danach über created_at
// (Shopify liefert es in der Shop-Zeitzone, also passt created_at.slice(0, 7) === name).
export const monatVon = (jetzt = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(jetzt).slice(0, 7);
export function vormonat(jetzt = new Date()) {
  const [y, m] = monatVon(jetzt).split('-').map(Number);
  const vy = m === 1 ? y - 1 : y;
  const vm = m === 1 ? 12 : m - 1;
  const p = (n) => String(n).padStart(2, '0');
  return { name: `${vy}-${p(vm)}`, von: new Date(Date.UTC(vy, vm - 1, 1) - 864e5).toISOString(), bis: new Date(Date.UTC(y, m - 1, 1) + 864e5).toISOString() };
}
