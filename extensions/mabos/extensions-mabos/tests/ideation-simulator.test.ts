import { describe, expect, it } from "vitest";
import { deriveConfidence, deriveRecommendation, validateIdea } from "../src/ideation/simulator.js";
import type { LlmCallFn, SimulatorObjection } from "../src/ideation/types.js";

const thesis = {
  value_proposition: "vp",
  differentiation: "diff",
  target_segment: "seg",
  risk_register: [],
};

describe("IRC simulator gate", () => {
  it("recommends pivot on two high-severity objections", () => {
    const objs: SimulatorObjection[] = [
      { persona: "customer", objection: "a", severity: "high" },
      { persona: "stakeholder", objection: "b", severity: "high" },
    ];
    expect(deriveRecommendation(objs)).toBe("pivot");
    expect(deriveConfidence(objs)).toBe(0);
  });

  it("recommends go with no objections", () => {
    expect(deriveRecommendation([])).toBe("go");
    expect(deriveConfidence([])).toBe(1);
  });

  it("recommends refine on a single high-severity objection", () => {
    expect(deriveRecommendation([{ persona: "customer", objection: "a", severity: "high" }])).toBe(
      "refine",
    );
  });

  it("aggregates persona output deterministically", async () => {
    const callLlm: LlmCallFn = async ({ system }) =>
      JSON.stringify({
        // The persona is substituted into "role-playing a skeptical <persona>".
        objections: system.includes("skeptical customer")
          ? [{ persona: "customer", objection: "too niche", severity: "high" }]
          : [],
        scores: { desirability: 6, viability: 7, feasibility: 8 },
      });
    const gate = await validateIdea({ thesis, researchContext: "", callLlm });
    expect(gate.simulator_objections.length).toBe(1);
    expect(gate.recommendation).toBe("refine");
    expect(gate.scores.desirability).toBe(6);
  });

  it("never throws when a persona call fails", async () => {
    const callLlm: LlmCallFn = async () => {
      throw new Error("api down");
    };
    const gate = await validateIdea({ thesis, researchContext: "", callLlm });
    expect(gate.recommendation).toBe("go"); // no objections gathered
    expect(gate.simulator_objections).toEqual([]);
  });
});
