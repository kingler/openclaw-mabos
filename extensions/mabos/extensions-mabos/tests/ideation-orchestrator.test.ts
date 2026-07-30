import { describe, expect, it } from "vitest";
import { IrcOrchestrator } from "../src/ideation/orchestrator.js";
import type { IrcPipelineConfig, LlmCallFn } from "../src/ideation/types.js";

const config: IrcPipelineConfig = {
  enabled: true,
  maxStage: 5,
  researchDepth: "light",
  maxResearchQueries: 3,
  validationGateEnabled: true,
  validationThreshold: 18,
  models: {},
  checkpointDir: "",
  enableCaching: false,
};

const STAGE_FIXTURES = {
  ideaFrame: {
    raw_idea: "dog walker booking app",
    problem_statement: "owners can't find trusted walkers",
    jobs_to_be_done: ["book a walk"],
    target_user_hypothesis: "urban dog owners",
    assumed_value: "trust + convenience",
    riskiest_assumptions: ["owners pay a premium"],
    industry_hint: "pet services",
  },
  marketResearch: {
    questions: ["q"],
    findings: [{ claim: "growing market", evidence: "reasoning", sources: [], unverified: true }],
    sizing: { tam: "$1B", sam: "$100M", som: "$5M", assumptions: ["urban only"] },
    trends: [],
    regulatory: [],
    mode: "analyst-only",
  },
  competitive: {
    competitors: [
      {
        name: "Rover",
        positioning: "marketplace",
        pricing_posture: "commission",
        strengths: ["scale"],
        weaknesses: ["trust"],
        sources: [],
      },
    ],
    positioning_gaps: ["premium vetted tier"],
    moat_hypotheses: ["local network effects"],
  },
  thesis: {
    value_proposition: "vetted premium dog walking",
    differentiation: "background-checked walkers",
    target_segment: "urban professionals",
    risk_register: [{ risk: "supply", likelihood: "med", mitigation: "incentives" }],
    simulator_objections: [],
    scores: { desirability: 0, viability: 0, feasibility: 0 },
    confidence: 0,
    recommendation: "refine",
  },
  businessModel: {
    bmc: {
      customer_segments: [{ title: "urban owners", description: "d" }],
      value_propositions: [{ title: "vetted walks", description: "d" }],
      channels: [{ title: "app store", description: "d" }],
      customer_relationships: [{ title: "self-serve", description: "d" }],
      revenue_streams: [{ title: "commission", description: "d" }],
      key_resources: [{ title: "walker network", description: "d" }],
      key_activities: [{ title: "vetting", description: "d" }],
      key_partners: [{ title: "vet clinics", description: "d" }],
      cost_structure: [{ title: "background checks", description: "d" }],
    },
    mission: "make pet care trustworthy",
    vision: "every dog well cared for",
    values: ["trust", "care"],
  },
};

/** Mock LLM that routes by the distinctive content of each stage prompt. */
const routingLlm: LlmCallFn = async ({ system }) => {
  if (system.includes("market-research questions")) return JSON.stringify(["q1", "q2", "q3"]);
  if (system.includes("problem framing") || system.includes("Jobs-to-be-Done"))
    return JSON.stringify(STAGE_FIXTURES.ideaFrame);
  if (system.includes("market research analyst"))
    return JSON.stringify(STAGE_FIXTURES.marketResearch);
  if (system.includes("competitive strategy analyst"))
    return JSON.stringify(STAGE_FIXTURES.competitive);
  if (system.includes("venture investor")) return JSON.stringify(STAGE_FIXTURES.thesis);
  if (system.includes("role-playing"))
    return JSON.stringify({
      objections: [],
      scores: { desirability: 7, viability: 7, feasibility: 7 },
    });
  if (system.includes("business model strategist"))
    return JSON.stringify(STAGE_FIXTURES.businessModel);
  throw new Error(`unexpected prompt: ${system.slice(0, 60)}`);
};

describe("IRC orchestrator", () => {
  it("runs all five stages with a routing mock", async () => {
    const orch = new IrcOrchestrator(config, routingLlm);
    const result = await orch.run({
      rawIdea: "dog walker booking app",
      industryHint: "pet services",
    });

    expect(result.ideaFrame?.problem_statement).toContain("walkers");
    expect(result.marketResearch?.mode).toBe("analyst-only");
    expect(result.competitiveLandscape?.competitors.length).toBe(1);
    expect(result.opportunityThesis?.recommendation).toBe("go"); // gate found no objections
    expect(result.businessModel?.mission).toContain("trustworthy");
    expect(result.errors).toEqual([]);
  });

  it("degrades gracefully when a stage fails", async () => {
    const failAtStage3: LlmCallFn = async (args) => {
      if (args.system.includes("competitive strategy analyst")) return "not json at all";
      return routingLlm(args);
    };
    const orch = new IrcOrchestrator(config, failAtStage3);
    const result = await orch.run({ rawIdea: "x" });

    expect(result.ideaFrame).toBeDefined();
    expect(result.marketResearch).toBeDefined();
    expect(result.competitiveLandscape).toBeUndefined();
    expect(result.opportunityThesis).toBeUndefined(); // depends on stage 3
    expect(result.errors.some((e) => e.includes("Stage 3"))).toBe(true);
  });
});

export { STAGE_FIXTURES, config as ircTestConfig, routingLlm };
