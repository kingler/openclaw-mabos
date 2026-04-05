/**
 * GDC Stage Output Validator — validates structural integrity of each
 * pipeline stage output: required fields, ID formats, referential
 * integrity, DAG acyclicity, and coverage completeness.
 */

import type {
  Stage1Output,
  Stage2Output,
  Stage3Output,
  Stage4Output,
  Stage5Output,
  Stage6Output,
  Stage7Output,
  RefinedGoal,
} from "./types.js";

// ---------------------------------------------------------------------------
// Result & error types
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class ValidationError extends Error {
  stage: number;
  errors: string[];

  constructor(stage: number, errors: string[]) {
    super(`GDC validation failed at stage ${stage}: ${errors.join("; ")}`);
    this.name = "ValidationError";
    this.stage = stage;
    this.errors = errors;
  }
}

// ---------------------------------------------------------------------------
// Kahn's algorithm — cycle detection
// ---------------------------------------------------------------------------

/**
 * Returns `true` if the directed graph described by `edges` contains a cycle.
 * Uses Kahn's topological-sort algorithm.
 */
export function detectCycle(edges: Array<{ from: string; to: string }>): boolean {
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  // Collect all nodes from edges
  for (const { from, to } of edges) {
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from)!.push(to);
    if (!inDegree.has(from)) inDegree.set(from, 0);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
  }

  // Seed queue with zero-indegree nodes
  const queue: string[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) queue.push(node);
  }
  for (const node of graph.keys()) {
    if (!inDegree.has(node) || inDegree.get(node) === 0) {
      if (!queue.includes(node)) queue.push(node);
    }
  }

  let processed = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    processed++;
    for (const neighbor of graph.get(node) ?? []) {
      inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
      if (inDegree.get(neighbor) === 0) queue.push(neighbor);
    }
  }

  return processed < inDegree.size;
}

// ---------------------------------------------------------------------------
// Per-stage validators
// ---------------------------------------------------------------------------

const GOAL_ID_RE = /^[A-Z]{2}-\d{3}$/;

const VALID_ACTION_TYPES = new Set([
  "api_call",
  "tool_use",
  "data_read",
  "data_write",
  "message_send",
  "compute",
  "decision",
  "wait",
]);

function validateStage1(output: Stage1Output, result: ValidationResult): void {
  if (!output.goals || !Array.isArray(output.goals)) {
    result.errors.push("Stage 1: 'goals' array is missing or not an array");
    return;
  }
  if (output.goals.length === 0) {
    result.errors.push("Stage 1: 'goals' array is empty");
    return;
  }

  const seenIds = new Set<string>();
  for (const goal of output.goals) {
    if (!goal.id) {
      result.errors.push("Stage 1: goal is missing 'id' field");
      continue;
    }
    if (!GOAL_ID_RE.test(goal.id)) {
      result.errors.push(`Stage 1: goal_id '${goal.id}' does not match format XX-NNN`);
    }
    if (seenIds.has(goal.id)) {
      result.errors.push(`Stage 1: duplicate goal_id '${goal.id}'`);
    }
    seenIds.add(goal.id);

    if (!goal.statement) {
      result.errors.push(`Stage 1: goal '${goal.id}' missing 'statement'`);
    }
    if (!goal.type || !["achieve", "maintain"].includes(goal.type)) {
      result.errors.push(
        `Stage 1: goal '${goal.id}' has invalid type '${goal.type}' (must be achieve|maintain)`,
      );
    }
    if (goal.priority == null) {
      result.errors.push(`Stage 1: goal '${goal.id}' missing 'priority'`);
    }
    if (!goal.category) {
      result.errors.push(`Stage 1: goal '${goal.id}' missing 'category'`);
    }

    // Condition checks based on type
    if (goal.type === "achieve" && (!goal.conditions || goal.conditions.length === 0)) {
      result.warnings.push(`Stage 1: achieve goal '${goal.id}' has no achievement conditions`);
    }
    if (goal.type === "maintain" && (!goal.conditions || goal.conditions.length === 0)) {
      result.warnings.push(`Stage 1: maintain goal '${goal.id}' has no maintain conditions`);
    }
  }
}

// Collect all leaf goals from the refinement tree
function collectLeafGoals(goals: RefinedGoal[]): RefinedGoal[] {
  const leaves: RefinedGoal[] = [];
  function walk(g: RefinedGoal) {
    if (g.decomposition === "LEAF" || g.sub_goals.length === 0) {
      leaves.push(g);
    } else {
      for (const sub of g.sub_goals) walk(sub);
    }
  }
  for (const g of goals) walk(g);
  return leaves;
}

// Measure max depth of the refinement tree
function maxDepth(goals: RefinedGoal[], depth = 1): number {
  let max = depth;
  for (const g of goals) {
    if (g.sub_goals.length > 0) {
      max = Math.max(max, maxDepth(g.sub_goals, depth + 1));
    }
  }
  return max;
}

