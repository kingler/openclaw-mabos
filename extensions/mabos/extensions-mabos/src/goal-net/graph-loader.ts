/**
 * Goal-graph loader: parse Goals.md + (optional) tropos-goal-model.json into a
 * typed GoalGraph.
 *
 * NOTE on Tropos schema: the loader expects an extended decomposition format
 * (`decompositions[].relType`/`children`) that is not yet emitted by the
 * production `tropos_generate` tool at onboarding-tools.ts. v1 callers that
 * want the topology either author this JSON directly, run a Tropos transformer
 * (separate follow-up plan), or extend `tropos_generate` to emit the new
 * decomposition shape. Without `troposJson`, the loader degrades to a flat
 * graph with zero edges (legacy-compatible).
 */

import type { GoalGraph, GoalNode, GoalEdge, GoalRelType } from "./types.js";

export interface LoadInput {
  goalsMd: string;
  troposJson: TroposGoalModel | null;
  agentId: string;
}

export interface TroposDecomposition {
  parent: string;
  relType?: GoalRelType;
  children: string[];
}

export interface TroposGoalModel {
  actors?: unknown[];
  decompositions?: TroposDecomposition[];
}

const HEADER = /^###\s+(G-[\w-]+):\s+(.+?)$/m;
const STATUS = /\*\*Status:\*\*\s*(\w+)/i;
const PROGRESS = /\*\*Progress:\*\*\s*(\d+)\s*%/i;
const VALID_STATUS = new Set(["active", "achieved", "dropped", "blocked"]);

function parseStatus(s: string): GoalNode["status"] {
  const lower = s.toLowerCase();
  return VALID_STATUS.has(lower) ? (lower as GoalNode["status"]) : "active";
}

export async function loadGoalGraph(input: LoadInput): Promise<GoalGraph> {
  const nodes = new Map<string, GoalNode>();
  const edges: GoalEdge[] = [];
  const byParent = new Map<string, string[]>();

  // Parse Goals.md headed blocks
  const blocks = input.goalsMd.split(/(?=^### G-)/m).filter((b) => b.trim());
  for (const block of blocks) {
    const headerMatch = block.match(HEADER);
    if (!headerMatch) continue;
    const id = headerMatch[1];
    const label = headerMatch[2].trim();
    const status = parseStatus(block.match(STATUS)?.[1] ?? "active");
    const progressMatch = block.match(PROGRESS);
    const progress = progressMatch ? parseInt(progressMatch[1], 10) : undefined;
    nodes.set(id, {
      id,
      label,
      composite: false,
      status,
      progress,
      agentId: input.agentId,
    });
  }

  // Layer Tropos decompositions
  for (const dec of input.troposJson?.decompositions ?? []) {
    const parent = nodes.get(dec.parent);
    if (parent) parent.composite = true;
    byParent.set(dec.parent, [...dec.children]);
    const relType: GoalRelType = dec.relType ?? "sequential";
    for (const child of dec.children) {
      edges.push({
        id: `${dec.parent}->${child}:${relType}`,
        from: dec.parent,
        to: child,
        relType,
      });
    }
  }

  return { nodes, edges, byParent };
}
