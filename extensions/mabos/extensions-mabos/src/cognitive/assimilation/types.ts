/**
 * Assimilation pipeline types.
 *
 * Shared shapes across lift → bind → validate → commit. Defined locally
 * (not imported from cognitive-router) so this module remains self-contained;
 * the canonical LlmAction interface lives at cognitive-router.ts:1009 and is
 * structurally compatible with the LlmAction defined here.
 */

export interface LlmAction {
  type: "belief_update" | "goal_progress" | "new_intention";
  data: Record<string, unknown>;
}

export interface Candidate {
  factTypeId: string;
  roles: Record<string, unknown>;
  source: "pattern" | "llm";
  confidence: number;
}

export interface Bound {
  ok: true;
  factTypeId: string;
  roles: Record<string, string>; // values resolved to IRIs (or stringified literals)
  confidence: number;
  source: "pattern" | "llm";
}

export type BindFailure =
  | { ok: false; reason: "unknown-mint-denied"; role: string; value: unknown; concept: string }
  | {
      ok: false;
      reason: "mint-failed";
      role: string;
      value: unknown;
      concept: string;
      cause: string;
    };

export interface ValidatedBelief extends Bound {}

export type ValidationResult =
  | { ok: true; validated: ValidatedBelief }
  | { ok: false; reason: "shacl"; report: unknown }
  | { ok: false; reason: "deontic"; ruleId: string; witness: unknown }
  | { ok: false; reason: "low-confidence"; threshold: number };

export interface Provenance {
  run_id: string;
  model: string;
  prompt_hash: string;
  signal_ids: string[];
  ts: string;
  lift_source: "pattern" | "llm" | "derived";
  confidence: number;
}

export interface QuarantineEntry {
  ts: string;
  agent_id: string;
  action: LlmAction;
  stage: "lift" | "bind" | "validate";
  reason: string;
  detail?: unknown;
  run_id: string;
}

export interface AssimilationResult {
  accepted: ValidatedBelief[];
  quarantined: QuarantineEntry[];
  rejected: QuarantineEntry[]; // structurally invalid (e.g. SHACL hard fail)
}
