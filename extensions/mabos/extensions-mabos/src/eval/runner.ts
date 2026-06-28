/**
 * Runner — execute a dataset against a target variant, grade, and score.
 *
 * The `target` is injected so the harness is agnostic to *what* is being
 * evaluated: a live agent turn, a single tool, a prompt template, or a set of
 * pre-recorded outputs (see {@link recordedTarget}).
 */

import { randomUUID } from "node:crypto";
import { gradeCase } from "./graders.js";
import { scoreGrades } from "./scorer.js";
import type {
  CaseOutcome,
  EvalCase,
  EvalDataset,
  EvalRunResult,
  GradeResult,
  LlmJudge,
  Variant,
} from "./types.js";

/** Produces an outcome for one case under one variant. */
export type TargetFn = (kase: EvalCase, variant: Variant) => Promise<CaseOutcome>;

export interface RunOptions {
  judge?: LlmJudge;
  /** Max cases evaluated in parallel (default 4). */
  concurrency?: number;
}

/** A target backed by pre-recorded outputs — useful for offline grading. */
export function recordedTarget(outputs: Record<string, string | CaseOutcome>): TargetFn {
  return async (kase) => {
    const rec = outputs[kase.id];
    if (rec === undefined) {
      return { caseId: kase.id, output: "", error: "no recorded output for case" };
    }
    if (typeof rec === "string") return { caseId: kase.id, output: rec };
    return rec;
  };
}

/** Run every case with a bounded-concurrency worker pool, preserving order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Evaluate one dataset against one variant. Never throws on case failure. */
export async function runEval(
  dataset: EvalDataset,
  variant: Variant,
  target: TargetFn,
  opts: RunOptions = {},
): Promise<EvalRunResult> {
  const concurrency = opts.concurrency ?? 4;

  const outcomes = await mapWithConcurrency(dataset.cases, concurrency, async (kase) => {
    try {
      return await target(kase, variant);
    } catch (err) {
      return { caseId: kase.id, output: "", error: String(err) } satisfies CaseOutcome;
    }
  });

  const grades: GradeResult[] = await mapWithConcurrency(
    dataset.cases,
    concurrency,
    async (kase, i) => gradeCase(kase, outcomes[i], opts.judge),
  );

  return {
    runId: `run-${randomUUID()}`,
    datasetId: dataset.id,
    variantId: variant.id,
    grades,
    metrics: scoreGrades(grades, outcomes, dataset.cases),
    createdAt: new Date().toISOString(),
  };
}
