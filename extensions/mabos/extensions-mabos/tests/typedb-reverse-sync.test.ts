/**
 * TypeDB Reverse Sync tests — graceful degradation when TypeDB is down.
 */
import { describe, it, expect, vi } from "vitest";
import { findNewerTypeDBFacts, reconcileTypeDBToJSON } from "../src/sync/typedb-reverse-sync.js";

const WORKSPACE = "/tmp/mabos-typedb-reverse-test";

function mockApi(): any {
  return {
    config: { agents: { defaults: { workspace: WORKSPACE } } },
    pluginConfig: {},
    logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
  };
}

describe("TypeDB reverse sync", () => {
  it("findNewerTypeDBFacts returns empty array when TypeDB is unavailable", async () => {
    const facts = await findNewerTypeDBFacts("cfo");
    expect(facts).toEqual([]);
  });

  it("reconcileTypeDBToJSON returns zero-change result when TypeDB is unavailable", async () => {
    const result = await reconcileTypeDBToJSON(mockApi(), "cfo");
    expect(result.patched).toBe(0);
    expect(result.skipped).toBe(true);
    expect(result.error).toContain("unavailable");
  });
});
