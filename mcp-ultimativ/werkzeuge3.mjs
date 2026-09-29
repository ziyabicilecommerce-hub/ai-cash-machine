// Ultimativ-MCP, Teil 3: Business, Entwicklung & Rechner - kostenlose Schnittstellen ohne Key
// plus lokale Werkzeuge (laufen ganz ohne Internet).
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { sichereZielUrl } from '../mcp-router/client.mjs';
import { hole, q, kurz, zahl, textGenerieren, T, S, N, UA } from './werkzeuge.mjs';

const IP = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+$/i;
const DOMAIN = /^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i;

async function ipInfo({ ip }) {
  const ziel = ip && IP.test(String(ip).trim()) ? String(ip).trim() : '';
  const d = await hole(`https://ipwho.is/${ziel}`);
  if (d.success === false) throw new Error(d.message || 'IP nicht gefunden');
  return { ip: d.ip, land: d.country, region: d.region, stadt: d.city, anbieter: d.connection?.isp, zeitzone: d.timezone?.id };
}

async function dnsAbfrage({ domain, typ }) {
  if (!DOMAIN.test(String(domain || ''))) throw new Error('Bitte eine gueltige Domain angeben, z. B. example.com');
  const t = ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME', 'CAA'].includes(String(typ || '').toUpperCase()) ? String(typ).toUpperCase() : 'A';
  const d = await hole(`https://cloudflare-dns.com/dns-query?name=${q(domain)}&type=${t}`, { headers: { accept: 'application/dns-json' } });
  return { domain, typ: t, eintraege: (d.Answer || []).map((a) => ({ wert: a.data, ttl: a.TTL })) };
}

async function domainInfo({ domain }) {
  if (!DOMAIN.test(String(domain || ''))) throw new Error('Bitte eine gueltige Domain angeben');
  const d = await hole(`https://rdap.org/domain/${q(domain)}`, { headers: { accept: 'application/rdap+json' } });
  const ereignis = (a) => d.events?.find((e) => e.eventAction === a)?.eventDate;
  return { domain: d.ldhName, status: d.status, registriert: ereignis('registration'), laeuft_ab: ereignis('expiration'), geaendert: ereignis('last changed'), nameserver: (d.nameservers || []).map((n) => n.ldhName) };
}

