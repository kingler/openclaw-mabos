import { describe, expect, it } from "vitest";
import { validate, ValidationError } from "../src/ideation/validator.js";

describe("IRC validator", () => {
  it("accepts a valid stage 1 output", () => {
    expect(() =>
      validate(1, {
        problem_statement: "Pet owners can't find trusted dog walkers",
        jobs_to_be_done: ["find a walker"],
        riskiest_assumptions: ["owners will pay a premium"],
      }),
    ).not.toThrow();
  });

  it("rejects stage 1 with no riskiest assumptions", () => {
    expect(() =>
      validate(1, { problem_statement: "x", jobs_to_be_done: [], riskiest_assumptions: [] }),
    ).toThrow(ValidationError);
  });

  it("accepts a stage 2 finding flagged unverified with no sources", () => {
    expect(() =>
      validate(2, {
        findings: [{ claim: "big market", evidence: "reasoning", sources: [], unverified: true }],
        trends: [],
        regulatory: [],
        sizing: { tam: "$1B", sam: "$100M", som: "$10M", assumptions: ["x"] },
        mode: "analyst-only",
      }),
    ).not.toThrow();
  });

  it("rejects a stage 2 finding with no sources that is not unverified", () => {
    expect(() =>
      validate(2, {
        findings: [{ claim: "big market", evidence: "x", sources: [], unverified: false }],
        trends: [],
        regulatory: [],
        sizing: {},
        mode: "researched",
      }),
    ).toThrow(/no sources/);
  });

  it("rejects stage 4 with out-of-range confidence", () => {
    expect(() =>
      validate(4, {
        scores: { desirability: 5, viability: 5, feasibility: 5 },
        confidence: 1.5,
        recommendation: "go",
      }),
    ).toThrow(/confidence/);
  });

  it("rejects stage 4 with an invalid recommendation", () => {
    expect(() =>
      validate(4, {
        scores: { desirability: 5, viability: 5, feasibility: 5 },
        confidence: 0.5,
        recommendation: "maybe",
      }),
    ).toThrow(/recommendation/);
  });

  it("rejects stage 5 missing a BMC block", () => {
    expect(() =>
      validate(5, {
        bmc: { customer_segments: [] }, // missing the other 8
        mission: "m",
        vision: "v",
        values: [],
      }),
    ).toThrow(ValidationError);
  });
});
