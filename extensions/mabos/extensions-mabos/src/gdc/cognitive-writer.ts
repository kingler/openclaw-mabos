/**
 * Cognitive file writer — bridges GDC pipeline output into agent BDI
 * cognitive files (Beliefs.md, Desires.md, Goals.md, etc.).
 *
 * Each agent gets only the goals/plans/tasks relevant to its role,
 * determined by category mapping for C-suite roles and by
 * `responsible_agent_type` matching for domain agents.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  CompanyDNA,
  GdcResult,
  GeneratedGoal,
  RefinedGoal,
  GeneratedPlan,
  DecomposedTask,
  GeneratedAction,
  GoalCategory,
} from "./types.js";

// ---------------------------------------------------------------------------
// Role-to-category mapping
// ---------------------------------------------------------------------------

/** Maps C-suite / named roles to the goal categories they own. */
const ROLE_CATEGORY_MAP: Record<string, GoalCategory[]> = {
  ceo: ["revenue", "growth", "finance", "hr"],
  cfo: ["finance", "legal"],
  coo: ["operations"],
  cmo: ["marketing", "customer_success"],
  cto: ["product", "engineering"],
  hr: ["hr"],
  legal: ["legal"],
  strategy: ["revenue", "marketing", "growth"],
  knowledge: [], // receives all goals as reference
};

// ---------------------------------------------------------------------------
// Filtering helpers
// ---------------------------------------------------------------------------

/**
 * Walk the refined-goal tree. If any node (including sub-goals) has a
 * `responsible_agent_type` matching the agent, add the *root* goal ID
 * to the set so we can match it against the flat GeneratedGoal list.
 */
function collectGoalIdsForAgent(
  roots: RefinedGoal[],
  normalisedRole: string,
  out: Set<string>,
): void {
  for (const root of roots) {
    if (treeContainsAgent(root, normalisedRole)) {
      out.add(root.id);
    }
  }
}

/** Returns true if any node in the subtree matches the agent role. */
function treeContainsAgent(node: RefinedGoal, normalisedRole: string): boolean {
  if (node.responsible_agent_type.toLowerCase().replace(/[_-]/g, "").includes(normalisedRole)) {
    return true;
  }
  return node.sub_goals.some((sg) => treeContainsAgent(sg, normalisedRole));
}

/**
 * Return goals relevant to the given agent role.
 * - Named roles (in ROLE_CATEGORY_MAP) filter by category.
 * - The "knowledge" role receives all goals.
 * - Domain agents match by `responsible_agent_type` from refined goals,
 *   or by keyword overlap between goal statement and role name.
 */
function filterGoals(
  goals: GeneratedGoal[],
  agentRole: string,
  refinedGoals?: RefinedGoal[],
): GeneratedGoal[] {
  const normalised = agentRole.toLowerCase().replace(/[_-]/g, "");

  // "knowledge" agent gets everything
  if (normalised === "knowledge") return goals;

  const categories = ROLE_CATEGORY_MAP[normalised];
  if (categories && categories.length > 0) {
    return goals.filter((g) => categories.includes(g.category));
  }

  // Domain agent: check refined-goal responsible_agent_type first.
  // When a sub-goal matches, trace up to the root refined goal and
  // include its ID so the corresponding top-level GeneratedGoal is found.
  const assignedGoalIds = new Set<string>();
  if (refinedGoals) {
    collectGoalIdsForAgent(refinedGoals, normalised, assignedGoalIds);
  }

  if (assignedGoalIds.size > 0) {
    return goals.filter((g) => assignedGoalIds.has(g.id));
  }

  // Fallback: keyword match on goal statement
  return goals.filter((g) => g.statement.toLowerCase().includes(normalised));
}

/** Flatten a refined-goal tree into a flat list. */
function flattenRefined(goals: RefinedGoal[]): RefinedGoal[] {
  const out: RefinedGoal[] = [];
  for (const g of goals) {
    out.push(g);
    if (g.sub_goals.length > 0) {
      out.push(...flattenRefined(g.sub_goals));
    }
  }
  return out;
}

/** Filter tasks by assigned_agent_type matching the role. */
function filterTasks(tasks: DecomposedTask[], agentRole: string): DecomposedTask[] {
  const normalised = agentRole.toLowerCase().replace(/[_-]/g, "");
  return tasks.filter((t) =>
    t.assigned_agent_type.toLowerCase().replace(/[_-]/g, "").includes(normalised),
  );
}

/** Filter plans: keep plans whose goal_id is in the given goal set. */
function filterPlans(plans: GeneratedPlan[], goalIds: Set<string>): GeneratedPlan[] {
  return plans.filter((p) => goalIds.has(p.goal_id));
}

/** Filter actions by matching task ids. */
function filterActions(actions: GeneratedAction[], taskIds: Set<string>): GeneratedAction[] {
  return actions.filter((a) => taskIds.has(a.task_id));
}

