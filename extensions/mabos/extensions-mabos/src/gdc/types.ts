/**
 * Goal Decomposition Chain (GDC) — type definitions for the 7-stage
 * LLM pipeline that transforms business DNA into executable agent
 * goals, plans, and tasks.
 */

// ---------------------------------------------------------------------------
// Utility types
// ---------------------------------------------------------------------------

/** Function signature for LLM calls used throughout the pipeline. */
export type LlmCallFn = (params: {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
}) => Promise<string>;

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Single item within a Business Model Canvas block. */
export interface BmcItem {
  title: string;
  description: string;
}

/** Business Model Canvas — the 9 canonical blocks. */
export interface BusinessModelCanvas {
  customer_segments: BmcItem[];
  value_propositions: BmcItem[];
  channels: BmcItem[];
  customer_relationships: BmcItem[];
  revenue_streams: BmcItem[];
  key_resources: BmcItem[];
  key_activities: BmcItem[];
  key_partners: BmcItem[];
  cost_structure: BmcItem[];
}

/** Company DNA supplied as the root input to the GDC pipeline. */
export interface CompanyDNA {
  business_description: string;
  mission: string;
  vision: string;
  industry: string;
  stage: string;
  revenue: string;
  team_size: number;
  key_products: string[];
  channels: string[];
  constraints: string[];
  bmc?: BusinessModelCanvas;
}

/** A tool available in the execution environment. */
export interface ToolInventoryItem {
  name: string;
  description: string;
  capabilities: string[];
  auth_type: string;
}

// ---------------------------------------------------------------------------
// Stage 1 — Goal generation
// ---------------------------------------------------------------------------

/** Category of a generated goal. */
export type GoalCategory =
  | "revenue"
  | "growth"
  | "operations"
  | "product"
  | "marketing"
  | "customer_success"
  | "engineering"
  | "finance"
  | "hr"
  | "legal";

/** A business goal produced by Stage 1. */
export interface GeneratedGoal {
  id: string;
  statement: string;
  type: "achieve" | "maintain";
  conditions: string[];
  timeframe: string;
  priority: number;
  strategic_alignment: string;
  kpi_metric: string;
  kpi_target: string;
  category: GoalCategory;
}

/** Output of Stage 1 — raw goal generation from company DNA. */
export interface Stage1Output {
  goals: GeneratedGoal[];
  metadata: {
    company_name: string;
    industry: string;
    generated_at: string;
    model_used: string;
  };
}

// ---------------------------------------------------------------------------
// Stage 2 — Goal refinement (hierarchical AND/OR tree)
// ---------------------------------------------------------------------------

/** Type of decomposition for a refined goal node. */
export type GoalDecomposition = "AND" | "OR" | "LEAF";

/** Refined goal with hierarchical sub-goal structure. */
export interface RefinedGoal {
  id: string;
  statement: string;
  type: "achieve" | "maintain";
  decomposition: GoalDecomposition;
  sub_goals: RefinedGoal[];
  obstacles: string[];
  softgoals: string[];
  responsible_agent_type: string;
  depends_on: string[];
}

/** Output of Stage 2 — refined goal hierarchy. */
export interface Stage2Output {
  refined_goals: RefinedGoal[];
}

// ---------------------------------------------------------------------------
// Stage 3 — Project scoping
// ---------------------------------------------------------------------------

/** A project scope derived from refined goals. */
export interface ProjectScope {
  id: string;
  name: string;
  type: "initiative" | "monitor";
  goals_addressed: string[];
  priority: number;
  timeline: string;
  agent_team: string[];
  execution_wave: number;
}

/** Output of Stage 3 — project scoping and wave assignment. */
export interface Stage3Output {
  projects: ProjectScope[];
  execution_waves: number[];
}

// ---------------------------------------------------------------------------
// Stage 4 — Plan generation
// ---------------------------------------------------------------------------

/** A context condition that gates plan activation. */
export interface ContextCondition {
  expression: string;
  description: string;
  variables: Record<string, string>;
}

/** A single step within a plan body. */
export interface PlanStep {
  step_id: string;
  description: string;
  action_type: string;
  expected_output: string;
}

/** A plan generated for a specific goal. */
export interface GeneratedPlan {
  id: string;
  goal_id: string;
  plan_type: string;
  priority: number;
  context_condition: ContextCondition;
  plan_body: {
    steps: PlanStep[];
  };
}

