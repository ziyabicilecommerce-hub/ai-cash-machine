import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Persistenter Zustand zwischen Workflow-Läufen (Ersatz für n8n's $getWorkflowStaticData).
// Wird als JSON-Datei im Repo abgelegt; die GitHub Action committed Änderungen automatisch zurück.
const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_DIR = join(__dirname, '..', 'state');

export function loadState(name) {
  const file = join(STATE_DIR, `${name}.json`);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveState(name, data) {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  const file = join(STATE_DIR, `${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 2));
}
