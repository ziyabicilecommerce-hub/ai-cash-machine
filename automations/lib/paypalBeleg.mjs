// Baut eine druckbare, dauerhaft abrufbare Beleg-Seite für eine per PayPal
// bezahlte Shopify-Bestellung - für den Fall, dass PayPal bei einer
// Reklamation oder Kontoprüfung einen Nachweis über echte Lieferung
// verlangt (Kunde/Lieferadresse, Artikel, Zahlungsstatus, Tracking).
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function slugifyBeleg(orderName, orderId) {
  const base = String(orderName || 'bestellung')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'bestellung';
  return `${base}-${orderId}`;
}

const fmtDatum = (iso) => {
  if (!iso) return 'unbekannt';
  try { return new Date(iso).toLocaleString('de-DE'); } catch { return iso; }
};

export function buildBelegHtml(beleg) {
  const artikelZeilen = beleg.artikel.map(
    (a) => `<tr><td>${escapeHtml(a.titel)}</td><td>${escapeHtml(a.menge)}</td><td>${escapeHtml(a.preis)} ${escapeHtml(beleg.waehrung)}</td></tr>`,
  ).join('');

  const sendungenHtml = beleg.sendungen.length
    ? beleg.sendungen.map((s) => `
      <div class="card">
        <p><b>Versanddienstleister:</b> ${escapeHtml(s.carrier)}</p>
        <p><b>Tracking-Nummer:</b> ${escapeHtml(s.trackingNummer || 'keine')}</p>
        ${s.trackingUrl ? `<p><a href="${escapeHtml(s.trackingUrl)}" target="_blank" rel="noopener">Sendungsverfolgung öffnen →</a></p>` : ''}
        <p><b>Versendet am:</b> ${fmtDatum(s.versendetAm)}</p>
        <p><b>Status:</b> ${escapeHtml(s.status)}</p>
      </div>`).join('')
    : `<div class="card"><p>Noch keine Sendung erfasst (Status: ${escapeHtml(beleg.versandstatus)}).</p></div>`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Beleg ${escapeHtml(beleg.orderName)} — PayPal-Zahlungsnachweis</title>
<style>
  :root{--primary:#003087;--ink:#1a1a2e;--mut:#6b7280;--bg:#ffffff;--soft:#f5f7fb;--line:#e5e7eb}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:var(--ink);background:var(--bg);line-height:1.6}
  header{background:var(--primary);color:#fff;padding:32px 24px}
  header h1{font-size:22px;margin-bottom:6px}
  header p{opacity:.85;font-size:13px}
  main{max-width:760px;margin:0 auto;padding:32px 24px}
  section{margin-bottom:28px}
  h2{font-size:16px;margin-bottom:12px;color:var(--primary);text-transform:uppercase;letter-spacing:.04em}
  .card{background:var(--soft);border:1px solid var(--line);border-radius:8px;padding:18px;margin-bottom:10px;font-size:14px}
  table{width:100%;border-collapse:collapse;font-size:14px}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
  th{color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase}
  .meta-row{display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:13px;color:var(--mut);margin-top:6px}
  footer{text-align:center;padding:24px;color:var(--mut);font-size:12px;border-top:1px solid var(--line)}
  @media print{header{background:#fff;color:var(--ink);border-bottom:2px solid var(--primary)}}
</style>
</head>
<body>
  <header>
    <h1>Zahlungs- und Liefernachweis · Bestellung ${escapeHtml(beleg.orderName)}</h1>
    <p>Automatisch erstellt am ${fmtDatum(beleg.erstelltAm)} · bestellt am ${fmtDatum(beleg.bestelltAm)}</p>
  </header>
  <main>
    <section>
      <h2>Zahlung</h2>
      <div class="card">
        <p><b>Zahlungsart:</b> PayPal</p>
        <p><b>Zahlungsstatus:</b> ${escapeHtml(beleg.zahlungsstatus)}</p>
        <p><b>Gesamtbetrag:</b> ${escapeHtml(beleg.gesamtBetrag)} ${escapeHtml(beleg.waehrung)}</p>
      </div>
    </section>
    <section>
      <h2>Lieferadresse</h2>
      <div class="card">
        ${beleg.kunde.adresseZeilen.map((z) => `<p>${escapeHtml(z)}</p>`).join('') || '<p>Keine Adresse hinterlegt.</p>'}
        ${beleg.kunde.email ? `<p class="meta-row"><span>E-Mail: ${escapeHtml(beleg.kunde.email)}</span></p>` : ''}
      </div>
    </section>
    <section>
      <h2>Bestellte Artikel</h2>
      <table>
        <thead><tr><th>Artikel</th><th>Menge</th><th>Preis</th></tr></thead>
        <tbody>${artikelZeilen}</tbody>
      </table>
    </section>
    <section>
      <h2>Versand (Status: ${escapeHtml(beleg.versandstatus)})</h2>
      ${sendungenHtml}
    </section>
  </main>
  <footer>Automatisch generierter Nachweis aus dem Shopify-Bestellsystem · nicht öffentlich verlinkt, nur für dich zum Aufbewahren/Vorzeigen bei Bedarf</footer>
</body>
</html>
`;
}
