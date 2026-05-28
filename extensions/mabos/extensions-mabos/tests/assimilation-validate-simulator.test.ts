import { describe, it, expect, vi } from "vitest";
import type { ShapeNode } from "../src/cognitive/assimilation/shacl-mini.js";
import type { Bound } from "../src/cognitive/assimilation/types.js";
import { validate } from "../src/cognitive/assimilation/validate.js";
import type { Simulator, IntentionContext } from "../src/simulators/types.js";

const passingShape: ShapeNode = { targetClass: "any", properties: [] };
const okStore = { countFacts: async () => 0, getProperty: async () => 0 };

const intentionBound: Bound = {
  ok: true,
  factTypeId: "mabos:CommitsToFact",
  roles: {
    intention: "I-1",
    description: "raise prices",
    affects: "vw:Edition/sb-3",
    impactUsd: "5000",
    publicFacing: "true",
  },
  confidence: 0.95,
  source: "pattern",
};

const nonIntentionBound: Bound = {
  ok: true,
  factTypeId: "vw:editionMaxQuantityFact",
  roles: { edition: "vw:Edition/sb-3", qty: "50" },
  confidence: 0.95,
  source: "pattern",
};

function intentionFromBound(b: Bound): IntentionContext | null {
  if (b.factTypeId !== "mabos:CommitsToFact") return null;
  return {
    agentId: "vw-cfo",
    intentionId: String(b.roles.intention),
    description: String(b.roles.description ?? ""),
    affectedSubjects: String(b.roles.affects ?? "")
      .split(",")
      .filter(Boolean),
    estimatedImpactUsd: Number(b.roles.impactUsd) || 0,
    affectsPublicFacing: String(b.roles.publicFacing ?? "").toLowerCase() === "true",
  };
}

describe("validate — simulator gate (4th check)", () => {
  it("passes through when no simulators configured (backward compatible)", async () => {
    const r = await validate(nonIntentionBound, {
      shape: passingShape,
      rules: [],
      store: okStore,
    });
    expect(r.ok).toBe(true);
  });

  it("ignores the simulator gate for non-intention facts", async () => {
    const sim: Simulator = {
      id: "s1",
      appliesTo: () => true,
      evaluate: vi.fn(),
    };
    const r = await validate(nonIntentionBound, {
      shape: passingShape,
      rules: [],
      store: okStore,
      simulators: [sim],
      intentionFromBound,
    });
    expect(r.ok).toBe(true);
    expect(sim.evaluate).not.toHaveBeenCalled();
  });

  it("vetoes a high-stakes intention when a simulator disapproves", async () => {
    const sim: Simulator = {
      id: "stakeholder",
      appliesTo: () => true,
      evaluate: async () => ({
        approved: false,
        confidence: 0.9,
        reasoning: "trust impact",
        predictedReaction: "refunds",
        simulatorId: "stakeholder",
      }),
    };
    const r = await validate(intentionBound, {
      shape: passingShape,
      rules: [],
      store: okStore,
      simulators: [sim],
      intentionFromBound,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("simulator-veto");
      if (r.reason === "simulator-veto") expect(r.verdicts).toHaveLength(1);
    }
  });

  it("approves an intention when the simulator approves", async () => {
    const sim: Simulator = {
      id: "stakeholder",
      appliesTo: () => true,
      evaluate: async () => ({
        approved: true,
        confidence: 0.8,
        reasoning: "fine",
        predictedReaction: "neutral",
        simulatorId: "stakeholder",
      }),
    };
    const r = await validate(intentionBound, {
      shape: passingShape,
      rules: [],
      store: okStore,
      simulators: [sim],
      intentionFromBound,
    });
    expect(r.ok).toBe(true);
  });
});
