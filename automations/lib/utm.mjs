// Verkaufs-Messung (Arsenal Tier 7): jeder Link zum eigenen Shop bekommt UTM-Parameter je Plattform -
// Shopify zeigt dann unter Analysen > Sitzungen/Umsatz nach Quelle, welcher Kanal wirklich verkauft. Kostenlos.
const SHOPS = (process.env.UTM_SHOPS || 'deskrebel.store,purivelle.store').split(',').map((s) => s.trim()).filter(Boolean);
const eigen = (u) => { try { const h = new URL(u).hostname.replace(/^www\./, ''); return SHOPS.includes(h); } catch { return false; } };
const sauber = (s) => String(s || '').toLowerCase().replace(/\.mp4$/, '').replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export function mitUtm(url, quelle, kampagne = '', medium = 'social') {
  if (!url || !eigen(url) || !quelle) return url;
  const u = new URL(url);
  if (u.searchParams.has('utm_source')) return url;
  u.searchParams.set('utm_source', sauber(quelle));
  u.searchParams.set('utm_medium', medium);
  if (kampagne) u.searchParams.set('utm_campaign', sauber(kampagne));
  return u.href;
}

// Alle eigenen Shop-Links in einem Text markieren (fremde Links bleiben unveraendert).
export const textMitUtm = (text, quelle, kampagne = '', medium = 'social') => String(text || '').replace(/https?:\/\/[^\s)"'<>]+/g, (u) => {
  const ende = u.match(/[.,!?;:]+$/)?.[0] || '';
  return mitUtm(u.slice(0, u.length - ende.length), quelle, kampagne, medium) + ende;
});
