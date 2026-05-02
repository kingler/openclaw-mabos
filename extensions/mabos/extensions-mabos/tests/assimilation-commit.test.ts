import { mkdtempSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { commit, type CommitCtx } from "../src/cognitive/assimilation/commit.js";
import type { ValidatedBelief, Provenance } from "../src/cognitive/assimilation/types.js";

function fixture(): {
  validated: ValidatedBelief;
  provenance: Provenance;
  ctx: CommitCtx & {
    typedb: { assertVersioned: ReturnType<typeof vi.fn> };
    bus: { publish: ReturnType<typeof vi.fn> };
  };
  agentDir: string;
} {
  const agentDir = mkdtempSync(join(tmpdir(), "commit-"));
  const validated: ValidatedBelief = {
    ok: true,
    factTypeId: "vw:editionMaxQuantityFact",
    roles: { edition: "vw:Edition/sb-3", qty: "50" },
    confidence: 0.9,
    source: "pattern",
  };
  const provenance: Provenance = {
    run_id: "r1",
    model: "test-model",
    prompt_hash: "h",
    signal_ids: ["s1"],
    ts: new Date().toISOString(),
    lift_source: "pattern",
    confidence: 0.9,
  };
  const ctx = {
    agentDir,
    typedb: { assertVersioned: vi.fn().mockResolvedValue(undefined) },
    bus: { publish: vi.fn().mockResolvedValue(undefined) },
  };
  return { validated, provenance, ctx, agentDir };
}

describe("commit", () => {
  it("writes to TypeDB, projects to Beliefs.md, and publishes belief.committed", async () => {
    const { validated, provenance, ctx, agentDir } = fixture();
    await commit(validated, ctx, provenance);

    expect(ctx.typedb.assertVersioned).toHaveBeenCalledTimes(1);
    expect(ctx.typedb.assertVersioned).toHaveBeenCalledWith(validated, provenance);
    expect(ctx.bus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "belief.committed", fact: validated }),
    );

    const beliefs = await readFile(join(agentDir, "Beliefs.md"), "utf-8");
    expect(beliefs).toContain("## Current Beliefs");
    expect(beliefs).toContain("vw:editionMaxQuantityFact");
    expect(beliefs).toContain("edition=vw:Edition/sb-3");
    expect(beliefs).toContain("qty=50");
    expect(beliefs).toContain("conf=0.90");
    expect(beliefs).toContain("run=r1");
  });

  it("appends a second belief under the existing Current Beliefs section", async () => {
    const { validated, provenance, ctx, agentDir } = fixture();
    await commit(validated, ctx, provenance);
    await commit(
      { ...validated, roles: { edition: "vw:Edition/sb-4", qty: "100" } },
      ctx,
      provenance,
    );
    const beliefs = await readFile(join(agentDir, "Beliefs.md"), "utf-8");
    expect((beliefs.match(/## Current Beliefs/g) ?? []).length).toBe(1);
    expect(beliefs).toContain("Edition/sb-3");
    expect(beliefs).toContain("Edition/sb-4");
  });

  it("synthesises a default provenance when not supplied", async () => {
    const { validated, ctx, agentDir } = fixture();
    await commit(validated, ctx);
    expect(ctx.typedb.assertVersioned).toHaveBeenCalled();
    const arg = ctx.typedb.assertVersioned.mock.calls[0][1] as Provenance;
    expect(arg.lift_source).toBe("pattern");
    expect(arg.confidence).toBe(0.9);
    expect(typeof arg.ts).toBe("string");
    const beliefs = await readFile(join(agentDir, "Beliefs.md"), "utf-8");
    expect(beliefs).toContain("vw:editionMaxQuantityFact");
  });
});
