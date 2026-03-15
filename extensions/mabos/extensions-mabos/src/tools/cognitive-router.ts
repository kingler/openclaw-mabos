/**
 * Cognitive Router — Dual-Process Orchestrator
 *
 * Wires reflexive (System 1), analytical (System 1.5), and deliberative
 * (System 2) processing into an automatic fast-then-slow pipeline.
 * Each agent autonomously manages its processing depth based on
 * situation demands and role thresholds.
 *
 * Three new tools:
 * - cognitive_demand — Diagnostic: assess demand score for an agent
 * - cognitive_route  — On-demand: trigger cognitive routing
 * - cognitive_status — Inspection: view router state
 *
 * Enhanced heartbeat replaces the flat maintenance loop.
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi, AnyAgentTool } from "openclaw/plugin-sdk";
import type {
  ProcessingDepth,
  CognitiveSignal,
  CognitiveDemand,
  RoleThresholds,
  CognitiveRouterState,
  AgentRouterState,
  ProcessingResult,
  CognitiveRouterConfig,
} from "./cognitive-router-types.js";
import { DEFAULT_ROLE_THRESHOLDS, DEFAULT_SUBAGENT_THRESHOLDS } from "./cognitive-router-types.js";
import { scanAllSignals } from "./cognitive-signal-scanners.js";
import { textResult, resolveWorkspaceDir, generatePrefixedId } from "./common.js";
import { runReflexiveProcessing } from "./reflexive-processor.js";

// ── File I/O ──────────────────────────────────────────────────

async function readJson(p: string): Promise<any> {
  try {
    return JSON.parse(await readFile(p, "utf-8"));
  } catch {
    return null;
  }
}

async function writeJson(p: string, d: any): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(d, null, 2), "utf-8");
}

async function readMd(p: string): Promise<string> {
  try {
    return await readFile(p, "utf-8");
  } catch {
    return "";
  }
}

// ── Demand Scoring ────────────────────────────────────────────

const DEFAULT_SIGNAL_WEIGHTS = {
  urgency: 0.3,
  stakes: 0.3,
  novelty: 0.15,
  volume: 0.1,
  recency: 0.15,
};

/**
 * Compute aggregated cognitive demand from signals.
 * Peak-driven: a single critical signal forces high demand.
 */
export function computeCognitiveDemand(
  signals: CognitiveSignal[],
  _thresholds: RoleThresholds,
  lastFullCycleAt: string,
  weights = DEFAULT_SIGNAL_WEIGHTS,
): CognitiveDemand {
  if (signals.length === 0) {
    return {
      score: 0,
      breakdown: { urgency: 0, stakes: 0, novelty: 0, volume: 0, recency: 0 },
      signalCount: 0,
      peakSignal: null,
    };
  }

  // Peak values (single highest signal drives depth, not average)
  const peakUrgency = Math.max(...signals.map((s) => s.urgency));
  const peakStakes = Math.max(...signals.map((s) => s.stakes));
  const peakNovelty = Math.max(...signals.map((s) => s.novelty));

  // Volume: log-scaled signal count (diminishing returns)
  const volumeScore = Math.min(1, Math.log2(signals.length + 1) / 5);

  // Recency: time since last full cycle (0 = just ran, 1 = overdue)
  const lastFull = new Date(lastFullCycleAt).getTime();
  const now = Date.now();
  const minutesSinceFullCycle = (now - lastFull) / (1000 * 60);
  // Normalize to 0-1: 0 at cycle time, 1 at 4x the expected interval
  const recencyScore = Math.min(1, minutesSinceFullCycle / (240 * 4));

  // Weighted aggregate
  const urgencyComponent = peakUrgency * weights.urgency;
  const stakesComponent = peakStakes * weights.stakes;
  const noveltyComponent = peakNovelty * weights.novelty;
  const volumeComponent = volumeScore * weights.volume;
  const recencyComponent = recencyScore * weights.recency;

  const score = Math.min(
    1,
    urgencyComponent + stakesComponent + noveltyComponent + volumeComponent + recencyComponent,
  );

  // Find the peak signal (highest combined urgency + stakes)
  let peakSignal = signals[0];
  let peakScore = 0;
  for (const s of signals) {
    const combined = s.urgency * 0.6 + s.stakes * 0.4;
    if (combined > peakScore) {
      peakScore = combined;
      peakSignal = s;
    }
  }

  return {
    score,
    breakdown: {
      urgency: urgencyComponent,
      stakes: stakesComponent,
      novelty: noveltyComponent,
      volume: volumeComponent,
      recency: recencyComponent,
    },
    signalCount: signals.length,
    peakSignal,
  };
}

