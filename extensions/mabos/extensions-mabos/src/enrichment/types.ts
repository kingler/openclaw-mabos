/**
 * Business enrichment + assumptions — types and TypeBox request schemas.
 *
 * An Assumption is a *proposal* with a lifecycle: the system infers smart
 * defaults for a partial CompanyDNA and records each as an assumption with a
 * confidence, rationale and status. Assumptions are validated explicitly
 * (user/harness) or by evidence (Bayesian update). Only `validated` assumptions
 * are promoted into the business fact store and feed predictive/prescriptive
 * output. The assumption store is append-only and versioned for continuous,
 * auditable enrichment.
 */

import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";

export type AssumptionStatus = "assumed" | "validated" | "rejected";
export type AssumptionSource = "llm_inference" | "user" | "harness" | "bayesian" | "default_rule";

export interface AssumptionEvidence {
  description: string;
  source: string;
  /** For Bayesian validation (mirrors the reasoning bayesian evidence shape). */
  likelihood?: number; // P(E|H)
  marginal?: number; // P(E)
  fact_id?: string;
  observed_at: string;
}

export interface AssumptionStatusChange {
  from: AssumptionStatus;
  to: AssumptionStatus;
  by: AssumptionSource;
  at: string;
  note?: string;
}

export interface Assumption {
  id: string;
  business_id: string;
  /** CompanyDNA key this assumption fills, e.g. "mission" or "bmc.value_propositions". */
  field: string;
  value: unknown;
  confidence: number; // 0-1
  rationale: string;
  source: AssumptionSource;
  status: AssumptionStatus;
  evidence: AssumptionEvidence[];
  history: AssumptionStatusChange[];
  enrichment_id: string;
  created_at: string;
  updated_at: string;
}

export interface FieldDiff {
  field: string;
  before: unknown;
  after: unknown;
  assumption_id: string;
}

export interface EnrichmentRecord {
  id: string;
  business_id: string;
  trigger: "pipeline" | "manual" | "new_info";
  effort: string;
  cost_usd: number;
  inferred_fields: string[];
  diffs: FieldDiff[];
  created_at: string;
}

export interface AssumptionFile {
  business_id: string;
  assumptions: Assumption[]; // append-only
  records: EnrichmentRecord[]; // append-only
  version: number;
}

// ---------------------------------------------------------------------------
// Request schemas (validate route + tool bodies with Value.Check)
// ---------------------------------------------------------------------------

const EvidenceSchema = Type.Object({
  description: Type.String(),
  source: Type.String(),
  likelihood: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  marginal: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  fact_id: Type.Optional(Type.String()),
  observed_at: Type.Optional(Type.String()),
});

export const EnrichBodySchema = Type.Object({
  effort: Type.Optional(
    Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")]),
  ),
  model: Type.Optional(Type.String()),
  fields: Type.Optional(Type.Array(Type.String())),
  new_info: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
export type EnrichBody = Static<typeof EnrichBodySchema>;

export const ValidateBodySchema = Type.Object({
  decision: Type.Union([Type.Literal("validated"), Type.Literal("rejected")]),
  evidence: Type.Optional(Type.Array(EvidenceSchema)),
  note: Type.Optional(Type.String()),
});
export type ValidateBody = Static<typeof ValidateBodySchema>;

export const EvidenceBodySchema = Type.Object({
  evidence: Type.Array(EvidenceSchema, { minItems: 1 }),
});
export type EvidenceBody = Static<typeof EvidenceBodySchema>;

export const PredictBodySchema = Type.Object({
  effort: Type.Optional(
    Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")]),
  ),
  mode: Type.Optional(Type.Union([Type.Literal("fast"), Type.Literal("llm")])),
  gate: Type.Optional(Type.Union([Type.Literal("validated_only"), Type.Literal("all")])),
});
export type PredictBody = Static<typeof PredictBodySchema>;
