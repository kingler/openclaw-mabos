import { describe, it, expect, vi } from "vitest";
import { makeStakeholderSimulator } from "../src/simulators/stakeholder-simulator.js";
import type { IntentionContext } from "../src/simulators/types.js";

const lowStakes: IntentionContext = {
  agentId: "vw-cfo",
  intentionId: "I-1",
  description: "tidy up the Q3 notes",
  affectedSubjects: [],
};

const highStakes: IntentionContext = {
  agentId: "vw-cfo",
  intentionId: "I-2",
  description: "Delay COA issuance by 14 days for cost savings",
  affectedSubjects: ["vw:Edition/spring-bloom-3"],
  estimatedImpactUsd: 12000,
  affectsPublicFacing: true,
};

describe("makeStakeholderSimulator", () => {
  it("does not apply to low-stakes intentions", () => {
    const sim = makeStakeholderSimulator({
      llm: { complete: vi.fn() },
      persona: "VividWalls collector lead",
    });
    expect(sim.appliesTo(lowStakes)).toBe(false);
  });

  it("applies to public-facing or high-impact intentions", () => {
    const sim = makeStakeholderSimulator({
      llm: { complete: vi.fn() },
      persona: "VividWalls collector lead",
    });
    expect(sim.appliesTo(highStakes)).toBe(true);
    expect(sim.appliesTo({ ...lowStakes, estimatedImpactUsd: 5000 })).toBe(true);
  });

  it("parses a structured verdict from the LLM response", async () => {
    const llm = {
      complete: vi
        .fn()
        .mockResolvedValue(
          "APPROVED: no\nCONFIDENCE: 0.85\nREACTION: collectors will demand refunds\nREASONING: trust impact too high",
        ),
    };
    const sim = makeStakeholderSimulator({ llm, persona: "VividWalls collector lead" });
    const v = await sim.evaluate(highStakes);
    expect(v.approved).toBe(false);
    expect(v.confidence).toBeCloseTo(0.85);
    expect(v.predictedReaction).toContain("refunds");
    expect(v.reasoning).toContain("trust impact");
    expect(v.simulatorId).toBe("stakeholder:VividWalls collector lead");
  });

  it("defaults confidence to 0.5 and clamps out-of-range values", async () => {
    const llm = {
      complete: vi.fn().mockResolvedValue("APPROVED: yes\nREACTION: fine\nREASONING: ok"),
    };
    const sim = makeStakeholderSimulator({ llm, persona: "p" });
    const v = await sim.evaluate(highStakes);
    expect(v.approved).toBe(true);
    expect(v.confidence).toBe(0.5);
  });

  it("respects a custom impact threshold", () => {
    const sim = makeStakeholderSimulator({
      llm: { complete: vi.fn() },
      persona: "p",
      impactThresholdUsd: 100,
    });
    expect(sim.appliesTo({ ...lowStakes, estimatedImpactUsd: 150 })).toBe(true);
    expect(sim.appliesTo({ ...lowStakes, estimatedImpactUsd: 50 })).toBe(false);
  });
});
