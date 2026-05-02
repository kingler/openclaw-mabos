/**
 * Commit stage — the only place that writes ValidatedBeliefs.
 *
 * Three sinks, in order:
 *   1. TypeDB (canonical source of truth for n-ary SBVR facts).
 *   2. Beliefs.md projection (human-readable view; not source of truth).
 *   3. Event bus (publishes belief.committed for downstream consumers —
 *      capability-gap cache invalidation, reflector loop, dashboards).
 *
 * Forward-chain recursion (deriving qualitative facts via pattern rules) is
 * handled by the orchestrator at index.ts, not here. Aggregate-style derived
 * views (capability gap) live outside the commit path entirely (Plan 2).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ValidatedBelief, Provenance } from "./types.js";

export interface TypeDBAdapter {
  assertVersioned(v: ValidatedBelief, p: Provenance): Promise<void>;
}

export interface EventBus {
  publish(event: {
    type: "belief.committed";
    fact: ValidatedBelief;
    provenance: Provenance;
  }): Promise<void>;
}

export interface CommitCtx {
  agentDir: string;
  typedb: TypeDBAdapter;
  bus: EventBus;
}

function renderBelief(v: ValidatedBelief, p: Provenance): string {
  const roleStr = Object.entries(v.roles)
    .map(([k, val]) => `${k}=${val}`)
    .join(", ");
  return `- [${v.factTypeId}] ${roleStr} (conf=${v.confidence.toFixed(2)}, src=${p.lift_source}, run=${p.run_id})`;
}

async function appendBeliefMd(agentDir: string, line: string): Promise<void> {
  await mkdir(agentDir, { recursive: true });
  const beliefsPath = join(agentDir, "Beliefs.md");
  let beliefs = "";
  try {
    beliefs = await readFile(beliefsPath, "utf-8");
  } catch {
    /* file does not exist yet */
  }
  if (!beliefs) beliefs = `# Beliefs\n\n## Current Beliefs\n`;
  if (!beliefs.includes("## Current Beliefs")) beliefs += "\n\n## Current Beliefs\n";
  const idx = beliefs.indexOf("## Current Beliefs");
  const insertAt = beliefs.indexOf("\n## ", idx + "## Current Beliefs".length);
  const insertion = `\n${line}`;
  beliefs =
    insertAt === -1
      ? beliefs + insertion
      : beliefs.slice(0, insertAt) + insertion + beliefs.slice(insertAt);
  await writeFile(beliefsPath, beliefs, "utf-8");
}

export async function commit(v: ValidatedBelief, ctx: CommitCtx, p?: Provenance): Promise<void> {
  const provenance: Provenance = p ?? {
    run_id: "unknown",
    model: "unknown",
    prompt_hash: "",
    signal_ids: [],
    ts: new Date().toISOString(),
    lift_source: v.source,
    confidence: v.confidence,
  };

  // 1. TypeDB versioned write
  await ctx.typedb.assertVersioned(v, provenance);

  // 2. Markdown projection
  await appendBeliefMd(ctx.agentDir, renderBelief(v, provenance));

  // 3. Event bus
  await ctx.bus.publish({ type: "belief.committed", fact: v, provenance });
}
