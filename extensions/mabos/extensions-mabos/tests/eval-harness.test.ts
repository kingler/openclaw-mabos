/**
 * Eval harness tests — deterministic, no live LLM calls.
 * Covers graders, scorer aggregation, runner, and the offline optimizers
 * (variant ranking + Beta-Bernoulli skill-policy update).
 */

import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { gradeCase, inferGrader } from "../src/eval/graders.js";
import { judgeFromLlmCall, parseVerdict } from "../src/eval/llm.js";
import { optimizeSkillPolicy, optimizeVariants } from "../src/eval/optimizer.js";
import { recordedTarget, runEval } from "../src/eval/runner.js";
import { scoreGrades } from "../src/eval/scorer.js";
import type {
  CaseOutcome,
  EvalCase,
  EvalDataset,
  SkillOutcome,
  Variant,
} from "../src/eval/types.js";

const out = (caseId: string, output: string, extra: Partial<CaseOutcome> = {}): CaseOutcome => ({
  caseId,
  output,
  ...extra,
});

describe("graders", () => {
  it("infers grader from fields", () => {
    assert.equal(inferGrader({ id: "a", input: "x", expectedNumber: 1 }), "numeric");
    assert.equal(inferGrader({ id: "b", input: "x", jsonPath: "a.b" }), "json_path");
    assert.equal(inferGrader({ id: "c", input: "x", rubric: "good?" }), "llm_judge");
    assert.equal(inferGrader({ id: "d", input: "x", expected: "hi" }), "contains");
  });

  it("grades exact / contains / regex", async () => {
    const exact = await gradeCase(
      { id: "1", input: "", grader: "exact", expected: "yes" },
      out("1", " yes "),
    );
    assert.equal(exact.score, 1);
    const contains = await gradeCase(
      { id: "2", input: "", expected: "Total" },
      out("2", "The total is 5"),
    );
    assert.equal(contains.score, 1);
    const regex = await gradeCase(
      { id: "3", input: "", grader: "regex", expected: "\\d{3}" },
      out("3", "abc123"),
    );
    assert.equal(regex.score, 1);
  });

  it("grades numeric with tolerance", async () => {
    const ok = await gradeCase(
      { id: "1", input: "", expectedNumber: 42, tolerance: 1 },
      out("1", "~41.5 units"),
    );
    assert.equal(ok.score, 1);
    const bad = await gradeCase(
      { id: "2", input: "", expectedNumber: 42, tolerance: 0.1 },
      out("2", "50"),
    );
    assert.equal(bad.score, 0);
  });

  it("grades json_path", async () => {
    const g = await gradeCase(
      { id: "1", input: "", jsonPath: "result.total", expected: "7" },
      out("1", JSON.stringify({ result: { total: 7 } })),
    );
    assert.equal(g.score, 1);
  });

  it("scores target errors as zero", async () => {
    const g = await gradeCase(
      { id: "1", input: "", expected: "x" },
      out("1", "", { error: "boom" }),
    );
    assert.equal(g.score, 0);
    assert.match(g.rationale ?? "", /target error/);
  });

  it("uses an injected llm judge", async () => {
    const judge = judgeFromLlmCall(async () => '{"score":0.8,"rationale":"good"}');
    const g = await gradeCase(
      { id: "1", input: "task", grader: "llm_judge", rubric: "is it good?" },
      out("1", "answer"),
      judge,
    );
    assert.equal(g.score, 0.8);
    assert.equal(g.passed, true);
  });

  it("degrades when no judge is configured", async () => {
    const g = await gradeCase(
      { id: "1", input: "", grader: "llm_judge", rubric: "?" },
      out("1", "x"),
    );
    assert.equal(g.score, 0);
    assert.match(g.rationale ?? "", /no LLM judge/);
  });
});

describe("parseVerdict", () => {
  it("extracts JSON from surrounding prose and clamps", () => {
    assert.deepEqual(parseVerdict('Here: {"score": 1.5, "rationale": "x"} done'), {
      score: 1,
      rationale: "x",
    });
    assert.equal(parseVerdict("not json").score, 0);
  });
});

