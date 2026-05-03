/**
 * Goal Net types — typed graph of goals with the seven Goal Net relationship
 * types (Shen 2005, §3.2). The graph is the runtime substrate that's missing
 * today: Tropos generates a goal model at onboarding, but the BDI runtime
 * treats Goals.md as a flat list. This module restores the topology.
 */

export type GoalRelType =
  | "sequence"
  | "concurrency"
  | "choice"
  | "synchronization"
  | "all-of"
  | "one-of"
  | "sequential";

export interface GoalNode {
  id: string; // e.g., "G-VW-TRUST-003"
  label: string;
  composite: boolean;
  satisfaction?: number; // [0.0, 1.0] — Goal Net §3.2.4
  progress?: number; // [0, 100] — legacy progress %
  status: "active" | "achieved" | "dropped" | "blocked";
  agentId: string;
}

export interface GoalEdge {
  id: string;
  from: string; // GoalNode.id
  to: string; // GoalNode.id
  relType: GoalRelType;
}

export interface GoalGraph {
  nodes: Map<string, GoalNode>;
  edges: GoalEdge[];
  byParent: Map<string, string[]>; // parent id → ordered child ids
}
