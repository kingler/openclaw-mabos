/**
 * Capability gap cache with event-driven invalidation.
 *
 * Replaces the forward-chain wrapper approach (rejected in Plan 2's
 * amendment): the gap is a *derived view* computed lazily, cached by
 * `(agentId, goalId)`, and invalidated when `belief.committed` events
 * touch a relevant subject.
 *
 * Wire-up: build-ctx.ts subscribes the cache to its event bus; downstream
 * consumers (BDI prompt builder, agent dashboards) call `get` / `byAgent`
 * to read.
 */

import { deriveGap } from "./gap-derivation.js";
import type { CapabilityCatalog, CapabilityGap } from "./types.js";

export interface BeliefCommittedTouches {
  touchedAgents?: string[];
  touchedGoals?: string[];
  touchedCapabilities?: string[];
}

type DeriveFn = (agentId: string, goalId: string) => Promise<CapabilityGap>;

export class GapCache {
  private cache = new Map<string, CapabilityGap>(); // key: `${agentId}::${goalId}`

  constructor(private derive: DeriveFn) {}

  static fromCatalog(catalog: CapabilityCatalog): GapCache {
    return new GapCache((agentId, goalId) => deriveGap(agentId, goalId, catalog));
  }

  async get(agentId: string, goalId: string): Promise<CapabilityGap> {
    const key = `${agentId}::${goalId}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const gap = await this.derive(agentId, goalId);
    this.cache.set(key, gap);
    return gap;
  }

  async byAgent(agentId: string, goals: string[]): Promise<CapabilityGap[]> {
    return Promise.all(goals.map((g) => this.get(agentId, g)));
  }

  onBeliefCommitted(ev: BeliefCommittedTouches): void {
    const touchedAgents = new Set(ev.touchedAgents ?? []);
    const touchedGoals = new Set(ev.touchedGoals ?? []);
    const capsTouched = (ev.touchedCapabilities?.length ?? 0) > 0;
    if (touchedAgents.size === 0 && touchedGoals.size === 0 && !capsTouched) return;
    if (capsTouched) {
      this.cache.clear();
      return;
    }
    for (const key of [...this.cache.keys()]) {
      const [agentId, goalId] = key.split("::");
      if (touchedAgents.has(agentId) || touchedGoals.has(goalId)) {
        this.cache.delete(key);
      }
    }
  }

  /** Test/observability: number of cached entries. */
  size(): number {
    return this.cache.size;
  }
}
