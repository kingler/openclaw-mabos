/**
 * Store — workspace-backed persistence for datasets, runs, and the skill
 * outcome log. Append-only outcomes feed the offline skill-policy optimizer.
 *
 * Layout (under <workspace>/eval/):
 *   datasets/<id>.json     one dataset per file
 *   runs/<runId>.json      one eval run per file
 *   skill-outcomes.jsonl   append-only log of SkillOutcome
 */

import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { EvalDataset, EvalRunResult, SkillOutcome } from "./types.js";

export class EvalStore {
  private base: string;

  constructor(workspaceDir: string) {
    this.base = join(workspaceDir, "eval");
  }

  private datasetsDir() {
    return join(this.base, "datasets");
  }
  private runsDir() {
    return join(this.base, "runs");
  }
  private outcomeLog() {
    return join(this.base, "skill-outcomes.jsonl");
  }

  async saveDataset(dataset: EvalDataset): Promise<string> {
    const dir = this.datasetsDir();
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${safeId(dataset.id)}.json`);
    await writeFile(path, JSON.stringify(dataset, null, 2));
    return path;
  }

  async loadDataset(id: string): Promise<EvalDataset | null> {
    try {
      const raw = await readFile(join(this.datasetsDir(), `${safeId(id)}.json`), "utf-8");
      return JSON.parse(raw) as EvalDataset;
    } catch {
      return null;
    }
  }

  async listDatasets(): Promise<string[]> {
    try {
      const entries = await readdir(this.datasetsDir());
      return entries.filter((e) => e.endsWith(".json")).map((e) => e.replace(/\.json$/, ""));
    } catch {
      return [];
    }
  }

  async saveRun(run: EvalRunResult): Promise<string> {
    const dir = this.runsDir();
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${safeId(run.runId)}.json`);
    await writeFile(path, JSON.stringify(run, null, 2));
    return path;
  }

  async appendSkillOutcome(outcome: SkillOutcome): Promise<void> {
    await mkdir(this.base, { recursive: true });
    await appendFile(this.outcomeLog(), `${JSON.stringify(outcome)}\n`);
  }

  async loadSkillOutcomes(): Promise<SkillOutcome[]> {
    try {
      const raw = await readFile(this.outcomeLog(), "utf-8");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          try {
            return JSON.parse(line) as SkillOutcome;
          } catch {
            return null;
          }
        })
        .filter((o): o is SkillOutcome => o !== null);
    } catch {
      return [];
    }
  }
}

/** Restrict ids to filename-safe characters to avoid path traversal. */
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "unnamed";
}