// ── Depth Selection ───────────────────────────────────────────

/**
 * Select processing depth based on demand score and role thresholds.
 */
export function selectDepth(score: number, thresholds: RoleThresholds): ProcessingDepth {
  if (score <= thresholds.reflexiveCeiling) return "reflexive";
  if (score >= thresholds.deliberativeFloor) return "deliberative";
  return "analytical";
}

/**
 * Apply override rules that force minimum depth regardless of score.
 */
export function applyDepthOverrides(
  depth: ProcessingDepth,
  signals: CognitiveSignal[],
  consecutiveReflexive: number,
  thresholds: RoleThresholds,
): ProcessingDepth {
  const depthOrder: ProcessingDepth[] = ["reflexive", "analytical", "deliberative"];
  let minDepthIdx = depthOrder.indexOf(depth);

  // Policy escalation flag → at least analytical
  const hasEscalatingPolicy = signals.some(
    (s) => s.source === "policy_trigger" && (s.metadata as any).escalate,
  );
  if (hasEscalatingPolicy && minDepthIdx < 1) minDepthIdx = 1;

  // Supervisor explicit request → use requested depth
  const supervisorSignal = signals.find((s) => s.source === "supervisor");
  if (supervisorSignal) {
    const requested = (supervisorSignal.metadata as any).requestedDepth;
    if (requested) {
      const reqIdx = depthOrder.indexOf(requested);
      if (reqIdx >= 0) minDepthIdx = Math.max(minDepthIdx, reqIdx);
    }
  }

  // Too many consecutive reflexive cycles → force analytical
  if (depth === "reflexive" && consecutiveReflexive >= thresholds.maxConsecutiveReflexive) {
    minDepthIdx = Math.max(minDepthIdx, 1);
  }

  // Critical rule violation → force deliberative
  const hasCriticalViolation = signals.some(
    (s) => s.source === "rule_violation" && (s.metadata as any).severity === "critical",
  );
  if (hasCriticalViolation) minDepthIdx = 2;

  // Strategic goal failing → at least analytical
  const hasFailingGoal = signals.some(
    (s) =>
      s.source === "goal_state" &&
      ((s.metadata as any).transition === "failing" ||
        (s.metadata as any).transition === "blocked") &&
      s.stakes >= 0.7,
  );
  if (hasFailingGoal && minDepthIdx < 1) minDepthIdx = 1;

  // Inbox REQUEST/QUERY/CFP → at least analytical (agents must compose a response)
  const hasActionableInbox = signals.some((s) => {
    if (s.source !== "inbox") return false;
    const perf = ((s.metadata as any).performative || "").toUpperCase();
    return perf === "REQUEST" || perf === "QUERY" || perf === "CFP" || perf === "DIRECTIVE";
  });
  if (hasActionableInbox && minDepthIdx < 1) minDepthIdx = 1;

  return depthOrder[minDepthIdx];
}

// ── Processing Executors ──────────────────────────────────────

/**
 * Execute reflexive processing (zero LLM calls).
 */
async function executeReflexive(
  agentId: string,
  agentDir: string,
  role: string,
  signals: CognitiveSignal[],
  thresholds: RoleThresholds,
): Promise<ProcessingResult> {
  const outcome = await runReflexiveProcessing({
    agentId,
    agentDir,
    role,
    signals,
    thresholds,
  });

  const trace = [
    `Reflexive processing for ${agentId} (${role})`,
    `Inbox processed: ${outcome.stats.inboxProcessed}`,
    `Facts inferred: ${outcome.stats.factsInferred}`,
    `Constraint violations: ${outcome.stats.constraintViolations}`,
    `Policies triggered: ${outcome.stats.policiesTriggered}`,
    `Goals checked: ${outcome.stats.goalsChecked}`,
    `Threshold alerts: ${outcome.stats.thresholdAlerts}`,
    `Actions: ${outcome.actions.length}, Escalations: ${outcome.escalations.length}`,
  ];

  const conclusion =
    outcome.escalations.length > 0
      ? `Reflexive processing found ${outcome.escalations.length} escalation(s): ${outcome.escalations.map((e) => e.reason).join("; ")}`
      : `Reflexive processing complete: ${outcome.actions.length} action(s), no escalations needed.`;

  return {
    depth: "reflexive",
    confidence: outcome.confidence,
    conclusion,
    reasoningTrace: trace,
    methodsUsed: ["pattern-matching", "forward-chaining", "constraint-check", "policy-eval"],
    tokensConsumed: 0,
    escalated: false,
    escalationHistory: [],
  };
}

