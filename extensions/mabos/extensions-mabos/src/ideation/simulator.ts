/**
 * IRC validation gate — role-plays skeptical customer and stakeholder
 * personas against an opportunity thesis before a CompanyDNA is committed.
 *
 * The gate ADVISES, it never vetoes: it emits objections, scores, a
 * confidence, and a go/refine/pivot recommendation. It never throws — a
 * failed persona call degrades to an empty objection set for that persona.
 */

import { buildValidationPrompt } from "./prompt-builder.js";
import type { LlmCallFn, OpportunityThesis, SimulatorObjection } from "./types.js";

type GateResult = Pick<
  OpportunityThesis,
  "simulator_objections" | "scores" | "confidence" | "recommendation"
>;

const SEVERITY_WEIGHT: Record<SimulatorObjection["severity"], number> = {
  low: 1,
  medium: 3,
  high: 6,
};

/** Parse JSON from an LLM response (direct, fenced, or embedded). */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]!);
    } catch {
      /* fall through */
    }
  }
  const embedded = text.match(/(\{[\s\S]*\})/);
  if (embedded) {
    try {
      return JSON.parse(embedded[1]!);
    } catch {
      /* fall through */
    }
  }
  return null;
}

/**
 * Derive a recommendation from objections, deterministically:
 *  - >= 2 high-severity objections  -> pivot
 *  - any high OR >= 3 medium          -> refine
 *  - otherwise                        -> go
 */
export function deriveRecommendation(
  objections: SimulatorObjection[],
): OpportunityThesis["recommendation"] {
  const high = objections.filter((o) => o.severity === "high").length;
  const medium = objections.filter((o) => o.severity === "medium").length;
  if (high >= 2) return "pivot";
  if (high >= 1 || medium >= 3) return "refine";
  return "go";
}

/** Confidence in [0,1] — inverse of normalized weighted objection severity. */
export function deriveConfidence(objections: SimulatorObjection[]): number {
  const weight = objections.reduce((sum, o) => sum + SEVERITY_WEIGHT[o.severity], 0);
  // Two high-severity objections (weight 12) floors confidence near 0.
  const confidence = 1 - Math.min(weight, 12) / 12;
  return Math.round(confidence * 100) / 100;
}

/**
 * Run the validation gate. Returns objections, averaged scores, derived
 * confidence, and a recommendation. Never throws.
 */
export async function validateIdea(params: {
  thesis: Omit<OpportunityThesis, keyof GateResult>;
  researchContext: string;
  callLlm: LlmCallFn;
  personas?: SimulatorObjection["persona"][];
  model?: string;
}): Promise<GateResult> {
  const personas = params.personas ?? ["customer", "stakeholder"];
  const model = params.model ?? "claude-opus-4-6";

  const allObjections: SimulatorObjection[] = [];
  const scoreAcc = {
    desirability: [] as number[],
    viability: [] as number[],
    feasibility: [] as number[],
  };

  for (const persona of personas) {
    const { system, user } = buildValidationPrompt({
      persona,
      thesis: JSON.stringify(params.thesis, null, 2),
      research_context: params.researchContext,
    });

    let parsed: unknown = null;
    try {
      const resp = await params.callLlm({ model, system, user, maxTokens: 2048, temperature: 0.4 });
      parsed = parseJson(resp);
    } catch {
      // Persona call failed — contribute nothing rather than block the gate.
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;

    const obj = parsed as {
      objections?: SimulatorObjection[];
      scores?: { desirability?: number; viability?: number; feasibility?: number };
    };
    if (Array.isArray(obj.objections)) {
      for (const o of obj.objections) {
        if (o && typeof o.objection === "string") {
          allObjections.push({
            persona,
            objection: o.objection,
            severity: ["low", "medium", "high"].includes(o.severity) ? o.severity : "medium",
          });
        }
      }
    }
    if (obj.scores) {
      if (typeof obj.scores.desirability === "number")
        scoreAcc.desirability.push(obj.scores.desirability);
      if (typeof obj.scores.viability === "number") scoreAcc.viability.push(obj.scores.viability);
      if (typeof obj.scores.feasibility === "number")
        scoreAcc.feasibility.push(obj.scores.feasibility);
    }
  }

  const avg = (xs: number[]): number =>
    xs.length === 0 ? 5 : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;

  return {
    simulator_objections: allObjections,
    scores: {
      desirability: avg(scoreAcc.desirability),
      viability: avg(scoreAcc.viability),
      feasibility: avg(scoreAcc.feasibility),
    },
    confidence: deriveConfidence(allObjections),
    recommendation: deriveRecommendation(allObjections),
  };
}
