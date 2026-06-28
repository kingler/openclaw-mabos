/**
 * Optimizer — offline optimization driven by eval scores and recorded outcomes.
 *
 *  - {@link optimizeVariants}: A/B/grid over prompt/policy variants; pick the
 *    best by graded mean score, breaking ties toward lower cost.
 *  - {@link optimizeSkillPolicy}: Beta-Bernoulli posterior over recorded skill
 *    outcomes, yielding updated confidences and retirement recommendations.
 *    This closes the open feedback loop in the skill-loop module, where
 *    confidence was frozen at birth and outcomes were discarded.
 */

import { runEval, type RunOptions, type TargetFn } from "./runner.js";
import type {
  EvalDataset,
  OptimizationResult,
  SkillOutcome,
  SkillPolicyUpdate,
  Variant,
} from "./types.js";

/** Evaluate each variant and rank them. Requires at least one variant. */
export async function optimizeVariants(
  dataset: EvalDataset,
  variants: Variant[],
  target: TargetFn,
  opts: RunOptions = {},
): Promise<OptimizationResult> {
  if (variants.length === 0) throw new Error("optimizeVariants requires at least one variant");

  const runs: Array<{ variant: Variant; run: Awaited<ReturnType<typeof runEval>> }> = [];
  for (const variant of variants) {
    // Sequential across variants keeps cost/log output deterministic and avoids
    // hammering the judge; within a variant, runEval still parallelizes cases.
    runs.push({ variant, run: await runEval(dataset, variant, target, opts) });
  }

  const ranked = runs
    .map(({ variant, run }) => ({ variant, metrics: run.metrics, runId: run.runId }))
    .sort((a, b) => {
      if (b.metrics.meanScore !== a.metrics.meanScore) {
        return b.metrics.meanScore - a.metrics.meanScore;
      }
      // Tie-break: prefer cheaper.
      return a.metrics.totalCostUsd - b.metrics.totalCostUsd;
    });

  return {
    datasetId: dataset.id,
    ranked,
    best: ranked[0].variant,
    createdAt: new Date().toISOString(),
  };
}

export interface SkillPolicyOptions {
  /** Beta prior pseudo-counts (default 1/1 = uniform). */
  priorAlpha?: number;
  priorBeta?: number;
  /** Std-devs below the posterior mean for the lower bound (default 1.0). */
  pessimism?: number;
  /** Retire a skill when its lower bound drops below this (default 0.2). */
  retireThreshold?: number;
  /** Minimum observations before retirement is considered (default 3). */
  minSamples?: number;
}

/**
 * Compute Beta-Bernoulli policy updates per skill from recorded outcomes.
 *
 * A "partial" counts as half a success and half a failure. The posterior mean
 * is the recommended confidence; a pessimistic lower bound (mean minus N std
 * devs of the Beta posterior) drives ranking and retirement so that skills with
 * little evidence are not retired prematurely.
 */
export function optimizeSkillPolicy(
  outcomes: SkillOutcome[],
  opts: SkillPolicyOptions = {},
): SkillPolicyUpdate[] {
  const a0 = opts.priorAlpha ?? 1;
  const b0 = opts.priorBeta ?? 1;
  const pessimism = opts.pessimism ?? 1.0;
  const retireThreshold = opts.retireThreshold ?? 0.2;
  const minSamples = opts.minSamples ?? 3;

  const bySkill = new Map<string, { s: number; p: number; f: number }>();
  for (const o of outcomes) {
    const acc = bySkill.get(o.skill) ?? { s: 0, p: 0, f: 0 };
    if (o.outcome === "success") acc.s += 1;
    else if (o.outcome === "partial") acc.p += 1;
    else acc.f += 1;
    bySkill.set(o.skill, acc);
  }

  const updates: SkillPolicyUpdate[] = [];
  for (const [skill, { s, p, f }] of bySkill) {
    const total = s + p + f;
    const successEff = s + 0.5 * p;
    const failureEff = f + 0.5 * p;

    const alpha = a0 + successEff;
    const beta = b0 + failureEff;
    const posteriorMean = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const sd = Math.sqrt(variance);
    const lowerBound = Math.max(0, posteriorMean - pessimism * sd);

    updates.push({
      skill,
      successes: s,
      partials: p,
      failures: f,
      total,
      posteriorMean: round4(posteriorMean),
      lowerBound: round4(lowerBound),
      recommendedConfidence: round4(posteriorMean),
      retire: total >= minSamples && lowerBound < retireThreshold,
    });
  }

  // Rank by pessimistic lower bound, best first.
  updates.sort((x, y) => y.lowerBound - x.lowerBound);
  return updates;
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