/**
 * Execute analytical processing (1 LLM call via meta-reasoning).
 */
async function executeAnalytical(
  agentId: string,
  agentDir: string,
  signals: CognitiveSignal[],
  api: OpenClawPluginApi,
): Promise<ProcessingResult> {
  // Derive problem classification heuristically from signals
  const peakUrgency = Math.max(...signals.map((s) => s.urgency), 0);
  const peakStakes = Math.max(...signals.map((s) => s.stakes), 0);
  const peakNovelty = Math.max(...signals.map((s) => s.novelty), 0);

  const uncertainty = peakNovelty > 0.6 ? "high" : peakNovelty > 0.3 ? "medium" : "low";
  const complexity = signals.length > 5 ? "complex" : signals.length > 2 ? "moderate" : "simple";
  const time_pressure = peakUrgency > 0.7 ? "urgent" : peakUrgency > 0.4 ? "moderate" : "none";
  const stakes = peakStakes > 0.7 ? "high" : peakStakes > 0.3 ? "medium" : "low";

  const classification = {
    uncertainty: uncertainty as "low" | "medium" | "high",
    complexity: complexity as "simple" | "moderate" | "complex",
    domain: "mixed" as const,
    time_pressure: time_pressure as "none" | "moderate" | "urgent",
    data_availability: "moderate" as const,
    stakes: stakes as "low" | "medium" | "high",
  };

  // Score methods using the selection matrix
  let topMethod = "heuristic";
  let methodScore = 0.5;
  try {
    const { scoreMethodsForProblem } = await import("../reasoning/meta/meta-reasoning.js");
    const agentConfig = await readJson(join(agentDir, "agent.json"));
    const available = agentConfig?.bdi?.reasoningMethods;
    const recommendations = scoreMethodsForProblem(classification, available);
    if (recommendations.length > 0) {
      topMethod = recommendations[0].method;
      methodScore = recommendations[0].score;
    }
  } catch {
    // Meta-reasoning unavailable — use default
  }

  // Build problem summary from signals
  const problemSummary = signals
    .slice(0, 5)
    .map((s) => s.summary)
    .join("\n");

  const trace = [
    `Analytical processing for ${agentId}`,
    `Problem classification: ${JSON.stringify(classification)}`,
    `Top method: ${topMethod} (score: ${methodScore.toFixed(2)})`,
    `Signals summarized: ${signals.length}`,
  ];

  // The analytical depth produces a structured prompt for the LLM
  // rather than calling it directly — the heartbeat caller handles invocation
  const conclusion = `## Analytical Assessment — ${agentId}

**Classification:** uncertainty=${classification.uncertainty}, complexity=${classification.complexity}, stakes=${classification.stakes}, time_pressure=${classification.time_pressure}

**Selected Method:** ${topMethod} (${(methodScore * 100).toFixed(0)}% suitability)

**Signals (${signals.length}):**
${problemSummary}

**Instruction:** Apply ${topMethod} reasoning to the above signals. Determine actions and whether deliberative depth is needed.`;

  return {
    depth: "analytical",
    confidence: methodScore * 0.8, // Analytical confidence scaled by method fit
    conclusion,
    reasoningTrace: trace,
    methodsUsed: [topMethod],
    tokensConsumed: 1, // Marker: 1 LLM call expected
    escalated: false,
    escalationHistory: [],
  };
}

/**
 * Execute deliberative processing (full BDI cycle, 3-5 LLM calls).
 */
