import { describe, it, expect } from "vitest";
import { loadGoalGraph } from "../src/goal-net/graph-loader.js";

describe("loadGoalGraph", () => {
  it("loads flat Goals.md as a graph with no edges (legacy compatibility)", async () => {
    const goalsMd = `# Goals

### G-CFO-001: Increase revenue
- **Status:** active
- **Progress:** 20%

### G-CFO-002: Reduce churn
- **Status:** active
- **Progress:** 0%
`;
    const g = await loadGoalGraph({ goalsMd, troposJson: null, agentId: "vw-cfo" });
    expect(g.nodes.size).toBe(2);
    expect(g.nodes.get("G-CFO-001")?.label).toBe("Increase revenue");
    expect(g.nodes.get("G-CFO-001")?.progress).toBe(20);
    expect(g.nodes.get("G-CFO-001")?.composite).toBe(false);
    expect(g.edges).toHaveLength(0);
  });

  it("merges tropos decompositions into the graph", async () => {
    const goalsMd = `### G-VW-TRUST-003: Provenance integrity
- **Status:** active

### G-VW-COA-001: Issue COA
- **Status:** active

### G-VW-REG-001: Register edition
- **Status:** active
`;
    const tropos = {
      actors: [{ id: "cfo", goals: ["G-VW-TRUST-003"] }],
      decompositions: [
        {
          parent: "G-VW-TRUST-003",
          relType: "all-of" as const,
          children: ["G-VW-COA-001", "G-VW-REG-001"],
        },
      ],
    };
    const g = await loadGoalGraph({ goalsMd, troposJson: tropos, agentId: "vw-cfo" });
    expect(g.nodes.get("G-VW-TRUST-003")?.composite).toBe(true);
    expect(g.byParent.get("G-VW-TRUST-003")).toEqual(["G-VW-COA-001", "G-VW-REG-001"]);
    const edges = g.edges.filter((e) => e.from === "G-VW-TRUST-003");
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.relType === "all-of")).toBe(true);
  });

  it("infers default 'sequential' relType when not specified in decomposition", async () => {
    const goalsMd = `### G-A: a\n- **Status:** active\n\n### G-B: b\n- **Status:** active\n`;
    const tropos = {
      decompositions: [{ parent: "G-A", children: ["G-B"] }],
    };
    const g = await loadGoalGraph({ goalsMd, troposJson: tropos, agentId: "x" });
    expect(g.edges[0].relType).toBe("sequential");
  });

  it("preserves status from Goals.md", async () => {
    const goalsMd = `### G-X: a
- **Status:** achieved

### G-Y: b
- **Status:** dropped
`;
    const g = await loadGoalGraph({ goalsMd, troposJson: null, agentId: "x" });
    expect(g.nodes.get("G-X")?.status).toBe("achieved");
    expect(g.nodes.get("G-Y")?.status).toBe("dropped");
  });

  it("returns an empty graph for empty inputs", async () => {
    const g = await loadGoalGraph({ goalsMd: "", troposJson: null, agentId: "x" });
    expect(g.nodes.size).toBe(0);
    expect(g.edges).toHaveLength(0);
  });
});
