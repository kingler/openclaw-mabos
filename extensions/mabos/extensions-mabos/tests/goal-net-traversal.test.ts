import { describe, it, expect } from "vitest";
import { subgoalsOf, blockingSubgoals, satisfactionRollup } from "../src/goal-net/traversal.js";
import type { GoalGraph, GoalRelType } from "../src/goal-net/types.js";

function fixture(relType: GoalRelType = "all-of"): GoalGraph {
  return {
    nodes: new Map([
      [
        "G-VW-TRUST-003",
        {
          id: "G-VW-TRUST-003",
          label: "Provenance integrity",
          composite: true,
          status: "active",
          agentId: "vw-cfo",
          satisfaction: 0.5,
        },
      ],
      [
        "G-VW-COA-001",
        {
          id: "G-VW-COA-001",
          label: "Issue COA",
          composite: false,
          status: "active",
          agentId: "vw-cfo",
          satisfaction: 1.0,
        },
      ],
      [
        "G-VW-REG-001",
        {
          id: "G-VW-REG-001",
          label: "Register edition",
          composite: false,
          status: "active",
          agentId: "vw-cfo",
          satisfaction: 0.0,
        },
      ],
    ]),
    edges: [
      { id: "e1", from: "G-VW-TRUST-003", to: "G-VW-COA-001", relType },
      { id: "e2", from: "G-VW-TRUST-003", to: "G-VW-REG-001", relType },
    ],
    byParent: new Map([["G-VW-TRUST-003", ["G-VW-COA-001", "G-VW-REG-001"]]]),
  };
}

describe("subgoalsOf", () => {
  it("returns the direct sub-goals of a composite", () => {
    expect(subgoalsOf(fixture(), "G-VW-TRUST-003").map((n) => n.id)).toEqual([
      "G-VW-COA-001",
      "G-VW-REG-001",
    ]);
  });

  it("returns [] for a leaf goal", () => {
    expect(subgoalsOf(fixture(), "G-VW-COA-001")).toEqual([]);
  });
});

describe("blockingSubgoals", () => {
  it("for an all-of parent, returns sub-goals with satisfaction < 1.0", () => {
    expect(blockingSubgoals(fixture(), "G-VW-TRUST-003").map((n) => n.id)).toEqual([
      "G-VW-REG-001",
    ]);
  });

  it("for a one-of parent, returns [] if any child is satisfied", () => {
    expect(blockingSubgoals(fixture("one-of"), "G-VW-TRUST-003")).toEqual([]);
  });

  it("for a one-of parent with no satisfied child, returns all children", () => {
    const g = fixture("one-of");
    g.nodes.get("G-VW-COA-001")!.satisfaction = 0.5;
    g.nodes.get("G-VW-REG-001")!.satisfaction = 0.5;
    expect(blockingSubgoals(g, "G-VW-TRUST-003")).toHaveLength(2);
  });

  it("returns [] when there are no sub-goals", () => {
    expect(blockingSubgoals(fixture(), "G-VW-COA-001")).toEqual([]);
  });
});

describe("satisfactionRollup", () => {
  it("for all-of, satisfaction is the min of children", () => {
    expect(satisfactionRollup(fixture(), "G-VW-TRUST-003")).toBe(0.0);
  });

  it("for one-of, satisfaction is the max of children", () => {
    expect(satisfactionRollup(fixture("one-of"), "G-VW-TRUST-003")).toBe(1.0);
  });

  it("for a leaf, returns the leaf's satisfaction", () => {
    expect(satisfactionRollup(fixture(), "G-VW-COA-001")).toBe(1.0);
  });

  it("recursively rolls up nested composites", () => {
    const g: GoalGraph = {
      nodes: new Map([
        ["A", { id: "A", label: "A", composite: true, status: "active", agentId: "x" }],
        ["B", { id: "B", label: "B", composite: true, status: "active", agentId: "x" }],
        [
          "C",
          {
            id: "C",
            label: "C",
            composite: false,
            status: "active",
            agentId: "x",
            satisfaction: 0.5,
          },
        ],
        [
          "D",
          {
            id: "D",
            label: "D",
            composite: false,
            status: "active",
            agentId: "x",
            satisfaction: 1.0,
          },
        ],
      ]),
      edges: [
        { id: "e1", from: "A", to: "B", relType: "all-of" },
        { id: "e2", from: "B", to: "C", relType: "all-of" },
        { id: "e3", from: "B", to: "D", relType: "all-of" },
      ],
      byParent: new Map([
        ["A", ["B"]],
        ["B", ["C", "D"]],
      ]),
    };
    expect(satisfactionRollup(g, "B")).toBe(0.5); // min(0.5, 1.0)
    expect(satisfactionRollup(g, "A")).toBe(0.5); // min(B's rollup)
  });
});