// Collect all goal IDs from the tree for dependency checking
function collectAllIds(goals: RefinedGoal[]): Set<string> {
  const ids = new Set<string>();
  function walk(g: RefinedGoal) {
    ids.add(g.id);
    for (const sub of g.sub_goals) walk(sub);
  }
  for (const g of goals) walk(g);
  return ids;
}

function validateStage2(output: Stage2Output, result: ValidationResult): void {
  if (!output.refined_goals || !Array.isArray(output.refined_goals)) {
    result.errors.push("Stage 2: 'refined_goals' array is missing or not an array");
    return;
  }

  const leaves = collectLeafGoals(output.refined_goals);
  for (const leaf of leaves) {
    if (!leaf.responsible_agent_type) {
      result.errors.push(`Stage 2: leaf goal '${leaf.id}' missing 'responsible_agent_type'`);
    }
  }

  const depth = maxDepth(output.refined_goals);
  if (depth > 5) {
    result.errors.push(`Stage 2: refinement depth ${depth} exceeds maximum of 5`);
  }

  // Check for dependency cycles
  const allIds = collectAllIds(output.refined_goals);
  const edges: Array<{ from: string; to: string }> = [];
  function collectEdges(goals: RefinedGoal[]) {
    for (const g of goals) {
      for (const dep of g.depends_on) {
        edges.push({ from: g.id, to: dep });
      }
      collectEdges(g.sub_goals);
    }
  }
  collectEdges(output.refined_goals);

  if (edges.length > 0 && detectCycle(edges)) {
    result.errors.push("Stage 2: circular dependency detected in goal dependency graph");
  }

  // Warn about dangling dependency references
  for (const edge of edges) {
    if (!allIds.has(edge.to)) {
      result.warnings.push(`Stage 2: goal '${edge.from}' depends on unknown id '${edge.to}'`);
    }
  }
}

function validateStage3(
  output: Stage3Output,
  result: ValidationResult,
  priorOutputs?: Record<number, unknown>,
): void {
  if (!output.projects || !Array.isArray(output.projects)) {
    result.errors.push("Stage 3: 'projects' array is missing or not an array");
    return;
  }

  const seenIds = new Set<string>();
  for (const proj of output.projects) {
    if (!proj.id) {
      result.errors.push("Stage 3: project missing 'id'");
      continue;
    }
    if (seenIds.has(proj.id)) {
      result.errors.push(`Stage 3: duplicate project_id '${proj.id}'`);
    }
    seenIds.add(proj.id);
  }

  // Cross-stage: check all leaf goals are assigned to exactly one project
  if (priorOutputs?.[2]) {
    const stage2 = priorOutputs[2] as Stage2Output;
    const leaves = collectLeafGoals(stage2.refined_goals);
    const goalToProjects = new Map<string, string[]>();
    for (const proj of output.projects) {
      for (const gid of proj.goals_addressed) {
        if (!goalToProjects.has(gid)) goalToProjects.set(gid, []);
        goalToProjects.get(gid)!.push(proj.id);
      }
    }
    for (const leaf of leaves) {
      const projects = goalToProjects.get(leaf.id);
      if (!projects || projects.length === 0) {
        result.warnings.push(`Stage 3: leaf goal '${leaf.id}' not assigned to any project`);
      } else if (projects.length > 1) {
        result.warnings.push(
          `Stage 3: leaf goal '${leaf.id}' assigned to multiple projects: ${projects.join(", ")}`,
        );
      }
    }
  }
}

function validateStage4(output: Stage4Output, result: ValidationResult): void {
  if (!output.plans || !Array.isArray(output.plans)) {
    result.errors.push("Stage 4: 'plans' array is missing or not an array");
    return;
  }

  for (const plan of output.plans) {
    if (!plan.plan_body?.steps || plan.plan_body.steps.length === 0) {
      result.errors.push(`Stage 4: plan '${plan.id}' has empty or missing plan_body.steps`);
    }
    if (!plan.context_condition) {
      result.warnings.push(`Stage 4: plan '${plan.id}' has no context_condition`);
    }
  }
}

function validateStage5(output: Stage5Output, result: ValidationResult): void {
  if (!output.tasks || !Array.isArray(output.tasks)) {
    result.errors.push("Stage 5: 'tasks' array is missing or not an array");
    return;
  }

  const seenIds = new Set<string>();
  const allTaskIds = new Set(output.tasks.map((t) => t.id));

  for (const task of output.tasks) {
    if (!task.id) {
      result.errors.push("Stage 5: task missing 'id'");
      continue;
    }
    if (seenIds.has(task.id)) {
      result.errors.push(`Stage 5: duplicate task_id '${task.id}'`);
    }
    seenIds.add(task.id);

    // Referential integrity for depends_on
    for (const dep of task.depends_on) {
      if (!allTaskIds.has(dep)) {
        result.errors.push(`Stage 5: task '${task.id}' depends on unknown task '${dep}'`);
      }
    }
  }

  // Cycle detection on task dependency graph
  const edges: Array<{ from: string; to: string }> = [];
  for (const task of output.tasks) {
    for (const dep of task.depends_on) {
      edges.push({ from: task.id, to: dep });
    }
  }
  if (edges.length > 0 && detectCycle(edges)) {
    result.errors.push("Stage 5: cycle detected in task dependency graph");
  }
}

