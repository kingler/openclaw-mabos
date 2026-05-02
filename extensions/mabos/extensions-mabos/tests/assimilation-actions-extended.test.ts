import { mkdtempSync } from "node:fs";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import type { CommitCtx, TypeDBAdapter, EventBus } from "../src/cognitive/assimilation/commit.js";
import { assimilate } from "../src/cognitive/assimilation/index.js";
import { NaryFactStore } from "../src/cognitive/assimilation/nary-store.js";
import { QuarantineStore } from "../src/cognitive/assimilation/quarantine.js";
import type { ShapeNode } from "../src/cognitive/assimilation/shacl-mini.js";
import type { LlmAction } from "../src/cognitive/assimilation/types.js";

async function makeCtx(opts?: { goalsMdContent?: string }) {
  const dir = mkdtempSync(join(tmpdir(), "assim-actions-"));
  if (opts?.goalsMdContent !== undefined) {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "Goals.md"), opts.goalsMdContent, "utf-8");
  }
  const naryStore = new NaryFactStore(join(dir, "nary.json"));
  const quarantineStore = new QuarantineStore(join(dir, "quarantine.jsonl"));
  const typedb: TypeDBAdapter = {
    assertVersioned: vi.fn(async (v, p) => {
      await naryStore.assertNary({
        factTypeId: v.factTypeId,
        roles: v.roles,
        provenance: { run_id: p.run_id, ts: p.ts },
      });
    }),
  };
  const bus: EventBus = { publish: vi.fn().mockResolvedValue(undefined) };
  const permissiveShape: ShapeNode = { targetClass: "any", properties: [] };
  return {
    dir,
    naryStore,
    typedb,
    bus,
    ctx: {
      agentId: "test-cfo",
      agentDir: dir,
      templates: [],
      resolver: {
        resolveOrMint: async () => ({ ok: false as const, reason: "mint-denied" as const }),
      },
      factTypeIndex: { rolePlayer: () => "owl:Thing" },
      typedb,
      bus,
      quarantineStore,
      shape: permissiveShape,
      rules: [],
      store: { countFacts: async () => 0, getProperty: async () => 0 },
      provenance: {
        run_id: "r1",
        model: "test",
        prompt_hash: "",
        signal_ids: [],
        ts: new Date().toISOString(),
      },
    } satisfies Parameters<typeof assimilate>[1],
  };
}

describe("assimilate — goal_progress", () => {
  it("commits a goal-progress fact when goal_id is known and progress is in [0,100]", async () => {
    const { ctx, dir, typedb, naryStore } = await makeCtx({
      goalsMdContent: "### G-CFO-001: Increase revenue\n\n### G-CFO-002: Reduce churn\n",
    });
    const actions: LlmAction[] = [
      {
        type: "goal_progress",
        data: { goalId: "G-CFO-001", progress: 35, reason: "analysis done" },
      },
    ];
    const r = await assimilate(actions, ctx);
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0].factTypeId).toBe("mabos:GoalProgressFact");
    expect(r.accepted[0].roles.goal).toBe("G-CFO-001");
    expect(r.accepted[0].roles.progress).toBe("35");
    expect(typedb.assertVersioned).toHaveBeenCalled();
    expect(await naryStore.countNary("mabos:GoalProgressFact", { goal: "G-CFO-001" })).toBe(1);
    const goalsMdAfter = await readFile(join(dir, "Goals.md"), "utf-8").catch(() => "");
    expect(goalsMdAfter).toContain("G-CFO-001");
  });

  it("quarantines a goal_progress against an unknown G-ID", async () => {
    const { ctx } = await makeCtx({ goalsMdContent: "### G-CFO-001: x\n" });
    const actions: LlmAction[] = [
      { type: "goal_progress", data: { goalId: "G-PHANTOM-999", progress: 20, reason: "" } },
    ];
    const r = await assimilate(actions, ctx);
    expect(r.accepted).toHaveLength(0);
    expect(r.quarantined).toHaveLength(1);
    expect(r.quarantined[0].reason).toBe("unknown-goal");
  });

  it("rejects a progress out of [0,100] via SHACL hard fail", async () => {
    const { ctx } = await makeCtx({ goalsMdContent: "### G-CFO-001: x\n" });
    const tightCtx = {
      ...ctx,
      shape: {
        targetClass: "mabos:GoalProgressFact",
        properties: [
          {
            path: "role:progress",
            minCount: 1,
            maxCount: 1,
            datatype: "xsd:string" as const,
          },
        ],
      } as ShapeNode,
    };
    // SHACL doesn't enforce numeric range on string-typed roles; instead,
    // assimilate's own pre-check rejects out-of-range progress.
    const actions: LlmAction[] = [
      { type: "goal_progress", data: { goalId: "G-CFO-001", progress: 150, reason: "" } },
    ];
    const r = await assimilate(actions, tightCtx);
    expect(r.accepted).toHaveLength(0);
    expect([...r.quarantined, ...r.rejected]).toHaveLength(1);
    const entry = [...r.quarantined, ...r.rejected][0];
    expect(entry.reason).toBe("progress-out-of-range");
  });
});

describe("assimilate — new_intention", () => {
  it("commits a new-intention fact carrying the content as a literal role", async () => {
    const { ctx, typedb, naryStore } = await makeCtx();
    const actions: LlmAction[] = [
      { type: "new_intention", data: { content: "Investigate Q3 ad spend variance" } },
    ];
    const r = await assimilate(actions, ctx);
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0].factTypeId).toBe("mabos:NewIntentionFact");
    expect(r.accepted[0].roles.content).toBe("Investigate Q3 ad spend variance");
    expect(typedb.assertVersioned).toHaveBeenCalled();
    expect(await naryStore.countNary("mabos:NewIntentionFact", {})).toBe(1);
  });

  it("quarantines an empty new_intention", async () => {
    const { ctx } = await makeCtx();
    const actions: LlmAction[] = [{ type: "new_intention", data: { content: "  " } }];
    const r = await assimilate(actions, ctx);
    expect(r.accepted).toHaveLength(0);
    expect(r.quarantined).toHaveLength(1);
    expect(r.quarantined[0].reason).toBe("empty-content");
  });
});
