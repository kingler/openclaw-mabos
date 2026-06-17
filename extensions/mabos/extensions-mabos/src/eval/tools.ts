/**
 * Eval harness tools — agent/operator surface for the eval-driven optimizer.
 *
 *  - eval_dataset_save / eval_dataset_list: manage scoring datasets.
 *  - eval_grade: grade (pre-recorded) outputs for a dataset → persisted run + metrics.
 *  - eval_record_skill_outcome: append a skill outcome to the feedback log.
 *  - eval_optimize_skills: Beta-Bernoulli policy update from the log, with
 *    optional write-back of confidences/retirement to skill manifests.
 *  - eval_report: summarize the latest run for a dataset.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveWorkspaceDir, textResult } from "../tools/common.js";
import { createDefaultJudge } from "./llm.js";
import { optimizeSkillPolicy } from "./optimizer.js";
import { recordedTarget, runEval } from "./runner.js";
import { EvalStore } from "./store.js";
import type { EvalCase, EvalDataset } from "./types.js";

const CaseSchema = Type.Object({
  id: Type.String(),
  input: Type.String(),
  tags: Type.Optional(Type.Array(Type.String())),
  weight: Type.Optional(Type.Number()),
  grader: Type.Optional(
    Type.String({ description: "exact|contains|regex|numeric|json_path|llm_judge" }),
  ),
  expected: Type.Optional(Type.String()),
  expectedNumber: Type.Optional(Type.Number()),
  tolerance: Type.Optional(Type.Number()),
  jsonPath: Type.Optional(Type.String()),
  rubric: Type.Optional(Type.String()),
});

export function createEvalTools(api: OpenClawPluginApi): AnyAgentTool[] {
  const workspaceDir = resolveWorkspaceDir(api);
  const store = new EvalStore(workspaceDir);

  const DatasetSaveParams = Type.Object({
    id: Type.String({ description: "Dataset id (filename-safe)" }),
    description: Type.Optional(Type.String()),
    cases: Type.Array(CaseSchema, { description: "Gradeable cases" }),
  });

  const datasetSave: AnyAgentTool = {
    name: "eval_dataset_save",
    label: "Save Eval Dataset",
    description: "Create or replace a scoring dataset of gradeable cases.",
    parameters: DatasetSaveParams,
    async execute(_id: string, params: Static<typeof DatasetSaveParams>) {
      const dataset: EvalDataset = {
        id: params.id,
        description: params.description,
        cases: params.cases as EvalCase[],
        createdAt: new Date().toISOString(),
      };
      const path = await store.saveDataset(dataset);
      return textResult(`Saved dataset "${dataset.id}" (${dataset.cases.length} cases) → ${path}`);
    },
  };

  const datasetList: AnyAgentTool = {
    name: "eval_dataset_list",
    label: "List Eval Datasets",
    description: "List saved eval dataset ids.",
    parameters: Type.Object({}),
    async execute() {
      const ids = await store.listDatasets();
      return textResult(
        ids.length ? `Datasets:\n${ids.map((d) => `- ${d}`).join("\n")}` : "No datasets saved.",
      );
    },
  };

  const GradeParams = Type.Object({
    dataset_id: Type.String(),
    variant_id: Type.Optional(
      Type.String({ description: "Variant label for this run (default 'baseline')" }),
    ),
    outputs: Type.Array(
      Type.Object({
        case_id: Type.String(),
        output: Type.String(),
        cost_usd: Type.Optional(Type.Number()),
        latency_ms: Type.Optional(Type.Number()),
      }),
      { description: "Pre-recorded outputs to grade, keyed by case id" },
    ),
  });

  const grade: AnyAgentTool = {
    name: "eval_grade",
    label: "Grade Eval Outputs",
    description:
      "Grade recorded outputs against a dataset and persist a scored run. Uses an LLM judge for rubric (llm_judge) cases when ANTHROPIC_API_KEY is set.",
    parameters: GradeParams,
    async execute(_id: string, params: Static<typeof GradeParams>) {
      const dataset = await store.loadDataset(params.dataset_id);
      if (!dataset) return textResult(`Dataset "${params.dataset_id}" not found.`);

      const outputs: Record<
        string,
        { caseId: string; output: string; costUsd?: number; latencyMs?: number }
      > = {};
      for (const o of params.outputs) {
        outputs[o.case_id] = {
          caseId: o.case_id,
          output: o.output,
          costUsd: o.cost_usd,
          latencyMs: o.latency_ms,
        };
      }

      const run = await runEval(
        dataset,
        { id: params.variant_id ?? "baseline" },
        recordedTarget(outputs as Record<string, any>),
        { judge: createDefaultJudge() ?? undefined },
      );
      await store.saveRun(run);

      const m = run.metrics;
      const tagLines = Object.entries(m.byTag)
        .map(([t, v]) => `  - ${t}: score ${pct(v.meanScore)}, pass ${pct(v.passRate)} (n=${v.n})`)
        .join("\n");
      return textResult(
        `Run ${run.runId} on "${dataset.id}" [${run.variantId}]\n` +
          `Mean score: ${pct(m.meanScore)} | Pass rate: ${pct(m.passRate)} | n=${m.n} | cost $${m.totalCostUsd.toFixed(4)}` +
          (tagLines ? `\nBy tag:\n${tagLines}` : ""),
      );
    },
  };

  const RecordParams = Type.Object({
    skill: Type.String(),
    outcome: Type.String({ description: "success | partial | failure" }),
    agent_id: Type.Optional(Type.String()),
    session_id: Type.Optional(Type.String()),
  });

  const recordOutcome: AnyAgentTool = {
    name: "eval_record_skill_outcome",
    label: "Record Skill Outcome",
    description:
      "Append a skill-usage outcome to the feedback log consumed by eval_optimize_skills.",
    parameters: RecordParams,
    async execute(_id: string, params: Static<typeof RecordParams>) {
      const outcome =
        params.outcome === "success" || params.outcome === "partial" ? params.outcome : "failure";
      await store.appendSkillOutcome({
        skill: params.skill,
        outcome,
        agentId: params.agent_id,
        sessionId: params.session_id,
        at: new Date().toISOString(),
      });
      return textResult(`Recorded ${outcome} for skill "${params.skill}".`);
    },
  };

  const OptimizeParams = Type.Object({
    apply: Type.Optional(
      Type.Boolean({
        description:
          "Write recommended confidences/retirement back to skill manifests (default false = dry run)",
      }),
    ),
    retire_threshold: Type.Optional(
      Type.Number({ description: "Lower-bound below which a skill is retired (default 0.2)" }),
    ),
    min_samples: Type.Optional(
      Type.Number({ description: "Min observations before retirement (default 3)" }),
    ),
  });

  const optimizeSkills: AnyAgentTool = {
    name: "eval_optimize_skills",
    label: "Optimize Skill Policy",
    description:
      "Compute Beta-Bernoulli confidence updates per skill from the recorded outcome log; optionally write them back to skill manifests. Closes the skill-loop feedback gap.",
    parameters: OptimizeParams,
    async execute(_id: string, params: Static<typeof OptimizeParams>) {
      const outcomes = await store.loadSkillOutcomes();
      if (outcomes.length === 0) return textResult("No skill outcomes recorded yet.");

      const updates = optimizeSkillPolicy(outcomes, {
        retireThreshold: params.retire_threshold,
        minSamples: params.min_samples,
      });

      let applied = 0;
      if (params.apply) {
        const skillsDir = join(workspaceDir, "skills");
        for (const u of updates) {
          const manifestPath = join(skillsDir, u.skill, "manifest.json");
          try {
            const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
            manifest.confidence = u.recommendedConfidence;
            manifest.retired = u.retire;
            await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
            applied += 1;
          } catch {
            // Skill manifest not on disk (e.g. marketplace-only) — skip.
          }
        }
      }

      const lines = updates.map(
        (u) =>
          `  ${u.retire ? "✗" : "✓"} ${u.skill}: conf ${u.recommendedConfidence} (LB ${u.lowerBound}, ` +
          `${u.successes}S/${u.partials}P/${u.failures}F, n=${u.total})${u.retire ? " — RETIRE" : ""}`,
      );
      return textResult(
        `Skill policy update (${updates.length} skills, ${outcomes.length} outcomes)` +
          (params.apply ? `, applied to ${applied} manifest(s)` : " — dry run") +
          `:\n${lines.join("\n")}`,
      );
    },
  };

  const ReportParams = Type.Object({ dataset_id: Type.String() });

  const report: AnyAgentTool = {
    name: "eval_report",
    label: "Eval Report",
    description: "Show the dataset summary for an eval dataset.",
    parameters: ReportParams,
    async execute(_id: string, params: Static<typeof ReportParams>) {
      const dataset = await store.loadDataset(params.dataset_id);
      if (!dataset) return textResult(`Dataset "${params.dataset_id}" not found.`);
      const graders = new Map<string, number>();
      for (const c of dataset.cases) {
        const g =
          c.grader ??
          (c.rubric
            ? "llm_judge"
            : c.jsonPath
              ? "json_path"
              : c.expectedNumber !== undefined
                ? "numeric"
                : "contains");
        graders.set(g, (graders.get(g) ?? 0) + 1);
      }
      const breakdown = [...graders].map(([g, n]) => `  - ${g}: ${n}`).join("\n");
      return textResult(
        `Dataset "${dataset.id}" — ${dataset.cases.length} cases${dataset.description ? `\n${dataset.description}` : ""}\nGraders:\n${breakdown}`,
      );
    },
  };

  return [datasetSave, datasetList, grade, recordOutcome, optimizeSkills, report];
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}