function validateStage6(output: Stage6Output, result: ValidationResult): void {
  if (!output.actions || !Array.isArray(output.actions)) {
    result.errors.push("Stage 6: 'actions' array is missing or not an array");
    return;
  }

  for (const action of output.actions) {
    if (!VALID_ACTION_TYPES.has(action.action_type)) {
      result.errors.push(
        `Stage 6: action '${action.id}' has invalid action_type '${action.action_type}'`,
      );
    }
  }

  // Warn about unmapped tools
  const unmapped = output.actions.filter((a) => !a.is_mapped);
  if (unmapped.length > 0) {
    result.warnings.push(
      `Stage 6: ${unmapped.length} action(s) have no mapped tool: ${unmapped.map((a) => a.id).join(", ")}`,
    );
  }
}

function validateStage7(output: Stage7Output, result: ValidationResult): void {
  const ep = output.execution_plan;
  if (!ep) {
    result.errors.push("Stage 7: 'execution_plan' is missing");
    return;
  }
  if (!ep.dag?.nodes || !Array.isArray(ep.dag.nodes)) {
    result.errors.push("Stage 7: 'execution_plan.dag.nodes' is missing or not an array");
    return;
  }

  // Unique node IDs
  const seenIds = new Set<string>();
  const allNodeIds = new Set(ep.dag.nodes.map((n) => n.id));
  for (const node of ep.dag.nodes) {
    if (seenIds.has(node.id)) {
      result.errors.push(`Stage 7: duplicate node_id '${node.id}'`);
    }
    seenIds.add(node.id);
  }

  // Edge referential integrity
  for (const edge of ep.dag.edges ?? []) {
    if (!allNodeIds.has(edge.from)) {
      result.errors.push(`Stage 7: edge references unknown 'from' node '${edge.from}'`);
    }
    if (!allNodeIds.has(edge.to)) {
      result.errors.push(`Stage 7: edge references unknown 'to' node '${edge.to}'`);
    }
  }

  // DAG cycle detection
  const edges = (ep.dag.edges ?? []).map((e) => ({ from: e.from, to: e.to }));
  if (edges.length > 0 && detectCycle(edges)) {
    result.errors.push("Stage 7: cycle detected in execution DAG");
  }

  // Maintain checkpoints reference valid nodes
  for (const cp of ep.maintain_checkpoints ?? []) {
    if (cp.goal_id && !allNodeIds.has(cp.goal_id)) {
      // goal_id references goal, not node — this is a soft check
      result.warnings.push(
        `Stage 7: maintain checkpoint '${cp.id}' references goal '${cp.goal_id}' not present as a node`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Main validate function
// ---------------------------------------------------------------------------

const STAGE_VALIDATORS: Record<
  number,
  (output: unknown, result: ValidationResult, priorOutputs?: Record<number, unknown>) => void
> = {
  1: (o, r) => validateStage1(o as Stage1Output, r),
  2: (o, r) => validateStage2(o as Stage2Output, r),
  3: (o, r, p) => validateStage3(o as Stage3Output, r, p),
  4: (o, r) => validateStage4(o as Stage4Output, r),
  5: (o, r) => validateStage5(o as Stage5Output, r),
  6: (o, r) => validateStage6(o as Stage6Output, r),
  7: (o, r) => validateStage7(o as Stage7Output, r),
};

/**
 * Validates the output of a GDC pipeline stage.
 *
 * @param stageNumber - Pipeline stage (1-7)
 * @param output - The stage output to validate
 * @param priorOutputs - Outputs from earlier stages (keyed by stage number) for cross-stage checks
 * @returns Validation result with errors and warnings
 * @throws {ValidationError} if any errors are found
 */
export function validate(
  stageNumber: number,
  output: unknown,
  priorOutputs?: Record<number, unknown>,
): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  if (output == null) {
    result.valid = false;
    result.errors.push(`Stage ${stageNumber}: output is null or undefined`);
    throw new ValidationError(stageNumber, result.errors);
  }

  const validator = STAGE_VALIDATORS[stageNumber];
  if (!validator) {
    result.valid = false;
    result.errors.push(`Unknown stage number: ${stageNumber}`);
    throw new ValidationError(stageNumber, result.errors);
  }

  validator(output, result, priorOutputs);

  if (result.errors.length > 0) {
    result.valid = false;
    throw new ValidationError(stageNumber, result.errors);
  }

  return result;
}
