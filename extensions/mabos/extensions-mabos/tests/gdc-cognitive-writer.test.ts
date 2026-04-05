import { randomUUID } from "node:crypto";
import { readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeCognitiveState } from "../src/gdc/cognitive-writer.js";
import type {
  CompanyDNA,
  GdcResult,
  GeneratedGoal,
  RefinedGoal,
  Stage1Output,
  Stage2Output,
  Stage4Output,
  Stage5Output,
  Stage6Output,
} from "../src/gdc/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDNA(overrides?: Partial<CompanyDNA>): CompanyDNA {
  return {
    business_description: "E-commerce wall art",
    mission: "Make walls vivid",
    vision: "Art in every home",
    industry: "E-commerce",
    stage: "growth",
    revenue: "$500K",
    team_size: 12,
    key_products: ["Canvas prints", "Framed art"],
    channels: ["Shopify", "Instagram"],
    constraints: ["Limited budget"],
    bmc: {
      customer_segments: [{ title: "Homeowners", description: "25-45 urban" }],
      value_propositions: [{ title: "Affordable art", description: "Quality at scale" }],
      channels: [{ title: "Online store", description: "Shopify-based" }],
      customer_relationships: [{ title: "Self-service", description: "Automated" }],
      revenue_streams: [{ title: "Product sales", description: "Direct" }],
      key_resources: [{ title: "Printing infra", description: "On-demand" }],
      key_activities: [{ title: "Fulfillment", description: "Print and ship" }],
      key_partners: [{ title: "Print provider", description: "Printful" }],
      cost_structure: [{ title: "COGS", description: "Materials + shipping" }],
    },
    ...overrides,
  };
}

function makeGoal(overrides?: Partial<GeneratedGoal>): GeneratedGoal {
  return {
    id: "MK-001",
    statement: "Increase social media engagement by 30%",
    type: "achieve",
    conditions: ["Engagement rate >= 5%"],
    timeframe: "Q3 2026",
    priority: 2,
    strategic_alignment: "Brand awareness",
    kpi_metric: "engagement_rate",
    kpi_target: "5%",
    category: "marketing",
    ...overrides,
  };
}

function makeRefinedGoal(overrides?: Partial<RefinedGoal>): RefinedGoal {
  return {
    id: "MK-001",
    statement: "Increase social media engagement",
    type: "achieve",
    decomposition: "AND",
    sub_goals: [],
    obstacles: ["Low follower count", "Content inconsistency"],
    softgoals: ["Brand voice consistency"],
    responsible_agent_type: "cmo",
    depends_on: [],
    ...overrides,
  };
}

function makeStage1(goals?: GeneratedGoal[]): Stage1Output {
  return {
    goals: goals ?? [
      makeGoal(),
      makeGoal({
        id: "RV-001",
        statement: "Increase revenue by 20%",
        category: "revenue",
        priority: 1,
        kpi_metric: "revenue",
        kpi_target: "$600K",
        timeframe: "Q4 2026",
      }),
      makeGoal({
        id: "OP-001",
        statement: "Reduce order fulfillment time",
        category: "operations",
        priority: 3,
        kpi_metric: "fulfillment_days",
        kpi_target: "2 days",
        timeframe: "Q2 2026",
      }),
    ],
    metadata: {
      company_name: "VividWalls",
      industry: "E-commerce",
      generated_at: "2026-04-05T00:00:00Z",
      model_used: "claude-opus-4-6",
    },
  };
}

function makeStage2(refined?: RefinedGoal[]): Stage2Output {
  return {
    refined_goals: refined ?? [
      makeRefinedGoal(),
      makeRefinedGoal({
        id: "RV-001",
        statement: "Grow revenue",
        responsible_agent_type: "ceo",
        obstacles: ["Market saturation"],
        sub_goals: [
          makeRefinedGoal({
            id: "RV-001-1",
            statement: "Launch new product line",
            responsible_agent_type: "inventory-mgr",
            obstacles: [],
            decomposition: "LEAF",
          }),
        ],
      }),
    ],
  };
}

