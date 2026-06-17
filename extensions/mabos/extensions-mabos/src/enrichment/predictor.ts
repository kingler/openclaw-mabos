/**
 * Predictive + prescriptive output, gated on validated assumptions.
 *
 * - Predictions: a Bayesian confidence summary over the chosen assumptions plus
 *   scenario sketches. `mode:"fast"` is purely algorithmic (no LLM).
 * - Prescriptions: recommended actions. `mode:"llm"` frames them via the
 *   deontic/abductive/meta reasoning lenses through a single LLM call; `mode:"fast"`
 *   emits deterministic heuristics.
 *
 * Every prediction/prescription is tagged `derived_from: "validated" | "speculative"`.
 * `gate:"validated_only"` excludes unvalidated assumptions entirely.
 */

import type { LlmCallFn } from "../gdc/types.js";
import type { AssumptionStore } from "./store.js";
import type { Assumption } from "./types.js";

export interface PredictParams {
  store: AssumptionStore;
  businessId: string;
  callLlm?: LlmCallFn;
  mode: "fast" | "llm";
  gate: "validated_only" | "all";
}

export interface Prediction {
  hypothesis: string;
  prior: number;
  posterior: number;
  interpretation: string;
  derived_from: "validated" | "speculative";
}

export interface Prescription {
  recommendation: string;
  reasoning_method: "deontic" | "abductive" | "meta";
  confidence: number;
  derived_from: "validated" | "speculative";
}

export interface PredictResult {
  basis: { validated: number; assumed: number; rejected: number; gated: boolean };
  predictions: {
    bayesian: Prediction[];
    scenarios: { name: string; assumptions_used: string[]; narrative: string }[];
  };
  prescriptions: { actions: Prescription[] };
  calledLlm: boolean;
}

function derivedFrom(a: Assumption): "validated" | "speculative" {
  return a.status === "validated" ? "validated" : "speculative";
}

export async function predictAndPrescribe(params: PredictParams): Promise<PredictResult> {
  const { assumptions } = await params.store.listByStatus(params.businessId);
  const validated = assumptions.filter((a) => a.status === "validated");
  const assumed = assumptions.filter((a) => a.status === "assumed");
  const rejected = assumptions.filter((a) => a.status === "rejected");

  const chosen = params.gate === "validated_only" ? validated : [...validated, ...assumed];

  const bayesian: Prediction[] = chosen.map((a) => ({
    hypothesis: `${a.field} = ${typeof a.value === "string" ? a.value : JSON.stringify(a.value)}`,
    prior: a.confidence,
    posterior: a.confidence,
    interpretation:
      a.status === "validated"
        ? "Confirmed assumption; safe to plan against."
        : "Unvalidated assumption; treat as a working hypothesis.",
    derived_from: derivedFrom(a),
  }));

  const basis = {
    validated: validated.length,
    assumed: assumed.length,
    rejected: rejected.length,
    gated: params.gate === "validated_only",
  };

  // Fast mode: deterministic, no LLM.
  if (params.mode === "fast" || !params.callLlm) {
    const actions: Prescription[] = chosen
      .filter((a) => a.confidence < 0.6)
      .map((a) => ({
        recommendation: `Gather evidence to validate "${a.field}" (confidence ${a.confidence.toFixed(2)}).`,
        reasoning_method: "meta",
        confidence: 1 - a.confidence,
        derived_from: derivedFrom(a),
      }));
    return {
      basis,
      predictions: {
        bayesian,
        scenarios: [
          { name: "baseline", assumptions_used: chosen.map((a) => a.field), narrative: "" },
        ],
      },
      prescriptions: { actions },
      calledLlm: false,
    };
  }

  // LLM mode: one call to produce scenario narratives + prescriptions.
  const system =
    "You are a strategy analyst. Given a company's validated and working assumptions, return JSON " +
    '{"scenarios":[{"name":string,"narrative":string}],"prescriptions":[{"recommendation":string,' +
    '"reasoning_method":"deontic"|"abductive"|"meta","confidence":number}]}. ' +
    "Prescriptions must be concrete next actions. Use only the assumptions provided.";
  const user =
    `Validated assumptions:\n${JSON.stringify(
      validated.map((a) => ({ field: a.field, value: a.value })),
      null,
      2,
    )}\n\n` +
    (params.gate === "all"
      ? `Working (unvalidated) assumptions:\n${JSON.stringify(
          assumed.map((a) => ({ field: a.field, value: a.value })),
          null,
          2,
        )}\n\n`
      : "") +
    "Return the JSON now.";

  let scenarios: { name: string; assumptions_used: string[]; narrative: string }[] = [];
  let actions: Prescription[] = [];
  try {
    const text = await params.callLlm({
      model: "",
      system,
      user,
      maxTokens: 2048,
      temperature: 0.4,
    });
    const cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/, "$1").trim();
    const parsed = JSON.parse(cleaned.slice(cleaned.indexOf("{"), cleaned.lastIndexOf("}") + 1));
    scenarios = (parsed.scenarios ?? []).map((s: Record<string, unknown>) => ({
      name: String(s.name ?? "scenario"),
      assumptions_used: chosen.map((a) => a.field),
      narrative: String(s.narrative ?? ""),
    }));
    const tag: "validated" | "speculative" =
      params.gate === "validated_only" ? "validated" : "speculative";
    actions = (parsed.prescriptions ?? []).map((p: Record<string, unknown>) => ({
      recommendation: String(p.recommendation ?? ""),
      reasoning_method: (["deontic", "abductive", "meta"].includes(String(p.reasoning_method))
        ? p.reasoning_method
        : "meta") as Prescription["reasoning_method"],
      confidence: Math.max(0, Math.min(1, Number(p.confidence ?? 0.5))),
      derived_from: tag,
    }));
  } catch {
    // Fall back to empty narratives/actions on parse failure.
  }

  return {
    basis,
    predictions: { bayesian, scenarios },
    prescriptions: { actions },
    calledLlm: true,
  };
}
