import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
/**
 * Fact store integrity tests — contradiction detection integration.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createFactStoreTools } from "../src/tools/fact-store.js";

const WORKSPACE = "/tmp/mabos-fact-integrity-test";

function mockApi(): any {
  return {
    config: { agents: { defaults: { workspace: WORKSPACE } } },
    pluginConfig: {},
    logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
  };
}

async function setupStore(agentId: string, facts: any[] = []) {
  const dir = join(WORKSPACE, "agents", agentId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "facts.json"), JSON.stringify({ facts, version: 1 }));
}

async function readStore(agentId: string) {
  const raw = await readFile(join(WORKSPACE, "agents", agentId, "facts.json"), "utf-8");
  return JSON.parse(raw);
}

describe("fact_assert contradiction detection", () => {
  let tools: any[];
  let factAssert: any;

  beforeEach(async () => {
    await rm(WORKSPACE, { recursive: true, force: true });
    tools = createFactStoreTools(mockApi());
    factAssert = tools.find((t) => t.name === "fact_assert");
  });

  it("allows first assertion with no existing facts", async () => {
    await setupStore("ceo", []);
    const result = await factAssert.execute("test", {
      agent_id: "ceo",
      subject: "vividwalls",
      predicate: "hasTotalRevenue",
      object: "3498",
      confidence: 1.0,
      source: "shopify-sync-2026-03-23",
    });
    expect(result.content[0].text).toContain("asserted");
    const store = await readStore("ceo");
    expect(store.facts).toHaveLength(1);
  });

  it("blocks lower-authority source contradicting higher-authority fact", async () => {
    await setupStore("ceo", [
      {
        id: "F-existing",
        subject: "vividwalls",
        predicate: "hasTotalRevenue",
        object: "3498",
        confidence: 1.0,
        source: "shopify-sync-2026-03-23",
        created_at: "2026-03-23T10:00:00Z",
        updated_at: "2026-03-23T10:00:00Z",
      },
    ]);

    const result = await factAssert.execute("test", {
      agent_id: "ceo",
      subject: "vividwalls",
      predicate: "hasTotalRevenue",
      object: "116400",
      confidence: 1.0,
      source: "heartbeat-tracking",
    });
    expect(result.content[0].text).toContain("BLOCKED");

    // Verify original fact is unchanged
    const store = await readStore("ceo");
    expect(store.facts).toHaveLength(1);
    expect(store.facts[0].object).toBe("3498");
  });

  it("allows higher-authority source to update lower-authority fact", async () => {
    await setupStore("ceo", [
      {
        id: "F-existing",
        subject: "vividwalls",
        predicate: "hasTotalRevenue",
        object: "116400",
        confidence: 0.95,
        source: "heartbeat-tracking",
        created_at: "2026-03-21T20:00:00Z",
        updated_at: "2026-03-21T20:00:00Z",
      },
    ]);

    const result = await factAssert.execute("test", {
      agent_id: "ceo",
      subject: "vividwalls",
      predicate: "hasTotalRevenue",
      object: "3498",
      confidence: 1.0,
      source: "shopify-sync-2026-03-23",
    });
    expect(result.content[0].text).toContain("asserted");
  });

  it("warns on same-tier contradiction but still writes", async () => {
    await setupStore("ceo", [
      {
        id: "F-existing",
        subject: "vividwalls",
        predicate: "hasTotalRevenue",
        object: "3498",
        confidence: 1.0,
        source: "shopify-sync-2026-03-23",
        created_at: "2026-03-23T10:00:00Z",
        updated_at: "2026-03-23T10:00:00Z",
      },
    ]);

    const result = await factAssert.execute("test", {
      agent_id: "ceo",
      subject: "vividwalls",
      predicate: "hasTotalRevenue",
      object: "3598",
      confidence: 1.0,
      source: "shopify-sync-2026-03-26",
    });
    // Same-tier updates are allowed with a warning
    expect(result.content[0].text).toMatch(/WARNING|asserted/);
  });

  it("does not flag when object values are numerically equivalent", async () => {
    await setupStore("ceo", [
      {
        id: "F-existing",
        subject: "vividwalls",
        predicate: "hasTotalRevenue",
        object: "3498",
        confidence: 1.0,
        source: "shopify-sync-2026-03-23",
        created_at: "2026-03-23T10:00:00Z",
        updated_at: "2026-03-23T10:00:00Z",
      },
    ]);

    const result = await factAssert.execute("test", {
      agent_id: "ceo",
      subject: "vividwalls",
      predicate: "hasTotalRevenue",
      object: "$3,498.00",
      confidence: 1.0,
      source: "shopify-api-2026-03-26",
    });
    expect(result.content[0].text).not.toContain("BLOCKED");
  });
});

describe("fact_assert contradiction detection — non-financial predicates", () => {
  let tools: any[];
  let factAssert: any;

  beforeEach(async () => {
    await rm(WORKSPACE, { recursive: true, force: true });
    tools = createFactStoreTools(mockApi());
    factAssert = tools.find((t) => t.name === "fact_assert");
  });

  it("blocks T4 source overwriting T1 fact for non-financial predicate", async () => {
    await setupStore("ceo", [
      {
        id: "F-existing",
        subject: "vividwalls",
        predicate: "hasCustomerCount",
        object: "47",
        confidence: 1.0,
        source: "shopify-sync-2026-03-23",
        created_at: "2026-03-23T10:00:00Z",
        updated_at: "2026-03-23T10:00:00Z",
      },
    ]);

    const result = await factAssert.execute("test", {
      agent_id: "ceo",
      subject: "vividwalls",
      predicate: "hasCustomerCount",
      object: "5000",
      confidence: 1.0,
      source: "enhanced_bdi_heartbeat",
    });
    expect(result.content[0].text).toContain("BLOCKED");

    const store = await readStore("ceo");
    expect(store.facts).toHaveLength(1);
    expect(store.facts[0].object).toBe("47");
  });
});
