/**
 * MABOS BDI Runtime — Background Service
 *
 * Registers a background service that runs periodic BDI cycles
 * for all active agents. This is the deep integration that was
 * not possible as a plugin — background services require
 * `api.registerService()`.
 *
 * The BDI heartbeat:
 *  1. Scans workspace for active agents
 *  2. For each agent, reads cognitive state (beliefs, desires, goals, intentions)
 *  3. Evaluates desire priority changes based on new beliefs
 *  4. Prunes stale intentions
 *  5. Writes updated cognitive state back
 */
export interface BdiAgentState {
  agentId: string;
  agentDir: string;
  beliefs: string;
  desires: string;
  goals: string;
  intentions: string;
  lastCycleAt: string | null;
}
export interface BdiCycleResult {
  agentId: string;
  staleIntentionsPruned: number;
  desiresPrioritized: number;
  timestamp: string;
}
/**
 * Read the cognitive state for a single agent.
 */
export declare function readAgentCognitiveState(
  agentDir: string,
  agentId: string,
): Promise<BdiAgentState>;
/**
 * Run a lightweight BDI maintenance cycle on an agent's cognitive state.
 * This is the background "heartbeat" — it doesn't make decisions, it
 * maintains cognitive hygiene (prune stale intentions, re-sort desires).
 */
export declare function runMaintenanceCycle(state: BdiAgentState): Promise<BdiCycleResult>;
/**
 * Discover all agent directories in a workspace.
 */
export declare function discoverAgents(workspaceDir: string): Promise<string[]>;
/**
 * Get a summary of all agents' cognitive state (for CLI display).
 */
export declare function getAgentsSummary(workspaceDir: string): Promise<
  Array<{
    agentId: string;
    beliefCount: number;
    goalCount: number;
    intentionCount: number;
    desireCount: number;
  }>
>;
/**
 * Create the BDI background service definition for registerService().
 */
export declare function createBdiService(opts: {
  workspaceDir: string;
  intervalMinutes: number;
  logger: {
    info: (msg: string) => void;
    warn: (msg: string) => void;
  };
}): {
  id: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};
//# sourceMappingURL=index.d.ts.map
