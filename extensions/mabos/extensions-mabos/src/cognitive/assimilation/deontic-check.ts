/**
 * Deontic-check adapter for the assimilation pipeline.
 *
 * Runs all deontic rules constraining the bound fact's type and returns the
 * first violation (or none). Wraps evaluateDeonticRule for callers that don't
 * want to import from src/reasoning/formal directly.
 */

import {
  evaluateDeonticRule,
  type DeonticRule,
  type DeonticStore,
} from "../../reasoning/formal/deontic.js";
import type { Bound } from "./types.js";

export type DeonticCheckResult =
  | { violated: false }
  | { violated: true; ruleId: string; witness: unknown };

export async function deonticCheck(
  bound: Bound,
  rules: DeonticRule[],
  store: DeonticStore,
): Promise<DeonticCheckResult> {
  for (const rule of rules) {
    const r = await evaluateDeonticRule(bound, rule, store);
    if (r.violated) return { violated: true, ruleId: rule.id, witness: r.witness };
  }
  return { violated: false };
}
