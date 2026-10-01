// Liest den Plan des Engpass-Chefs (automations/state/agenten-plan.json). Nur frische Plaene (< 36 h)
// zaehlen; eine von Hand gesetzte Variable oder Eingabe beim Start hat immer Vorrang.
import { readFileSync, existsSync } from 'node:fs';

export const PLAN = 'automations/state/agenten-plan.json';

export function planWert(name, standard, { pfad = PLAN, jetzt = Date.now() } = {}) {
  try {
    if (!existsSync(pfad)) return standard;
    const p = JSON.parse(readFileSync(pfad, 'utf8'));
    if (!(jetzt - Date.parse(p.stand) < 36 * 36e5)) return standard;
    const w = Number(p.plan?.[name]);
    return Number.isFinite(w) && w > 0 ? w : standard;
  } catch { return standard; }
}
