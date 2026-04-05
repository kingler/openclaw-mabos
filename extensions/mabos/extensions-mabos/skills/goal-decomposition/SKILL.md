# Goal Decomposition — 7-Stage Pipeline

Decomposes business goals into actionable tasks through a structured 7-stage pipeline grounded in KAOS, Tropos, GO-BPMN, and BDI methodologies. Each stage produces structured JSON stored in Mission Control.

## Prerequisites

- A goal must exist in `kanban_goals` (Mission Control)
- Company DNA available via `business.json` in workspace, or a `company-dna.md` file
- Agent has access to `start_decomposition_pipeline`, `submit_decomposition_stage`, `get_decomposition_status`, and `decompose_goal` tools

## Pipeline Initialization

Before executing stages, initialize the pipeline:

```
start_decomposition_pipeline(goalId, agentId)
→ returns { pipelineRunId }
```

To resume a partial run, call `get_decomposition_status(pipelineRunId)` and continue from the last completed stage.

---

## Stage 1: Business Goal Generation

**Purpose:** Generate candidate business goals from company DNA, or validate/enrich an existing goal.

**Input:** Read from workspace: `business.json` (vision, business_model, products_services, target_market, stage). If `company-dna.md` exists, use it for richer context. Also read existing `kanban_goals` from Mission Control via `get_goal_status`.

**System Role:** You are a KAOS business analyst specializing in goal-oriented requirements engineering.

**Prompt:**

```
Given the following company DNA:
- Vision: {{business_architecture.vision}}
- Business Model: {{business_model}}
- Products/Services: {{products_services}}
- Target Market: {{target_market}}
- Stage: {{stage}}

And the existing goals already in the system:
{{existing_goals}}

Generate business goals organized by these 8 categories:
1. Revenue Growth
2. Customer Acquisition
3. Brand Development
4. Operational Efficiency
5. Product/Service Excellence
6. Market Expansion
7. Financial Health
8. Team & Culture

For each goal provide: title, category, description, suggested_priority (1-10), suggested_domain, rationale.

If decomposing a specific existing goal (goalId: {{goalId}}), focus on enriching that goal's context rather than generating new ones.
```

**Output Schema:**

```json
{
  "goals": [
    {
      "title": "string",
      "category": "string",
      "description": "string",
      "suggested_priority": "number",
      "suggested_domain": "string",
      "rationale": "string"
    }
  ],
  "company_context": {
    "stage": "string",
    "key_constraints": ["string"],
    "primary_focus_areas": ["string"]
  }
}
```

**Tool Call:**

```
submit_decomposition_stage(pipelineRunId, 1, 'completed', outputJson)
```

**Gate:** At least 1 goal per applicable category. Each goal has a clear, measurable description.

---

## Stage 2: Goal Refinement & Typing

**Purpose:** Classify goals as achieve/maintain, apply AND/OR decomposition, identify obstacles and dependencies.

**Input:** Stage 1 output (via `get_decomposition_status`), the target goal from `kanban_goals`.

**System Role:** You are a KAOS goal modeling expert. Apply formal goal refinement: AND-decomposition (all subgoals required), OR-decomposition (alternative strategies), achieve goals (reach a target state), maintain goals (preserve an invariant).

**Prompt:**

```
Refine the following goal using KAOS methodology:
- Goal: {{goal.title}}
- Description: {{goal.description}}
- Domain: {{goal.domain}}
- Company Context: {{stage1.company_context}}

Produce:
1. goal_type: "achieve" or "maintain"
2. AND/OR decomposition tree (subgoals with refinement type)
3. Obstacles that could prevent goal achievement
4. Dependencies on other goals
5. Domain assumptions required for success
```

**Output Schema:**

```json
{
  "goal_type": "achieve|maintain",
  "refinement_tree": {
    "goal": "string",
    "type": "AND|OR",
    "children": [
      {
        "goal": "string",
        "type": "AND|OR|leaf",
        "children": [],
        "rationale": "string"
      }
    ]
  },
  "obstacles": [
    {
      "title": "string",
      "description": "string",
      "severity": "high|medium|low",
      "mitigation": "string"
    }
  ],
  "dependencies": [
    {
      "goal_title": "string",
      "dependency_type": "requires|enables|conflicts",
      "description": "string"
    }
  ],
  "assumptions": ["string"]
}
```

**Tool Call:**

```
submit_decomposition_stage(pipelineRunId, 2, 'completed', outputJson)
```

**Gate:** goal_type is set. Refinement tree has at least 2 levels. Every leaf node is actionable.

**Side Effect:** Stage 2 output with `goal_type` triggers MC to update `kanban_goals.goal_type`. Also persist to TypeDB via the knowledge tools if available.

---

## Stage 3: Project Scoping

**Purpose:** Define projects (campaigns) with agent teams, timelines, context variables, and resource requirements.

