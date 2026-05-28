/**
 * Validate orchestrator — fuses confidence, SHACL, deontic, and simulator
 * checks.
 *
 * Order matters: cheapest check first (confidence → SHACL → deontic →
 * simulator), each gate short-circuits on failure. Bound facts that pass all
 * checks become ValidatedBelief instances ready for commit.
 *
 * The simulator gate only fires for intention-shaped facts: `intentionFromBound`
 * returns null for non-intentions, skipping the gate. Both `simulators` and
 * `intentionFromBound` are optional, so callers that don't configure them keep
 * the original three-check behavior (backward compatible with Plan 1).
 */

import type { DeonticRule, DeonticStore } from "../../reasoning/formal/deontic.js";
import type { Simulator, IntentionContext } from "../../simulators/types.js";
import { deonticCheck } from "./deontic-check.js";
import { validateAgainstShape, type ShapeNode } from "./shacl-mini.js";
import { runSimulatorGate } from "./simulator-gate.js";
import type { Bound, ValidationResult } from "./types.js";

const THRESHOLDS = { pattern: 0.85, llm: 0.7 } as const;

export interface ValidateCtx {
  shape: ShapeNode;
  rules: DeonticRule[];
  store: DeonticStore;
  simulators?: Simulator[];
  intentionFromBound?: (b: Bound) => IntentionContext | null;
}

function boundToShaclNode(b: Bound): Record<string, unknown> {
  const node: Record<string, unknown> = { "@type": b.factTypeId };
  for (const [k, v] of Object.entries(b.roles)) node[`role:${k}`] = v;
  return node;
}

export async function validate(b: Bound, ctx: ValidateCtx): Promise<ValidationResult> {
  // 1. Confidence gate
  const threshold = THRESHOLDS[b.source];
  if (b.confidence < threshold) {
    return { ok: false, reason: "low-confidence", threshold };
  }

  // 2. Structural — JSON-LD-shaped node validated against the shape
  const node = boundToShaclNode(b);
  const shacl = validateAgainstShape(node, ctx.shape);
  if (!shacl.conforms) {
    return { ok: false, reason: "shacl", report: shacl.violations };
  }

  // 3. Modal — deontic rules constraining this fact type
  const relevantRules = ctx.rules.filter((r) => r.constrainsFact === b.factTypeId);
  const dr = await deonticCheck(b, relevantRules, ctx.store);
  if (dr.violated) {
    return { ok: false, reason: "deontic", ruleId: dr.ruleId, witness: dr.witness };
  }

  // 4. Simulator gate — only for intention-shaped facts (mimicked stakeholder
  //    feedback before commit). Skipped when not configured or not an intention.
  if (ctx.simulators && ctx.simulators.length > 0 && ctx.intentionFromBound) {
    const ictx = ctx.intentionFromBound(b);
    if (ictx) {
      const gate = await runSimulatorGate(ictx, ctx.simulators);
      if (!gate.approved) {
        return { ok: false, reason: "simulator-veto", verdicts: gate.verdicts };
      }
    }
  }

  return { ok: true, validated: b };
}
