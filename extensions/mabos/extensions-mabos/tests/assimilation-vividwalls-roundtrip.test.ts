/**
 * VividWalls round-trip integration test.
 *
 * Demonstrates the full assimilation pipeline end-to-end with a realistic
 * 3-bullet input: one valid fact (accepted), one prose bullet (quarantined,
 * unliftable), one referencing an unknown Edition (quarantined, mint-denied).
 *
 * VividWalls is a *fixture tenant*; the same machinery serves any tenant via
 * a different domain ontology — see CLAUDE.md "Multi-tenant scope" notes
 * and docs/plans/2026-05-02-llm-output-assimilation-pipeline.md §0.
 */

import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import type { EntityResolver, FactTypeIndex } from "../src/cognitive/assimilation/bind.js";
import type { CommitCtx, TypeDBAdapter, EventBus } from "../src/cognitive/assimilation/commit.js";
import { assimilate } from "../src/cognitive/assimilation/index.js";
import { NaryFactStore } from "../src/cognitive/assimilation/nary-store.js";
import { QuarantineStore } from "../src/cognitive/assimilation/quarantine.js";
import type {
  ValidatedBelief,
  Provenance,
  LlmAction,
} from "../src/cognitive/assimilation/types.js";
import {
  compileFactTemplates,
  type FactTemplate,
} from "../src/cognitive/assimilation/vocabulary-index.js";

const factTypes = [
  {
    id: "vw:editionMaxQuantityFact",
    reading: "edition has maximum quantity",
    arity: 2,
    roles: [
      { roleName: "edition", rolePlayer: "vw:Edition" },
      { roleName: "qty", rolePlayer: "xsd:integer" },
    ],
  },
];

describe("VividWalls assimilation round-trip", () => {
  it("accepts a valid fact, quarantines an unliftable bullet, quarantines an unknown entity", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vw-roundtrip-"));
    const naryStore = new NaryFactStore(join(dir, "nary.json"));
    const quarantineStore = new QuarantineStore(join(dir, "quarantine.jsonl"));

    const knownLabels: Record<string, string> = {
      "Spring Bloom #3": "vw:Edition/spring-bloom-3",
    };
    const resolver: EntityResolver = {
      resolveOrMint: async (label, concept) => {
        if (knownLabels[label]) return { ok: true, iri: knownLabels[label] };
        if (concept === "vw:Edition") return { ok: false, reason: "mint-denied" };
        return {
          ok: true,
          iri: `${concept}/${label.replace(/\s+/g, "-").toLowerCase()}`,
          minted: true,
        };
      },
    };

    const factTypeIndex: FactTypeIndex = {
      rolePlayer: (_ft, role) => (role === "edition" ? "vw:Edition" : "xsd:integer"),
    };

    const typedb: TypeDBAdapter = {
      assertVersioned: vi.fn(async (v: ValidatedBelief, p: Provenance) => {
        await naryStore.assertNary({
          factTypeId: v.factTypeId,
          roles: v.roles,
          provenance: { run_id: p.run_id, ts: p.ts },
        });
      }),
    };

    const bus: EventBus = { publish: vi.fn().mockResolvedValue(undefined) };

    const templates: FactTemplate[] = compileFactTemplates(factTypes);

    const actions: LlmAction[] = [
      { type: "belief_update", data: { content: "Spring Bloom #3 has maximum quantity 50" } },
      { type: "belief_update", data: { content: "Vibe is off this week" } },
      { type: "belief_update", data: { content: "Phantom Edition X-12 has maximum quantity 4" } },
    ];

    const ctx = {
      agentId: "vw-cfo",
      agentDir: dir,
      templates,
      resolver,
      factTypeIndex,
      typedb,
      bus,
      quarantineStore,
      shape: { targetClass: "any", properties: [] as never[] },
      rules: [],
      store: { countFacts: async () => 0, getProperty: async () => 0 },
      provenance: {
        run_id: "r1",
        model: "test",
        prompt_hash: "h",
        signal_ids: ["s1"],
        ts: new Date().toISOString(),
      },
    } satisfies Parameters<typeof assimilate>[1];

    const r = await assimilate(actions, ctx);

    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0].factTypeId).toBe("vw:editionMaxQuantityFact");
    expect(r.accepted[0].roles.edition).toBe("vw:Edition/spring-bloom-3");
    expect(r.accepted[0].roles.qty).toBe("50");

    expect(r.quarantined).toHaveLength(2);
    const reasons = r.quarantined.map((q) => q.reason).sort();
    expect(reasons).toEqual(["unknown-mint-denied", "unliftable"]);

    expect(r.rejected).toHaveLength(0);

    expect(typedb.assertVersioned).toHaveBeenCalledTimes(1);
    expect(bus.publish).toHaveBeenCalledWith(expect.objectContaining({ type: "belief.committed" }));

    // Belief.md projection contains the accepted fact only
    const beliefs = await readFile(join(dir, "Beliefs.md"), "utf-8");
    expect(beliefs).toContain("vw:Edition/spring-bloom-3");
    expect(beliefs).not.toContain("Phantom Edition X-12");
    expect(beliefs).not.toContain("Vibe is off");

    // Quarantine.jsonl contains both quarantined entries with structured detail
    const quarantineRaw = await readFile(join(dir, "quarantine.jsonl"), "utf-8");
    const lines = quarantineRaw.split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    const parsed = lines.map((l) => JSON.parse(l));
    const reasonsFromFile = parsed.map((p) => p.reason).sort();
    expect(reasonsFromFile).toEqual(["unknown-mint-denied", "unliftable"]);

    // N-ary store contains exactly one fact
    expect(await naryStore.countNary("vw:editionMaxQuantityFact", {})).toBe(1);
  });
});
