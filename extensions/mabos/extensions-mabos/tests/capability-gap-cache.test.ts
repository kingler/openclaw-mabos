import { describe, it, expect, vi } from "vitest";
import { GapCache } from "../src/capability/gap-cache.js";
import type { CapabilityCatalog, CapabilityGap } from "../src/capability/types.js";

describe("GapCache", () => {
  it("caches deriveGap results and serves second call from cache", async () => {
    const derive = vi.fn(
      async (agentId: string, goalId: string): Promise<CapabilityGap> => ({
        agentId,
        goalId,
        missing: [],
        ts: new Date().toISOString(),
      }),
    );
    const cache = new GapCache(derive);
    await cache.get("a", "g1");
    await cache.get("a", "g1");
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it("invalidates only entries whose goal is touched", async () => {
    const derive = vi.fn(
      async (agentId: string, goalId: string): Promise<CapabilityGap> => ({
        agentId,
        goalId,
        missing: [],
        ts: new Date().toISOString(),
      }),
    );
    const cache = new GapCache(derive);
    await cache.get("a", "g1");
    await cache.get("a", "g2");
    cache.onBeliefCommitted({ touchedGoals: ["g1"] });
    await cache.get("a", "g1"); // recomputed
    await cache.get("a", "g2"); // still cached
    expect(derive).toHaveBeenCalledTimes(3);
  });

  it("invalidates entries when touchedAgents is set", async () => {
    const derive = vi.fn(
      async (agentId: string, goalId: string): Promise<CapabilityGap> => ({
        agentId,
        goalId,
        missing: [],
        ts: new Date().toISOString(),
      }),
    );
    const cache = new GapCache(derive);
    await cache.get("a", "g1");
    await cache.get("b", "g1");
    cache.onBeliefCommitted({ touchedAgents: ["a"] });
    await cache.get("a", "g1");
    await cache.get("b", "g1");
    expect(derive).toHaveBeenCalledTimes(3);
  });

  it("invalidates everything when touchedCapabilities is set", async () => {
    const derive = vi.fn(
      async (agentId: string, goalId: string): Promise<CapabilityGap> => ({
        agentId,
        goalId,
        missing: [],
        ts: new Date().toISOString(),
      }),
    );
    const cache = new GapCache(derive);
    await cache.get("a", "g1");
    await cache.get("b", "g2");
    cache.onBeliefCommitted({ touchedCapabilities: ["cap:X"] });
    await cache.get("a", "g1");
    await cache.get("b", "g2");
    expect(derive).toHaveBeenCalledTimes(4);
  });

  it("no-ops when no fields are set on the event", async () => {
    const derive = vi.fn(
      async (agentId: string, goalId: string): Promise<CapabilityGap> => ({
        agentId,
        goalId,
        missing: [],
        ts: new Date().toISOString(),
      }),
    );
    const cache = new GapCache(derive);
    await cache.get("a", "g1");
    cache.onBeliefCommitted({});
    await cache.get("a", "g1");
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it("byAgent fetches multiple goals at once", async () => {
    const catalog: CapabilityCatalog = {
      requiredFor: async () => [{ id: "cap:X", label: "" }],
      heldBy: async () => [],
    };
    const cache = GapCache.fromCatalog(catalog);
    const gaps = await cache.byAgent("a", ["g1", "g2", "g3"]);
    expect(gaps).toHaveLength(3);
    expect(gaps.every((g) => g.missing.map((c) => c.id).includes("cap:X"))).toBe(true);
  });
});
