import { describe, it, expect } from "vitest";
import { GdcOrchestrator } from "../src/gdc/orchestrator.js";
import type { CompanyDNA, GdcPipelineConfig, LlmCallFn } from "../src/gdc/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_DNA: CompanyDNA = {
  business_description: "Test e-commerce company selling widgets online, $100K ARR, 2-person team",
  mission: "Make widgets accessible to everyone",
  vision: "Leading widget marketplace globally",
  industry: "E-commerce",
  stage: "Growth",
  revenue: "$100K ARR",
  team_size: 2,
  key_products: ["Standard Widget", "Premium Widget"],
  channels: ["Website", "Amazon"],
  constraints: ["Limited budget", "Small team"],
};

function makeConfig(overrides: Partial<GdcPipelineConfig> = {}): GdcPipelineConfig {
  return {
    enabled: true,
    maxStage: 1,
    pattern: "sequential",
    maxParallelBranches: 1,
    models: {},
    checkpointDir: "",
    enableCaching: false,
    ...overrides,
  };
}

/** Stage 1 mock output matching the real Stage1Output / GeneratedGoal shape. */
function makeStage1Output() {
  return {
    goals: [
      {
        id: "RG-001",
        statement: "Increase revenue to $500K",
        type: "achieve",
        conditions: ["ARR >= 500K"],
        timeframe: "Q4 2026",
        priority: 1,
        strategic_alignment: "Core growth",
        kpi_metric: "ARR",
        kpi_target: "$500K",
        category: "revenue",
      },
      {
        id: "RG-002",
        statement: "Maintain customer retention above 90%",
        type: "maintain",
        conditions: ["retention >= 90%"],
        timeframe: "ongoing",
        priority: 2,
        strategic_alignment: "Sustainability",
        kpi_metric: "Retention Rate",
        kpi_target: "90%",
        category: "growth",
      },
      {
        id: "OP-001",
        statement: "Reduce fulfillment time to 2 days",
        type: "achieve",
        conditions: ["avg_fulfillment <= 2 days"],
        timeframe: "Q2 2026",
        priority: 3,
        strategic_alignment: "Operations",
        kpi_metric: "Fulfillment Time",
        kpi_target: "2 days",
        category: "operations",
      },
      {
        id: "OP-002",
        statement: "Maintain inventory accuracy above 98%",
        type: "maintain",
        conditions: ["accuracy >= 98%"],
        timeframe: "ongoing",
        priority: 4,
        strategic_alignment: "Operations",
        kpi_metric: "Inventory Accuracy",
        kpi_target: "98%",
        category: "operations",
      },
    ],
    metadata: {
      company_name: "Test Co",
      industry: "E-commerce",
      generated_at: "2026-04-05T00:00:00Z",
      model_used: "claude-sonnet-4-6",
    },
  };
}

/** Mock LLM that returns a valid stage-1 output for any call. */
function createMockLlm(): LlmCallFn {
  return async () => JSON.stringify(makeStage1Output());
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GDC Orchestrator", () => {
  it("runs stage 1 and produces goals", async () => {
    const orchestrator = new GdcOrchestrator(makeConfig({ maxStage: 1 }), createMockLlm());
    const result = await orchestrator.run(SAMPLE_DNA);

    expect(result.stage1).toBeDefined();
    expect(result.stage1!.goals).toHaveLength(4);
    expect(result.errors).toHaveLength(0);
  });

  it("stops at configured maxStage", async () => {
    const orchestrator = new GdcOrchestrator(makeConfig({ maxStage: 1 }), createMockLlm());
    const result = await orchestrator.run(SAMPLE_DNA);

    expect(result.stage1).toBeDefined();
    expect(result.stage2).toBeUndefined();
  });

  it("gracefully handles LLM failures", async () => {
    const failingLlm: LlmCallFn = async () => {
      throw new Error("API rate limited");
    };
    const orchestrator = new GdcOrchestrator(makeConfig({ maxStage: 1 }), failingLlm);
    const result = await orchestrator.run(SAMPLE_DNA);

    expect(result.stage1).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Stage 1 failed");
  });

  it("parses JSON from markdown code blocks", async () => {
    const codeBlockLlm: LlmCallFn = async () => {
      return "Here are the goals:\n```json\n" + JSON.stringify(makeStage1Output()) + "\n```";
    };
    const orchestrator = new GdcOrchestrator(makeConfig({ maxStage: 1 }), codeBlockLlm);
    const result = await orchestrator.run(SAMPLE_DNA);

    expect(result.stage1).toBeDefined();
    expect(result.stage1!.goals).toHaveLength(4);
  });

  it("includes BMC context in stage 1 prompt", async () => {
    let capturedUser = "";
    const capturingLlm: LlmCallFn = async ({ user }) => {
      capturedUser = user;
      return JSON.stringify(makeStage1Output());
    };

    const dnaWithBmc: CompanyDNA = {
      ...SAMPLE_DNA,
      bmc: {
        customer_segments: [{ title: "Home Decorators", description: "People who decorate homes" }],
        value_propositions: [{ title: "Unique Art", description: "One-of-a-kind pieces" }],
        channels: [],
        customer_relationships: [],
        revenue_streams: [],
        key_resources: [],
        key_activities: [],
        key_partners: [],
        cost_structure: [],
      },
    };

    const orchestrator = new GdcOrchestrator(makeConfig({ maxStage: 1 }), capturingLlm);
    await orchestrator.run(dnaWithBmc);

    expect(capturedUser).toContain("Home Decorators");
  });

  it("retries on validation failure with feedback", async () => {
    let callCount = 0;
    const retryLlm: LlmCallFn = async () => {
      callCount++;
      if (callCount === 1) {
        // First call returns invalid output (empty goals)
        return JSON.stringify({ goals: [], metadata: {} });
      }
      // Second call returns valid output
      return JSON.stringify(makeStage1Output());
    };

    const orchestrator = new GdcOrchestrator(makeConfig({ maxStage: 1 }), retryLlm);
    const result = await orchestrator.run(SAMPLE_DNA);

    expect(callCount).toBe(2);
    expect(result.stage1).toBeDefined();
    expect(result.errors).toHaveLength(0);
  });

  it("fails after max retries", async () => {
    const alwaysBadLlm: LlmCallFn = async () => {
      return JSON.stringify({ goals: [], metadata: {} });
    };

    const orchestrator = new GdcOrchestrator(makeConfig({ maxStage: 1 }), alwaysBadLlm);
    const result = await orchestrator.run(SAMPLE_DNA);

    expect(result.stage1).toBeUndefined();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Stage 1 failed");
  });

  it("skips downstream stages when upstream fails", async () => {
    const failingLlm: LlmCallFn = async () => {
      throw new Error("API down");
    };
    const orchestrator = new GdcOrchestrator(makeConfig({ maxStage: 3 }), failingLlm);
    const result = await orchestrator.run(SAMPLE_DNA);

    // Stage 1 fails, so stage 2 and 3 are never attempted
    expect(result.stage1).toBeUndefined();
    expect(result.stage2).toBeUndefined();
    expect(result.stage3).toBeUndefined();
    // Only one error from stage 1 (stages 2-3 skipped, not failed)
    expect(result.errors).toHaveLength(1);
  });
});
