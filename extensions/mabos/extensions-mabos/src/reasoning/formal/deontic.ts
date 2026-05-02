/**
 * Deontic Reasoning Tool
 *
 * Evaluates actions against normative rules (obligations, permissions, prohibitions).
 * Draws on deontic logic to determine what an agent ought to, may, or must not do.
 *
 * Two surfaces are exported:
 *   - createDeonticTool: LLM-facing tool (prompt-builder for agents).
 *   - evaluateDeonticRule: code-side, structured-predicate evaluator used by
 *     the assimilation pipeline's validate stage. Rules without a structured
 *     `predicate` field skip gracefully (violated: false).
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi, AnyAgentTool } from "openclaw/plugin-sdk";
import { textResult } from "../../tools/common.js";

// ── Structured-predicate evaluator (assimilation pipeline) ──────────────

export type ComparisonOp = "ge" | "gt" | "le" | "lt" | "eq";

export type DeonticThreshold =
  | { kind: "literal"; value: number }
  | { kind: "property"; iri: string; property: string };

export type DeonticPredicate =
  | {
      kind: "count_threshold";
      factTypeId: string;
      where: Record<string, string>; // values may use "$role:roleName" placeholders
      operator: ComparisonOp;
      threshold: DeonticThreshold;
    }
  | { kind: "always" };

export interface DeonticRule {
  id: string;
  ruleModality: string;
  modal?: "obligation" | "permission" | "prohibition";
  constrainsFact: string;
  condition: string;
  predicate?: DeonticPredicate;
}

export interface DeonticFact {
  factTypeId: string;
  roles: Record<string, string>;
}

export interface DeonticStore {
  countFacts(factTypeId: string, where: Record<string, string>): Promise<number>;
  getProperty(iri: string, property: string): Promise<unknown>;
}

export interface DeonticEvaluation {
  violated: boolean;
  witness?: unknown;
}

const ROLE_PLACEHOLDER = /^\$role:(.+)$/;

function expandRoleRef(value: string, roles: Record<string, string>): string {
  const m = value.match(ROLE_PLACEHOLDER);
  if (!m) return value;
  const resolved = roles[m[1]];
  if (resolved === undefined) {
    throw new Error(`deontic predicate references unknown role: ${m[1]}`);
  }
  return resolved;
}

function expandWhere(
  where: Record<string, string>,
  roles: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(where)) out[k] = expandRoleRef(v, roles);
  return out;
}

function compare(lhs: number, op: ComparisonOp, rhs: number): boolean {
  switch (op) {
    case "ge":
      return lhs >= rhs;
    case "gt":
      return lhs > rhs;
    case "le":
      return lhs <= rhs;
    case "lt":
      return lhs < rhs;
    case "eq":
      return lhs === rhs;
  }
}

async function predicateHolds(
  pred: DeonticPredicate,
  fact: DeonticFact,
  store: DeonticStore,
): Promise<{ holds: boolean; witness: unknown }> {
  if (pred.kind === "always") return { holds: true, witness: { reason: "always" } };

  const where = expandWhere(pred.where, fact.roles);
  const count = await store.countFacts(pred.factTypeId, where);

  let threshold: number;
  if (pred.threshold.kind === "literal") {
    threshold = pred.threshold.value;
  } else {
    const iri = expandRoleRef(pred.threshold.iri, fact.roles);
    const raw = await store.getProperty(iri, pred.threshold.property);
    if (typeof raw !== "number") {
      throw new Error(
        `deontic threshold property ${pred.threshold.property} on ${iri} is not numeric (got ${typeof raw})`,
      );
    }
    threshold = raw;
  }

  return {
    holds: compare(count, pred.operator, threshold),
    witness: { count, threshold, operator: pred.operator, where },
  };
}

/**
 * Evaluate a deontic rule against a fact. Returns violated=true when:
 *   - prohibition: predicate holds (the prohibited situation is occurring)
 *   - obligation: predicate does NOT hold (the required situation is missing)
 *   - permission: never violated (permissions don't generate violations)
 *
 * Skips (violated: false) when:
 *   - rule.ruleModality !== "deontic"
 *   - rule.constrainsFact !== fact.factTypeId
 *   - rule has no structured `predicate` (NL-only rules cannot be enforced)
 */
