/**
 * Scorer — aggregate per-case grades (and their outcomes) into metrics.
 * Pure and deterministic.
 */

import type { CaseOutcome, EvalCase, EvalMetrics, GradeResult } from "./types.js";

function weightedMean(pairs: Array<{ value: number; weight: number }>): number {
  const totalWeight = pairs.reduce((s, p) => s + p.weight, 0);
  if (totalWeight === 0) return 0;
  return pairs.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight;
}

/**
 * Aggregate grades into metrics, including a per-tag breakdown. Outcomes are
 * matched to grades by caseId to fold in cost/latency; cases supply tags.
 */
export function scoreGrades(
  grades: GradeResult[],
  outcomes: CaseOutcome[],
  cases: EvalCase[],
): EvalMetrics {
  const outcomeById = new Map(outcomes.map((o) => [o.caseId, o]));
  const caseById = new Map(cases.map((c) => [c.id, c]));

  const meanScore = weightedMean(grades.map((g) => ({ value: g.score, weight: g.weight })));
  const passRate = weightedMean(grades.map((g) => ({ value: g.passed ? 1 : 0, weight: g.weight })));

  let totalCostUsd = 0;
  let latencySum = 0;
  let latencyN = 0;
  for (const o of outcomes) {
    if (typeof o.costUsd === "number") totalCostUsd += o.costUsd;
    if (typeof o.latencyMs === "number") {
      latencySum += o.latencyMs;
      latencyN += 1;
    }
  }

  // Per-tag breakdown.
  const tagBuckets = new Map<string, GradeResult[]>();
  for (const g of grades) {
    const tags = caseById.get(g.caseId)?.tags ?? [];
    for (const tag of tags) {
      const bucket = tagBuckets.get(tag) ?? [];
      bucket.push(g);
      tagBuckets.set(tag, bucket);
    }
  }
  const byTag: EvalMetrics["byTag"] = {};
  for (const [tag, bucket] of tagBuckets) {
    byTag[tag] = {
      n: bucket.length,
      meanScore: weightedMean(bucket.map((g) => ({ value: g.score, weight: g.weight }))),
      passRate: weightedMean(bucket.map((g) => ({ value: g.passed ? 1 : 0, weight: g.weight }))),
    };
  }

  // Touch the outcome map so the lookup intent is explicit and tree-shake-safe.
  void outcomeById;

  return {
    n: grades.length,
    meanScore,
    passRate,
    totalCostUsd,
    meanLatencyMs: latencyN > 0 ? latencySum / latencyN : 0,
    byTag,
  };
}