async function webseiteStatus({ url }) {
  const ziel = sichereZielUrl(url);
  if (!ziel) throw new Error('Nur oeffentliche https-Adressen sind erlaubt.');
  const start = Date.now();
  const res = await fetch(ziel, { redirect: 'manual', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  return { url: ziel, status: res.status, online: res.status < 500, antwortzeit_ms: Date.now() - start, server: res.headers.get('server'), weiterleitung: res.headers.get('location') || '' };
}

async function urlKuerzen({ url }) {
  const ziel = sichereZielUrl(url);
  if (!ziel) throw new Error('Nur oeffentliche https-Adressen sind erlaubt.');
  const d = await hole(`https://is.gd/create.php?format=json&url=${q(ziel)}`);
  if (!d.shorturl) throw new Error(d.errormessage || 'Kuerzen fehlgeschlagen');
  return { kurz: d.shorturl, lang: ziel };
}

async function npmPaket({ name }) {
  const n = String(name || '').trim();
  if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/i.test(n)) throw new Error('Ungueltiger Paketname');
  const [p, dl] = await Promise.all([hole(`https://registry.npmjs.org/${n.replace('/', '%2F')}/latest`), hole(`https://api.npmjs.org/downloads/point/last-week/${n}`).catch(() => ({}))]);
  return { name: p.name, version: p.version, beschreibung: p.description, lizenz: p.license, downloads_woche: dl.downloads, homepage: p.homepage, abhaengigkeiten: Object.keys(p.dependencies || {}).length };
}

async function pypiPaket({ name }) {
  const n = String(name || '').trim();
  if (!/^[a-z0-9._-]+$/i.test(n)) throw new Error('Ungueltiger Paketname');
  const d = await hole(`https://pypi.org/pypi/${n}/json`);
  return { name: d.info.name, version: d.info.version, beschreibung: d.info.summary, lizenz: kurz(d.info.license, 80), python: d.info.requires_python, homepage: d.info.home_page || d.info.project_urls?.Homepage };
}

async function stackoverflow({ suche, limit }) {
  const d = await hole(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${q(suche)}&site=stackoverflow&pagesize=${zahl(limit, 8, 1, 20)}`);
  return (d.items || []).map((i) => ({ frage: kurz(i.title.replace(/&#39;/g, "'").replace(/&quot;/g, '"'), 200), beantwortet: i.is_answered, antworten: i.answer_count, punkte: i.score, tags: i.tags, link: i.link }));
}

async function redditSuche({ suche, limit }) {
  const n = zahl(limit, 10, 1, 25);
  try {
    const d = await hole(`https://www.reddit.com/search.json?q=${q(suche)}&limit=${n}&sort=relevance`);
    return (d.data?.children || []).map(({ data: p }) => ({ titel: p.title, subreddit: p.subreddit_name_prefixed, punkte: p.score, kommentare: p.num_comments, link: `https://www.reddit.com${p.permalink}` }));
  } catch {
    // Reddit blockt manche Server - Ersatz: oeffentliches Reddit-Archiv (PullPush).
    const d = await hole(`https://api.pullpush.io/reddit/search/submission/?q=${q(suche)}&size=${n}`);
    return (d.data || []).map((p) => ({ titel: p.title, subreddit: `r/${p.subreddit}`, punkte: p.score, kommentare: p.num_comments, link: `https://www.reddit.com${p.permalink}`, quelle: 'PullPush-Archiv' }));
  }
}

// KI-Helfer fuer Marketing - nutzen die kostenlose KI-Kette des Ultimativ-MCP.
const ki = async (prompt) => (await textGenerieren({ anweisung: prompt })).text;
async function werbetext({ produkt, zielgruppe, plattform }) {
  return { text: await ki(`Schreibe fuer das Produkt "${kurz(produkt, 300)}" (Zielgruppe: ${kurz(zielgruppe || 'breit', 100)}) Werbetexte fuer ${kurz(plattform || 'TikTok/Instagram', 50)}: 5 Hooks (max. 8 Woerter), 3 kurze Captions mit Call-to-Action, 1 laengere Produktbeschreibung. Du-Ansprache, keine erfundenen Fakten.`) };
}
async function hashtags({ thema, anzahl }) {
  return { text: await ki(`Gib ${zahl(anzahl, 15, 3, 30)} passende, reichweitenstarke Hashtags (Mischung aus gross, mittel, Nische) fuer: "${kurz(thema, 300)}". Nur die Hashtags, durch Leerzeichen getrennt.`) };
}
async function emailEntwurf({ anlass, empfaenger, ton }) {
  return { text: await ki(`Schreibe eine kurze, professionelle E-Mail auf Deutsch. Anlass: ${kurz(anlass, 500)}. Empfaenger: ${kurz(empfaenger || 'Kunde', 100)}. Ton: ${kurz(ton || 'freundlich', 50)}. Mit Betreff.`) };
}

// ---------- lokale Werkzeuge ----------

function rechnen({ ausdruck }) {
  const a = String(ausdruck || '').replace(/,/g, '.').replace(/\^/g, '**').trim();
  if (!a || a.length > 200 || !/^[0-9+\-*/(). \t]+$/.test(a)) throw new Error('Nur Zahlen und + - * / ^ ( ) erlaubt');
  const ergebnis = Function(`"use strict"; return (${a});`)();
  if (typeof ergebnis !== 'number' || !Number.isFinite(ergebnis)) throw new Error('Kein gueltiges Ergebnis');
  return { ausdruck, ergebnis };
}

const EINHEITEN = {
  km: ['m', 1000], m: ['m', 1], cm: ['m', 0.01], mm: ['m', 0.001], mi: ['m', 1609.344], yd: ['m', 0.9144], ft: ['m', 0.3048], in: ['m', 0.0254],
  kg: ['g', 1000], g: ['g', 1], mg: ['g', 0.001], lb: ['g', 453.59237], oz: ['g', 28.349523],
  l: ['l', 1], ml: ['l', 0.001], gal: ['l', 3.785411784], floz: ['l', 0.0295735],
  kmh: ['ms', 1 / 3.6], mph: ['ms', 0.44704], ms: ['ms', 1], kn: ['ms', 0.514444],
  m2: ['m2', 1], km2: ['m2', 1e6], ha: ['m2', 1e4], ft2: ['m2', 0.09290304],
  kb: ['b', 1000], mb: ['b', 1e6], gb: ['b', 1e9], tb: ['b', 1e12],
};
function einheitenUmrechnen({ wert, von, nach }) {
  const v = Number(wert);
  const [a, b] = [String(von || '').toLowerCase(), String(nach || '').toLowerCase()];
  const temp = { c: (x) => x, f: (x) => (x - 32) * 5 / 9, k: (x) => x - 273.15 };
  const tempZurueck = { c: (x) => x, f: (x) => x * 9 / 5 + 32, k: (x) => x + 273.15 };
  if (temp[a] && tempZurueck[b]) return { wert: v, von: a, nach: b, ergebnis: +tempZurueck[b](temp[a](v)).toFixed(4) };
  if (!EINHEITEN[a] || !EINHEITEN[b] || EINHEITEN[a][0] !== EINHEITEN[b][0]) throw new Error(`Moegliche Einheiten: ${Object.keys(EINHEITEN).join(', ')}, c, f, k`);
  return { wert: v, von: a, nach: b, ergebnis: +((v * EINHEITEN[a][1]) / EINHEITEN[b][1]).toPrecision(10) };
}

function passwort({ laenge, sonderzeichen }) {
  const zeichen = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789' + (sonderzeichen === false ? '' : '!@#$%&*?-_+=');
  const n = zahl(laenge, 20, 8, 128);
  return { passwort: Array.from({ length: n }, () => zeichen[randomInt(zeichen.length)]).join(''), hinweis: 'Lokal mit Krypto-Zufall erzeugt, nirgendwo gespeichert.' };
}

function hashBerechnen({ text, verfahren }) {
  const v = ['md5', 'sha1', 'sha256', 'sha512'].includes(String(verfahren || '').toLowerCase()) ? String(verfahren).toLowerCase() : 'sha256';
  return { verfahren: v, hash: createHash(v).update(String(text ?? '')).digest('hex'), uuid: randomUUID() };
}

function base64({ text, richtung }) {
  const t = String(text ?? '').slice(0, 100000);
  return String(richtung).toLowerCase() === 'decode' ? { ergebnis: Buffer.from(t, 'base64').toString('utf8') } : { ergebnis: Buffer.from(t, 'utf8').toString('base64') };
}

async function farbpalette({ farbe, modus, anzahl }) {
  const hex = String(farbe || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error('Farbe als Hex angeben, z. B. #ff5500');
  const m = ['monochrome', 'analogic', 'complement', 'triad', 'quad', 'analogic-complement'].includes(modus) ? modus : 'analogic';
  const d = await hole(`https://www.thecolorapi.com/scheme?hex=${hex}&mode=${m}&count=${zahl(anzahl, 5, 2, 10)}`);
  return (d.colors || []).map((c) => ({ hex: c.hex.value, name: c.name.value, rgb: c.rgb.value }));
}

function mwstRechner({ betrag, satz, richtung }) {
  const b = Number(betrag);
  const s = [19, 7, 0].includes(Number(satz)) ? Number(satz) : 19;
  const netto = String(richtung).toLowerCase() === 'brutto' ? b / (1 + s / 100) : b;
  const r = (x) => Math.round(x * 100) / 100;
  return { netto: r(netto), mwst: r(netto * s / 100), brutto: r(netto * (1 + s / 100)), satz_prozent: s, hinweis: 'Kleinunternehmer nach § 19 UStG weisen keine MwSt aus.' };
}

function zinsRechner({ start, rate_monat, zins_prozent, jahre }) {
  const s = Number(start) || 0; const r = Number(rate_monat) || 0; const z = (Number(zins_prozent) || 0) / 100 / 12; const n = zahl(jahre, 10, 1, 80) * 12;
  let wert = s;
  for (let i = 0; i < n; i++) wert = wert * (1 + z) + r;
  const eingezahlt = s + r * n;
  return { endwert: Math.round(wert), eingezahlt: Math.round(eingezahlt), zinsertrag: Math.round(wert - eingezahlt), hinweis: 'Monatliche Verzinsung, ohne Steuern/Inflation.' };
}

function zeitzonen({ zeit, von, nach }) {
  const zonen = String(nach || 'America/New_York,Asia/Tokyo,Asia/Istanbul,Europe/London').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 10);
  const basis = zeit ? new Date(zeit) : new Date();
  if (Number.isNaN(basis.getTime())) throw new Error('Zeit bitte als ISO angeben, z. B. 2026-10-01T15:00:00+02:00');
  return { basis: basis.toISOString(), von: von || 'UTC', zeiten: zonen.map((z) => { try { return { zone: z, zeit: basis.toLocaleString('de-DE', { timeZone: z }) }; } catch { return { zone: z, zeit: 'unbekannte Zeitzone' }; } }) };
}

function kalender({ datum }) {
  const d = datum ? new Date(`${datum}T12:00:00Z`) : new Date();
  if (Number.isNaN(d.getTime())) throw new Error('Datum als YYYY-MM-DD angeben');
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const kw = Math.ceil(((t - new Date(Date.UTC(t.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7);
  const heute = new Date(); heute.setUTCHours(12, 0, 0, 0);
  return { datum: d.toISOString().slice(0, 10), wochentag: d.toLocaleDateString('de-DE', { weekday: 'long', timeZone: 'UTC' }), kalenderwoche: kw, tag_im_jahr: Math.floor((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1, tage_bis_dahin: Math.round((d - heute) / 86400000) };
}

function textStatistik({ text }) {
  const t = String(text ?? '');
  const woerter = t.trim() ? t.trim().split(/\s+/).length : 0;
  return { zeichen: t.length, zeichen_ohne_leerzeichen: t.replace(/\s/g, '').length, woerter, saetze: (t.match(/[.!?]+(\s|$)/g) || []).length, lesezeit_min: +(woerter / 200).toFixed(1), sprechzeit_s: Math.round(woerter / 2.5) };
}

export const WERKZEUGE3 = [
  T('ip_info', 'Standort und Anbieter einer IP-Adresse (ohne Angabe: eigene IP).', { ip: S('IPv4/IPv6, optional') }, [], ipInfo),
  T('dns_abfrage', 'DNS-Eintraege einer Domain (A, AAAA, MX, TXT, NS, CNAME, CAA) ueber Cloudflare.', { domain: S('z. B. example.com'), typ: S('Eintragstyp, Standard A') }, ['domain'], dnsAbfrage),
  T('domain_info', 'Registrierung, Ablaufdatum und Nameserver einer Domain (RDAP/Whois).', { domain: S('z. B. example.com') }, ['domain'], domainInfo),
  T('webseite_status', 'Prueft, ob eine Webseite online ist, mit Statuscode und Antwortzeit.', { url: S('https-Adresse') }, ['url'], webseiteStatus),
  T('url_kuerzen', 'Kuerzt einen Link kostenlos (is.gd).', { url: S('https-Adresse') }, ['url'], urlKuerzen),
  T('npm_paket', 'Infos zu einem npm-Paket: Version, Lizenz, Downloads pro Woche.', { name: S('Paketname') }, ['name'], npmPaket),
  T('pypi_paket', 'Infos zu einem Python-Paket (PyPI): Version, Lizenz, Python-Version.', { name: S('Paketname') }, ['name'], pypiPaket),
  T('stackoverflow_suche', 'Sucht Programmier-Fragen und Antworten auf Stack Overflow.', { suche: S('Frage/Begriff'), limit: N('max. Treffer') }, ['suche'], stackoverflow),
  T('reddit_suche', 'Sucht Reddit-Beitraege (Trends, Meinungen, Produktideen).', { suche: S('Suchbegriff'), limit: N('max. Treffer') }, ['suche'], redditSuche),
  T('werbetext', 'KI-Werbetexte: 5 Hooks, 3 Captions und eine Produktbeschreibung.', { produkt: S('Produkt + Infos'), zielgruppe: S('optional'), plattform: S('z. B. TikTok, Instagram, Shop') }, ['produkt'], werbetext),
  T('hashtags', 'KI-Hashtags fuer ein Thema (Mischung aus gross, mittel, Nische).', { thema: S('Thema/Produkt'), anzahl: N('Anzahl, Standard 15') }, ['thema'], hashtags),
  T('email_entwurf', 'KI-Entwurf fuer eine professionelle E-Mail mit Betreff.', { anlass: S('Worum geht es?'), empfaenger: S('optional'), ton: S('z. B. freundlich, foermlich') }, ['anlass'], emailEntwurf),
  T('rechnen', 'Rechnet einen mathematischen Ausdruck aus (+ - * / ^ Klammern).', { ausdruck: S('z. B. (19.99*3)^2/7') }, ['ausdruck'], rechnen),
  T('einheiten_umrechnen', 'Rechnet Einheiten um: Laenge, Gewicht, Volumen, Tempo, Flaeche, Daten, Temperatur.', { wert: N('Zahl'), von: S('z. B. km, lb, f'), nach: S('z. B. mi, kg, c') }, ['wert', 'von', 'nach'], einheitenUmrechnen),
  T('passwort_generator', 'Erzeugt ein sicheres Zufallspasswort (lokal).', { laenge: N('8-128, Standard 20'), sonderzeichen: { type: 'boolean', description: 'mit Sonderzeichen (Standard ja)' } }, [], passwort),
  T('hash_berechnen', 'Berechnet MD5/SHA1/SHA256/SHA512 eines Textes und eine neue UUID (lokal).', { text: S('Text'), verfahren: S('md5, sha1, sha256, sha512') }, ['text'], hashBerechnen),
  T('base64', 'Base64 kodieren oder dekodieren (lokal).', { text: S('Text'), richtung: S('encode oder decode') }, ['text'], base64),
  T('farbpalette', 'Passende Farbpalette zu einer Farbe (z. B. fuer Marke/Shop).', { farbe: S('Hex, z. B. #ff5500'), modus: S('analogic, complement, triad, quad, monochrome'), anzahl: N('2-10') }, ['farbe'], farbpalette),
  T('mwst_rechner', 'Netto/Brutto/MwSt fuer 19 % oder 7 % berechnen.', { betrag: N('Betrag'), satz: N('19, 7 oder 0'), richtung: S('netto (Betrag ist netto) oder brutto') }, ['betrag'], mwstRechner),
  T('zins_rechner', 'Zinseszins/Sparplan: Endwert, Einzahlungen, Zinsertrag.', { start: N('Startkapital'), rate_monat: N('monatliche Sparrate'), zins_prozent: N('Zins pro Jahr in %'), jahre: N('Laufzeit in Jahren') }, [], zinsRechner),
  T('zeitzonen_umrechnen', 'Zeigt eine Uhrzeit in mehreren Zeitzonen.', { zeit: S('ISO-Zeit, Standard jetzt'), nach: S('Zeitzonen, kommagetrennt') }, [], zeitzonen),
  T('kalender_info', 'Wochentag, Kalenderwoche, Tag im Jahr und Tage bis zu einem Datum.', { datum: S('YYYY-MM-DD, Standard heute') }, [], kalender),
  T('text_statistik', 'Zaehlt Zeichen, Woerter, Saetze; schaetzt Lese- und Sprechzeit.', { text: S('Text') }, ['text'], textStatistik),
];