**Input:** Stage 2 output, available agents from Mission Control, domain expertise mapping from `DOMAIN_AGENTS`.

**System Role:** You are a Tropos actor-dependency modeler. Map each subgoal from the refinement tree to a project with assigned agent teams, considering actor dependencies and delegations.

**Prompt:**

```
Given the refined goal structure:
{{stage2.refinement_tree}}

And available agents:
{{available_agents}}

For each major branch of the refinement tree, define a project (campaign):
1. Title and description
2. Agent team: lead agent + supporting agents with roles
3. Timeline: start_date, end_date (relative to today)
4. Context variables: key metrics, thresholds, external dependencies
5. Resource requirements and constraints
6. Success criteria
```

**Output Schema:**

```json
{
  "campaigns": [
    {
      "title": "string",
      "description": "string",
      "domain": "string",
      "agent_team": [
        {
          "agent_id": "string",
          "agent_name": "string",
          "role": "lead|contributor|reviewer|advisor",
          "responsibilities": ["string"]
        }
      ],
      "timeline": {
        "start_date": "ISO date",
        "end_date": "ISO date",
        "milestones": [{ "title": "string", "target_date": "ISO date" }]
      },
      "context_variables": {
        "key": "value"
      },
      "success_criteria": ["string"]
    }
  ]
}
```

**Tool Call:**

```
submit_decomposition_stage(pipelineRunId, 3, 'completed', outputJson)
```

**Materialization:** For each campaign in output, create `kanban_campaigns` via MC API:

```
POST /api/kanban/campaigns { goalId, title, description, domain, ownerId, startDate, endDate }
```

**Gate:** Every campaign has at least one agent assigned. Timelines don't overlap where dependencies exist.

---

## Stage 4: Plan Generation

**Purpose:** Generate 2-3 alternative plans (initiatives) per campaign with context conditions and confidence scores.

**Input:** Stage 3 output, Stage 2 obstacles.

**System Role:** You are a GO-BPMN process designer. For each campaign, generate alternative execution plans with guard conditions that determine which plan is appropriate given runtime context.

**Prompt:**

```
For each campaign:
{{stage3.campaigns}}

Considering obstacles:
{{stage2.obstacles}}

Generate 2-3 alternative plans (initiatives) per campaign:
1. Title and description
2. Guard condition: when to select this plan (context predicate)
3. Confidence score (0.0-1.0): estimated likelihood of success
4. Required preconditions
5. Expected outcomes
6. Risk factors
```

**Output Schema:**

```json
{
  "plans_by_campaign": [
    {
      "campaign_title": "string",
      "campaign_id": "string (from Stage 3 materialization)",
      "initiatives": [
        {
          "title": "string",
          "description": "string",
          "guard_condition": "string (natural language predicate)",
          "confidence": "number (0.0-1.0)",
          "preconditions": ["string"],
          "expected_outcomes": ["string"],
          "risk_factors": ["string"],
          "is_default": "boolean"
        }
      ]
    }
  ]
}
```

**Tool Call:**

```
submit_decomposition_stage(pipelineRunId, 4, 'completed', outputJson)
```

**Materialization:** For each initiative, create `kanban_initiatives` via MC API:

```
POST /api/kanban/initiatives { campaignId, goalId, title, description, domain }
```

**Gate:** Each campaign has at least 2 plans. Default plan identified. Guard conditions are mutually intelligible.

---

## Stage 5: Task Decomposition

**Purpose:** Break each initiative's plan into concrete tasks with sequential/concurrent ordering and dependency graph.

**Input:** Stage 4 output (default or selected initiative per campaign).

**System Role:** You are an HTN (Hierarchical Task Network) planner. Decompose each plan into primitive tasks with ordering constraints and dependency edges.

**Prompt:**

```
For the selected initiative of each campaign:
{{selected_initiatives}}

Decompose into tasks:
1. Title and description
2. Assigned agent (from Stage 3 team)
3. Priority: low/normal/high/urgent
4. Estimated duration
5. Ordering: sequential index within initiative
6. Dependencies: which tasks must complete before this one starts (by index)
```

**Output Schema:**

```json
{
  "tasks_by_initiative": [
    {
      "initiative_title": "string",
      "initiative_id": "string",
      "campaign_id": "string",
      "tasks": [
        {
          "title": "string",
          "description": "string",
          "assignedAgentId": "string",
          "priority": "low|normal|high|urgent",
          "estimatedDuration": "string",
          "dependsOnIndex": "number|null"
        }
      ]
    }
  ]
}
```

**Tool Call:**

```
submit_decomposition_stage(pipelineRunId, 5, 'completed', outputJson)
```

**Materialization:** For each initiative's task list, call:

```
decompose_goal(goalId, campaignId, initiativeId, analysis, pipelineRunId, proposedTasks)
```

This creates tasks in Mission Control linked to the pipeline run with auto-generated descriptions.