async function executeDeliberative(
  agentId: string,
  agentDir: string,
  signals: CognitiveSignal[],
  api: OpenClawPluginApi,
): Promise<ProcessingResult> {
  // Load all 10 cognitive files
  const cognitiveFiles: Record<string, string> = {};
  for (const f of [
    "Persona.md",
    "Capabilities.md",
    "Beliefs.md",
    "Desires.md",
    "Goals.md",
    "Intentions.md",
    "Plans.md",
    "Playbooks.md",
    "Knowledge.md",
    "Memory.md",
  ]) {
    cognitiveFiles[f] = await readMd(join(agentDir, f));
  }

  // Get top 3 methods via meta-reasoning
  let top3Methods: string[] = ["means-ends", "causal", "decision-theory"];
  try {
    const { scoreMethodsForProblem } = await import("../reasoning/meta/meta-reasoning.js");
    const agentConfig = await readJson(join(agentDir, "agent.json"));
    const available = agentConfig?.bdi?.reasoningMethods;

    const peakStakes = Math.max(...signals.map((s) => s.stakes), 0);
    const peakNovelty = Math.max(...signals.map((s) => s.novelty), 0);
    const recommendations = scoreMethodsForProblem(
      {
        uncertainty: peakNovelty > 0.5 ? "high" : "medium",
        complexity: "complex",
        domain: "mixed",
        time_pressure: "none",
        data_availability: "moderate",
        stakes: peakStakes > 0.7 ? "high" : "medium",
      },
      available,
    );
    top3Methods = recommendations.slice(0, 3).map((r) => r.method);
  } catch {
    // Use defaults
  }

  const signalSummary = signals
    .slice(0, 10)
    .map(
      (s) =>
        `- [${s.source}] ${s.summary} (urgency=${s.urgency.toFixed(2)}, stakes=${s.stakes.toFixed(2)})`,
    )
    .join("\n");

  const trace = [
    `Deliberative processing for ${agentId}`,
    `Full BDI cycle with ${Object.keys(cognitiveFiles).length} cognitive files`,
    `Multi-method fusion: ${top3Methods.join(", ")}`,
    `Signals: ${signals.length}`,
  ];

  // Build the full deliberative prompt
  const conclusion = `## Full BDI Cycle — ${agentId}

### Triggering Signals (${signals.length})
${signalSummary}

### PHASE 1: PERCEIVE
${cognitiveFiles["Beliefs.md"] || "No beliefs."}

### PHASE 2: DELIBERATE
**Desires:** ${cognitiveFiles["Desires.md"] || "None."}
**Goals:** ${cognitiveFiles["Goals.md"] || "None."}

### PHASE 3: PLAN
**Playbooks:** ${cognitiveFiles["Playbooks.md"] || "None."}
**Plans:** ${cognitiveFiles["Plans.md"] || "None."}

### PHASE 4: ACT
**Intentions:** ${cognitiveFiles["Intentions.md"] || "None."}
**Capabilities:** ${cognitiveFiles["Capabilities.md"] || "None."}

### PHASE 5: LEARN
**Memory:** ${cognitiveFiles["Memory.md"] || "None."}

### Multi-Method Fusion
Apply these methods in order: ${top3Methods.join(", ")}
Fuse results and determine: actions, goal updates, new intentions, belief revisions.

### Governance Check
Before executing high-stakes actions (financial >$1000, legal, public-facing), verify approval requirements.`;

  return {
    depth: "deliberative",
    confidence: 0.6, // Will be refined after LLM processing
    conclusion,
    reasoningTrace: trace,
    methodsUsed: top3Methods,
    tokensConsumed: 4, // Marker: 3-5 LLM calls expected
    escalated: false,
    escalationHistory: [],
  };
}

// ── Escalation Cascade ────────────────────────────────────────

/**
 * Process with confidence-based escalation: reflexive → analytical → deliberative.
 * Auto-escalates when confidence is insufficient for the stakes level.
 */
export async function processWithEscalation(
  agentId: string,
  agentDir: string,
  role: string,
  depth: ProcessingDepth,
  signals: CognitiveSignal[],
  thresholds: RoleThresholds,
  api: OpenClawPluginApi,
): Promise<ProcessingResult> {
  const depthOrder: ProcessingDepth[] = ["reflexive", "analytical", "deliberative"];
  let currentDepthIdx = depthOrder.indexOf(depth);
  const escalationHistory: ProcessingDepth[] = [];
  let result: ProcessingResult | null = null;

  const peakStakes = Math.max(...signals.map((s) => s.stakes), 0);

  while (currentDepthIdx < depthOrder.length) {
    const currentDepth = depthOrder[currentDepthIdx];

    switch (currentDepth) {
      case "reflexive":
        result = await executeReflexive(agentId, agentDir, role, signals, thresholds);
        break;
      case "analytical":
        result = await executeAnalytical(agentId, agentDir, signals, api);
        break;
      case "deliberative":
        result = await executeDeliberative(agentId, agentDir, signals, api);
        break;
    }

    // Compute required confidence based on stakes
    // Higher stakes → higher confidence required to avoid escalation
    const requiredConfidence = 0.3 + (thresholds.analyticalConfidenceMin - 0.3) * peakStakes;

    if (result.confidence >= requiredConfidence || currentDepthIdx >= 2) {
      // Sufficient confidence or already at max depth
      break;
    }

    // Escalate to next depth
    escalationHistory.push(currentDepth);
    currentDepthIdx++;
  }

  if (result) {
    result.escalated = escalationHistory.length > 0;
    result.escalationHistory = escalationHistory;
  }

  return result!;
}

