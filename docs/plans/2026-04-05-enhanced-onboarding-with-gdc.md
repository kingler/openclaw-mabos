# Enhanced Business Onboarding with Goal Decomposition Chain

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the static 5-step onboarding wizard with a conversational, AI-assisted flow that collects Business Model Canvas data and feeds it into the Goal Decomposition Chain pipeline to provision agents with populated cognitive state.

**Architecture:** The onboarding wizard becomes a chat-like interface (inspired by GDC-UX's "Neo" pattern) that collects CompanyDNA + BMC in ~16 conversational steps, then triggers a 7-stage GDC pipeline (ported from goal-decomposition-chain as a TypeScript module) to generate goals, plans, tasks, and actions. These are written into agent cognitive files. Core agents (9) are always created; domain-specific agents are dynamically generated based on business type, industry, and BMC analysis.

**Tech Stack:** React 19 + TanStack Router (existing MABOS dashboard), Anthropic Claude API (via existing model router), SQLite (existing governance DB), TypeScript

---

## Context for Implementers

### Current State

- **Onboarding UI:** `extensions/mabos/extensions-mabos/ui/src/pages/OnboardingPage.tsx` + `ui/src/components/onboarding/WizardSteps.tsx` — a 5-step static form wizard (Business Info, Details, Agents, Review, Launch)
- **Backend:** `POST /mabos/api/onboard` in `extensions/mabos/extensions-mabos/index.ts` (lines ~1203-1626) — creates workspace directory, provisions 9 core agents with template files, optionally spawns domain agents
- **Agent templates:** `extensions/mabos/extensions-mabos/templates/base/agents/{role}/` — Persona.md, Capabilities.md, agent.json per role
- **Desire templates:** `extensions/mabos/extensions-mabos/templates/base/desires-{role}.md`

### Reference Projects

- **GDC pipeline:** `/Users/kinglerbercy/Projects/goal-decomposition-chain/` — 7-stage LLM pipeline (JS). Key files: `lib/orchestrator.js`, `lib/prompt_builder.js`, `lib/validator.js`, `prompts/stage{1-7}_*.md`, `schemas/stage{1-7}_output.json`
- **GDC-UX:** `/Users/kinglerbercy/Projects/goal-generation/gdc-ux/` — TanStack Start app with 18-step conversational onboarding. Key files: `src/routes/onboarding.tsx`, `src/components/onboarding/`, `src/server/functions/onboarding-ai.ts`

### Design Principles

1. **Business-agnostic core** — no business-specific logic in framework code
2. **Core agents always created** — 9 C-suite roles for any business
3. **Domain agents generated dynamically** — based on business type + industry + BMC analysis, not a hardcoded lookup table
4. **Graceful degradation** — if GDC pipeline fails, agents still provision with empty cognitive files (current behavior)
5. **Config-driven** — GDC pipeline depth, model selection, and agent generation all configurable

---

## Phase 1: GDC Pipeline Port (Backend)

Port the goal-decomposition-chain pipeline from JS to TypeScript as a MABOS module.

### Task 1: GDC Types and Schemas

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/gdc/types.ts`

**Step 1: Create GDC type definitions**

```typescript
// types.ts — All data models for the 7-stage Goal Decomposition Chain

export interface CompanyDNA {
  description: string; // What the business does (>=50 chars)
  mission: string; // Core purpose (>=10 chars)
  vision: string; // Aspirational future (>=10 chars)
  industry?: string;
  stage?: string; // Pre-revenue | Early | Growth | Scaling | Mature
  current_revenue?: string;
  team_size?: string;
  key_products?: string;
  primary_channels?: string;
  constraints?: string;
  // BMC fields (assembled from wizard)
  bmc?: BusinessModelCanvas;
}

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

export interface BmcItem {
  title: string;
  description: string;
}

// Stage 1: Goal Generation
export interface GeneratedGoal {
  goal_id: string; // Format: XX-NNN (category prefix + number)
  goal_statement: string;
  goal_type: "achieve" | "maintain";
  achievement_condition?: string;
  maintain_condition?: string;
  timeframe: string;
  priority: "critical" | "high" | "medium" | "low";
  strategic_alignment: string;
  kpi_metric: string;
  kpi_target: string;
  category: string;
}

export interface Stage1Output {
  goals: GeneratedGoal[];
  metadata: { total: number; by_category: Record<string, number> };
}

// Stage 2: Goal Refinement
export interface RefinedGoal {
  root_goal_id: string;
  refinement_type: "AND" | "OR" | "LEAF";
  sub_goals: RefinedGoal[];
  responsible_agent_type?: string;
  depends_on?: string[];
  achievement_condition?: string;
  goal_id: string;
  obstacles?: Obstacle[];
  softgoals?: Softgoal[];
}

export interface Obstacle {
  obstacle_id: string;
  description: string;
  likelihood: "high" | "medium" | "low";
  countermeasure_goal?: { goal_id: string; goal_type: "maintain" };
}

export interface Softgoal {
  attribute: string;
  weight: number;
}

export interface Stage2Output {
  refined_goals: RefinedGoal[];
}

// Stage 3: Project Scoping
export interface ProjectScope {
  project_id: string;
  project_name: string;
  project_type: "initiative" | "monitor";
  goals_addressed: string[];
  priority: "critical" | "high" | "medium" | "low";
  timeline: { estimated_start: string; estimated_end: string; estimated_duration_weeks: number };
  agent_team: AgentTeamMember[];
  execution_wave: number;
}

export interface AgentTeamMember {
  role: string; // orchestrator | planner | executor | monitor
  agent_type: string; // marketing_executor | sales_agent | etc.
  capabilities_required: string[];
  count: number;
}

export interface Stage3Output {
  projects: ProjectScope[];
  execution_waves: number[][];
}

// Stage 4: Plan Generation
export interface GeneratedPlan {
  plan_id: string;
  goal_id: string;
  plan_type: "achieve_plan" | "maintain_monitor" | "maintain_remediation";
  priority: number;
  context_condition: {
    expression: string;
    description: string;
    variables_referenced: string[];
  };
  plan_body: {
    steps: PlanStep[];
  };
}

export interface PlanStep {
  step_id: string;
  step_type: "sequential" | "parallel_start" | "parallel_join" | "conditional_branch";
  step_name: string;
  inputs: string[];
  produces: string[];
}

export interface Stage4Output {
  plans: GeneratedPlan[];
}

// Stage 5: Task Decomposition
export interface DecomposedTask {
  task_id: string;
  task_name: string;
  plan_id: string;
  assigned_agent_type: string;
  execution_mode: "sequential" | "concurrent";
  parallel_group?: string;
  depends_on: string[];
  estimated_duration_minutes: number;
  verification?: { success_criteria: string };
}

export interface Stage5Output {
  tasks: DecomposedTask[];
  execution_dag: {
    phases: Array<{
      phase_number: number;
      parallel_tasks: string[];
      estimated_duration_minutes: number;
    }>;
    critical_path: string[];
  };
}

// Stage 6: Action Generation
export interface GeneratedAction {
  action_id: string;
  task_id: string;
  action_type:
    | "api_call"
    | "tool_use"
    | "data_read"
    | "data_write"
    | "message_send"
    | "compute"
    | "decision"
    | "wait";
  action_name: string;
  tool_or_api?: string;
  is_mapped: boolean;
  parameters?: Record<string, unknown>;
  estimated_duration_seconds: number;
}

export interface Stage6Output {
  actions: GeneratedAction[];
  unmapped_capabilities: string[];
}

// Stage 7: Execution Assembly
export interface ExecutionPlan {
  plan_id: string;
  summary: {
    total_goals: number;
    total_projects: number;
    total_plans: number;
    total_tasks: number;
    total_actions: number;
    estimated_duration_parallel: string;
  };
  dag: {
    nodes: DagNode[];
    edges: Array<{ from: string; to: string }>;
  };
  critical_path: { node_ids: string[]; total_duration_seconds: number };
  approval_gates: ApprovalGate[];
  maintain_checkpoints: MaintainCheckpoint[];
}

export interface DagNode {
  node_id: string;
  node_type: "action" | "checkpoint" | "approval_gate" | "plan_selection" | "join" | "fork";
  goal_id: string;
  project_id: string;
  dependencies: string[];
}

export interface ApprovalGate {
  gate_id: string;
  inserted_before: string;
  required_approver_role: string;
  timeout_hours: number;
}

export interface MaintainCheckpoint {
  checkpoint_id: string;
  goal_id: string;
  inserted_before: string;
  check_interval_minutes: number;
}

export interface Stage7Output {
  execution_plan: ExecutionPlan;
}

// Pipeline configuration
export interface GdcPipelineConfig {
  enabled?: boolean;
  maxStage?: number; // Run up to this stage (1-7, default: 7)
  pattern?: "sequential" | "fan_out" | "priority_gated";
  maxParallelBranches?: number; // For fan_out (default: 4)
  models?: Partial<Record<`stage${1 | 2 | 3 | 4 | 5 | 6 | 7}`, string>>;
  checkpointDir?: string;
  enableCaching?: boolean;
}

// Domain agent generation
export interface DomainAgentSpec {
  id: string;
  role: string;
  description: string;
  capabilities: string[];
  reasoning_methods: string[];
  terminal_desires: string[];
  source: "industry" | "bmc" | "goal_analysis"; // Why this agent was generated
}

// Full pipeline result
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
```

**Step 2: Commit**

```bash
scripts/committer "feat(gdc): add Goal Decomposition Chain type definitions" extensions/mabos/extensions-mabos/src/gdc/types.ts
```

---

### Task 2: GDC Prompt Templates

Port the 7 stage prompt templates from the GDC project. These are markdown files with `{{variable}}` placeholders.

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/gdc/prompts/stage1-goal-generation.md`
- Create: `extensions/mabos/extensions-mabos/src/gdc/prompts/stage2-goal-refinement.md`
- Create: `extensions/mabos/extensions-mabos/src/gdc/prompts/stage3-project-scoping.md`
- Create: `extensions/mabos/extensions-mabos/src/gdc/prompts/stage4-plan-generation.md`
- Create: `extensions/mabos/extensions-mabos/src/gdc/prompts/stage5-task-decomposition.md`
- Create: `extensions/mabos/extensions-mabos/src/gdc/prompts/stage6-action-generation.md`
- Create: `extensions/mabos/extensions-mabos/src/gdc/prompts/stage7-execution-assembly.md`

**Step 1:** Copy prompt templates from `/Users/kinglerbercy/Projects/goal-decomposition-chain/prompts/` and adapt variable names to match the TypeScript types. Each template has `<system>` and `<user>` blocks.

**Step 2:** Add a domain-agent-generation prompt for dynamic agent creation:

- Create: `extensions/mabos/extensions-mabos/src/gdc/prompts/domain-agent-generation.md`

This prompt takes CompanyDNA + BMC + Stage1 goals + industry context and generates domain-specific agent specs. It should:

- Analyze the business type, industry, and BMC blocks
- Identify functional gaps not covered by the 9 core C-suite agents
- Generate 2-8 domain-specific agents with roles, capabilities, reasoning methods, and terminal desires
- Examples: for e-commerce → inventory-mgr, fulfillment-mgr, product-catalog-mgr; for SaaS → devops, customer-success, product-mgr; for healthcare → compliance-officer, patient-liaison; for manufacturing → supply-chain-mgr, quality-assurance

**Step 3: Commit**

```bash
scripts/committer "feat(gdc): add 7-stage prompt templates + domain agent generation prompt" extensions/mabos/extensions-mabos/src/gdc/prompts/
```

---

### Task 3: GDC Prompt Builder

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/gdc/prompt-builder.ts`

Port `lib/prompt_builder.js` to TypeScript. Key functions:

- `buildPrompt(stageNumber, variables)` — loads template, substitutes `{{variable}}` placeholders
- `summarizeForContext(stageNumber, priorOutputs)` — creates compressed summaries of prior stage outputs to fit token budgets
- `computeInputHash(input)` — SHA256 hash for checkpoint keying

Read templates from `src/gdc/prompts/` directory using `import.meta.url` or `__dirname` relative paths.

**Step 1: Write test**

```typescript
// extensions/mabos/extensions-mabos/tests/gdc-prompt-builder.test.ts
import { describe, it, expect } from "vitest";
import { buildPrompt, computeInputHash, summarizeForContext } from "../src/gdc/prompt-builder.js";

describe("GDC Prompt Builder", () => {
  it("substitutes variables in stage 1 template", () => {
    const { system, user } = buildPrompt(1, {
      company_description: "Test company selling widgets",
      mission_statement: "Make great widgets",
      vision_statement: "World leader in widgets",
    });
    expect(system).toContain("goal generation");
    expect(user).toContain("Test company selling widgets");
    expect(user).not.toContain("{{company_description}}");
  });

  it("produces deterministic input hashes", () => {
    const input = { description: "test", mission: "test" };
    const hash1 = computeInputHash(input);
    const hash2 = computeInputHash(input);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(16);
  });

  it("summarizes stage 1 output for context", () => {
    const stage1 = {
      goals: [{ goal_id: "RG-001", category: "revenue_growth" }],
      metadata: { total: 1, by_category: { revenue_growth: 1 } },
    };
    const summary = summarizeForContext(1, { stage1 });
    expect(summary).toContain("revenue_growth");
  });
});
```

**Step 2:** Run test, verify failure.

**Step 3:** Implement `prompt-builder.ts`.

**Step 4:** Run test, verify pass.

**Step 5: Commit**

---

### Task 4: GDC Validator

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/gdc/validator.ts`

Port `lib/validator.js` to TypeScript. Key functions:

- `validate(stageNumber, output)` — validates stage output against expected schema
- Per-stage checks: category counts, unique IDs, dependency cycle detection (Kahn's algorithm), referential integrity
- Throws `ValidationError` with structured feedback that can be appended to retry prompts

**Step 1: Write test**

```typescript
// extensions/mabos/extensions-mabos/tests/gdc-validator.test.ts
import { describe, it, expect } from "vitest";
import { validate, ValidationError } from "../src/gdc/validator.js";

describe("GDC Validator", () => {
  it("accepts valid stage 1 output", () => {
    const output = {
      goals: [
        {
          goal_id: "RG-001",
          goal_statement: "Grow revenue",
          goal_type: "achieve",
          category: "revenue_growth",
          priority: "high",
          timeframe: "Q2 2026",
          kpi_metric: "ARR",
          kpi_target: "$500K",
          strategic_alignment: "core",
          achievement_condition: "ARR >= 500K",
        },
        {
          goal_id: "RG-002",
          goal_statement: "Retain customers",
          goal_type: "maintain",
          category: "revenue_growth",
          priority: "high",
          timeframe: "ongoing",
          kpi_metric: "churn",
          kpi_target: "<5%",
          strategic_alignment: "core",
          maintain_condition: "churn < 5%",
        },
      ],
      metadata: { total: 2, by_category: { revenue_growth: 2 } },
    };
    expect(() => validate(1, output)).not.toThrow();
  });

  it("rejects stage 1 output with missing goal_id", () => {
    const output = { goals: [{ goal_statement: "test" }], metadata: { total: 1, by_category: {} } };
    expect(() => validate(1, output)).toThrow(ValidationError);
  });

  it("detects dependency cycles in stage 5", () => {
    const output = {
      tasks: [
        {
          task_id: "T1",
          depends_on: ["T2"],
          task_name: "a",
          plan_id: "P1",
          assigned_agent_type: "x",
          execution_mode: "sequential",
          estimated_duration_minutes: 5,
        },
        {
          task_id: "T2",
          depends_on: ["T1"],
          task_name: "b",
          plan_id: "P1",
          assigned_agent_type: "x",
          execution_mode: "sequential",
          estimated_duration_minutes: 5,
        },
      ],
      execution_dag: { phases: [], critical_path: [] },
    };
    expect(() => validate(5, output)).toThrow(/cycle/i);
  });
});
```

**Step 2-5:** TDD cycle + commit.

---

### Task 5: GDC Orchestrator

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/gdc/orchestrator.ts`

Port `lib/orchestrator.js` to TypeScript. This is the core pipeline engine.

**Key behavior:**

- `run(companyDNA, toolInventory?)` — main entry point
- Calls Claude API via the existing MABOS model router (not direct HTTP — use `httpRequest` from `tools/common.ts` or the Anthropic SDK)
- Sequential, fan-out, and priority-gated execution patterns
- Checkpoint save/load for resume capability
- Validation between stages with auto-retry (append validation errors to next prompt)
- Progressive context summarization to manage token budgets
- Returns `GdcResult` with all stage outputs

**Important:** The orchestrator must accept an LLM call function as a dependency (for testability and to use the existing model router):

```typescript
export type LlmCallFn = (params: {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
}) => Promise<string>;

export class GdcOrchestrator {
  constructor(config: GdcPipelineConfig, callLlm: LlmCallFn) { ... }
  async run(companyDNA: CompanyDNA, toolInventory?: ToolInventory): Promise<GdcResult> { ... }
}
```

**Step 1: Write test** — test stage 1 execution with a mock LLM that returns valid JSON.

**Step 2-5:** TDD cycle + commit.

---

### Task 6: Domain Agent Generator

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/gdc/domain-agent-generator.ts`

This module takes the pipeline output + CompanyDNA and generates domain-specific agent specs. It replaces the hardcoded `ecommerce → [inventory-mgr, fulfillment-mgr, product-mgr]` mapping with an LLM-driven generation step.

**Key behavior:**

- Inputs: CompanyDNA (including BMC), Stage1 goals, Stage3 projects, MABOS tool inventory
- Calls Claude to analyze gaps between core agents (CEO, CFO, COO, CMO, CTO, HR, Legal, Strategy, Knowledge) and the business requirements
- Outputs: `DomainAgentSpec[]` with id, role, description, capabilities, reasoning methods, terminal desires
- The LLM prompt should consider:
  - Business type and industry
  - BMC blocks (key activities, key resources, customer segments)
  - Generated goals (which functional areas are underserved by core agents?)
  - Available tools (which tools need a dedicated agent to operate them?)
- Validates output: unique IDs, no overlap with core agent roles, reasonable count (2-8 agents)

```typescript
export async function generateDomainAgents(params: {
  companyDNA: CompanyDNA;
  stage1Goals: Stage1Output;
  stage3Projects?: Stage3Output;
  toolInventory: string[]; // MABOS registered tool names
  callLlm: LlmCallFn;
  config?: { model?: string; maxAgents?: number };
}): Promise<DomainAgentSpec[]>;
```

**Step 1: Write test** — mock LLM returns agent specs for an e-commerce business.

**Step 2-5:** TDD cycle + commit.

---

### Task 7: Agent Cognitive File Writer

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/gdc/cognitive-writer.ts`

This module takes GDC pipeline output and writes it into agent cognitive files. It bridges the gap between "GDC generated goals/plans/tasks" and "agents have populated Beliefs.md, Desires.md, Goals.md, etc."

**Key behavior:**

- `writeCognitiveState(agentDir, agentRole, gdcResult, companyDNA)` — populates an agent's cognitive files
- Maps GDC goals to agent Desires.md (filtered by responsible_agent_type)
- Maps GDC plans to agent Plans.md
- Maps GDC obstacles to agent Observations.md
- Maps GDC project assignments to agent Intentions.md
- Writes KPI targets to agent Goals.md
- Writes BMC context to agent Beliefs.md
- Writes tool mappings to agent Skills.md

```typescript
export async function writeCognitiveState(params: {
  agentDir: string; // Path to agent's directory
  agentRole: string; // "ceo", "cmo", "inventory-mgr", etc.
  gdcResult: GdcResult;
  companyDNA: CompanyDNA;
  businessName: string;
}): Promise<void>;
```

**Step 1: Write test** — verify that writing cognitive state creates properly formatted markdown files.

**Step 2-5:** TDD cycle + commit.

---

### Task 8: GDC Module Index + Registration

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/gdc/index.ts`

Wire the GDC pipeline into the MABOS plugin system:

- Export `registerGdc(api, config)` function
- Register tools: `gdc_run` (run full pipeline), `gdc_status` (check pipeline status)
- Register HTTP route: `POST /mabos/gdc/run` (trigger pipeline from dashboard)
- Register HTTP route: `GET /mabos/gdc/status/:runId` (poll pipeline progress)
- Add `gdcEnabled` and `gdc` config fields to `MabosPluginConfig` in `src/tools/common.ts`
- Wire into main `index.ts` with conditional activation

**Step 1-5:** Implement, test, commit.

---

## Phase 2: Enhanced Onboarding UI

Replace the 5-step form wizard with a conversational flow inspired by GDC-UX.

### Task 9: Onboarding Chat Components

**Files:**

- Create: `extensions/mabos/extensions-mabos/ui/src/components/onboarding/NeoMessage.tsx`
- Create: `extensions/mabos/extensions-mabos/ui/src/components/onboarding/UserMessage.tsx`
- Create: `extensions/mabos/extensions-mabos/ui/src/components/onboarding/BmcBlockEditor.tsx`
- Create: `extensions/mabos/extensions-mabos/ui/src/components/onboarding/SuggestionCards.tsx`
- Create: `extensions/mabos/extensions-mabos/ui/src/components/onboarding/ReviewCard.tsx`
- Create: `extensions/mabos/extensions-mabos/ui/src/components/onboarding/StepsOverview.tsx`
- Create: `extensions/mabos/extensions-mabos/ui/src/components/onboarding/InlineForm.tsx`
- Create: `extensions/mabos/extensions-mabos/ui/src/components/onboarding/ChoiceCards.tsx`

Port the component patterns from GDC-UX's `src/components/onboarding/` directory, adapting to the existing MABOS design system (CSS variables, Radix UI components, Tailwind classes from the existing dashboard).

**NeoMessage** — AI assistant message bubble with markdown rendering, optional embedded component (forms, suggestions, BMC editor).

**UserMessage** — User response bubble.

**BmcBlockEditor** — Editable list of BmcItems with title+description, add/edit/delete, AI suggest button.

**SuggestionCards** — Display AI-generated suggestions (vision, mission, values, BMC items) with accept/edit/dismiss actions.

**ReviewCard** — Full summary of all onboarding data with section edit buttons.

**StepsOverview** — Visual step checklist showing completed/current/upcoming steps (16 steps: welcome, company, vision, mission, values, 9 BMC blocks, review, complete).

**InlineForm** — Dynamic form renderer supporting text, textarea, select, radio-cards, and tags input types.

**ChoiceCards** — Option cards for multiple-choice questions (business type, stage).

**Step 1:** Implement all components using existing MABOS design tokens.

**Step 2: Commit**

---

### Task 10: AI Suggestion Endpoint

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/onboarding/ai-suggestions.ts`
- Modify: `extensions/mabos/extensions-mabos/index.ts` — add route

Add `POST /mabos/api/onboard/suggest` endpoint that generates AI suggestions during onboarding:

```typescript
// Request body
interface SuggestionRequest {
  suggest_type: "vision" | "mission" | "values" | "bmc_block";
  workspace_context: {
    company_name: string;
    industry: string;
    stage: string;
    vision?: string;
    mission?: string;
    values?: string[];
    bmc_blocks?: Record<string, BmcItem[]>;
  };
  bmc_block_key?: string; // For bmc_block type
}

// Response
interface SuggestionResponse {
  suggestions: string[] | BmcItem[]; // strings for vision/mission/values, BmcItems for BMC
}
```

Uses Claude (via model router or direct API call) with a focused prompt that takes accumulated context and generates 3 suggestions. Each suggestion type has its own prompt template.

**Step 1: Write test** — mock Claude call, verify suggestion format.

**Step 2-5:** TDD cycle + commit.

---

### Task 11: Rewrite Onboarding Page

**Files:**

- Modify: `extensions/mabos/extensions-mabos/ui/src/pages/OnboardingPage.tsx`
- Modify: `extensions/mabos/extensions-mabos/ui/src/components/onboarding/WizardSteps.tsx` (or replace entirely)

Rewrite the onboarding page as a conversational chat interface with 16 steps:

1. **Welcome** — "I'm Neo, your Business Assistant. Let's set up your AI-powered business." Choice cards: New Business / Existing Business.
2. **Company Info** — Inline form: name, industry (free text), stage (choice cards: Pre-revenue / Early / Growth / Scaling / Mature).
3. **Vision** — Text area + "AI Suggest" button. SuggestionCards overlay.
4. **Mission** — Text area + "AI Suggest" button. SuggestionCards overlay.
5. **Values** — Tags input + "AI Suggest" button.
   6-14. **BMC Blocks** (9 steps) — BmcBlockEditor per block with AI suggest. Each step has Neo intro message explaining the block.
6. **Review** — ReviewCard showing all data with edit buttons per section.
7. **Launch** — Triggers:
   a. Save workspace (existing `POST /mabos/api/onboard`)
   b. Run GDC pipeline (new `POST /mabos/gdc/run`)
   c. Show progress: "Generating goals... Refining goal trees... Scoping projects... Creating plans... Decomposing tasks... Mapping actions... Assembling execution plan... Generating domain agents... Writing cognitive state..."
   d. On completion: show summary of what was created (N goals, N plans, N tasks, N domain agents), navigate to dashboard.

**State shape:**

```typescript
interface WorkspaceData {
  businessType: "new" | "existing";
  companyName: string;
  businessId: string; // slugified from name
  industry: string;
  stage: string;
  vision: string;
  mission: string;
  values: string[];
  bmcBlocks: Record<string, BmcItem[]>;
}
```

**Chat message pattern:** Each step adds a NeoMessage (with embedded component) and waits for user input. User responses are shown as UserMessages. Auto-scroll on new messages. Typing indicator before Neo messages.

**Step 1:** Implement the new OnboardingPage with chat flow.

**Step 2:** Wire up AI suggestion calls to `POST /mabos/api/onboard/suggest`.

**Step 3:** Wire up launch step to existing onboard endpoint + new GDC pipeline.

**Step 4: Commit**

---

### Task 12: Onboarding-GDC Integration

**Files:**

- Modify: `extensions/mabos/extensions-mabos/index.ts` — update the `POST /mabos/api/onboard` handler

Update the onboarding backend to integrate the GDC pipeline:

1. After creating the workspace directory and core agents (existing logic), check if GDC is enabled.
2. Assemble `CompanyDNA` from the onboarding request body (name, industry, stage, vision, mission, BMC blocks → description is synthesized from BMC).
3. Build `toolInventory` from the registered MABOS tool names.
4. Run the GDC orchestrator (stages 1-7, or up to `maxStage` from config).
5. Run domain agent generation using Stage 1 goals + CompanyDNA.
6. For each domain agent spec: create agent directory, write Persona.md from spec, initialize cognitive files.
7. For each agent (core + domain): call `writeCognitiveState()` to populate cognitive files from GDC output.
8. Return enhanced result with goal/plan/task counts and domain agent list.

**Graceful degradation:** If GDC pipeline fails at any stage, log the error, skip cognitive population, and return the basic onboarding result (agents created with empty cognitive files). The system should never fail to onboard because the AI pipeline errored.

**Step 1: Write test** — verify that onboarding with GDC enabled creates populated cognitive files.

**Step 2-5:** TDD cycle + commit.

---

## Phase 3: Domain Agent Generation Intelligence

### Task 13: Industry-Aware Agent Templates

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/gdc/prompts/domain-agent-generation.md`

Enhance the domain agent generation prompt with industry-specific guidance. The prompt should include:

**Core C-suite agents (always created, do not duplicate):**

- CEO, CFO, COO, CMO, CTO, HR, Legal, Strategy, Knowledge

**Industry signal analysis:**

- E-commerce → inventory, fulfillment, product catalog, marketplace operations
- SaaS → DevOps, customer success, product management, developer relations
- Healthcare → regulatory compliance, patient management, clinical operations
- Manufacturing → supply chain, quality assurance, production planning
- Professional services → engagement management, resource allocation, knowledge management
- Fintech → risk management, compliance, fraud detection
- Education → curriculum design, student success, enrollment
- Real estate → property management, leasing, maintenance

**BMC-driven signals:**

- Key Activities → map to operational agent roles
- Key Resources → if "intellectual property" → R&D agent; if "fleet" → logistics agent
- Customer Segments → if B2B + B2C → separate account management agents
- Revenue Streams → if multiple models → pricing/monetization agent
- Key Partners → if supply chain heavy → procurement agent

**Goal-driven signals:**

- If goals span areas with no core agent coverage → create specialist
- If a single core agent has >40% of goals → split into specialized sub-agents

The prompt must output valid `DomainAgentSpec[]` JSON with all required fields.

**Step 1:** Write the enhanced prompt.

**Step 2:** Test with 3 different business types (e-commerce, SaaS, healthcare).

**Step 3: Commit**

---

### Task 14: Agent Persona Generator

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/gdc/persona-generator.ts`

Generate rich Persona.md files for domain agents (core agents use templates; domain agents need generated personas).

```typescript
export async function generatePersona(params: {
  agentSpec: DomainAgentSpec;
  companyDNA: CompanyDNA;
  businessName: string;
  callLlm: LlmCallFn;
}): Promise<string>; // Returns Persona.md content
```

The generated persona should include:

- Agent name and role title
- Core responsibilities (3-5 bullet points)
- Decision-making authority and escalation paths
- Key stakeholder relationships (which other agents they collaborate with)
- Success metrics (derived from relevant goals)
- Communication style and preferences
- Reasoning methods appropriate to their domain

**Step 1: Write test.**

**Step 2-5:** TDD cycle + commit.

---

## Phase 4: Dashboard Integration

### Task 15: Onboarding Progress Component

**Files:**

- Create: `extensions/mabos/extensions-mabos/ui/src/components/onboarding/PipelineProgress.tsx`

A real-time progress component shown during the Launch step. Displays:

- Current pipeline stage (1-7) with stage names
- Spinning indicator on active stage
- Checkmarks on completed stages
- Domain agent generation status
- Cognitive file writing status
- Error display with retry option

Polls `GET /mabos/gdc/status/:runId` every 2 seconds for updates.

**Step 1:** Implement component.

**Step 2: Commit**

---

### Task 16: Post-Onboarding Dashboard Enhancement

**Files:**

- Modify: `extensions/mabos/extensions-mabos/ui/src/pages/OverviewPage.tsx` (or the main dashboard page)

After onboarding completes, the dashboard should show:

- Business profile card (name, industry, stage, BMC summary)
- Agent roster (core + domain agents with role descriptions)
- Goal summary (count by category, priority breakdown)
- Suggested next steps ("Connect integrations", "Review agent goals", "Configure approval thresholds")

**Step 1:** Add post-onboarding summary section.

**Step 2: Commit**

---

## Implementation Order

```
Phase 1 (Backend — GDC Pipeline):
  Task 1: Types              → 30 min
  Task 2: Prompt Templates   → 45 min
  Task 3: Prompt Builder     → 30 min
  Task 4: Validator          → 45 min
  Task 5: Orchestrator       → 60 min
  Task 6: Domain Agent Gen   → 45 min
  Task 7: Cognitive Writer   → 30 min
  Task 8: Module Registration→ 20 min

Phase 2 (Frontend — Enhanced Wizard):
  Task 9:  Chat Components   → 60 min
  Task 10: AI Suggestions    → 30 min
  Task 11: Onboarding Page   → 90 min
  Task 12: Integration       → 45 min

Phase 3 (Intelligence):
  Task 13: Industry Templates→ 30 min
  Task 14: Persona Generator → 30 min

Phase 4 (Dashboard):
  Task 15: Progress Component→ 30 min
  Task 16: Post-Onboarding   → 30 min
```

---

## Config Extension

Add to `MabosPluginConfig`:

```typescript
// GDC Pipeline
gdcEnabled?: boolean;              // Default: false
gdc?: GdcPipelineConfig;

// Enhanced onboarding
onboarding?: {
  conversationalMode?: boolean;    // Default: true (chat-like vs. static form)
  aiSuggestionsEnabled?: boolean;  // Default: true
  bmcEnabled?: boolean;            // Default: true (collect BMC during onboarding)
  domainAgentGeneration?: boolean; // Default: true (generate domain agents via LLM)
  maxDomainAgents?: number;        // Default: 8
};
```

---

## Key Design Decisions

1. **LLM call injection** — The orchestrator accepts a `callLlm` function rather than calling Claude directly. This enables testability (mock LLM in tests), uses the existing model router (respects fallback chains, cost tracking), and keeps the module framework-agnostic.

2. **Dynamic domain agents over static mapping** — Instead of `ecommerce → [inventory-mgr, fulfillment-mgr]`, the system analyzes BMC + goals + industry to generate contextually appropriate agents. A healthcare e-commerce company gets different agents than a fashion e-commerce company.

3. **Progressive context accumulation** — Each onboarding step feeds context to the next AI suggestion call. By step 16, Claude knows the full business model and generates better goals.

4. **Graceful degradation at every level** — If AI suggestions fail → show empty form. If GDC pipeline fails → agents created with empty files. If domain agent generation fails → only core agents created. The onboarding never blocks.

5. **Checkpoint-based resume** — The GDC pipeline checkpoints after each stage. If the browser disconnects during the Launch step, the pipeline can resume from the last completed stage on reconnect.
