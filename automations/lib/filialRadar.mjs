// Filial-Radar (#112): welche dm-Filialen im Umkreis von Hattersheim gefragte Ware vorrätig haben.
// dm-Schnittstellen sind inoffiziell (die dm-Webseite nutzt sie selbst) - deshalb lesen alle Funktionen tolerant
// und werfen nichts weg, nur weil ein Feld anders heißt. Ohne Netz testbar.
import { HEIMAT, entfernungKm } from './resellingRadar.mjs';

export const DM_SUCHE = ['adventskalender', 'pokemon', 'lego', 'beauty adventskalender', 'one piece', 'labubu'];
const zahl = (v) => (typeof v === 'number' ? v : Number.parseFloat(String(v ?? '').replace(',', '.')));

// Rechteck um Hattersheim (ca. 50 km in jede Richtung) für die dm-Filialsuche
export function bbox(h = HEIMAT) {
  const dLat = h.radiusKm / 111, dLon = h.radiusKm / (111 * Math.cos((h.lat * Math.PI) / 180));
  return [h.lat + dLat, h.lon - dLon, h.lat - dLat, h.lon + dLon].map((x) => x.toFixed(5)).join(',');
}

// Filialen aus der dm-Filialsuche: Nummer, Adresse, Koordinaten, Entfernung - nur im Radius
export function dmFilialen(json, h = HEIMAT) {
  const liste = Array.isArray(json) ? json : json?.stores || json?.items || json?.content || [];
  return liste.map((s) => {
    const a = s.address || {}, ort = s.location || s.geoLocation || s.coordinates || {};
    const lat = zahl(ort.lat ?? ort.latitude ?? s.lat), lon = zahl(ort.lon ?? ort.lng ?? ort.longitude ?? s.lon);
    const nummer = String(s.storeNumber ?? s.storeId ?? s.id ?? '').trim();
    if (!nummer || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const strasse = a.street || [a.streetName, a.streetNumber].filter(Boolean).join(' ');
    return { nummer, id: String(s.storeId ?? s.id ?? nummer), name: `dm ${a.city || ''}`.trim(), adresse: [strasse, [a.zip || a.postalCode, a.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      ort: a.city || '', lat, lon, km: entfernungKm(h, { lat, lon }) };
  }).filter((f) => f && f.km <= h.radiusKm).sort((a, b) => a.km - b.km);
}

// Produkte aus der dm-Suche: DAN, Name, Preis, Bild, Link
export function dmProdukte(json, begriff, maxEuro = 80) {
  const liste = json?.items || json?.products || json?.results || [];
  return liste.map((p) => {
    const dan = String(p.dan ?? p.id ?? '').trim();
    const preis = zahl(p.price?.value ?? p.price?.current?.value ?? p.priceValue ?? p.price);
    const tpl = p.imageUrlTemplates?.[0] || p.images?.[0]?.src || p.imageUrl || p.image || '';
    const bild = String(tpl).replace('{transformations}', 'f_auto,q_auto,c_fit,h_270,w_270');
    const url = p.relativeProductUrl || p.productUrl || p.url || '';
    return dan ? { dan, name: [p.brandName || p.brand?.name, p.title || p.name].filter(Boolean).join(' ').trim(), preis: Number.isFinite(preis) ? preis : null,
      bild: /^https:\/\//.test(bild) ? bild : '', link: url ? (url.startsWith('http') ? url : `https://www.dm.de${url}`) : `https://www.dm.de/search?query=${encodeURIComponent(begriff)}`, begriff } : null;
  }).filter((p) => p && p.name && (p.preis == null || p.preis <= maxEuro));
}

// Bestand pro Produkt und Filiale. Prüffehler (checkStatus ERROR) zählen als "unbekannt", nicht als "leer".
export function dmBestand(json) {
  const raus = {};
  for (const [dan, eintraege] of Object.entries(json?.storeAvailabilities || {})) {
    for (const e of eintraege || []) {
      const nr = String(e.store?.storeNumber ?? e.storeNumber ?? '');
      if (!nr) continue;
      const fehler = e.checkStatus?.status === 'ERROR';
      raus[`${dan}|${nr}`] = fehler ? null : { da: !!e.inStock || (e.stockLevel ?? 0) > 0, menge: e.stockLevel ?? null };
    }
  }
  return raus;
}

// Neu im Bestand: vorher nicht da (oder noch nie gesehen, aber es gab schon einen Lauf) -> jetzt da
export function neuImBestand(alt = {}, neu = {}, ersterLauf = false) {
  if (ersterLauf) return [];
  return Object.entries(neu).filter(([k, v]) => v?.da && alt[k] !== true).map(([k]) => k);
}

// Pro Produkt eine Meldung im Stil der Discord-Monitore: nächste Filiale + wie viele im Umkreis
export function filialMeldungen(neueSchluessel, produkte, filialen, bestand) {
  const proDan = {};
  for (const k of neueSchluessel) { const [dan, nr] = k.split('|'); (proDan[dan] ||= []).push(nr); }
  return Object.entries(proDan).map(([dan, nummern]) => {
    const p = produkte.find((x) => x.dan === dan);
    const vorrat = filialen.filter((f) => bestand[`${dan}|${f.nummer}`]?.da);
    const naechste = filialen.filter((f) => nummern.includes(f.nummer))[0];
    if (!p || !naechste) return null;
    const menge = bestand[`${dan}|${naechste.nummer}`]?.menge;
    return {
      schluessel: `filiale:${dan}:${naechste.nummer}`, art: 'Filiale', titel: `🟢 NEU im Bestand: ${p.name}`, bild: p.bild,
      link: `https://www.google.com/maps/dir/?api=1&destination=${naechste.lat},${naechste.lon}`, shop: p.link,
      text: `${p.preis != null ? `${p.preis.toFixed(2).replace('.', ',')} € · ` : ''}${naechste.name} (${String(naechste.km).replace('.', ',')} km)${menge ? ` · ${menge} Stück` : ''}\n${naechste.adresse}\nIm Umkreis in ${vorrat.length} Filiale(n) vorrätig.`,
    };
  }).filter(Boolean);
}
