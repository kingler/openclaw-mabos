/**
 * Cache-backed capability-gap query helpers.
 *
 * The gap is a derived view (Plan 2 amendment): there is no "gap fact" in the
 * store. These helpers read through the GapCache, which lazily derives and
 * invalidates on belief.committed events.
 */

import type { GapCache } from "./gap-cache.js";

/**
 * Rank the capabilities the agent is missing across its active goals, most
 * frequently-required first. Used by the BDI prompt builder to surface the
 * highest-leverage gaps.
 */
export async function topMissingForAgent(
  cache: GapCache,
  agentId: string,
  activeGoalIds: string[],
  limit = 5,
): Promise<string[]> {
  const gaps = await cache.byAgent(agentId, activeGoalIds);
  const counts = new Map<string, number>();
  for (const g of gaps) {
    for (const c of g.missing) counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

/** Missing capability ids for a single (agent, goal) pair. */
export async function gapForGoal(
  cache: GapCache,
  agentId: string,
  goalId: string,
): Promise<string[]> {
  const g = await cache.get(agentId, goalId);
  return g.missing.map((c) => c.id);
}
