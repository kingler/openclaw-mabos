/**
 * Traversal queries over a typed Goal Net graph.
 *
 * Three queries cover the deliberative use cases:
 *   - subgoalsOf(g, id)         — direct children
 *   - blockingSubgoals(g, id)   — children whose unsatisfied state holds
 *                                 the parent back, given the parent's relType
 *   - satisfactionRollup(g, id) — recursive satisfaction with relType semantics
 *
 * Relationship-type semantics for satisfaction rollup:
 *   - all-of, sequence, sequential, synchronization, concurrency → min
 *   - one-of, choice                                             → max
 */

import type { GoalGraph, GoalNode, GoalRelType } from "./types.js";

const ALL_OF_TYPES = new Set<GoalRelType>([
  "all-of",
  "sequence",
  "sequential",
  "synchronization",
  "concurrency",
]);

const ONE_OF_TYPES = new Set<GoalRelType>(["one-of", "choice"]);

export function subgoalsOf(g: GoalGraph, parentId: string): GoalNode[] {
  const ids = g.byParent.get(parentId) ?? [];
  return ids.map((id) => g.nodes.get(id)).filter((n): n is GoalNode => n !== undefined);
}

function relTypeOf(g: GoalGraph, parentId: string): GoalRelType | null {
  const e = g.edges.find((edge) => edge.from === parentId);
  return e?.relType ?? null;
}

export function blockingSubgoals(g: GoalGraph, parentId: string): GoalNode[] {
  const subs = subgoalsOf(g, parentId);
  if (subs.length === 0) return [];
  const rel = relTypeOf(g, parentId);
  if (rel && ONE_OF_TYPES.has(rel)) {
    // Blocked only if no child reaches full satisfaction
    return subs.some((s) => (s.satisfaction ?? 0) >= 1.0) ? [] : subs;
  }
  // Default (all-of-style): every unsatisfied child blocks
  return subs.filter((s) => (s.satisfaction ?? 0) < 1.0);
}

export function satisfactionRollup(g: GoalGraph, parentId: string): number {
  const subs = subgoalsOf(g, parentId);
  if (subs.length === 0) {
    return g.nodes.get(parentId)?.satisfaction ?? 0;
  }
  const rel = relTypeOf(g, parentId);
  const sats = subs.map((s) => satisfactionRollup(g, s.id));
  if (rel && ONE_OF_TYPES.has(rel)) return Math.max(...sats);
  if (rel && ALL_OF_TYPES.has(rel)) return Math.min(...sats);
  // Unknown relType: average
  return sats.reduce((a, b) => a + b, 0) / sats.length;
}
