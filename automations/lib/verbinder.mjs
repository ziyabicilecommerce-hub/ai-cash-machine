// Holt die per Ein-Klick-Verbinden gespeicherten Tokens vom Cloudflare-Worker (verbinder-worker)
// und traegt sie als Umgebungsvariablen ein - nur dort, wo kein GitHub-Secret gesetzt ist.
// Die Plattform-Module lesen danach wie gewohnt process.env.
import { readFileSync, existsSync } from 'node:fs';

export async function verbinderLaden() {
  const passwort = (process.env.VERBINDER_PASSWORT || '').trim();
  let url = (process.env.VERBINDER_URL || '').trim();
  if (!url && existsSync('verbinden/verbinder.json')) {
    try { url = JSON.parse(readFileSync('verbinden/verbinder.json', 'utf8')).url || ''; } catch { /* egal */ }
  }
  if (!passwort || !/^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(url)) return 0;
  try {
    const res = await fetch(`${url}/tokens`, { headers: { authorization: `Bearer ${passwort}` }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const werte = await res.json();
    let n = 0;
    for (const [k, v] of Object.entries(werte)) {
      if (!/^[A-Z][A-Z0-9_]+$/.test(k) || typeof v !== 'string' || !v) continue;
      if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${v}`);
      if (!(process.env[k] || '').trim()) { process.env[k] = v; n++; }
    }
    console.log(`[verbinder] ${n} Werte aus dem Ein-Klick-Verbinden geladen`);
    return n;
  } catch (err) {
    console.log(`[verbinder] nicht erreichbar: ${err.message}`);
    return 0;
  }
}
