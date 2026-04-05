/**
 * GDC Prompt Builder — loads stage templates, renders variables,
 * and parses system/user blocks for LLM calls.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "prompts");

const SYS_OPEN_VARIANTS = ["<system>", "<s>"];
const SYS_CLOSE_VARIANTS = ["</system>", "</s>"];
const USR_OPEN = "<user>";
const USR_CLOSE = "</user>";

/** Stage number to kebab-case filename mapping. */
const STAGE_NAMES: Record<number, string> = {
  1: "stage1-goal-generation",
  2: "stage2-goal-refinement",
  3: "stage3-project-scoping",
  4: "stage4-plan-generation",
  5: "stage5-task-decomposition",
  6: "stage6-action-generation",
  7: "stage7-execution-assembly",
};

interface PromptBlock {
  system: string;
  user: string;
}

/**
 * Find the first matching tag variant in the template string.
 */
function findTag(template: string, variants: string[]): { idx: number; tag: string | null } {
  for (const tag of variants) {
    const idx = template.indexOf(tag);
    if (idx !== -1) return { idx, tag };
  }
  return { idx: -1, tag: null };
}

/**
 * Load a template file, substitute variables, and parse system/user blocks.
 */
function renderTemplate(
  templatePath: string,
  variables: Record<string, unknown> = {},
): PromptBlock {
  let template = readFileSync(templatePath, "utf-8");

  // Substitute provided variables
  for (const [key, value] of Object.entries(variables)) {
    const serialized = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    template = template.replaceAll(`{{${key}}}`, serialized);
  }

  // Replace any remaining unresolved placeholders with [NOT PROVIDED]
  const unresolved = template.match(/\{\{[a-z_]+\}\}/g);
  if (unresolved) {
    for (const v of [...new Set(unresolved)]) {
      template = template.replaceAll(v, "[NOT PROVIDED]");
    }
  }

  // Parse system and user blocks
  const sysOpen = findTag(template, SYS_OPEN_VARIANTS);
  const sysClose = findTag(template, SYS_CLOSE_VARIANTS);
  const usrStart = template.indexOf(USR_OPEN);
  const usrEnd = template.indexOf(USR_CLOSE);

  const system =
    sysOpen.idx !== -1 && sysOpen.tag && sysClose.idx !== -1
      ? template.slice(sysOpen.idx + sysOpen.tag.length, sysClose.idx).trim()
      : "";

  const user =
    usrStart !== -1 && usrEnd !== -1
      ? template.slice(usrStart + USR_OPEN.length, usrEnd).trim()
      : "";

  return { system, user };
}

/**
 * Build a prompt for a numbered GDC stage (1-7).
 */
export function buildPrompt(
  stageNumber: number,
  variables: Record<string, unknown> = {},
): PromptBlock {
  const stageName = STAGE_NAMES[stageNumber];
  if (!stageName) {
    throw new Error(`Unknown stage number: ${stageNumber}. Valid stages: 1-7.`);
  }
  const templatePath = join(PROMPTS_DIR, `${stageName}.md`);
  return renderTemplate(templatePath, variables);
}

/**
 * Build a prompt for domain agent generation (special non-numbered stage).
 */
export function buildDomainAgentPrompt(variables: Record<string, unknown> = {}): PromptBlock {
  const templatePath = join(PROMPTS_DIR, "domain-agent-generation.md");
  return renderTemplate(templatePath, variables);
}

/**
 * Compute a short deterministic hash of pipeline input for caching/dedup.
 */
export function computeInputHash(input: unknown): string {
  const serialized = typeof input === "string" ? input : JSON.stringify(input);
  return createHash("sha256").update(serialized).digest("hex").slice(0, 16);
}

/**
 * Stage-specific summarization to compress prior stage outputs for
 * downstream token budgets. Each stage extracts the minimum context
 * needed by subsequent stages.
 */
export function summarizeForContext(
  stageNumber: number,
  stageOutput: Record<string, unknown>,
): string {
  switch (stageNumber) {
    case 1: {
      // Summarize goals: IDs, statements, types, priorities
      const goals = (stageOutput.goals as Record<string, unknown>[]) ?? [];
      return JSON.stringify(
        {
          total_goals: goals.length,
          goals: goals.map((g) => ({
            goal_id: g.goal_id,
            goal_statement: g.goal_statement,
            goal_type: g.goal_type,
            priority: g.priority,
            category: g.category,
          })),
        },
        null,
        2,
      );
    }

    case 2: {
      // Leaf goals + obstacles
      const refined = (stageOutput.refined_goals as Record<string, unknown>[]) ?? [];
      return JSON.stringify(
        {
          refined_goals: refined.map((rg) => ({
            root_goal_id: rg.root_goal_id,
            refinement_type: rg.refinement_type,
            obstacles: ((rg.obstacles as Record<string, unknown>[]) ?? []).map((o) => ({
              obstacle_id: o.obstacle_id,
              description: o.description,
            })),
          })),
        },
        null,
        2,
      );
    }

    case 3: {
      // Projects with goals and teams
      const projects = (stageOutput.projects as Record<string, unknown>[]) ?? [];
      return JSON.stringify(
        {
          projects: projects.map((p) => ({
            project_id: p.project_id,
            project_name: p.project_name,
            priority: p.priority,
            goals_addressed: p.goals_addressed,
            execution_wave: p.execution_wave,
          })),
        },
        null,
        2,
      );
    }

    case 4: {
      // Plan IDs and goal mappings
      const plans = (stageOutput.plans as Record<string, unknown>[]) ?? [];
      return JSON.stringify(
        {
          plans: plans.map((p) => ({
            plan_id: p.plan_id,
            goal_id: p.goal_id,
            plan_type: p.plan_type,
            step_count: ((p.plan_body as Record<string, unknown>)?.steps as unknown[])?.length ?? 0,
          })),
        },
        null,
        2,
      );
    }

    case 5: {
      // Task summary with critical path
      const tasks = (stageOutput.tasks as unknown[]) ?? [];
      const dag = (stageOutput.execution_dag as Record<string, unknown>) ?? {};
      const phases = (dag.phases as Record<string, unknown>[]) ?? [];
      return JSON.stringify(
        {
          tasks_count: tasks.length,
          critical_path: dag.critical_path,
          phases: phases.map((p) => ({
            phase: p.phase_number,
            task_count: (p.parallel_tasks as unknown[])?.length ?? 0,
          })),
        },
        null,
        2,
      );
    }

    case 6:
      // Full output (largest stage, needed for Stage 7)
      return JSON.stringify(stageOutput, null, 2);

    default:
      return JSON.stringify(stageOutput, null, 2);
  }
}