function timestamp(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Content builders
// ---------------------------------------------------------------------------

function buildBeliefs(dna: CompanyDNA, businessName: string, agentRole: string): string {
  const lines: string[] = [
    `# Beliefs — ${businessName}`,
    `*Updated: ${timestamp()}*`,
    `*Source: Business onboarding + GDC pipeline*`,
    "",
    "## Business Context",
    `- **Industry:** ${dna.industry}`,
    `- **Stage:** ${dna.stage}`,
    `- **Mission:** ${dna.mission}`,
    `- **Vision:** ${dna.vision}`,
    "",
  ];

  if (dna.bmc) {
    lines.push("## Business Model");
    const blocks: [string, { title: string; description: string }[]][] = [
      ["Customer Segments", dna.bmc.customer_segments],
      ["Value Propositions", dna.bmc.value_propositions],
      ["Channels", dna.bmc.channels],
      ["Customer Relationships", dna.bmc.customer_relationships],
      ["Revenue Streams", dna.bmc.revenue_streams],
      ["Key Resources", dna.bmc.key_resources],
      ["Key Activities", dna.bmc.key_activities],
      ["Key Partners", dna.bmc.key_partners],
      ["Cost Structure", dna.bmc.cost_structure],
    ];
    for (const [label, items] of blocks) {
      lines.push(`### ${label}`);
      for (const item of items) {
        lines.push(`- **${item.title}:** ${item.description}`);
      }
      lines.push("");
    }
  }

  lines.push("## My Role", `I am the ${agentRole} agent for ${businessName}.`, "");

  return lines.join("\n");
}

function buildDesires(
  goals: GeneratedGoal[],
  agentRole: string,
  businessName: string,
  refinedGoals?: RefinedGoal[],
): string {
  const filtered = filterGoals(goals, agentRole, refinedGoals);
  const lines: string[] = [
    `# Desires — ${agentRole} @ ${businessName}`,
    `*Generated: ${timestamp()}*`,
    "",
    "## Terminal Desires",
  ];

  if (filtered.length === 0) {
    lines.push("- (none assigned)");
  } else {
    for (const g of filtered) {
      lines.push(
        `- [P${g.priority}] ${g.statement} (KPI: ${g.kpi_metric} -> ${g.kpi_target}, by ${g.timeframe})`,
      );
    }
  }

  // Instrumental desires from refined sub-goals
  lines.push("", "## Instrumental Desires");
  if (refinedGoals) {
    const flat = flattenRefined(refinedGoals);
    const subs = flat.filter(
      (rg) =>
        rg.sub_goals.length === 0 &&
        rg.responsible_agent_type.toLowerCase().includes(agentRole.toLowerCase()),
    );
    if (subs.length > 0) {
      for (const sg of subs) {
        lines.push(`- ${sg.statement}`);
      }
    } else {
      lines.push("- (none)");
    }
  } else {
    lines.push("- (none)");
  }

  lines.push("");
  return lines.join("\n");
}

function buildGoals(
  goals: GeneratedGoal[],
  agentRole: string,
  refinedGoals?: RefinedGoal[],
): string {
  const filtered = filterGoals(goals, agentRole, refinedGoals);
  const lines: string[] = [
    "# Goals",
    `*Generated: ${timestamp()}*`,
    "",
    "## Active Goals",
    "| ID | Goal | Type | Priority | KPI | Target | Timeframe |",
    "|----|------|------|----------|-----|--------|-----------|",
  ];

  for (const g of filtered) {
    lines.push(
      `| ${g.id} | ${g.statement} | ${g.type} | ${g.priority} | ${g.kpi_metric} | ${g.kpi_target} | ${g.timeframe} |`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

function buildPlans(
  plans: GeneratedPlan[],
  goals: GeneratedGoal[],
  agentRole: string,
  refinedGoals?: RefinedGoal[],
): string {
  const relevantGoals = filterGoals(goals, agentRole, refinedGoals);
  const goalIds = new Set(relevantGoals.map((g) => g.id));
  const filtered = filterPlans(plans, goalIds);

  const lines: string[] = ["# Plans", `*Generated: ${timestamp()}*`, ""];

  if (filtered.length === 0) {
    lines.push("No plans assigned.");
  } else {
    for (const p of filtered) {
      lines.push(`## Plan: ${p.id}`);
      lines.push(`- **Goal:** ${p.goal_id}`);
      lines.push(`- **Type:** ${p.plan_type}`);
      lines.push(`- **Priority:** ${p.priority}`);
      lines.push(`- **Context:** ${p.context_condition.description}`);
      lines.push("");
      lines.push("### Steps");
      for (const s of p.plan_body.steps) {
        lines.push(`1. **${s.step_id}** — ${s.description} (expected: ${s.expected_output})`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

function buildIntentions(tasks: DecomposedTask[], agentRole: string): string {
  const filtered = filterTasks(tasks, agentRole);
  const lines: string[] = ["# Intentions", `*Generated: ${timestamp()}*`, "", "## Committed Tasks"];

  if (filtered.length === 0) {
    lines.push("No tasks assigned.");
  } else {
    for (const t of filtered) {
      lines.push(`- **${t.id}:** ${t.name} (mode: ${t.execution_mode}, duration: ${t.duration})`);
      if (t.depends_on.length > 0) {
        lines.push(`  - depends on: ${t.depends_on.join(", ")}`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}

function buildObservations(refinedGoals: RefinedGoal[], agentRole: string): string {
  const normalised = agentRole.toLowerCase().replace(/[_-]/g, "");
  const flat = flattenRefined(refinedGoals);

  const lines: string[] = [
    "# Observations",
    `*Generated: ${timestamp()}*`,
    "",
    "## Known Obstacles",
  ];

  let count = 0;
  for (const rg of flat) {
    if (
      rg.obstacles.length > 0 &&
      (normalised === "knowledge" ||
        rg.responsible_agent_type.toLowerCase().replace(/[_-]/g, "").includes(normalised))
    ) {
      lines.push(`### ${rg.statement}`);
      for (const obs of rg.obstacles) {
        lines.push(`- ${obs}`);
        count++;
      }
      lines.push("");
    }
  }

  if (count === 0) {
    lines.push("- No obstacles identified.");
    lines.push("");
  }

  return lines.join("\n");
}

function buildSkills(actions: GeneratedAction[], agentRole: string): string {
  // Actions are matched via their parent tasks, but we need task ids.
  // Since we don't have the full task list here, include actions whose
  // tool_or_api is mapped (is_mapped=true) as available skills.
  const lines: string[] = [
    "# Skills",
    `*Generated: ${timestamp()}*`,
    "",
    "## Available Tools",
    "| Action | Tool/API | Mapped | Parameters |",
    "|--------|----------|--------|------------|",
  ];

  for (const a of actions) {
    const params = Object.keys(a.parameters).join(", ") || "-";
    lines.push(
      `| ${a.action_name} | ${a.tool_or_api} | ${a.is_mapped ? "Yes" : "No"} | ${params} |`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write GDC pipeline output into an agent's cognitive files.
 * Maps goals, plans, tasks, and obstacles to the appropriate agent
 * based on role matching.
 */
export async function writeCognitiveState(params: {
  agentDir: string;
  agentRole: string;
  gdcResult: GdcResult;
  companyDNA: CompanyDNA;
  businessName: string;
}): Promise<{ filesWritten: string[] }> {
  const { agentDir, agentRole, gdcResult, companyDNA, businessName } = params;
  const filesWritten: string[] = [];

  await mkdir(agentDir, { recursive: true });

  // Beliefs.md — business context from CompanyDNA + BMC
  const beliefs = buildBeliefs(companyDNA, businessName, agentRole);
  await writeFile(join(agentDir, "Beliefs.md"), beliefs);
  filesWritten.push("Beliefs.md");

  // Desires.md — goals assigned to this agent
  if (gdcResult.stage1) {
    const desires = buildDesires(
      gdcResult.stage1.goals,
      agentRole,
      businessName,
      gdcResult.stage2?.refined_goals,
    );
    await writeFile(join(agentDir, "Desires.md"), desires);
    filesWritten.push("Desires.md");
  }

  // Goals.md — KPI targets from assigned goals
  if (gdcResult.stage1) {
    const goals = buildGoals(gdcResult.stage1.goals, agentRole, gdcResult.stage2?.refined_goals);
    await writeFile(join(agentDir, "Goals.md"), goals);
    filesWritten.push("Goals.md");
  }

  // Plans.md — plans from stage 4
  if (gdcResult.stage4) {
    const plans = buildPlans(
      gdcResult.stage4.plans,
      gdcResult.stage1?.goals ?? [],
      agentRole,
      gdcResult.stage2?.refined_goals,
    );
    await writeFile(join(agentDir, "Plans.md"), plans);
    filesWritten.push("Plans.md");
  }

  // Intentions.md — committed tasks from stage 5
  if (gdcResult.stage5) {
    const intentions = buildIntentions(gdcResult.stage5.tasks, agentRole);
    await writeFile(join(agentDir, "Intentions.md"), intentions);
    filesWritten.push("Intentions.md");
  }

  // Observations.md — obstacles from stage 2
  if (gdcResult.stage2) {
    const observations = buildObservations(gdcResult.stage2.refined_goals, agentRole);
    await writeFile(join(agentDir, "Observations.md"), observations);
    filesWritten.push("Observations.md");
  }

  // Skills.md — tool mappings from stage 6
  if (gdcResult.stage6) {
    const skills = buildSkills(gdcResult.stage6.actions, agentRole);
    await writeFile(join(agentDir, "Skills.md"), skills);
    filesWritten.push("Skills.md");
  }

  return { filesWritten };
}
