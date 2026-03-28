/**
 * Direct API Sync — assertFactDirect tests.
 * TDD: these tests should fail until assertFactDirect is implemented.
 */
import { rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { assertFactDirect, type DirectFactParams } from "../src/tools/fact-store.js";

const WORKSPACE = "/tmp/mabos-direct-sync-test";

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

describe("assertFactDirect", () => {
  beforeEach(async () => {
    await rm(WORKSPACE, { recursive: true, force: true });
  });

  it("writes a fact and returns fact ID", async () => {
    await setupStore("cfo", []);
    const params: DirectFactParams = {
      agent_id: "cfo",
      subject: "vividwalls",
      predicate: "hasTotalRevenue",
      object: "3498",
      confidence: 1.0,
      source: "shopify-sync-2026-03-28",
    };
    const result = await assertFactDirect(mockApi(), params);
    expect(result.factId).toBeTruthy();
    expect(result.action).toBe("asserted");
    expect(result.message).toContain("asserted");

    const store = await readStore("cfo");
    expect(store.facts).toHaveLength(1);
    expect(store.facts[0].object).toBe("3498");
    expect(store.facts[0].source).toBe("shopify-sync-2026-03-28");
  });

  it("updates existing fact with same SPO triple", async () => {
    const existingFact = {
      id: "F-existing-1",
      subject: "vividwalls",
      predicate: "hasTotalRevenue",
      object: "3498",
      confidence: 1.0,
      source: "shopify-sync-2026-03-27",
      created_at: "2026-03-27T04:00:00Z",
      updated_at: "2026-03-27T04:00:00Z",
    };
    await setupStore("cfo", [existingFact]);

    const params: DirectFactParams = {
      agent_id: "cfo",
      subject: "vividwalls",
      predicate: "hasTotalRevenue",
      object: "3498",
      confidence: 1.0,
      source: "shopify-sync-2026-03-28",
    };
    const result = await assertFactDirect(mockApi(), params);
    expect(result.factId).toBe("F-existing-1");
    expect(result.action).toBe("updated");

    const store = await readStore("cfo");
    expect(store.facts).toHaveLength(1);
    expect(store.facts[0].source).toBe("shopify-sync-2026-03-28");
  });

  it("blocks lower-authority source contradicting higher-authority fact", async () => {
    const existingFact = {
      id: "F-api-revenue",
      subject: "vividwalls",
      predicate: "hasTotalRevenue",
      object: "3498",
      confidence: 1.0,
      source: "shopify-sync-2026-03-27",
      created_at: "2026-03-27T04:00:00Z",
      updated_at: "2026-03-27T04:00:00Z",
    };
    await setupStore("cfo", [existingFact]);

    const params: DirectFactParams = {
      agent_id: "cfo",
      subject: "vividwalls",
      predicate: "hasTotalRevenue",
      object: "116400",
      confidence: 1.0,
      source: "heartbeat-tracking",
    };
    const result = await assertFactDirect(mockApi(), params);
    expect(result.action).toBe("blocked");
    expect(result.message).toContain("BLOCKED");

    // Verify original unchanged
    const store = await readStore("cfo");
    expect(store.facts).toHaveLength(1);
    expect(store.facts[0].object).toBe("3498");
  });
});
