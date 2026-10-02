// Fertige Post-Texte je Plattform aus einem Video des Feeds - mit den Laengengrenzen der Plattformen,
// passenden Hashtags, Shop-Link (wo er klickbar ist) und ehrlichem KI-Hinweis. Ohne KI, ohne Schluessel.
// Laeuft im Browser (Zentrale > Heute posten) und in Node (Tests).
(function (root) {
  // KI-Hinweis in der Sprache des Videos (international: "AI-generated" / #AI).
  const kiText = (sp) => (!sp || sp === 'de' ? 'KI-generiert' : 'AI-generated');
  const kiTag = (sp) => (!sp || sp === 'de' ? '#KI' : '#AI');
  const zerlegen = (v) => {
    const c = String(v.caption || '');
    const link = c.match(/https:\/\/\S+\/products\/\S+/)?.[0] || '';
    const tags = [...new Set(c.match(/#[\p{L}\p{N}_]+/gu) || [])].filter((t) => !['#ki', '#ai'].includes(t.toLowerCase()));
    const text = c.replace(/https?:\/\/\S+/g, '').replace(/#[\p{L}\p{N}_]+/gu, '').replace(/👉/g, '').replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return { titel: String(v.titel || '').trim(), text, link, tags, sp: v.sprache || 'de' };
  };
  const kuerzen = (s, n) => ([...s].length <= n ? s : `${[...s].slice(0, n - 1).join('').replace(/\s+\S*$/, '')}…`);
  const tagsText = (z, n) => [...z.tags.slice(0, n), kiTag(z.sp)].join(' ');
  // Kopf und Fuss (KI-Hinweis, Hashtags, Link) bleiben immer vollstaendig - gekuerzt wird nur der Mittelteil.
  const passend = (kopf, mitte, fuss, n) => `${kopf}${kuerzen(mitte, Math.max(0, n - [...kopf].length - [...fuss].length))}${fuss}`;

  const PLATTFORMEN = {
    tiktok: { name: 'TikTok', bauen: (z) => ({ text: passend(`${z.titel}\n\n`, z.text, `\n\n🔗 Link in Bio\n${tagsText(z, 5)}`, 2200), tipp: 'Beim Hochladen "KI-generierte Inhalte" einschalten.' }) },
    instagram: { name: 'Instagram Reels', bauen: (z) => ({ text: passend(`${z.titel}\n\n`, z.text, `\n\n🔗 Link in Bio\n${kiText(z.sp)}\n\n${tagsText(z, 10)}`, 2200), tipp: 'Unter Erweiterte Einstellungen "KI-Info" aktivieren.' }) },
    youtube: { name: 'YouTube Shorts', bauen: (z) => ({ titel: kuerzen(`${z.titel} #Shorts`, 100), text: passend('', z.text, `\n\n👉 ${z.link}\n\n${kiText(z.sp)} · ${tagsText(z, 5)}`, 5000), tipp: 'Bei "Veränderte oder synthetische Inhalte" Ja wählen.' }) },
    x: { name: 'X (Twitter)', bauen: (z) => ({ text: passend('', z.titel, `\n\n${z.link} ${kiTag(z.sp)}`, 280) }) },
    pinterest: { name: 'Pinterest', bauen: (z) => ({ titel: kuerzen(z.titel, 100), text: passend('', z.text, ` ${kiText(z.sp)}. ${tagsText(z, 5)}`, 500), link: z.link, tipp: 'Shop-Link als Ziel-Link des Pins eintragen.' }) },
    facebook: { name: 'Facebook Reels', bauen: (z) => ({ text: passend(`${z.titel}\n\n`, z.text, `\n\n👉 ${z.link}\n${kiText(z.sp)}\n${tagsText(z, 5)}`, 5000) }) },
  };

  // Verkaufs-Messung: Shop-Link mit UTM je Plattform (Shopify > Analysen > Umsatz nach Quelle).
  const utm = (url, quelle, kampagne) => {
    try {
      const u = new URL(url);
      if (!/(^|\.)(deskrebel|purivelle)\.store$/.test(u.hostname) || u.searchParams.has('utm_source')) return url;
      u.searchParams.set('utm_source', quelle);
      u.searchParams.set('utm_medium', 'social');
      if (kampagne) u.searchParams.set('utm_campaign', String(kampagne).toLowerCase().replace(/\.mp4$/, '').replace(/[^a-z0-9-]+/g, '-').slice(0, 60));
      return u.href;
    } catch (e) { return url; }
  };

  function fuerPlattform(video, plattform) {
    const p = PLATTFORMEN[plattform];
    if (!p) throw new Error(`Unbekannte Plattform: ${plattform}`);
    const z = zerlegen(video);
    z.link = z.link ? utm(z.link, plattform, video.gruppe || video.datei) : z.link;
    return { plattform: p.name, ...p.bauen(z) };
  }

  // Die besten Kandidaten fuer heute: neueste deutsche Hochformat-Ads (max. 90 s), noch nicht gepostet.
  function heute(videos, { gepostet = [], anzahl = 5, sprache = 'de' } = {}) {
    const schon = new Set(gepostet);
    return (videos || []).filter((v) => (v.sprache || 'de') === sprache && !v.kanal && v.format === 'hoch' && (v.dauer || 99) <= 90 && !v.teaser && !schon.has(v.datei))
      .filter((v, i, l) => l.findIndex((x) => x.titel === v.titel) === i).slice(0, anzahl);
  }

  root.ZCaptions = { PLATTFORMEN, fuerPlattform, heute, zerlegen, utm };
})(typeof window !== 'undefined' ? window : globalThis);
