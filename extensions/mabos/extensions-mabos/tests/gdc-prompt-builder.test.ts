import { describe, it, expect } from "vitest";
import { buildPrompt, computeInputHash, summarizeForContext } from "../src/gdc/prompt-builder.js";

describe("GDC Prompt Builder", () => {
  it("loads and renders stage 1 template", () => {
    const { system, user } = buildPrompt(1, {
      company_description: "Test e-commerce company",
      mission_statement: "Sell great products",
      vision_statement: "Global leader in widgets",
    });
    expect(system.length).toBeGreaterThan(100);
    expect(user).toContain("Test e-commerce company");
    expect(user).not.toContain("{{company_description}}");
  });

  it("replaces unresolved variables with [NOT PROVIDED]", () => {
    const { user } = buildPrompt(1, { company_description: "Test" });
    expect(user).not.toContain("{{");
  });

  it("produces deterministic input hashes", () => {
    const input = { description: "test", mission: "test" };
    expect(computeInputHash(input)).toBe(computeInputHash(input));
    expect(computeInputHash(input)).toHaveLength(16);
  });

  it("different inputs produce different hashes", () => {
    expect(computeInputHash({ a: 1 })).not.toBe(computeInputHash({ a: 2 }));
  });

  it("summarizes stage 1 output", () => {
    const output = {
      goals: [
        {
          goal_id: "RG-001",
          goal_statement: "Grow",
          goal_type: "achieve",
          priority: "high",
          category: "revenue_growth",
        },
      ],
    };
    const summary = summarizeForContext(1, output);
    expect(summary).toContain("RG-001");
    expect(summary).toContain("revenue_growth");
  });

  it("throws for invalid stage number", () => {
    expect(() => buildPrompt(99)).toThrow("Unknown stage number: 99");
  });

  it("summarizes stage 3 projects", () => {
    const output = {
      projects: [
        {
          project_id: "P-001",
          project_name: "Launch MVP",
          priority: 1,
          goals_addressed: ["RG-001"],
          execution_wave: 1,
        },
      ],
    };
    const summary = summarizeForContext(3, output);
    const parsed = JSON.parse(summary);
    expect(parsed.projects[0].project_id).toBe("P-001");
    expect(parsed.projects[0].goals_addressed).toEqual(["RG-001"]);
  });

  it("summarizes stage 5 with critical path", () => {
    const output = {
      tasks: [{ id: "T-001" }, { id: "T-002" }],
      execution_dag: {
        critical_path: ["T-001", "T-002"],
        phases: [{ phase_number: 1, parallel_tasks: ["T-001"] }],
      },
    };
    const summary = summarizeForContext(5, output);
    const parsed = JSON.parse(summary);
    expect(parsed.tasks_count).toBe(2);
    expect(parsed.critical_path).toEqual(["T-001", "T-002"]);
  });
});
