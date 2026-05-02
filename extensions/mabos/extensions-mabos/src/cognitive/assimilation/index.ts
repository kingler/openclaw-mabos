/**
 * Assimilation pipeline — public surface.
 *
 * The orchestrator routes each LlmAction through lift → bind → validate →
 * commit. Failures land in the quarantine store with a typed reason; only
 * SHACL hard-fails are classified as `rejected` (the data is structurally
 * malformed and can't be reviewed). All other failures are `quarantined`
 * for human or Reflector review.
 *
 * v1 handles `belief_update` only. `goal_progress` and `new_intention`
 * land in Task 13 with the same lift→bind→validate→commit shape, parameterised
 * by fact type.
 */

import { bind, type EntityResolver, type FactTypeIndex } from "./bind.js";
import { commit, type CommitCtx } from "./commit.js";
import { liftByPattern } from "./lift-pattern.js";
import { QuarantineStore } from "./quarantine.js";
import type {
  AssimilationResult,
  LlmAction,
  Provenance,
  QuarantineEntry,
  ValidatedBelief,
} from "./types.js";
import { validate, type ValidateCtx } from "./validate.js";
import type { FactTemplate } from "./vocabulary-index.js";

export interface AssimilationCtx extends CommitCtx, ValidateCtx {
  agentId: string;
  templates: FactTemplate[];
  resolver: EntityResolver;
  factTypeIndex: FactTypeIndex;
  quarantineStore: QuarantineStore;
  provenance: Omit<Provenance, "lift_source" | "confidence">;
}

function qEntry(
  ctx: AssimilationCtx,
  action: LlmAction,
  stage: "lift" | "bind" | "validate",
  reason: string,
  detail?: unknown,
): QuarantineEntry {
  return {
    ts: new Date().toISOString(),
    agent_id: ctx.agentId,
    action,
    stage,
    reason,
    detail,
    run_id: ctx.provenance.run_id,
  };
}

export async function assimilate(
  actions: LlmAction[],
  ctx: AssimilationCtx,
): Promise<AssimilationResult> {
  const accepted: ValidatedBelief[] = [];
  const quarantined: QuarantineEntry[] = [];
  const rejected: QuarantineEntry[] = [];

  for (const action of actions) {
    if (action.type !== "belief_update") continue; // Task 13 extends to other action types
    const bullet = String((action.data as { content?: unknown }).content ?? "");
    if (!bullet.trim()) {
      quarantined.push(qEntry(ctx, action, "lift", "empty-bullet"));
      continue;
    }

    // Stage 1 — Lift
    const lifted = liftByPattern(bullet, ctx.templates);
    if (!lifted) {
      quarantined.push(qEntry(ctx, action, "lift", "unliftable"));
      continue;
    }

    // Stage 2 — Bind
    const bound = await bind(lifted, ctx.resolver, ctx.factTypeIndex);
    if (!bound.ok) {
      quarantined.push(
        qEntry(ctx, action, "bind", bound.reason, {
          role: bound.role,
          value: bound.value,
          concept: bound.concept,
        }),
      );
      continue;
    }

    // Stage 3 — Validate
    const v = await validate(bound, ctx);
    if (!v.ok) {
      const isHardFail = v.reason === "shacl";
      const entry = qEntry(ctx, action, "validate", v.reason, v);
      (isHardFail ? rejected : quarantined).push(entry);
      continue;
    }

    // Stage 4 — Commit
    const provenance: Provenance = {
      ...ctx.provenance,
      lift_source: bound.source,
      confidence: bound.confidence,
    };
    await commit(v.validated, ctx, provenance);
    accepted.push(v.validated);
  }

  await ctx.quarantineStore.appendAll([...quarantined, ...rejected]);
  return { accepted, quarantined, rejected };
}

// Re-export types and stage helpers for downstream consumers
export type {
  AssimilationResult,
  LlmAction,
  Provenance,
  QuarantineEntry,
  ValidatedBelief,
} from "./types.js";
export type { FactTemplate } from "./vocabulary-index.js";
export { compileFactTemplates } from "./vocabulary-index.js";
export type { EntityResolver, FactTypeIndex, ResolveResult } from "./bind.js";
export type { ShapeNode, PropertyConstraint, Violation, ShaclResult } from "./shacl-mini.js";
export { QuarantineStore } from "./quarantine.js";
export { NaryFactStore } from "./nary-store.js";
export type { CommitCtx, TypeDBAdapter, EventBus } from "./commit.js";
export type { ValidateCtx } from "./validate.js";
