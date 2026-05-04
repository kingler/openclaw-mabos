/**
 * Goal-graph store — TypeDB hyperrelation persistence (interface only in v1).
 *
 * The store interface is the seam for writing GoalGraphs to TypeDB. v1
 * implementations can persist to a JSON file alongside the n-ary fact store
 * (sibling to NaryFactStore); a real TypeDB-backed adapter is a follow-up plan.
 */

import type { GoalGraph, GoalNode, GoalEdge } from "./types.js";

export interface TypeDBGraphAdapter {
  upsertGoalNode(n: GoalNode): Promise<void>;
  upsertGoalEdge(e: GoalEdge): Promise<void>;
  queryGoalGraph(agentId: string): Promise<GoalGraph>;
}

export class GoalGraphStore {
  constructor(private typedb: TypeDBGraphAdapter) {}

  async commit(g: GoalGraph): Promise<void> {
    for (const node of g.nodes.values()) await this.typedb.upsertGoalNode(node);
    for (const edge of g.edges) await this.typedb.upsertGoalEdge(edge);
  }

  async load(agentId: string): Promise<GoalGraph> {
    return this.typedb.queryGoalGraph(agentId);
  }
}
