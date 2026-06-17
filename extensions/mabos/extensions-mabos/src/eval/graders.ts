/**
 * Graders — map a case + its produced outcome to a normalized 0..1 score.
 *
 * Deterministic graders (exact/contains/regex/numeric/json_path) require no
 * LLM and are fully unit-testable. The llm_judge grader delegates to an
 * injected {@link LlmJudge}, keeping the core offline-friendly.
 */

import type { CaseOutcome, EvalCase, GradeResult, GraderKind, LlmJudge } from "./types.js";

/** Score at or above which a case is considered "passed". */
export const PASS_THRESHOLD = 0.5;

/** Infer the grader for a case when none is set explicitly. */
export function inferGrader(kase: EvalCase): GraderKind {
  if (kase.grader) return kase.grader;
  if (kase.jsonPath !== undefined) return "json_path";
  if (kase.expectedNumber !== undefined) return "numeric";
  if (kase.rubric !== undefined) return "llm_judge";
  if (kase.expected !== undefined) return "contains";
  return "contains";
}

/** Read a dot-path (e.g. "a.b.0.c") out of a parsed JSON value. */
function readPath(value: unknown, path: string): unknown {
  let cur: unknown = value;
  for (const seg of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Grade a single case. Pure for every grader except llm_judge, which awaits
 * the injected judge. Always resolves — grading never throws.
 */
export async function gradeCase(
  kase: EvalCase,
  outcome: CaseOutcome,
  judge?: LlmJudge,
): Promise<GradeResult> {
  const grader = inferGrader(kase);
  const weight = kase.weight ?? 1;
  const base = { caseId: kase.id, grader, weight };

  // A target error is an automatic zero regardless of grader.
  if (outcome.error) {
    return { ...base, score: 0, passed: false, rationale: `target error: ${outcome.error}` };
  }

  const out = outcome.output ?? "";

  switch (grader) {
    case "exact": {
      const score = out.trim() === (kase.expected ?? "").trim() ? 1 : 0;
      return { ...base, score, passed: score >= PASS_THRESHOLD };
    }
    case "contains": {
      const needle = (kase.expected ?? "").toLowerCase();
      const score = needle && out.toLowerCase().includes(needle) ? 1 : 0;
      return { ...base, score, passed: score >= PASS_THRESHOLD };
    }
    case "regex": {
      let score = 0;
      let rationale: string | undefined;
      try {
        score = new RegExp(kase.expected ?? "").test(out) ? 1 : 0;
      } catch (err) {
        rationale = `invalid regex: ${String(err)}`;
      }
      return { ...base, score, passed: score >= PASS_THRESHOLD, rationale };
    }
    case "numeric": {
      const got = Number.parseFloat(out.replace(/[^0-9.eE+-]/g, ""));
      const want = kase.expectedNumber ?? 0;
      const tol = kase.tolerance ?? 0;
      const score = Number.isFinite(got) && Math.abs(got - want) <= tol ? 1 : 0;
      return {
        ...base,
        score,
        passed: score >= PASS_THRESHOLD,
        rationale: `parsed ${got}, expected ${want}±${tol}`,
      };
    }
    case "json_path": {
      let score = 0;
      let rationale: string | undefined;
      try {
        const parsed = JSON.parse(out);
        const actual = readPath(parsed, kase.jsonPath ?? "");
        const expected = kase.expected ?? String(kase.expectedNumber ?? "");
        score = String(actual) === expected ? 1 : 0;
        rationale = `path "${kase.jsonPath}" = ${JSON.stringify(actual)}`;
      } catch (err) {
        rationale = `output is not valid JSON: ${String(err)}`;
      }
      return { ...base, score, passed: score >= PASS_THRESHOLD, rationale };
    }
    case "llm_judge": {
      if (!judge) {
        return {
          ...base,
          score: 0,
          passed: false,
          rationale: "no LLM judge configured (set ANTHROPIC_API_KEY or inject a judge)",
        };
      }
      try {
        const verdict = await judge({ rubric: kase.rubric ?? "", input: kase.input, output: out });
        const score = clamp01(verdict.score);
        return { ...base, score, passed: score >= PASS_THRESHOLD, rationale: verdict.rationale };
      } catch (err) {
        return { ...base, score: 0, passed: false, rationale: `judge error: ${String(err)}` };
      }
    }
    default: {
      return { ...base, score: 0, passed: false, rationale: `unknown grader: ${grader}` };
    }
  }
}
