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

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { bind, type EntityResolver, type FactTypeIndex } from "./bind.js";
import { commit, type CommitCtx } from "./commit.js";
import { liftByPattern } from "./lift-pattern.js";
import { QuarantineStore } from "./quarantine.js";
import type {
  AssimilationResult,
  Bound,
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

// ── Goal-id binding (Goals.md catalog lookup) ──────────────────────────

const GOAL_ID_PATTERN = /\bG-[\w-]+\b/g;

async function loadKnownGoalIds(agentDir: string): Promise<Set<string>> {
  try {
    const md = await readFile(join(agentDir, "Goals.md"), "utf-8");
    return new Set(md.match(GOAL_ID_PATTERN) ?? []);
  } catch {
    return new Set();
  }
}

// ── Stage 1 — Action-type-specific candidate construction ──────────────

interface ProgressData {
  goalId?: unknown;
  progress?: unknown;
  reason?: unknown;
}

function makeGoalProgressBound(action: LlmAction): Bound | { error: string } {
  const data = action.data as ProgressData;
  const goalId = String(data.goalId ?? "");
  const progress = Number(data.progress);
  const reason = String(data.reason ?? "");
  if (!goalId) return { error: "missing-goal-id" };
  if (!Number.isFinite(progress)) return { error: "invalid-progress" };
  if (progress < 0 || progress > 100) return { error: "progress-out-of-range" };
  return {
    ok: true,
    factTypeId: "mabos:GoalProgressFact",
    roles: { goal: goalId, progress: String(progress), reason },
    confidence: 1.0,
    source: "pattern",
  };
}

function makeNewIntentionBound(action: LlmAction): Bound | { error: string } {
  const data = action.data as { content?: unknown };
  const content = String(data.content ?? "").trim();
  if (!content) return { error: "empty-content" };
  return {
    ok: true,
    factTypeId: "mabos:NewIntentionFact",
    roles: { content },
    confidence: 1.0,
    source: "pattern",
  };
}

// ── Orchestrator ───────────────────────────────────────────────────────

export async function assimilate(
  actions: LlmAction[],
  ctx: AssimilationCtx,
): Promise<AssimilationResult> {
  const accepted: ValidatedBelief[] = [];
  const quarantined: QuarantineEntry[] = [];
  const rejected: QuarantineEntry[] = [];

  let knownGoalIds: Set<string> | null = null;
  const ensureGoalIds = async () =>
    knownGoalIds ?? (knownGoalIds = await loadKnownGoalIds(ctx.agentDir));

  for (const action of actions) {
    let bound: Bound | { error?: string; ok: false; reason?: string } | null = null;

    if (action.type === "belief_update") {
      const bullet = String((action.data as { content?: unknown }).content ?? "");
      if (!bullet.trim()) {
        quarantined.push(qEntry(ctx, action, "lift", "empty-bullet"));
        continue;
      }
      const lifted = liftByPattern(bullet, ctx.templates);
      if (!lifted) {
        quarantined.push(qEntry(ctx, action, "lift", "unliftable"));
        continue;
      }
      const b = await bind(lifted, ctx.resolver, ctx.factTypeIndex);
      if (!b.ok) {
        quarantined.push(
          qEntry(ctx, action, "bind", b.reason, {
            role: b.role,
            value: b.value,
            concept: b.concept,
          }),
        );
        continue;
      }
      bound = b;
    } else if (action.type === "goal_progress") {
      const r = makeGoalProgressBound(action);
      if ("error" in r) {
        quarantined.push(qEntry(ctx, action, "lift", r.error));
        continue;
      }
      // Goal-id binding: must reference a known goal in Goals.md
      const ids = await ensureGoalIds();
      const goalId = String(r.roles.goal);
      if (ids.size > 0 && !ids.has(goalId)) {
        quarantined.push(qEntry(ctx, action, "bind", "unknown-goal", { goalId }));
        continue;
      }
      bound = r;
    } else if (action.type === "new_intention") {
      const r = makeNewIntentionBound(action);
      if ("error" in r) {
        quarantined.push(qEntry(ctx, action, "lift", r.error));
        continue;
      }
      bound = r;
    } else {
      continue;
    }

    if (!bound || !bound.ok) continue;

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
