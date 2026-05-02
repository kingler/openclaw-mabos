/**
 * Pattern-based lifter: turn a free-form NL bullet from an LLM into a
 * structured fact-type Candidate by matching against compiled templates.
 *
 * Cheap, deterministic, and the first lifter tried. The LLM-based fallback
 * (TBD in a follow-up plan) only runs when this returns null.
 */

import type { Candidate } from "./types.js";
import type { FactTemplate } from "./vocabulary-index.js";

const PATTERN_CONFIDENCE = 0.9;

export function liftByPattern(bullet: string, templates: FactTemplate[]): Candidate | null {
  const text = bullet.trim();
  for (const t of templates) {
    const m = text.match(t.pattern);
    if (!m?.groups) continue;
    const roles: Record<string, unknown> = {};
    for (const r of t.roles) {
      const raw = m.groups[r];
      if (raw === undefined) return null;
      roles[r] = t.caster[r]?.(raw) ?? raw;
    }
    return { factTypeId: t.factTypeId, roles, source: "pattern", confidence: PATTERN_CONFIDENCE };
  }
  return null;
}