describe("scorer", () => {
  it("computes weighted mean, pass rate, and per-tag breakdown", () => {
    const cases: EvalCase[] = [
      { id: "1", input: "", tags: ["a"], weight: 1 },
      { id: "2", input: "", tags: ["a", "b"], weight: 3 },
    ];
    const grades = [
      { caseId: "1", score: 1, passed: true, grader: "exact" as const, weight: 1 },
      { caseId: "2", score: 0, passed: false, grader: "exact" as const, weight: 3 },
    ];
    const outcomes = [
      out("1", "x", { costUsd: 0.01, latencyMs: 100 }),
      out("2", "y", { costUsd: 0.02, latencyMs: 300 }),
    ];
    const m = scoreGrades(grades, outcomes, cases);
    assert.equal(m.meanScore, 0.25); // (1*1 + 0*3) / 4
    assert.equal(m.passRate, 0.25);
    assert.ok(Math.abs(m.totalCostUsd - 0.03) < 1e-9);
    assert.equal(m.meanLatencyMs, 200);
    assert.equal(m.byTag.a.n, 2);
    assert.equal(m.byTag.b.n, 1);
  });
});

describe("runner", () => {
  it("runs a recorded target and grades it", async () => {
    const dataset: EvalDataset = {
      id: "d1",
      cases: [
        { id: "1", input: "", expected: "cat" },
        { id: "2", input: "", expected: "dog" },
      ],
      createdAt: "now",
    };
    const target = recordedTarget({ "1": "a cat sat", "2": "a fish swam" });
    const run = await runEval(dataset, { id: "baseline" }, target);
    assert.equal(run.metrics.n, 2);
    assert.equal(run.metrics.meanScore, 0.5);
  });
});

describe("optimizeVariants", () => {
  it("ranks variants by score, tie-breaking on cost", async () => {
    const dataset: EvalDataset = {
      id: "d",
      cases: [{ id: "1", input: "", expected: "right" }],
      createdAt: "now",
    };
    // Variant target: "good" answers correctly, "cheap" also correct but cheaper.
    const target = async (kase: EvalCase, v: Variant): Promise<CaseOutcome> => {
      if (v.id === "wrong") return out(kase.id, "nope");
      return out(kase.id, "right", { costUsd: v.id === "cheap" ? 0.001 : 0.01 });
    };
    const variants: Variant[] = [{ id: "wrong" }, { id: "good" }, { id: "cheap" }];
    const result = await optimizeVariants(dataset, variants, target);
    assert.equal(result.best.id, "cheap"); // tied score with "good", cheaper wins
    assert.equal(result.ranked[2].variant.id, "wrong");
  });
});

describe("optimizeSkillPolicy", () => {
  const log = (skill: string, n: number, outcome: SkillOutcome["outcome"]): SkillOutcome[] =>
    Array.from({ length: n }, () => ({ skill, outcome, at: "now" }));

  it("ranks reliable skills above unreliable ones and recommends retirement", () => {
    const outcomes = [
      ...log("good", 9, "success"),
      ...log("good", 1, "failure"),
      ...log("bad", 1, "success"),
      ...log("bad", 9, "failure"),
    ];
    const updates = optimizeSkillPolicy(outcomes, { retireThreshold: 0.3, minSamples: 3 });
    const good = updates.find((u) => u.skill === "good")!;
    const bad = updates.find((u) => u.skill === "bad")!;
    assert.ok(good.posteriorMean > bad.posteriorMean);
    assert.ok(good.lowerBound > bad.lowerBound);
    assert.equal(bad.retire, true);
    assert.equal(good.retire, false);
    // Ranked best-first.
    assert.equal(updates[0].skill, "good");
  });

  it("does not retire skills with too little evidence", () => {
    const updates = optimizeSkillPolicy([{ skill: "new", outcome: "failure", at: "now" }], {
      retireThreshold: 0.3,
      minSamples: 3,
    });
    assert.equal(updates[0].retire, false);
  });

  it("treats partials as half success / half failure", () => {
    const updates = optimizeSkillPolicy(
      [
        { skill: "p", outcome: "partial", at: "now" },
        { skill: "p", outcome: "partial", at: "now" },
      ],
      {},
    );
    // 1 effective success, 1 effective failure, uniform prior → mean 0.5
    assert.equal(updates[0].posteriorMean, 0.5);
  });
});