// ── Inbox Response Pipeline ──────────────────────────────────

/**
 * After cognitive processing, compose replies for actionable inbox messages
 * (REQUEST, QUERY, CFP) and mark all processed messages as read.
 * Writes responses to the sender's inbox using the same flat-array format.
 */
async function processInboxResponses(
  agentId: string,
  agentDir: string,
  workspaceDir: string,
  signals: CognitiveSignal[],
  result: ProcessingResult,
  log: { debug: (...args: any[]) => void; warn?: (...args: any[]) => void },
): Promise<void> {
  const inboxSignals = signals.filter((s) => s.source === "inbox");
  if (inboxSignals.length === 0) return;

  const inboxPath = join(agentDir, "inbox.json");
  const raw = await readJson(inboxPath);
  const messages: any[] = Array.isArray(raw) ? raw : raw?.messages || [];
  if (messages.length === 0) return;

  // Collect message IDs from inbox signals
  const signalMessageIds = new Set(
    inboxSignals.map((s) => (s.metadata as any).messageId as string),
  );

  const now = new Date().toISOString();
  let modified = false;
  let repliesSent = 0;

  for (const msg of messages) {
    if (!msg.id || msg.read || !signalMessageIds.has(msg.id)) continue;

    // Mark the message as read
    msg.read = true;
    msg.read_at = now;
    modified = true;

    const perf = (msg.performative || "").toUpperCase();

    // For REQUEST, QUERY, CFP, DIRECTIVE: compose and send a response
    if (perf === "REQUEST" || perf === "QUERY" || perf === "CFP" || perf === "DIRECTIVE") {
      const responsePerf = perf === "QUERY" ? "INFORM" : "AGREE";
      const msgPreview = (msg.content || msg.subject || "your message").slice(0, 300);

      // Build response content from processing result
      let responseContent: string;
      if (result.depth === "reflexive") {
        responseContent = [
          `Acknowledged your ${perf}: ${msgPreview}`,
          ``,
          `Processing depth: ${result.depth} | Confidence: ${result.confidence.toFixed(2)}`,
          `This message has been logged and will be addressed in the next deliberative cycle.`,
        ].join("\n");
      } else {
        // Analytical/Deliberative: use the full analysis as response
        responseContent = [
          `Re: ${msgPreview.slice(0, 120)}`,
          ``,
          `Processing depth: ${result.depth} | Confidence: ${result.confidence.toFixed(2)}`,
          `Methods used: ${result.methodsUsed.join(", ")}`,
          ``,
          result.conclusion,
        ].join("\n");
      }

      // Write response to sender's inbox
      try {
        const senderInboxPath = join(workspaceDir, "agents", msg.from, "inbox.json");
        const senderRaw = await readJson(senderInboxPath);
        const senderInbox: any[] = Array.isArray(senderRaw) ? senderRaw : senderRaw?.messages || [];

        senderInbox.push({
          id: `REPLY-${msg.id}-${Date.now().toString(36)}`,
          from: agentId,
          to: msg.from,
          performative: responsePerf,
          content: responseContent,
          reply_to: msg.id,
          priority: msg.priority || "normal",
          timestamp: now,
          read: false,
        });

        await writeJson(senderInboxPath, senderInbox);
        repliesSent++;
      } catch (err) {
        log.warn?.(
          `[cognitive-router] Failed to send reply from ${agentId} to ${msg.from}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    // For INFORM, ACCEPT, REJECT, CONFIRM, CANCEL: just mark read, no response needed
  }

  // Save updated inbox with read marks
  if (modified) {
    await writeJson(inboxPath, messages);
    log.debug(
      `[cognitive-router] ${agentId}: marked ${signalMessageIds.size} message(s) read, sent ${repliesSent} reply(s)`,
    );
  }
}

// ── Router State Management ───────────────────────────────────

function routerStatePath(workspaceDir: string): string {
  return join(workspaceDir, "cognitive-router-state.json");
}

async function loadRouterState(workspaceDir: string): Promise<CognitiveRouterState> {
  const state = await readJson(routerStatePath(workspaceDir));
  return state || { version: 0, updatedAt: new Date().toISOString(), agents: {} };
}

async function saveRouterState(workspaceDir: string, state: CognitiveRouterState): Promise<void> {
  state.version++;
  state.updatedAt = new Date().toISOString();
  await writeJson(routerStatePath(workspaceDir), state);
}

function getAgentRouterState(state: CognitiveRouterState, agentId: string): AgentRouterState {
  return (
    state.agents[agentId] || {
      lastHeartbeatAt: new Date(0).toISOString(),
      lastFullCycleAt: new Date(0).toISOString(),
      consecutiveReflexive: 0,
      lastDepth: "reflexive" as ProcessingDepth,
      lastDemandScore: 0,
    }
  );
}

// ── Resolve Thresholds ────────────────────────────────────────

async function resolveThresholds(agentDir: string, role: string): Promise<RoleThresholds> {
  // Check agent.json for custom thresholds
  const agentConfig = await readJson(join(agentDir, "agent.json"));
  const custom = agentConfig?.bdi?.cognitiveRouter?.thresholds;
  const base = DEFAULT_ROLE_THRESHOLDS[role] || DEFAULT_SUBAGENT_THRESHOLDS;

  // Merge cycle frequency from agent config
  const cycleFreq = agentConfig?.bdi?.cycleFrequency;
  const merged: RoleThresholds = {
    ...base,
    fullCycleMinutes: cycleFreq?.fullCycleMinutes ?? base.fullCycleMinutes,
    quickCheckMinutes: cycleFreq?.quickCheckMinutes ?? base.quickCheckMinutes,
    commitmentStrategy: agentConfig?.bdi?.commitmentStrategy ?? base.commitmentStrategy,
  };

  if (custom) {
    return { ...merged, ...custom };
  }
  return merged;
}

// ── Enhanced Heartbeat ────────────────────────────────────────

/**
 * Enhanced heartbeat cycle that replaces the flat maintenance loop.
 * For each agent: scan signals → compute demand → select depth →
 * process with escalation → run maintenance → record results.
 */
export async function enhancedHeartbeatCycle(
  workspaceDir: string,
  api: OpenClawPluginApi,
  log: {
    info: (...args: any[]) => void;
    debug: (...args: any[]) => void;
    warn?: (...args: any[]) => void;
  },
): Promise<void> {
  const agentsDir = join(workspaceDir, "agents");
  let agentIds: string[] = [];

  try {
    const entries = await readdir(agentsDir, { withFileTypes: true });
    agentIds = entries.filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    log.debug("[cognitive-router] No agents directory found");
    return;
  }

  if (agentIds.length === 0) return;

  const routerState = await loadRouterState(workspaceDir);
  const now = new Date().toISOString();

  for (const agentId of agentIds) {
    try {
      const agentDir = join(agentsDir, agentId);
      const agentState = getAgentRouterState(routerState, agentId);

      // Resolve role from agent.json
      const agentConfig = await readJson(join(agentDir, "agent.json"));
      const role = agentConfig?.id || agentId;

      // Check if cognitive router is enabled for this agent
      const routerConfig = agentConfig?.bdi?.cognitiveRouter as CognitiveRouterConfig | undefined;
      if (routerConfig?.enabled === false) {
        // Skip cognitive routing for this agent, fall through to legacy maintenance
        continue;
      }

      const thresholds = await resolveThresholds(agentDir, role);

      // 1. Scan all signals
      const signals = await scanAllSignals(agentDir, agentId, agentState.lastHeartbeatAt);

      // 2. Compute demand
      const demand = computeCognitiveDemand(signals, thresholds, agentState.lastFullCycleAt);

      // 3. Select depth
      let depth = selectDepth(demand.score, thresholds);
      depth = applyDepthOverrides(depth, signals, agentState.consecutiveReflexive, thresholds);

      // 4. Process with escalation cascade
      const result = await processWithEscalation(
        agentId,
        agentDir,
        role,
        depth,
        signals,
        thresholds,
        api,
      );

      // 5. Process inbox responses (reply to REQUEST/QUERY, mark messages read)
      try {
        await processInboxResponses(agentId, agentDir, workspaceDir, signals, result, log);
      } catch (err) {
        log.warn?.(
          `[cognitive-router] Inbox response error for ${agentId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      // 6. Update router state
      const newAgentState: AgentRouterState = {
        lastHeartbeatAt: now,
        lastFullCycleAt: result.depth === "deliberative" ? now : agentState.lastFullCycleAt,
        consecutiveReflexive:
          result.depth === "reflexive" ? agentState.consecutiveReflexive + 1 : 0,
        lastDepth: result.depth,
        lastDemandScore: demand.score,
      };
      routerState.agents[agentId] = newAgentState;

      // 7. Also run legacy maintenance (prune intentions, sort desires)
      try {
        const BDI_RUNTIME_PATH = "../../mabos/bdi-runtime/index.js";
        const { readAgentCognitiveState, runMaintenanceCycle } = (await import(
          /* webpackIgnore: true */ BDI_RUNTIME_PATH
        )) as any;
        const state = await readAgentCognitiveState(agentDir, agentId);
        const cycleResult = await runMaintenanceCycle(state);

        // Fire-and-forget TypeDB write
        import("../knowledge/typedb-dashboard.js")
          .then(({ writeBdiCycleResultToTypeDB }) =>
            writeBdiCycleResultToTypeDB(agentId, "mabos", {
              newIntentions: cycleResult?.newIntentions,
              newBeliefs: cycleResult?.newBeliefs,
              updatedGoals: cycleResult?.updatedGoals,
            }),
          )
          .catch(() => {});
      } catch {
        // Legacy maintenance unavailable — not critical
      }

      log.debug(
        `[cognitive-router] ${agentId}: depth=${result.depth}, demand=${demand.score.toFixed(2)}, confidence=${result.confidence.toFixed(2)}, signals=${signals.length}${result.escalated ? ` (escalated from ${result.escalationHistory.join("→")})` : ""}`,
      );
    } catch (err) {
      log.warn?.(
        `[cognitive-router] Error processing ${agentId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Save updated router state
  await saveRouterState(workspaceDir, routerState);
}

// ── Tool Definitions ──────────────────────────────────────────

const CognitiveDemandParams = Type.Object({
  agent_id: Type.String({ description: "Agent ID to assess demand for" }),
});

const CognitiveRouteParams = Type.Object({
  agent_id: Type.String({ description: "Agent ID to route" }),
  force_depth: Type.Optional(
    Type.Union(
      [Type.Literal("reflexive"), Type.Literal("analytical"), Type.Literal("deliberative")],
      { description: "Force a specific processing depth (overrides auto-selection)" },
    ),
  ),
});

const CognitiveStatusParams = Type.Object({
  agent_id: Type.Optional(
    Type.String({ description: "Agent ID to inspect (omit for all agents)" }),
  ),
});

export function createCognitiveRouterTools(api: OpenClawPluginApi): AnyAgentTool[] {
  return [
    {
      name: "cognitive_demand",
      label: "Assess Cognitive Demand",
      description:
        "Diagnostic: assess the current cognitive demand score and recommended processing depth for an agent based on its signals, role thresholds, and cycle history.",
      parameters: CognitiveDemandParams,
      async execute(_id: string, params: Static<typeof CognitiveDemandParams>) {
        const workspaceDir = resolveWorkspaceDir(api);
        const agentDir = join(workspaceDir, "agents", params.agent_id);
        const role = params.agent_id;
        const thresholds = await resolveThresholds(agentDir, role);
        const routerState = await loadRouterState(workspaceDir);
        const agentState = getAgentRouterState(routerState, params.agent_id);

        const signals = await scanAllSignals(agentDir, params.agent_id, agentState.lastHeartbeatAt);

        const demand = computeCognitiveDemand(signals, thresholds, agentState.lastFullCycleAt);

        let depth = selectDepth(demand.score, thresholds);
        depth = applyDepthOverrides(depth, signals, agentState.consecutiveReflexive, thresholds);

        const signalBreakdown = signals
          .slice(0, 10)
          .map(
            (s) =>
              `- [${s.source}] ${s.summary} (u=${s.urgency.toFixed(2)}, s=${s.stakes.toFixed(2)}, n=${s.novelty.toFixed(2)})`,
          )
          .join("\n");

        return textResult(`## Cognitive Demand — ${params.agent_id}

**Demand Score:** ${demand.score.toFixed(3)}
**Recommended Depth:** ${depth}
**Signal Count:** ${demand.signalCount}

### Score Breakdown
| Component | Value | Weight |
|-----------|-------|--------|
| Urgency | ${demand.breakdown.urgency.toFixed(3)} | 0.30 |
| Stakes | ${demand.breakdown.stakes.toFixed(3)} | 0.30 |
| Novelty | ${demand.breakdown.novelty.toFixed(3)} | 0.15 |
| Volume | ${demand.breakdown.volume.toFixed(3)} | 0.10 |
| Recency | ${demand.breakdown.recency.toFixed(3)} | 0.15 |

### Role Thresholds
- Reflexive ceiling: ${thresholds.reflexiveCeiling}
- Deliberative floor: ${thresholds.deliberativeFloor}
- Max consecutive reflexive: ${thresholds.maxConsecutiveReflexive}
- Current consecutive reflexive: ${agentState.consecutiveReflexive}

### Top Signals
${signalBreakdown || "No pending signals."}

### Peak Signal
${demand.peakSignal ? demand.peakSignal.summary : "None"}`);
      },
    },

    {
      name: "cognitive_route",
      label: "Trigger Cognitive Routing",
      description:
        "On-demand: trigger the cognitive router for an agent outside the regular heartbeat cycle. Optionally force a specific depth.",
      parameters: CognitiveRouteParams,
      async execute(_id: string, params: Static<typeof CognitiveRouteParams>) {
        const workspaceDir = resolveWorkspaceDir(api);
        const agentDir = join(workspaceDir, "agents", params.agent_id);
        const role = params.agent_id;
        const thresholds = await resolveThresholds(agentDir, role);
        const routerState = await loadRouterState(workspaceDir);
        const agentState = getAgentRouterState(routerState, params.agent_id);

        const signals = await scanAllSignals(agentDir, params.agent_id, agentState.lastHeartbeatAt);

        const demand = computeCognitiveDemand(signals, thresholds, agentState.lastFullCycleAt);

        let depth: ProcessingDepth;
        if (params.force_depth) {
          depth = params.force_depth;
        } else {
          depth = selectDepth(demand.score, thresholds);
          depth = applyDepthOverrides(depth, signals, agentState.consecutiveReflexive, thresholds);
        }

        const result = await processWithEscalation(
          params.agent_id,
          agentDir,
          role,
          depth,
          signals,
          thresholds,
          api,
        );

        // Process inbox responses (reply + mark read)
        const routeLog = {
          debug: () => {},
          warn: () => {},
        };
        await processInboxResponses(
          params.agent_id,
          agentDir,
          workspaceDir,
          signals,
          result,
          routeLog,
        );

        // Update state
        const now = new Date().toISOString();
        routerState.agents[params.agent_id] = {
          lastHeartbeatAt: now,
          lastFullCycleAt: result.depth === "deliberative" ? now : agentState.lastFullCycleAt,
          consecutiveReflexive:
            result.depth === "reflexive" ? agentState.consecutiveReflexive + 1 : 0,
          lastDepth: result.depth,
          lastDemandScore: demand.score,
        };
        await saveRouterState(workspaceDir, routerState);

        return textResult(`## Cognitive Route — ${params.agent_id}

**Demand:** ${demand.score.toFixed(3)} | **Depth:** ${result.depth}${params.force_depth ? " (forced)" : ""} | **Confidence:** ${result.confidence.toFixed(2)}
**Signals:** ${signals.length} | **Methods:** ${result.methodsUsed.join(", ")}
${result.escalated ? `**Escalated:** ${result.escalationHistory.join(" → ")} → ${result.depth}` : ""}

### Reasoning Trace
${result.reasoningTrace.map((t) => `- ${t}`).join("\n")}

### Result
${result.conclusion}`);
      },
    },

    {
      name: "cognitive_status",
      label: "Cognitive Router Status",
      description:
        "Inspection: view the cognitive router state for one or all agents — last depth, demand score, consecutive reflexive count, cycle timestamps.",
      parameters: CognitiveStatusParams,
      async execute(_id: string, params: Static<typeof CognitiveStatusParams>) {
        const workspaceDir = resolveWorkspaceDir(api);
        const state = await loadRouterState(workspaceDir);

        if (params.agent_id) {
          const agentState = state.agents[params.agent_id];
          if (!agentState) {
            return textResult(`No router state found for agent '${params.agent_id}'.`);
          }

          return textResult(`## Cognitive Router State — ${params.agent_id}

| Field | Value |
|-------|-------|
| Last Heartbeat | ${agentState.lastHeartbeatAt} |
| Last Full Cycle | ${agentState.lastFullCycleAt} |
| Last Depth | ${agentState.lastDepth} |
| Last Demand Score | ${agentState.lastDemandScore.toFixed(3)} |
| Consecutive Reflexive | ${agentState.consecutiveReflexive} |`);
        }

        // All agents
        const agents = Object.entries(state.agents);
        if (agents.length === 0) {
          return textResult("No cognitive router state recorded yet.");
        }

        const rows = agents
          .map(
            ([id, s]) =>
              `| ${id} | ${s.lastDepth} | ${s.lastDemandScore.toFixed(3)} | ${s.consecutiveReflexive} | ${s.lastHeartbeatAt.split("T")[0]} |`,
          )
          .join("\n");

        return textResult(`## Cognitive Router State (all agents)

**State version:** ${state.version} | **Updated:** ${state.updatedAt}

| Agent | Last Depth | Demand | Consec. Reflexive | Last Heartbeat |
|-------|-----------|--------|-------------------|----------------|
${rows}`);
      },
    },
  ];
}