**Gate:** Every task has a clear title. Dependencies form a DAG (no cycles). At least 2 tasks per initiative.

---

## Stage 6: Subtask & Action Generation

**Purpose:** Map each task to atomic actions with tool/API mappings and expected outputs.

**Input:** Stage 5 output, available tool list from agent capabilities.

**System Role:** You are an agent capability engineer. For each task, determine the specific tools, APIs, or manual actions needed, along with their expected inputs and outputs.

**Prompt:**

```
For each task created in Stage 5:
{{stage5.tasks}}

Available tools:
{{agent_tools}}

Generate atomic actions:
1. Action description
2. Tool or API to use (from available tools, or 'manual' for human actions)
3. Input parameters
4. Expected output / deliverable
5. Success criteria for this action
6. Estimated time
```

**Output Schema:**

```json
{
  "actions_by_task": [
    {
      "task_title": "string",
      "task_id": "string",
      "actions": [
        {
          "description": "string",
          "tool": "string|manual",
          "input_params": {},
          "expected_output": "string",
          "success_criteria": "string",
          "estimated_time": "string"
        }
      ],
      "expected_deliverables": [
        {
          "title": "string",
          "description": "string",
          "type": "file|url|artifact"
        }
      ]
    }
  ]
}
```

**Tool Call:**

```
submit_decomposition_stage(pipelineRunId, 6, 'completed', outputJson)
```

**Gate:** Every task has at least one action. Tool references exist in the available tools list or are marked 'manual'.

---

## Stage 7: Execution Plan Assembly

**Purpose:** Assemble the full DAG, compute critical path, and configure maintain-goal monitors.

**Input:** All prior stage outputs (1-6).

**System Role:** You are a BDI agent orchestrator. Assemble the complete execution plan as a directed acyclic graph, identify the critical path, and configure monitoring for maintain-type goals.

**Prompt:**

```
Given all pipeline outputs:
- Goals: {{stage1}}
- Refinement: {{stage2}}
- Campaigns: {{stage3}}
- Initiatives: {{stage4}}
- Tasks: {{stage5}}
- Actions: {{stage6}}

Produce:
1. DAG: nodes (tasks) and edges (dependencies) with estimated durations
2. Critical path: longest path through the DAG
3. Parallel execution groups: tasks that can run concurrently
4. Maintain-goal monitors: for maintain-type goals, define monitoring conditions
5. Rollback triggers: conditions that should pause or roll back execution
6. Success metrics: how to measure overall pipeline completion
```

**Output Schema:**

```json
{
  "dag": {
    "nodes": [
      {
        "id": "string (task_id)",
        "title": "string",
        "duration_hours": "number",
        "agent_id": "string"
      }
    ],
    "edges": [
      {
        "from": "string (task_id)",
        "to": "string (task_id)",
        "type": "depends_on|enables"
      }
    ]
  },
  "critical_path": ["string (task_id)"],
  "parallel_groups": [
    {
      "group_id": "number",
      "task_ids": ["string"],
      "estimated_duration_hours": "number"
    }
  ],
  "maintain_monitors": [
    {
      "goal_title": "string",
      "condition": "string",
      "check_interval": "string",
      "alert_threshold": "string"
    }
  ],
  "rollback_triggers": [
    {
      "condition": "string",
      "action": "pause|rollback|escalate",
      "affected_tasks": ["string"]
    }
  ],
  "success_metrics": {
    "total_estimated_hours": "number",
    "critical_path_hours": "number",
    "parallel_efficiency": "number (0.0-1.0)",
    "task_count": "number",
    "agent_count": "number"
  }
}
```

**Tool Call:**

```
submit_decomposition_stage(pipelineRunId, 7, 'completed', outputJson)
```

**Gate:** DAG is valid (no cycles). Critical path computed. All maintain-goals have monitors.

---

## Execution Modes

### Full Sequential (Default)

Execute stages 1 → 2 → 3 → 4 → 5 → 6 → 7 in order, submitting each before proceeding.

### Fan-Out at Stage 4

After Stage 3, generate plans for each campaign in parallel, then merge results before Stage 5.

### Partial Run

Use `startStage` and `endStage` parameters to run a subset:

```
start_decomposition_pipeline(goalId, agentId, startStage=3, endStage=5)
```

### Resume

Call `get_decomposition_status(pipelineRunId)` to see completed stages, then continue from the next pending stage.

---

## Error Handling

If any stage fails:

1. Submit with status `'failed'` and include `errorMessage`
2. Check if the failure is recoverable (bad input vs. system error)
3. For recoverable failures: fix input and re-submit the same stage
4. For system failures: escalate to stakeholder via `request_collaboration`

## BDI Integration

The `undecomposed_goals_scanner` in the cognitive signal scanners detects goals without pipeline runs and signals "deliberative" cognitive demand. This triggers this skill during the agent's BDI cycle when the cognitive router routes to deliberative depth.
