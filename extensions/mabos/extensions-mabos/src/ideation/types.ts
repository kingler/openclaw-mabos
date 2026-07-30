/**
 * Ideation and Research Chain (IRC) — type definitions for the pipeline
 * that turns a raw founder idea into a research-grounded, validated
 * CompanyDNA. IRC is the front-door analogue of GDC: same staged,
 * validated, checkpointed shape, one stage upstream.
 *
 * CompanyDNA and BusinessModelCanvas are reused directly from the GDC
 * types — they are the handoff contract and must not be redefined here.
 */

import type { BmcItem, BusinessModelCanvas, CompanyDNA, LlmCallFn } from "../gdc/types.js";

export type { BmcItem, BusinessModelCanvas, CompanyDNA, LlmCallFn };

// ---------------------------------------------------------------------------
// Stage 1 — Idea framing
// ---------------------------------------------------------------------------

/** Structured reframing of a raw founder idea. */
export interface IdeaFrame {
  raw_idea: string;
  problem_statement: string;
  jobs_to_be_done: string[];
  target_user_hypothesis: string;
  assumed_value: string;
  /** The assumptions the validation gate (Stage 4) will stress-test. */
  riskiest_assumptions: string[];
  industry_hint?: string;
}

// ---------------------------------------------------------------------------
// Stage 2 — Market research
// ---------------------------------------------------------------------------

/** A cited source backing a research finding. */
export interface ResearchSource {
  url: string;
  title: string;
  /** ISO8601 timestamp the source was retrieved. */
  retrieved_at: string;
}

/**
 * A single research finding. Every finding must carry at least one source
 * OR be explicitly flagged `unverified` (LLM analyst-mode output).
 */
export interface ResearchFinding {
  claim: string;
  evidence: string;
  sources: ResearchSource[];
  unverified: boolean;
}

/** Top-down / bottom-up market sizing with stated assumptions. */
export interface MarketSizing {
  tam: string;
  sam: string;
  som: string;
  assumptions: string[];
}

/** Output of Stage 2 — grounded market research. */
export interface MarketResearch {
  questions: string[];
  findings: ResearchFinding[];
  sizing: MarketSizing;
  trends: ResearchFinding[];
  regulatory: ResearchFinding[];
  /** "researched" when a live backend was used; "analyst-only" otherwise. */
  mode: "researched" | "analyst-only";
}

// ---------------------------------------------------------------------------
// Stage 3 — Competitive landscape
// ---------------------------------------------------------------------------

/** A single competitor / substitute record. */
export interface CompetitorRecord {
  name: string;
  positioning: string;
  pricing_posture: string;
  strengths: string[];
  weaknesses: string[];
  sources: ResearchSource[];
}

/** Output of Stage 3 — competitive landscape and white-space analysis. */
export interface CompetitiveLandscape {
  competitors: CompetitorRecord[];
  positioning_gaps: string[];
  moat_hypotheses: string[];
}

// ---------------------------------------------------------------------------
// Stage 4 — Opportunity synthesis + validation gate
// ---------------------------------------------------------------------------

/** An objection raised by a simulated persona during the validation gate. */
export interface SimulatorObjection {
  persona: "customer" | "stakeholder";
  objection: string;
  severity: "low" | "medium" | "high";
}

/** A single entry in the opportunity risk register. */
export interface RiskRegisterEntry {
  risk: string;
  likelihood: string;
  mitigation: string;
}

/** Output of Stage 4 — the validated opportunity thesis. */
export interface OpportunityThesis {
  value_proposition: string;
  differentiation: string;
  target_segment: string;
  risk_register: RiskRegisterEntry[];
  simulator_objections: SimulatorObjection[];
  scores: {
    desirability: number;
    viability: number;
    feasibility: number;
  };
  /** 0..1 — derived from objection count and severity. */
  confidence: number;
  recommendation: "go" | "refine" | "pivot";
}

// ---------------------------------------------------------------------------
// Stage 5 — Business model + identity
// ---------------------------------------------------------------------------

/** Output of Stage 5 — the drafted business model and brand identity. */
export interface BusinessModelDraft {
  bmc: BusinessModelCanvas;
  mission: string;
  vision: string;
  values: string[];
}

// ---------------------------------------------------------------------------
// Pipeline configuration
// ---------------------------------------------------------------------------

/** Research depth controls query count and token budgets. */
export type ResearchDepth = "light" | "standard" | "deep";

/** Configuration for the IRC pipeline (mirrors GdcPipelineConfig). */
export interface IrcPipelineConfig {
  enabled: boolean;
  /** Maximum stage to run (1-5). */
  maxStage: 1 | 2 | 3 | 4 | 5;
  researchDepth: ResearchDepth;
  maxResearchQueries: number;
  validationGateEnabled: boolean;
  /** Minimum combined score (0-30) for the gate to recommend "go" without override. */
  validationThreshold: number;
  /** LLM model override per stage (keyed by stage number). */
  models: Partial<Record<1 | 2 | 3 | 4 | 5, string>>;
  checkpointDir: string;
  enableCaching: boolean;
}

// ---------------------------------------------------------------------------
// Aggregate result
// ---------------------------------------------------------------------------

/** Full result of an IRC pipeline run (stages optional — pipeline can stop early). */
export interface IrcResult {
  ideaFrame?: IdeaFrame;
  marketResearch?: MarketResearch;
  competitiveLandscape?: CompetitiveLandscape;
  opportunityThesis?: OpportunityThesis;
  businessModel?: BusinessModelDraft;
  /** Assembled in the module layer (Stage 6) — the GDC handoff contract. */
  companyDna?: CompanyDNA;
  errors: string[];
}
