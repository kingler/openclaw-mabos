/**
 * Validate orchestrator — fuses confidence, SHACL, and deontic checks.
 *
 * Order matters: cheapest check first (confidence → SHACL → deontic), each
 * gate short-circuits on failure. Bound facts that pass all three become
 * ValidatedBelief instances ready for commit.
 */

import type { DeonticRule, DeonticStore } from "../../reasoning/formal/deontic";
import { deonticCheck } from "./deontic-check";
import { validateAgainstShape, type ShapeNode } from "./shacl-mini";
import type { Bound, ValidationResult } from "./types";

const THRESHOLDS = { pattern: 0.85, llm: 0.7 } as const;

export interface ValidateCtx {
  shape: ShapeNode;
  rules: DeonticRule[];
  store: DeonticStore;
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

  return { ok: true, validated: b };
}
