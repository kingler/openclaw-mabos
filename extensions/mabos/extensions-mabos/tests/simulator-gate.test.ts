import { describe, it, expect, vi } from "vitest";
import { runSimulatorGate } from "../src/cognitive/assimilation/simulator-gate.js";
import type { Simulator, IntentionContext } from "../src/simulators/types.js";

const ctx: IntentionContext = {
  agentId: "a",
  intentionId: "i",
  description: "x",
  affectedSubjects: [],
};

describe("runSimulatorGate", () => {
  it("approves when no simulator applies (low-stakes)", async () => {
    const sim: Simulator = { id: "s1", appliesTo: () => false, evaluate: vi.fn() };
    const r = await runSimulatorGate(ctx, [sim]);
    expect(r.approved).toBe(true);
    expect(r.verdicts).toHaveLength(0);
    expect(sim.evaluate).not.toHaveBeenCalled();
  });

  it("rejects when an applicable simulator vetoes", async () => {
    const sim: Simulator = {
      id: "s1",
      appliesTo: () => true,
      evaluate: async () => ({
        approved: false,
        confidence: 0.8,
        reasoning: "bad",
        predictedReaction: "outrage",
        simulatorId: "s1",
      }),
    };
    const r = await runSimulatorGate(ctx, [sim]);
    expect(r.approved).toBe(false);
    expect(r.verdicts).toHaveLength(1);
  });

  it("approves only when ALL applicable simulators approve", async () => {
    const sim1: Simulator = {
      id: "s1",
      appliesTo: () => true,
      evaluate: async () => ({
        approved: true,
        confidence: 0.9,
        reasoning: "",
        predictedReaction: "",
        simulatorId: "s1",
      }),
    };
    const sim2: Simulator = {
      id: "s2",
      appliesTo: () => true,
      evaluate: async () => ({
        approved: false,
        confidence: 0.6,
        reasoning: "",
        predictedReaction: "",
        simulatorId: "s2",
      }),
    };
    const r = await runSimulatorGate(ctx, [sim1, sim2]);
    expect(r.approved).toBe(false);
    expect(r.verdicts).toHaveLength(2);
  });

  it("only evaluates simulators that apply", async () => {
    const applies: Simulator = {
      id: "s1",
      appliesTo: () => true,
      evaluate: vi.fn(async () => ({
        approved: true,
        confidence: 1,
        reasoning: "",
        predictedReaction: "",
        simulatorId: "s1",
      })),
    };
    const skips: Simulator = { id: "s2", appliesTo: () => false, evaluate: vi.fn() };
    const r = await runSimulatorGate(ctx, [applies, skips]);
    expect(r.approved).toBe(true);
    expect(applies.evaluate).toHaveBeenCalledTimes(1);
    expect(skips.evaluate).not.toHaveBeenCalled();
  });
});
