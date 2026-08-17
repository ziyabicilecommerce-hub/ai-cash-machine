// Löst einen ANDEREN Workflow in diesem Repo sofort aus (statt auf dessen
// eigenen Cron-Zeitplan zu warten) - der eigentliche Kern eines "Orchestrators":
// eine Automation trifft eine Entscheidung und STARTET eine andere Automation,
// statt die Entscheidung nur als Empfehlung liegen zu lassen.
//
// Sicherheitsprinzip: WELCHER Workflow ausgelöst wird, entscheidet
// ausschließlich fester Code (deterministische if-Bedingungen im Aufrufer,
// z.B. 60-chef-agent.mjs) - NIE ein freier LLM-Textvorschlag. Claude darf die
// Lage einschätzen, aber nicht selbst wählen, welches Skript startet.
const API_VERSION = '2022-11-28';

export async function dispatchWorkflow(workflowFile, { ref = 'main' } = {}) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY; // von GitHub Actions automatisch gesetzt, z.B. "owner/repo"
  if (!token || !repo) {
    console.log(`[github-actions] GITHUB_TOKEN/GITHUB_REPOSITORY fehlt - kann ${workflowFile} nicht auslösen (lokal/Test?).`);
    return { ausgeloest: false, grund: 'kein-token' };
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflowFile}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref }),
  });

  if (res.status === 204) {
    return { ausgeloest: true };
  }
  const text = await res.text();
  console.error(`[github-actions] Auslösen von ${workflowFile} fehlgeschlagen (${res.status}):`, text);
  return { ausgeloest: false, grund: `http-${res.status}` };
}
