import { describe, it, expect } from "vitest";
import type { Stage1Output, Stage5Output, Stage7Output } from "../src/gdc/types.js";
import { validate, detectCycle, ValidationError } from "../src/gdc/validator.js";

// ---------------------------------------------------------------------------
// Helpers — minimal valid fixtures
// ---------------------------------------------------------------------------

function makeStage1Output(overrides?: Partial<Stage1Output>): Stage1Output {
  return {
    goals: [
      {
        id: "RV-001",
        statement: "Increase revenue by 20%",
        type: "achieve",
        conditions: ["Revenue >= $1.2M"],
        timeframe: "Q4 2026",
        priority: 1,
        strategic_alignment: "Growth",
        kpi_metric: "revenue",
        kpi_target: "$1.2M",
        category: "revenue",
      },
      {
        id: "OP-002",
        statement: "Maintain 99.9% uptime",
        type: "maintain",
        conditions: ["Uptime >= 99.9%"],
        timeframe: "Ongoing",
        priority: 2,
        strategic_alignment: "Reliability",
        kpi_metric: "uptime",
        kpi_target: "99.9%",
        category: "operations",
      },
    ],
    metadata: {
      company_name: "Acme Corp",
      industry: "SaaS",
      generated_at: "2026-04-05T00:00:00Z",
      model_used: "claude-opus-4-6",
    },
    ...overrides,
  };
}

function makeStage5Output(tasks: Stage5Output["tasks"] = []): Stage5Output {
  return {
    tasks,
    execution_dag: { phases: [], critical_path: [] },
  };
}

function makeStage7Output(
  nodes: Stage7Output["execution_plan"]["dag"]["nodes"],
  edges: Stage7Output["execution_plan"]["dag"]["edges"] = [],
): Stage7Output {
  return {
    execution_plan: {
      id: "ep-001",
      summary: {
        total_goals: 1,
        total_projects: 1,
        total_plans: 1,
        total_tasks: nodes.length,
        total_actions: 0,
      },
      dag: { nodes, edges },
      critical_path: [],
      approval_gates: [],
      maintain_checkpoints: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Stage 1 tests
// ---------------------------------------------------------------------------

describe("GDC Validator — Stage 1", () => {
  it("accepts valid stage 1 output with achieve + maintain goals", () => {
    const output = makeStage1Output();
    const result = validate(1, output);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects stage 1 with missing goal_id", () => {
    const output = makeStage1Output();
    // Remove id from first goal
    (output.goals[0] as Record<string, unknown>).id = "";
    expect(() => validate(1, output)).toThrow(ValidationError);
    try {
      validate(1, output);
    } catch (e) {
      const ve = e as ValidationError;
      expect(ve.stage).toBe(1);
      expect(ve.errors.some((err) => err.includes("missing 'id'") || err.includes("format"))).toBe(
        true,
      );
    }
  });

  it("rejects stage 1 with duplicate goal_ids", () => {
    const output = makeStage1Output();
    output.goals[1].id = output.goals[0].id; // duplicate
    expect(() => validate(1, output)).toThrow(ValidationError);
    try {
      validate(1, output);
    } catch (e) {
      const ve = e as ValidationError;
      expect(ve.errors.some((err) => err.includes("duplicate"))).toBe(true);
    }
  });

  it("rejects stage 1 with invalid goal_type", () => {
    const output = makeStage1Output();
    (output.goals[0] as Record<string, unknown>).type = "destroy";
    expect(() => validate(1, output)).toThrow(ValidationError);
    try {
      validate(1, output);
    } catch (e) {
      const ve = e as ValidationError;
      expect(ve.errors.some((err) => err.includes("invalid type"))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Stage 5 tests — cycle detection
// ---------------------------------------------------------------------------

describe("GDC Validator — Stage 5 (cycles)", () => {
  it("detects dependency cycles in stage 5 tasks (T1→T2→T1)", () => {
    const output = makeStage5Output([
      {
        id: "T1",
        name: "Task 1",
        plan_id: "P1",
        assigned_agent_type: "ops",
        execution_mode: "auto",
        depends_on: ["T2"],
        duration: "1h",
      },
      {
        id: "T2",
        name: "Task 2",
        plan_id: "P1",
        assigned_agent_type: "ops",
        execution_mode: "auto",
        depends_on: ["T1"],
        duration: "1h",
      },
    ]);
    expect(() => validate(5, output)).toThrow(ValidationError);
    try {
      validate(5, output);
    } catch (e) {
      const ve = e as ValidationError;
      expect(ve.errors.some((err) => err.includes("cycle"))).toBe(true);
    }
  });

  it("accepts valid stage 5 output with no cycles", () => {
    const output = makeStage5Output([
      {
        id: "T1",
        name: "Task 1",
        plan_id: "P1",
        assigned_agent_type: "ops",
        execution_mode: "auto",
        depends_on: [],
        duration: "1h",
      },
      {
        id: "T2",
        name: "Task 2",
        plan_id: "P1",
        assigned_agent_type: "ops",
        execution_mode: "auto",
        depends_on: ["T1"],
        duration: "1h",
      },
    ]);
    const result = validate(5, output);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Stage 7 tests
// ---------------------------------------------------------------------------

describe("GDC Validator — Stage 7", () => {
  it("detects duplicate node_ids in stage 7", () => {
    const output = makeStage7Output([
      { id: "N1", label: "Node 1", type: "task", metadata: {} },
      { id: "N1", label: "Node 1 dup", type: "action", metadata: {} },
    ]);
    expect(() => validate(7, output)).toThrow(ValidationError);
    try {
      validate(7, output);
    } catch (e) {
      const ve = e as ValidationError;
      expect(ve.errors.some((err) => err.includes("duplicate node_id"))).toBe(true);
    }
  });

  it("accepts valid stage 7 with proper DAG", () => {
    const output = makeStage7Output(
      [
        { id: "N1", label: "Start", type: "task", metadata: {} },
        { id: "N2", label: "Process", type: "action", metadata: {} },
        { id: "N3", label: "End", type: "checkpoint", metadata: {} },
      ],
      [
        { from: "N1", to: "N2", relation: "sequence" },
        { from: "N2", to: "N3", relation: "sequence" },
      ],
    );
    const result = validate(7, output);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// detectCycle unit tests
// ---------------------------------------------------------------------------

describe("detectCycle (Kahn's algorithm)", () => {
  it("returns false for an acyclic graph", () => {
    expect(
      detectCycle([
        { from: "A", to: "B" },
        { from: "B", to: "C" },
      ]),
    ).toBe(false);
  });

  it("returns true for a cyclic graph", () => {
    expect(
      detectCycle([
        { from: "A", to: "B" },
        { from: "B", to: "A" },
      ]),
    ).toBe(true);
  });

  it("returns false for an empty graph", () => {
    expect(detectCycle([])).toBe(false);
  });
});
