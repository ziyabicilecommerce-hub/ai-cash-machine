// Findet die Bewerbungs-Adresse auf der Firmen-Website, wenn die Anzeige selbst keine E-Mail nennt.
const JOBBOERSE = /arbeitsagentur|jobexport|empfehlungsbund|persy\.jobs|jcd\.de|onapply|beruf-und-familie|kmk\.org|stepstone|indeed|softgarden|personio|join\.com|smartrecruiters|myworkday|successfactors|greenhouse|lever\.co|recruitee|onlyfy|dvinci|umantis|jobware|monster|xing|linkedin|google|facebook|instagram|youtube|kununu|stellenanzeigen|jobs\.de|w3\.org|schema\.org|bund\.de|interamt|gstatic|cloudflare/i;
const PFADE = ['', 'karriere', 'jobs', 'kontakt', 'impressum'];
// Bewerbungs-Postfächer zuerst, allgemeine Firmen-Postfächer als Ersatz - nie Personen, Presse oder Datenschutz.
const BEWERBUNG = /^(bewerbung|bewerbungen|karriere|career|careers|jobs?|personal|hr|recruiting|talent)[a-z.-]*@/;
const ALLGEMEIN = /^(info|kontakt|contact|office|mail|hallo|hello)@/;

export function basisDomain(host) {
  return host.toLowerCase().replace(/^www\./, '').split('.').slice(-2).join('.');
}

export function websiteDomain(text, externeUrl) {
  for (const k of [externeUrl, ...(text.match(/(?:https?:\/\/|www\.)[a-z0-9.-]+\.[a-z]{2,}/gi) || [])]) {
    if (!k) continue;
    try {
      const host = new URL(k.startsWith('http') ? k : `https://${k}`).hostname;
      if (!JOBBOERSE.test(host)) return basisDomain(host);
    } catch { /* kaputte URL */ }
  }
  return '';
}

export async function emailVonWebsite(domain) {
  if (!domain) return '';
  const ersatz = [];
  for (const pfad of PFADE) {
    try {
      const res = await fetch(`https://www.${domain}/${pfad}`, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) continue;
      const html = (await res.text()).slice(0, 400000).replace(/&#64;|&#x40;|\\u0040|%40/g, '@');
      const mails = (html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [])
        .map((e) => e.toLowerCase()).filter((e) => basisDomain(e.split('@')[1]) === domain);
      const treffer = mails.find((e) => BEWERBUNG.test(e));
      if (treffer) return treffer;
      ersatz.push(...mails.filter((e) => ALLGEMEIN.test(e)));
    } catch { /* Seite nicht erreichbar */ }
  }
  return ersatz[0] || '';
}
