/**
 * Eval-driven optimization harness — type definitions.
 *
 * The harness has three jobs:
 *  1. Score agent/tool outcomes against a dataset (deterministic + LLM-judge graders).
 *  2. Optimize prompt/policy *variants* offline by comparing graded scores.
 *  3. Optimize *skill policy* from recorded outcomes (Beta-Bernoulli posterior),
 *     closing the open feedback loop in the skill-loop module.
 *
 * The core is intentionally pure and synchronous where possible so it can be
 * unit-tested deterministically with no LLM calls.
 */

/** Which grading strategy to apply to a case. */
export type GraderKind = "exact" | "contains" | "regex" | "numeric" | "json_path" | "llm_judge";

/** A single gradeable case in an eval dataset. */
export interface EvalCase {
  id: string;
  /** Task/prompt handed to the target under evaluation. */
  input: string;
  /** Optional grouping tags (e.g. "finance", "routing") for per-segment metrics. */
  tags?: string[];
  /** Relative weight in aggregate scoring (default 1). */
  weight?: number;
  /** Explicit grader override; otherwise inferred from the fields below. */
  grader?: GraderKind;

  // Grading targets (set the ones relevant to the chosen grader):
  /** Expected string for exact/contains/regex grading. */
  expected?: string;
  /** Expected number for numeric grading. */
  expectedNumber?: number;
  /** Absolute tolerance for numeric grading (default 0). */
  tolerance?: number;
  /** Dot-path into JSON output for json_path grading (e.g. "result.total"). */
  jsonPath?: string;
  /** Rubric handed to the LLM judge for llm_judge grading. */
  rubric?: string;

  metadata?: Record<string, unknown>;
}

/** A versioned collection of cases. */
export interface EvalDataset {
  id: string;
  description?: string;
  cases: EvalCase[];
  createdAt: string;
}

/** The product of running one case against a target variant. */
export interface CaseOutcome {
  caseId: string;
  /** Raw text the target produced. */
  output: string;
  costUsd?: number;
  latencyMs?: number;
  toolsUsed?: string[];
  error?: string;
}

/** Grade for a single case, normalized to 0..1. */
export interface GradeResult {
  caseId: string;
  score: number;
  passed: boolean;
  grader: GraderKind;
  weight: number;
  rationale?: string;
}

/** Aggregate metrics over a set of grades. */
export interface EvalMetrics {
  n: number;
  /** Weighted mean score, 0..1. */
  meanScore: number;
  /** Weighted fraction of cases that passed. */
  passRate: number;
  totalCostUsd: number;
  meanLatencyMs: number;
  byTag: Record<string, { n: number; meanScore: number; passRate: number }>;
}

/** A candidate configuration being evaluated (prompt override and/or policy params). */
export interface Variant {
  id: string;
  /** System-prompt override handed to the target, if any. */
  promptOverride?: string;
  /** Arbitrary policy knobs the target interprets. */
  params?: Record<string, unknown>;
}

/** Full result of evaluating one dataset against one variant. */
export interface EvalRunResult {
  runId: string;
  datasetId: string;
  variantId: string;
  grades: GradeResult[];
  metrics: EvalMetrics;
  createdAt: string;
}

/** Ranked optimization result over multiple variants. */
export interface OptimizationResult {
  datasetId: string;
  ranked: Array<{ variant: Variant; metrics: EvalMetrics; runId: string }>;
  best: Variant;
  createdAt: string;
}

/**
 * One recorded skill-usage outcome, appended to the outcome log as agents run.
 * This is the raw signal the offline skill-policy optimizer consumes.
 */
export interface SkillOutcome {
  skill: string;
  outcome: "success" | "partial" | "failure";
  agentId?: string;
  sessionId?: string;
  at: string;
}

/** Per-skill policy recommendation produced by the offline optimizer. */
export interface SkillPolicyUpdate {
  skill: string;
  successes: number;
  partials: number;
  failures: number;
  total: number;
  /** Beta-Bernoulli posterior mean of success probability. */
  posteriorMean: number;
  /** Lower confidence bound (pessimistic estimate) used for ranking/retirement. */
  lowerBound: number;
  /** Recommended new confidence to write back to the manifest. */
  recommendedConfidence: number;
  /** True when lowerBound falls below the retirement threshold. */
  retire: boolean;
}

/** Signature for an LLM judge used by the llm_judge grader. */
export type LlmJudge = (params: {
  rubric: string;
  input: string;
  output: string;
}) => Promise<{ score: number; rationale: string }>;