export async function evaluateDeonticRule(
  fact: DeonticFact,
  rule: DeonticRule,
  store: DeonticStore,
): Promise<DeonticEvaluation> {
  if (rule.ruleModality !== "deontic") return { violated: false };
  if (rule.constrainsFact !== fact.factTypeId) return { violated: false };
  if (!rule.predicate) return { violated: false };

  const { holds, witness } = await predicateHolds(rule.predicate, fact, store);
  const modal = rule.modal ?? "prohibition";

  if (modal === "permission") return { violated: false };
  const violated = modal === "prohibition" ? holds : !holds;
  return violated
    ? { violated: true, witness: { rule: rule.id, ...((witness ?? {}) as object) } }
    : { violated: false };
}

// ── LLM-facing tool ─────────────────────────────────────────────────────

const NormSchema = Type.Object({
  norm: Type.String({ description: "The normative rule or regulation" }),
  type: Type.Union(
    [Type.Literal("obligation"), Type.Literal("permission"), Type.Literal("prohibition")],
    {
      description:
        "Type of norm: obligation (must do), permission (may do), prohibition (must not do)",
    },
  ),
});

const DeonticParams = Type.Object({
  action: Type.String({
    description: "The action to evaluate against the norms",
  }),
  norms: Type.Array(NormSchema, {
    description: "Array of normative rules with their types (obligation, permission, prohibition)",
  }),
  context: Type.Optional(
    Type.String({
      description: "Situational context that may affect norm applicability or priority",
    }),
  ),
});

const NORM_SYMBOLS: Record<string, string> = {
  obligation: "O(a) — obligatory",
  permission: "P(a) — permitted",
  prohibition: "F(a) — forbidden",
};

export function createDeonticTool(api: OpenClawPluginApi): AnyAgentTool {
  return {
    name: "reason_deontic",
    label: "Deontic Reasoning",
    description:
      "Evaluate an action against normative rules (obligations, permissions, prohibitions). Determines whether an action is obligatory, permitted, or forbidden.",
    parameters: DeonticParams,
    async execute(_id: string, params: Static<typeof DeonticParams>) {
      const normsList = params.norms
        .map((n, i) => {
          const sym = NORM_SYMBOLS[n.type];
          return `  N${i + 1}. [${sym}] ${n.norm}`;
        })
        .join("\n");

      const obligations = params.norms.filter((n) => n.type === "obligation");
      const permissions = params.norms.filter((n) => n.type === "permission");
      const prohibitions = params.norms.filter((n) => n.type === "prohibition");

      const contextSection = params.context ? `\n**Context:** ${params.context}` : "";

      return textResult(`## Deontic Reasoning — Normative Evaluation

**Action under evaluation:** ${params.action}

**Applicable norms:**
${normsList}
${contextSection}

**Norm summary:**
- Obligations: ${obligations.length} (things that must be done)
- Permissions: ${permissions.length} (things that may be done)
- Prohibitions: ${prohibitions.length} (things that must not be done)

---

**Instructions — apply deontic analysis systematically:**

1. **Norm applicability:** For each norm, determine whether it applies to the action in question given the context. A norm may be inapplicable due to scope, conditions, or exceptions.

2. **Conflict detection:** Check for deontic conflicts:
   - Is the action both obligated and prohibited? (deontic dilemma)
   - Is the action obligated by one norm but its negation obligated by another?
   - Are there conflicts between norms of the same type?

3. **Norm priority resolution:** If conflicts exist, resolve using:
   - **Specificity:** More specific norms override general ones.
   - **Recency:** Later-enacted norms override earlier ones.
   - **Hierarchy:** Higher-authority norms override lower ones.
   - **Context:** Situational factors that activate exception clauses.

4. **Deontic status determination:**
   - **Obligatory:** The action must be performed (required by an undefeated obligation).
   - **Permitted:** The action may be performed (not prohibited, or explicitly permitted).
   - **Forbidden:** The action must not be performed (prohibited by an undefeated prohibition).
   - **Optional:** The action is neither obligatory nor forbidden (discretionary).

5. **Compliance assessment:**
   - Would performing the action satisfy all applicable obligations?
   - Would performing the action violate any applicable prohibitions?
   - What are the consequences of non-compliance?

**Provide:**
- Deontic status of the action: OBLIGATORY / PERMITTED / FORBIDDEN / OPTIONAL
- List of satisfied and violated norms.
- Any unresolved conflicts with recommended resolution.
- Recommended course of action.`);
    },
  };
}
