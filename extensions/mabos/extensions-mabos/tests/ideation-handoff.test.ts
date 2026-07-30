import { describe, expect, it } from "vitest";
import { assembleCompanyDNA } from "../src/ideation/index.js";
import { IrcOrchestrator } from "../src/ideation/orchestrator.js";
import type { CompanyDNA } from "../src/ideation/types.js";
import { ircTestConfig, routingLlm } from "./ideation-orchestrator.test.js";

const BMC_BLOCKS = [
  "customer_segments",
  "value_propositions",
  "channels",
  "customer_relationships",
  "revenue_streams",
  "key_resources",
  "key_activities",
  "key_partners",
  "cost_structure",
];

/** The fields GDC's buildStage1Variables reads from CompanyDNA. */
function assertSatisfiesGdcContract(dna: CompanyDNA): void {
  expect(typeof dna.business_description).toBe("string");
  expect(dna.business_description.length).toBeGreaterThan(0);
  expect(typeof dna.mission).toBe("string");
  expect(typeof dna.vision).toBe("string");
  expect(typeof dna.industry).toBe("string");
  expect(typeof dna.stage).toBe("string");
  expect(typeof dna.revenue).toBe("string");
  expect(typeof dna.team_size).toBe("number");
  expect(Array.isArray(dna.key_products)).toBe(true);
  expect(Array.isArray(dna.channels)).toBe(true);
  expect(Array.isArray(dna.constraints)).toBe(true);
  expect(dna.bmc).toBeDefined();
  for (const block of BMC_BLOCKS) {
    expect(Array.isArray((dna.bmc as unknown as Record<string, unknown>)[block])).toBe(true);
  }
}

describe("IRC → GDC handoff", () => {
  it("assembles a CompanyDNA that satisfies the GDC input contract", async () => {
    const orch = new IrcOrchestrator(ircTestConfig, routingLlm);
    const result = await orch.run({
      rawIdea: "dog walker booking app",
      industryHint: "pet services",
    });
    const dna = assembleCompanyDNA(result);

    assertSatisfiesGdcContract(dna);
    expect(dna.stage).toBe("idea");
    expect(dna.business_description).toContain("vetted"); // from the thesis value proposition
    expect(dna.key_products).toContain("vetted walks");
  });

  it("still produces a usable CompanyDNA from a partial run (idea frame only)", () => {
    const dna = assembleCompanyDNA({
      ideaFrame: {
        raw_idea: "raw",
        problem_statement: "a real problem",
        jobs_to_be_done: [],
        target_user_hypothesis: "users",
        assumed_value: "value",
        riskiest_assumptions: ["a"],
        industry_hint: "saas",
      },
      errors: [],
    });
    expect(dna.business_description.length).toBeGreaterThan(0);
    expect(dna.industry).toBe("saas");
    expect(dna.stage).toBe("idea");
  });
});
