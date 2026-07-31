// Baut eine kleine, eigenständige Demo-Website für einen gefundenen Lead -
// zum Vorzeigen statt einer kalten "Sie haben keine Website"-Nachricht.
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function slugifyLead(name, placeId) {
  const base = String(name || 'firma')
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }[c]))
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'firma';
  const suffix = String(placeId || '').slice(-8) || Date.now().toString(36);
  return `${base}-${suffix}`;
}

export function buildLeadPreviewHtml(lead) {
  const name = escapeHtml(lead.name);
  const branche = escapeHtml(lead.branche || 'Unternehmen');
  const adresse = escapeHtml(lead.adresse || '');
  const telefon = escapeHtml(lead.telefon || '');
  const mapsUrl = lead.mapsUrl || '#';
  const bewertung = lead.bewertung ? `${lead.bewertung.toFixed(1)} ★ (${lead.bewertungenAnzahl || 0} Bewertungen)` : '';

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${name} — Website-Entwurf</title>
<style>
  :root{--primary:#2563eb;--ink:#1a1a2e;--mut:#6b7280;--bg:#ffffff;--soft:#f5f7fb}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--ink);background:var(--bg);line-height:1.6}
  header{background:linear-gradient(135deg,var(--primary),#1e3a8a);color:#fff;padding:72px 24px;text-align:center}
  header h1{font-size:clamp(28px,5vw,44px);margin-bottom:10px}
  header p{opacity:.9;font-size:18px}
  .draft-note{background:#fffbeb;border-bottom:1px solid #fde68a;color:#92400e;text-align:center;padding:10px 16px;font-size:13px}
  main{max-width:800px;margin:0 auto;padding:48px 24px}
  section{margin-bottom:48px}
  h2{font-size:24px;margin-bottom:16px;color:var(--primary)}
  .card{background:var(--soft);border-radius:12px;padding:28px}
  .contact-row{display:flex;flex-wrap:wrap;gap:16px;margin-top:16px}
  .contact-row a{display:inline-flex;align-items:center;gap:8px;background:var(--primary);color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600}
  .rating{color:var(--mut);font-size:15px;margin-top:8px}
  footer{text-align:center;padding:32px 24px;color:var(--mut);font-size:13px;border-top:1px solid #e5e7eb}
</style>
</head>
<body>
  <div class="draft-note">Unverbindlicher Website-Entwurf — nicht die echte Seite von ${name}</div>
  <header>
    <h1>${name}</h1>
    <p>${branche}${adresse ? ' · ' + adresse : ''}</p>
  </header>
  <main>
    <section>
      <h2>Über uns</h2>
      <div class="card">
        <p>${name} ist Ihr Ansprechpartner für ${branche} in der Region${adresse ? ' — ' + adresse : ''}. Diese Seite zeigt, wie ein moderner, mobil-optimierter Web-Auftritt für Ihr Unternehmen aussehen könnte.</p>
        ${bewertung ? `<p class="rating">${bewertung} auf Google</p>` : ''}
      </div>
    </section>
    <section>
      <h2>Kontakt</h2>
      <div class="card">
        <p>${adresse || 'Adresse auf Anfrage'}</p>
        <div class="contact-row">
          ${telefon ? `<a href="tel:${telefon.replace(/\s+/g, '')}">📞 ${telefon}</a>` : ''}
          <a href="${mapsUrl}" target="_blank" rel="noopener">📍 Auf Google Maps ansehen</a>
        </div>
      </div>
    </section>
  </main>
  <footer>Automatisch generierter Website-Entwurf · unverbindlich</footer>
</body>
</html>
`;
}
