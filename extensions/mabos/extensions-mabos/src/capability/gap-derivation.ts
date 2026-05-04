/**
 * Pure capability-gap derivation: ΔS = S' − S₀ (GenMentor §4.1).
 *
 * Stateless and side-effect-free. The cache (gap-cache.ts, Task 9) wraps this
 * with memoization and event-driven invalidation; both consumers
 * (BDI prompt builder, agent dashboards) read through the cache.
 */

import type { CapabilityCatalog, CapabilityGap, CapabilityRef } from "./types.js";

export async function deriveGap(
  agentId: string,
  goalId: string,
  catalog: CapabilityCatalog,
): Promise<CapabilityGap> {
  const required = await catalog.requiredFor(goalId);
  const held = await catalog.heldBy(agentId);
  const heldIds = new Set(held.map((c) => c.id));
  const missing: CapabilityRef[] = required.filter((c) => !heldIds.has(c.id));
  return {
    agentId,
    goalId,
    missing,
    ts: new Date().toISOString(),
  };
}