function makeMinimalResult(overrides?: Partial<GdcResult>): GdcResult {
  return {
    domain_agents: [],
    errors: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("cognitive-writer", () => {
  let agentDir: string;

  beforeEach(() => {
    agentDir = join(tmpdir(), `cognitive-writer-test-${randomUUID()}`);
  });

  afterEach(async () => {
    await rm(agentDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // 1. Beliefs.md
  // -------------------------------------------------------------------------

  it("writes Beliefs.md with business context and BMC", async () => {
    const dna = makeDNA();
    const result = await writeCognitiveState({
      agentDir,
      agentRole: "cmo",
      gdcResult: makeMinimalResult(),
      companyDNA: dna,
      businessName: "VividWalls",
    });

    expect(result.filesWritten).toContain("Beliefs.md");

    const content = await readFile(join(agentDir, "Beliefs.md"), "utf-8");
    expect(content).toContain("# Beliefs — VividWalls");
    expect(content).toContain("**Industry:** E-commerce");
    expect(content).toContain("**Mission:** Make walls vivid");
    expect(content).toContain("**Vision:** Art in every home");
    expect(content).toContain("## Business Model");
    expect(content).toContain("Homeowners");
    expect(content).toContain("I am the cmo agent for VividWalls");
  });

  // -------------------------------------------------------------------------
  // 2. Desires.md — filtered by role
  // -------------------------------------------------------------------------

  it("writes Desires.md with goals filtered by role (CMO gets marketing)", async () => {
    const result = await writeCognitiveState({
      agentDir,
      agentRole: "cmo",
      gdcResult: makeMinimalResult({ stage1: makeStage1(), stage2: makeStage2() }),
      companyDNA: makeDNA(),
      businessName: "VividWalls",
    });

    expect(result.filesWritten).toContain("Desires.md");

    const content = await readFile(join(agentDir, "Desires.md"), "utf-8");
    expect(content).toContain("# Desires — cmo @ VividWalls");
    // CMO should see marketing goal
    expect(content).toContain("Increase social media engagement");
    // CMO should NOT see revenue goal
    expect(content).not.toContain("Increase revenue by 20%");
    // CMO should NOT see operations goal
    expect(content).not.toContain("Reduce order fulfillment");
  });

  // -------------------------------------------------------------------------
  // 3. Goals.md with KPI table
  // -------------------------------------------------------------------------

  it("writes Goals.md with KPI table for the role", async () => {
    const result = await writeCognitiveState({
      agentDir,
      agentRole: "ceo",
      gdcResult: makeMinimalResult({ stage1: makeStage1() }),
      companyDNA: makeDNA(),
      businessName: "VividWalls",
    });

    expect(result.filesWritten).toContain("Goals.md");

    const content = await readFile(join(agentDir, "Goals.md"), "utf-8");
    expect(content).toContain("| ID | Goal | Type | Priority | KPI | Target | Timeframe |");
    // CEO should see revenue goal
    expect(content).toContain("RV-001");
    expect(content).toContain("$600K");
    // CEO should NOT see operations goal
    expect(content).not.toContain("OP-001");
  });

  // -------------------------------------------------------------------------
  // 4. Creates agent directory if it doesn't exist
  // -------------------------------------------------------------------------

  it("creates agent directory if it does not exist", async () => {
    const nested = join(agentDir, "deep", "nested", "agent");
    await writeCognitiveState({
      agentDir: nested,
      agentRole: "coo",
      gdcResult: makeMinimalResult(),
      companyDNA: makeDNA(),
      businessName: "VividWalls",
    });

    const dirStat = await stat(nested);
    expect(dirStat.isDirectory()).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 5. Returns list of files written
  // -------------------------------------------------------------------------

  it("returns the list of all files written", async () => {
    const result = await writeCognitiveState({
      agentDir,
      agentRole: "cmo",
      gdcResult: makeMinimalResult({
        stage1: makeStage1(),
        stage2: makeStage2(),
        stage4: {
          plans: [
            {
              id: "PL-001",
              goal_id: "MK-001",
              plan_type: "proactive",
              priority: 1,
              context_condition: {
                expression: "true",
                description: "Always active",
                variables: {},
              },
              plan_body: {
                steps: [
                  {
                    step_id: "S1",
                    description: "Create content calendar",
                    action_type: "create",
                    expected_output: "Calendar doc",
                  },
                ],
              },
            },
          ],
        },
        stage5: {
          tasks: [
            {
              id: "T-001",
              name: "Draft posts",
              plan_id: "PL-001",
              assigned_agent_type: "cmo",
              execution_mode: "autonomous",
              depends_on: [],
              duration: "2h",
            },
          ],
          execution_dag: { phases: [], critical_path: [] },
        },
        stage6: {
          actions: [
            {
              id: "A-001",
              task_id: "T-001",
              action_type: "api_call",
              action_name: "post_to_instagram",
              tool_or_api: "instagram_api",
              is_mapped: true,
              parameters: { caption: "string" },
              duration: "5m",
            },
          ],
          unmapped_capabilities: [],
        },
      }),
      companyDNA: makeDNA(),
      businessName: "VividWalls",
    });

    expect(result.filesWritten).toEqual([
      "Beliefs.md",
      "Desires.md",
      "Goals.md",
      "Plans.md",
      "Intentions.md",
      "Observations.md",
      "Skills.md",
    ]);
  });

  // -------------------------------------------------------------------------
  // 6. Handles missing stage outputs gracefully
  // -------------------------------------------------------------------------

  it("writes only Beliefs.md when no pipeline stages are present", async () => {
    const result = await writeCognitiveState({
      agentDir,
      agentRole: "ceo",
      gdcResult: makeMinimalResult(),
      companyDNA: makeDNA(),
      businessName: "VividWalls",
    });

    expect(result.filesWritten).toEqual(["Beliefs.md"]);
  });

  it("writes Beliefs + Desires + Goals when only stage1 is present", async () => {
    const result = await writeCognitiveState({
      agentDir,
      agentRole: "cmo",
      gdcResult: makeMinimalResult({ stage1: makeStage1() }),
      companyDNA: makeDNA(),
      businessName: "VividWalls",
    });

    expect(result.filesWritten).toEqual(["Beliefs.md", "Desires.md", "Goals.md"]);
  });

  // -------------------------------------------------------------------------
  // 7. Domain agents get goals via responsible_agent_type
  // -------------------------------------------------------------------------

  it("assigns goals to domain agents via responsible_agent_type", async () => {
    const result = await writeCognitiveState({
      agentDir,
      agentRole: "inventory-mgr",
      gdcResult: makeMinimalResult({
        stage1: makeStage1(),
        stage2: makeStage2(),
      }),
      companyDNA: makeDNA(),
      businessName: "VividWalls",
    });

    expect(result.filesWritten).toContain("Desires.md");

    const content = await readFile(join(agentDir, "Desires.md"), "utf-8");
    // inventory-mgr is responsible for RV-001 via sub-goal responsible_agent_type
    expect(content).toContain("Increase revenue by 20%");
    // Should not have marketing goals
    expect(content).not.toContain("social media engagement");
  });

  // -------------------------------------------------------------------------
  // Extra: Observations.md with obstacles
  // -------------------------------------------------------------------------

  it("writes Observations.md with obstacles for the agent role", async () => {
    await writeCognitiveState({
      agentDir,
      agentRole: "cmo",
      gdcResult: makeMinimalResult({ stage2: makeStage2() }),
      companyDNA: makeDNA(),
      businessName: "VividWalls",
    });

    const content = await readFile(join(agentDir, "Observations.md"), "utf-8");
    expect(content).toContain("# Observations");
    expect(content).toContain("Low follower count");
    expect(content).toContain("Content inconsistency");
    // CEO's obstacle should not appear for CMO
    expect(content).not.toContain("Market saturation");
  });

  // -------------------------------------------------------------------------
  // Extra: Plans.md content
  // -------------------------------------------------------------------------

  it("writes Plans.md with steps for relevant goals", async () => {
    const stage4: Stage4Output = {
      plans: [
        {
          id: "PL-MK",
          goal_id: "MK-001",
          plan_type: "proactive",
          priority: 1,
          context_condition: {
            expression: "engagement < 5",
            description: "When engagement is low",
            variables: { engagement: "number" },
          },
          plan_body: {
            steps: [
              {
                step_id: "S1",
                description: "Audit current content",
                action_type: "analyze",
                expected_output: "Content report",
              },
            ],
          },
        },
        {
          id: "PL-RV",
          goal_id: "RV-001",
          plan_type: "reactive",
          priority: 2,
          context_condition: {
            expression: "revenue < target",
            description: "Revenue miss",
            variables: {},
          },
          plan_body: { steps: [] },
        },
      ],
    };

    await writeCognitiveState({
      agentDir,
      agentRole: "cmo",
      gdcResult: makeMinimalResult({ stage1: makeStage1(), stage4 }),
      companyDNA: makeDNA(),
      businessName: "VividWalls",
    });

    const content = await readFile(join(agentDir, "Plans.md"), "utf-8");
    expect(content).toContain("PL-MK");
    expect(content).toContain("Audit current content");
    // Revenue plan should not appear for CMO
    expect(content).not.toContain("PL-RV");
  });
});
