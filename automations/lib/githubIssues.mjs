// Erstellt echte GitHub Issues als Kundenservice-Tickets. Nutzt den von
// GitHub Actions automatisch bereitgestellten GITHUB_TOKEN + GITHUB_REPOSITORY
// (Format "owner/repo") - kein zusätzlicher Secret nötig. Funktioniert nur
// innerhalb von GitHub Actions; außerhalb (z.B. lokal) wird nur geloggt.
export async function erstelleTicket({ title, body, labels }) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    console.log('[github-issues] GITHUB_TOKEN/GITHUB_REPOSITORY nicht verfügbar - Ticket nur geloggt:', title);
    return { skipped: true };
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title, body, labels: labels || [] }),
  });
  if (!res.ok) {
    console.error('[github-issues] Fehler beim Ticket-Erstellen:', await res.text());
    return { error: true };
  }
  return res.json();
}