/** Output of Stage 4 — plan generation. */
export interface Stage4Output {
  plans: GeneratedPlan[];
}

// ---------------------------------------------------------------------------
// Stage 5 — Task decomposition
// ---------------------------------------------------------------------------

/** A task decomposed from a plan. */
export interface DecomposedTask {
  id: string;
  name: string;
  plan_id: string;
  assigned_agent_type: string;
  execution_mode: string;
  depends_on: string[];
  duration: string;
}

/** A phase within the execution DAG. */
export interface ExecutionPhase {
  phase_id: string;
  name: string;
  task_ids: string[];
}

/** Output of Stage 5 — task decomposition with execution DAG. */
export interface Stage5Output {
  tasks: DecomposedTask[];
  execution_dag: {
    phases: ExecutionPhase[];
    critical_path: string[];
  };
}

// ---------------------------------------------------------------------------
// Stage 6 — Action mapping
// ---------------------------------------------------------------------------

/** An atomic action mapped to a tool or API. */
export interface GeneratedAction {
  id: string;
  task_id: string;
  action_type: string;
  action_name: string;
  tool_or_api: string;
  is_mapped: boolean;
  parameters: Record<string, unknown>;
  duration: string;
}

/** Output of Stage 6 — action mapping with gap analysis. */
export interface Stage6Output {
  actions: GeneratedAction[];
  unmapped_capabilities: string[];
}

// ---------------------------------------------------------------------------
// Stage 7 — Execution plan assembly
// ---------------------------------------------------------------------------

/** A node in the execution DAG. */
export interface DagNode {
  id: string;
  label: string;
  type: "task" | "action" | "gate" | "checkpoint";
  metadata: Record<string, unknown>;
}

/** An edge in the execution DAG. */
export interface DagEdge {
  from: string;
  to: string;
  relation: string;
}

/** An approval gate in the execution plan. */
export interface ApprovalGate {
  id: string;
  description: string;
  required_approver: string;
  before_node: string;
}

/** A checkpoint for maintain-type goals. */
export interface MaintainCheckpoint {
  id: string;
  goal_id: string;
  schedule: string;
  check_description: string;
}

/** The fully assembled execution plan. */
export interface ExecutionPlan {
  id: string;
  summary: {
    total_goals: number;
    total_projects: number;
    total_plans: number;
    total_tasks: number;
    total_actions: number;
  };
  dag: {
    nodes: DagNode[];
    edges: DagEdge[];
  };
  critical_path: string[];
  approval_gates: ApprovalGate[];
  maintain_checkpoints: MaintainCheckpoint[];
}

/** Output of Stage 7 — final execution plan. */
export interface Stage7Output {
  execution_plan: ExecutionPlan;
}

// ---------------------------------------------------------------------------
// Pipeline configuration
// ---------------------------------------------------------------------------

/** Configuration for the GDC pipeline. */
export interface GdcPipelineConfig {
  enabled: boolean;
  /** Maximum stage to run (1-7). */
  maxStage: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** Pipeline execution pattern. */
  pattern: "sequential" | "fan_out" | "priority_gated";
  maxParallelBranches: number;
  /** LLM model override per stage (keyed by stage number). */
  models: Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7, string>>;
  checkpointDir: string;
  enableCaching: boolean;
}

// ---------------------------------------------------------------------------
// Agent generation
// ---------------------------------------------------------------------------

/** Specification for a domain-specific agent generated by the pipeline. */
export interface DomainAgentSpec {
  id: string;
  role: string;
  description: string;
  capabilities: string[];
  reasoning_methods: string[];
  terminal_desires: string[];
  source: "industry" | "bmc" | "goal_analysis";
}

// ---------------------------------------------------------------------------
// Aggregate result
// ---------------------------------------------------------------------------

/** Full result of a GDC pipeline run (stages are optional since pipeline can stop early). */
export interface GdcResult {
  stage1?: Stage1Output;
  stage2?: Stage2Output;
  stage3?: Stage3Output;
  stage4?: Stage4Output;
  stage5?: Stage5Output;
  stage6?: Stage6Output;
  stage7?: Stage7Output;
  domain_agents: DomainAgentSpec[];
  errors: string[];
}
