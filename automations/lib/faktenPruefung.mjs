// Fakten-Kanal: Skripte zu Rekord-Fragen, bei denen Quellen sich uneinig sind, werden verworfen -
// auf einem Community-Konto soll keine strittige Behauptung als sichere Tatsache stehen.
const UMSTRITTEN = /l(ä|ae)ngste[rnms]?\s+(fluss|flusses|strom)|fluss\S*\s+(ist|war)\s+(der\s+)?l(ä|ae)ngste|(h(ö|oe)chste[rnms]?|gr(ö|oe)(ß|ss)te[rnms]?|(ä|ae)lteste[rnms]?)\s+(berg|tier|lebewesen|baum)|l(ä|ae)ngste[rnms]?\s+\S*(fluss|strom)/i;

export const umstritten = (skript) => {
  const text = [skript?.titel, skript?.fakt, ...(skript?.szenen || []).map((s) => s?.text)].filter(Boolean).join('\n');
  return UMSTRITTEN.test(text);
};
