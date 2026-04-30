/**
 * Neo Orchestration Chat Test — Agent Task Orchestration Monitoring
 *
 * Verifies the main orchestration agent (CEO) correctly:
 * 1. Classifies incoming chat directives and routes to domain agents
 * 2. Monitors agent inbox signals via cognitive router
 * 3. Tracks cognitive demand escalation and depth selection
 * 4. Processes multi-agent inboxes through heartbeat cycles
 * 5. Handles multi-domain directives that require decomposition
 * 6. Monitors decision escalation flow between agents
 * 7. Verifies inbox read/mark-read tools for orchestration monitoring
 *
 * Note: Message delivery tests write directly to inbox files rather than
 * going through agent_message tool (which has a pre-existing import issue
 * with checkAgentToAgentPolicy).
 */

import { randomUUID } from "node:crypto";
import { readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  enhancedHeartbeatCycle,
  computeCognitiveDemand,
  selectDepth,
  applyDepthOverrides,
} from "../src/tools/cognitive-router.js";
import { scanInbox } from "../src/tools/cognitive-signal-scanners.js";
import { createCommunicationTools } from "../src/tools/communication-tools.js";
import { classifyDirective, buildRoutingDecision } from "../src/tools/directive-router.js";

// ── Helpers ─────────────────────────────────────────────────

async function readJson(p: string) {
  try {
    return JSON.parse(await readFile(p, "utf-8"));
  } catch {
    return null;
  }
}

async function writeJson(p: string, d: any) {
  await mkdir(join(p, ".."), { recursive: true });
  await writeFile(p, JSON.stringify(d, null, 2), "utf-8");
}

/** Simulate message delivery by writing directly to agent inbox. */
async function deliverMessage(
  workspaceDir: string,
  msg: {
    from: string;
    to: string;
    performative: string;
    content: string;
    priority?: string;
    reply_to?: string;
  },
) {
  const inboxPath = join(workspaceDir, "agents", msg.to, "inbox.json");
  const inbox = (await readJson(inboxPath)) ?? [];
  inbox.push({
    id: `MSG-${randomUUID().slice(0, 8)}`,
    from: msg.from,
    to: msg.to,
    performative: msg.performative,
    content: msg.content,
    priority: msg.priority ?? "normal",
    reply_to: msg.reply_to ?? null,
    timestamp: new Date().toISOString(),
    read: false,
  });
  await writeJson(inboxPath, inbox);
  return inbox[inbox.length - 1];
}

// ── Workspace Setup ─────────────────────────────────────────

const ALL_AGENTS = [
  "ceo",
  "cfo",
  "cmo",
  "cto",
  "coo",
  "hr",
  "legal",
  "strategy",
  "knowledge",
  "customer-service",
];

let workspaceDir: string;

async function setupWorkspace() {
  workspaceDir = join(tmpdir(), `mabos-neo-test-${randomUUID()}`);
  const agentsDir = join(workspaceDir, "agents");

  for (const agentId of ALL_AGENTS) {
    const agentDir = join(agentsDir, agentId);
    await mkdir(agentDir, { recursive: true });
    await writeJson(join(agentDir, "agent.json"), {
      id: agentId,
      name: agentId.toUpperCase(),
      bdi: {
        commitmentStrategy: "open-minded",
        cycleFrequency: { fullCycleMinutes: 120, quickCheckMinutes: 15 },
        reasoningMethods: ["heuristic"],
        cognitiveRouter: {
          enabled: true,
          thresholds: {
            reflexiveCeiling: 0.3,
            deliberativeFloor: 0.6,
            reflexiveConfidenceMin: 0.75,
            analyticalConfidenceMin: 0.7,
            maxConsecutiveReflexive: 4,
          },
        },
      },
    });
    await writeJson(join(agentDir, "inbox.json"), []);
    await writeFile(
      join(agentDir, "Goals.md"),
      `# ${agentId.toUpperCase()} Goals\n\n### G-1: Execute role responsibilities\n**Status:** active\n**Priority:** 0.8\n**Progress:** 40\n**Deadline:** ongoing\n`,
      "utf-8",
    );
  }

  return workspaceDir;
}

async function teardownWorkspace() {
  if (workspaceDir) {
    await rm(workspaceDir, { recursive: true, force: true });
  }
}

// ── Mock API ────────────────────────────────────────────────

function createMockApi(ws: string) {
  const logs: string[] = [];
  return {
    api: {
      id: "mabos-neo-test",
      name: "MABOS Neo Test",
      version: "0.1.0",
      description: "Test",
      source: "test",
      config: {
        agents: { defaults: { workspace: ws } },
        tools: { agentToAgent: { enabled: true, allow: [] } },
      } as any,
      pluginConfig: {},
      runtime: {
        system: { requestHeartbeatNow: () => {} },
        subagent: null,
      } as any,
      logger: {
        debug: (msg: string) => logs.push(`[debug] ${msg}`),
        info: (msg: string) => logs.push(`[info] ${msg}`),
        warn: (msg: string) => logs.push(`[warn] ${msg}`),
        error: (msg: string) => logs.push(`[error] ${msg}`),
      },
      registerTool: () => {},
      registerHook: () => {},
      registerHttpRoute: () => {},
      registerChannel: () => {},
      registerGatewayMethod: () => {},
      registerCli: () => {},
      registerService: () => {},
      registerProvider: () => {},
      registerCommand: () => {},
      registerContextEngine: () => {},
      resolvePath: (p: string) => p,
      on: () => {},
    } as any,
    logs,
  };
}

const mockLog = { info: vi.fn(), debug: vi.fn(), warn: vi.fn() };

// ── Tests ───────────────────────────────────────────────────

describe("Neo Orchestration — Chat Conversation & Task Monitoring", () => {
  beforeEach(async () => {
    await setupWorkspace();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await teardownWorkspace();
  });

  // ── 1. Directive Classification ──────────────────────────

  describe("directive routing — incoming chat to agent assignment", () => {
    it("routes financial chat to CFO", () => {
      const result = classifyDirective(
        "What is our current revenue and how can we reduce operational costs?",
      );
      expect(result.primaryAgent).toBe("cfo");
      expect(result.keywords).toContain("revenue");
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it("routes marketing chat to CMO", () => {
      const result = classifyDirective(
        "Launch a social media campaign targeting new audience segments",
      );
      expect(result.primaryAgent).toBe("cmo");
      expect(result.keywords).toContain("campaign");
    });

    it("routes technical chat to CTO", () => {
      const result = classifyDirective("Deploy the new API and update database infrastructure");
      expect(result.primaryAgent).toBe("cto");
    });

    it("routes operations chat to COO", () => {
      const result = classifyDirective(
        "Optimize our supply chain logistics for fulfillment efficiency",
      );
      expect(result.primaryAgent).toBe("coo");
    });

    it("routes customer service chat to customer-service", () => {
      const result = classifyDirective(
        "Handle the customer complaint about damaged product and process the return",
      );
      expect(result.primaryAgent).toBe("customer-service");
    });

    it("defaults ambiguous chat to CEO (handle_directly)", () => {
      const result = classifyDirective("Let's think about our next big move");
      expect(result.primaryAgent).toBe("ceo");
      expect(result.confidence).toBe(0.3);

      const routing = buildRoutingDecision(result);
      expect(routing.suggestedAction).toBe("handle_directly");
    });

    it("detects multi-domain chat and suggests decomposition", () => {
      // Needs 2+ keywords for primary AND 2+ keywords for secondary to trigger isMultiDomain
      const result = classifyDirective(
        "We need to cut cost and budget spending on our tech platform and database infrastructure while launching a new social media campaign to grow our brand audience",
      );
      expect(result.isMultiDomain).toBe(true);
      expect(result.secondaryAgents.length).toBeGreaterThan(0);

      const routing = buildRoutingDecision(result);
      expect(routing.suggestedAction).toBe("decompose");
      expect(routing.routingSummary).toContain("Multi-domain");
    });

    it("builds delegate routing with confidence for single-domain chat", () => {
      const classification = classifyDirective("Review our quarterly budget projections");
      const routing = buildRoutingDecision(classification);
      expect(routing.suggestedAction).toBe("delegate");
      expect(routing.routingSummary).toContain("CFO");
      expect(routing.routingSummary).toContain("confidence");
    });
  });

  // ── 2. CEO Task Dispatch & Agent Inbox Monitoring ─────────

  describe("CEO dispatches tasks and monitors agent inboxes", () => {
    it("dispatched tasks appear in domain agent inboxes", async () => {
      const tasks = [
        { to: "cfo", content: "Prepare Q2 budget forecast with 15% cost reduction" },
        { to: "cmo", content: "Design acquisition campaign targeting 500 new leads" },
        { to: "cto", content: "Assess cloud migration costs and propose phased plan" },
      ];

      for (const task of tasks) {
        await deliverMessage(workspaceDir, {
          from: "ceo",
          to: task.to,
          performative: "REQUEST",
          content: task.content,
          priority: "high",
        });
      }

      // Verify each agent received their task
      for (const task of tasks) {
        const inbox = await readJson(join(workspaceDir, "agents", task.to, "inbox.json"));
        expect(inbox).toHaveLength(1);
        expect(inbox[0].from).toBe("ceo");
        expect(inbox[0].performative).toBe("REQUEST");
        expect(inbox[0].content).toBe(task.content);
        expect(inbox[0].read).toBe(false);
      }
    });

    it("inbox scanner detects all pending tasks across agents", async () => {
      // Deliver tasks to multiple agents
      await deliverMessage(workspaceDir, {
        from: "ceo",
        to: "cfo",
        performative: "REQUEST",
        content: "Budget analysis",
        priority: "high",
      });
      await deliverMessage(workspaceDir, {
        from: "ceo",
        to: "cmo",
        performative: "REQUEST",
        content: "Campaign plan",
        priority: "high",
      });

      // Scan each agent's inbox
      const cfoSignals = await scanInbox(
        join(workspaceDir, "agents", "cfo"),
        "cfo",
        new Date(0).toISOString(),
      );
      const cmoSignals = await scanInbox(
        join(workspaceDir, "agents", "cmo"),
        "cmo",
        new Date(0).toISOString(),
      );

      expect(cfoSignals).toHaveLength(1);
      expect(cfoSignals[0].source).toBe("inbox");
      expect(cfoSignals[0].summary).toContain("REQUEST");
      expect(cfoSignals[0].summary).toContain("ceo");

      expect(cmoSignals).toHaveLength(1);
      expect(cmoSignals[0].source).toBe("inbox");
    });

    it("heartbeat processes agent inboxes and marks messages as read", async () => {
      const { api } = createMockApi(workspaceDir);

      // Deliver tasks
      await deliverMessage(workspaceDir, {
        from: "ceo",
        to: "cfo",
        performative: "REQUEST",
        content: "Financial summary for board meeting",
        priority: "high",
      });
      await deliverMessage(workspaceDir, {
        from: "ceo",
        to: "cmo",
        performative: "REQUEST",
        content: "Campaign performance metrics",
        priority: "high",
      });

      // Run heartbeat
      await enhancedHeartbeatCycle(workspaceDir, api, mockLog);

      // Both agents should have marked messages as read
      const cfoInbox = await readJson(join(workspaceDir, "agents", "cfo", "inbox.json"));
      const cmoInbox = await readJson(join(workspaceDir, "agents", "cmo", "inbox.json"));
      expect(cfoInbox[0].read).toBe(true);
      expect(cfoInbox[0].read_at).toBeDefined();
      expect(cmoInbox[0].read).toBe(true);
    });

    it("heartbeat generates agent replies back to CEO", async () => {
      const { api } = createMockApi(workspaceDir);

      await deliverMessage(workspaceDir, {
        from: "ceo",
        to: "cfo",
        performative: "REQUEST",
        content: "Provide financial summary",
        priority: "high",
      });

      await enhancedHeartbeatCycle(workspaceDir, api, mockLog);

      // CEO should have received a reply
      const ceoInbox = await readJson(join(workspaceDir, "agents", "ceo", "inbox.json"));
      const cfoReply = ceoInbox.find((m: any) => m.from === "cfo");
      expect(cfoReply).toBeDefined();
      expect(cfoReply.performative).toBe("CONFIRM");
      expect(cfoReply.content.length).toBeGreaterThan(0);
    });
  });

  // ── 3. Multi-Agent Task Chain ─────────────────────────────

  describe("multi-agent task coordination chain", () => {
    it("CEO → CFO delegation processed in heartbeat, reply generated", async () => {
      const { api } = createMockApi(workspaceDir);

      // CEO delegates to CFO
      await deliverMessage(workspaceDir, {
        from: "ceo",
        to: "cfo",
        performative: "REQUEST",
        content: "Analyze total cost of ownership for new infrastructure",
        priority: "high",
      });

      // CFO also gets a query from CTO
      await deliverMessage(workspaceDir, {
        from: "cto",
        to: "cfo",
        performative: "QUERY",
        content: "What is the budget allocated for infrastructure Q2?",
        priority: "normal",
      });

      // Heartbeat processes both
      await enhancedHeartbeatCycle(workspaceDir, api, mockLog);

      // CFO should have marked both messages as read
      const cfoInbox = await readJson(join(workspaceDir, "agents", "cfo", "inbox.json"));
      expect(cfoInbox.every((m: any) => m.read)).toBe(true);

      // Both CEO and CTO should have replies
      const ceoInbox = await readJson(join(workspaceDir, "agents", "ceo", "inbox.json"));
      const ctoInbox = await readJson(join(workspaceDir, "agents", "cto", "inbox.json"));

      expect(ceoInbox.find((m: any) => m.from === "cfo")).toBeDefined();
      expect(ctoInbox.find((m: any) => m.from === "cfo")).toBeDefined();
    });

    it("parallel dispatch to 5 agents, all process in single heartbeat", async () => {
      const { api } = createMockApi(workspaceDir);

      const targets = ["cfo", "cmo", "cto", "coo", "hr"];
      for (const to of targets) {
        await deliverMessage(workspaceDir, {
          from: "ceo",
          to,
          performative: "REQUEST",
          content: `Task for ${to}: provide department status report`,
          priority: "high",
        });
      }

      await enhancedHeartbeatCycle(workspaceDir, api, mockLog);

      // All messages read
      for (const to of targets) {
        const inbox = await readJson(join(workspaceDir, "agents", to, "inbox.json"));
        expect(inbox[0].read).toBe(true);
      }

      // CEO received replies from all 5
      const ceoInbox = await readJson(join(workspaceDir, "agents", "ceo", "inbox.json"));
      const replyAgents = new Set(ceoInbox.map((m: any) => m.from));
      for (const to of targets) {
        expect(replyAgents.has(to)).toBe(true);
      }
    });
  });

  // ── 4. Cognitive Demand Monitoring ────────────────────────

  describe("cognitive demand and processing depth monitoring", () => {
    it("computes high demand from multiple urgent signals", async () => {
      const cfoDir = join(workspaceDir, "agents", "cfo");

      await writeJson(join(cfoDir, "inbox.json"), [
        {
          id: "MSG-U1",
          from: "ceo",
          to: "cfo",
          performative: "REQUEST",
          content: "Emergency cash flow crisis",
          priority: "urgent",
          timestamp: new Date().toISOString(),
          read: false,
        },
        {
          id: "MSG-U2",
          from: "coo",
          to: "cfo",
          performative: "REQUEST",
          content: "Supplier payment overdue",
          priority: "urgent",
          timestamp: new Date().toISOString(),
          read: false,
        },
      ]);

      const signals = await scanInbox(cfoDir, "cfo", new Date(0).toISOString());
      expect(signals.length).toBe(2);
      expect(signals[0].urgency).toBe(0.9);
      expect(signals[1].urgency).toBe(0.9);

      const thresholds = {
        reflexiveCeiling: 0.3,
        deliberativeFloor: 0.6,
        reflexiveConfidenceMin: 0.75,
        analyticalConfidenceMin: 0.7,
        maxConsecutiveReflexive: 4,
        fullCycleMinutes: 120,
        quickCheckMinutes: 15,
        commitmentStrategy: "open-minded" as const,
      };
      const demand = computeCognitiveDemand(signals, thresholds, new Date(0).toISOString());
      expect(demand.score).toBeGreaterThan(0.6);
      expect(demand.breakdown.urgency).toBeGreaterThan(0);
    });

    it("selects reflexive depth for low demand", () => {
      const t = {
        reflexiveCeiling: 0.3,
        deliberativeFloor: 0.6,
        reflexiveConfidenceMin: 0.75,
        analyticalConfidenceMin: 0.7,
        maxConsecutiveReflexive: 4,
        fullCycleMinutes: 120,
        quickCheckMinutes: 15,
        commitmentStrategy: "open-minded" as const,
      };
      expect(selectDepth(0.15, t)).toBe("reflexive");
    });

    it("selects analytical depth for medium demand", () => {
      const t = {
        reflexiveCeiling: 0.3,
        deliberativeFloor: 0.6,
        reflexiveConfidenceMin: 0.75,
        analyticalConfidenceMin: 0.7,
        maxConsecutiveReflexive: 4,
        fullCycleMinutes: 120,
        quickCheckMinutes: 15,
        commitmentStrategy: "open-minded" as const,
      };
      expect(selectDepth(0.45, t)).toBe("analytical");
    });

    it("selects deliberative depth for high demand", () => {
      const t = {
        reflexiveCeiling: 0.3,
        deliberativeFloor: 0.6,
        reflexiveConfidenceMin: 0.75,
        analyticalConfidenceMin: 0.7,
        maxConsecutiveReflexive: 4,
        fullCycleMinutes: 120,
        quickCheckMinutes: 15,
        commitmentStrategy: "open-minded" as const,
      };
      expect(selectDepth(0.8, t)).toBe("deliberative");
    });

    it("overrides reflexive to analytical for REQUEST signals", async () => {
      const cfoDir = join(workspaceDir, "agents", "cfo");

      await writeJson(join(cfoDir, "inbox.json"), [
        {
          id: "MSG-REQ",
          from: "ceo",
          to: "cfo",
          performative: "REQUEST",
          content: "Prepare financial report",
          priority: "high",
          timestamp: new Date().toISOString(),
          read: false,
        },
      ]);

      const signals = await scanInbox(cfoDir, "cfo", new Date(0).toISOString());
      const t = {
        reflexiveCeiling: 0.3,
        deliberativeFloor: 0.6,
        reflexiveConfidenceMin: 0.75,
        analyticalConfidenceMin: 0.7,
        maxConsecutiveReflexive: 4,
        fullCycleMinutes: 120,
        quickCheckMinutes: 15,
        commitmentStrategy: "open-minded" as const,
      };

      let depth = selectDepth(0.1, t);
      expect(depth).toBe("reflexive");

      depth = applyDepthOverrides(depth, signals, 0, t);
      expect(depth).toBe("analytical");
    });
  });

  // ── 5. Decision Escalation Flow ───────────────────────────

  describe("decision escalation from agent to CEO", () => {
    it("CFO escalates PROPOSE to CEO inbox, CEO replies with ACCEPT", async () => {
      // CFO proposes a decision
      const proposal = await deliverMessage(workspaceDir, {
        from: "cfo",
        to: "ceo",
        performative: "PROPOSE",
        content:
          "DECISION: Approve emergency budget increase of $50K for Q2 marketing. " +
          "Options: (A) Full, (B) Partial $30K, (C) Deny. Recommendation: A",
        priority: "high",
      });

      const ceoInbox = await readJson(join(workspaceDir, "agents", "ceo", "inbox.json"));
      expect(ceoInbox).toHaveLength(1);
      expect(ceoInbox[0].performative).toBe("PROPOSE");
      expect(ceoInbox[0].content).toContain("DECISION");

      // CEO responds
      await deliverMessage(workspaceDir, {
        from: "ceo",
        to: "cfo",
        performative: "ACCEPT",
        content: "Approved: Option A — proceed with full $50K allocation.",
        reply_to: proposal.id,
        priority: "high",
      });

      const cfoInbox = await readJson(join(workspaceDir, "agents", "cfo", "inbox.json"));
      const approval = cfoInbox.find((m: any) => m.performative === "ACCEPT");
      expect(approval).toBeDefined();
      expect(approval.from).toBe("ceo");
      expect(approval.content).toContain("Approved");
      expect(approval.reply_to).toBe(proposal.id);
    });

    it("escalation triggers high cognitive demand on CEO", async () => {
      const ceoDir = join(workspaceDir, "agents", "ceo");

      await writeJson(join(ceoDir, "inbox.json"), [
        {
          id: "ESC-1",
          from: "cfo",
          to: "ceo",
          performative: "PROPOSE",
          content: "DECISION: Critical budget reallocation needed",
          priority: "urgent",
          timestamp: new Date().toISOString(),
          read: false,
        },
        {
          id: "ESC-2",
          from: "coo",
          to: "ceo",
          performative: "PROPOSE",
          content: "DECISION: Supplier contract renegotiation deadline",
          priority: "urgent",
          timestamp: new Date().toISOString(),
          read: false,
        },
      ]);

      const signals = await scanInbox(ceoDir, "ceo", new Date(0).toISOString());
      expect(signals.length).toBe(2);

      const thresholds = {
        reflexiveCeiling: 0.3,
        deliberativeFloor: 0.6,
        reflexiveConfidenceMin: 0.75,
        analyticalConfidenceMin: 0.7,
        maxConsecutiveReflexive: 4,
        fullCycleMinutes: 120,
        quickCheckMinutes: 15,
        commitmentStrategy: "open-minded" as const,
      };
      const demand = computeCognitiveDemand(signals, thresholds, new Date(0).toISOString());
      // Multiple urgent PROPOSEs should push demand high
      expect(demand.score).toBeGreaterThan(0.5);
    });
  });

  // ── 6. Inbox Read/Mark-Read Monitoring Tools ──────────────

  describe("inbox monitoring tools for orchestration oversight", () => {
    it("inbox_read retrieves unread messages filtered by performative", async () => {
      const { api } = createMockApi(workspaceDir);
      const tools = createCommunicationTools(api);
      const inboxRead = tools.find((t) => t.name === "inbox_read")!;

      // Populate CEO inbox with mixed replies
      await writeJson(join(workspaceDir, "agents", "ceo", "inbox.json"), [
        {
          id: "R-1",
          from: "cfo",
          to: "ceo",
          performative: "CONFIRM",
          content: "Budget report ready",
          priority: "normal",
          timestamp: new Date().toISOString(),
          read: false,
        },
        {
          id: "R-2",
          from: "cmo",
          to: "ceo",
          performative: "PROPOSE",
          content: "Campaign needs approval",
          priority: "high",
          timestamp: new Date().toISOString(),
          read: false,
        },
        {
          id: "R-3",
          from: "cto",
          to: "ceo",
          performative: "CONFIRM",
          content: "Tech review complete",
          priority: "normal",
          timestamp: new Date().toISOString(),
          read: true, // already read
        },
      ]);

      // Read only unread PROPOSEs (decisions needing CEO attention)
      const result = await inboxRead.execute("monitor", {
        agent_id: "ceo",
        unread_only: true,
        performative: "PROPOSE",
      });

      const text = result.content[0].text;
      expect(text).toContain("R-2");
      expect(text).toContain("PROPOSE");
      expect(text).not.toContain("R-1"); // CONFIRM filtered
      expect(text).not.toContain("R-3"); // already read
    });

    it("inbox_mark_read marks processed messages", async () => {
      const { api } = createMockApi(workspaceDir);
      const tools = createCommunicationTools(api);
      const markRead = tools.find((t) => t.name === "inbox_mark_read")!;

      await writeJson(join(workspaceDir, "agents", "ceo", "inbox.json"), [
        { id: "M-1", from: "cfo", read: false },
        { id: "M-2", from: "cmo", read: false },
        { id: "M-3", from: "cto", read: false },
      ]);

      // Mark only CFO and CTO replies as processed
      await markRead.execute("process", {
        agent_id: "ceo",
        message_ids: ["M-1", "M-3"],
      });

      const inbox = await readJson(join(workspaceDir, "agents", "ceo", "inbox.json"));
      expect(inbox[0].read).toBe(true); // M-1 marked
      expect(inbox[1].read).toBe(false); // M-2 untouched
      expect(inbox[2].read).toBe(true); // M-3 marked
    });
  });

  // ── 7. End-to-End: Chat → Route → Execute → Monitor ──────

  describe("end-to-end: user chat → routing → agent execution → monitoring", () => {
    it("user directive gets classified, agents process tasks, CEO monitors results", async () => {
      const { api } = createMockApi(workspaceDir);
      const tools = createCommunicationTools(api);
      const inboxRead = tools.find((t) => t.name === "inbox_read")!;

      // === Step 1: User sends chat ===
      const userMessage =
        "Reduce our marketing budget by 20% and reallocate to product development";

      // === Step 2: Classify directive ===
      const classification = classifyDirective(userMessage);
      expect(classification.primaryAgent).toBeDefined();
      expect(classification.confidence).toBeGreaterThan(0);

      const routing = buildRoutingDecision(classification);
      expect(["delegate", "decompose", "handle_directly"]).toContain(routing.suggestedAction);

      // === Step 3: CEO dispatches to agents (simulated) ===
      const agents = [classification.primaryAgent, ...classification.secondaryAgents.slice(0, 2)];
      for (const to of agents) {
        await deliverMessage(workspaceDir, {
          from: "ceo",
          to,
          performative: "REQUEST",
          content: `Directive: "${userMessage}" — provide your domain analysis.`,
          priority: "high",
        });
      }

      // === Step 4: Heartbeat processes all ===
      await enhancedHeartbeatCycle(workspaceDir, api, mockLog);

      // === Step 5: CEO monitors replies ===
      const ceoInbox = await readJson(join(workspaceDir, "agents", "ceo", "inbox.json"));
      expect(ceoInbox.length).toBeGreaterThanOrEqual(1);

      const primaryReply = ceoInbox.find((m: any) => m.from === classification.primaryAgent);
      expect(primaryReply).toBeDefined();
      expect(primaryReply.performative).toBe("CONFIRM");

      // === Step 6: CEO reads aggregated results ===
      const readResult = await inboxRead.execute("aggregate", {
        agent_id: "ceo",
        unread_only: true,
      });
      expect(readResult.content[0].text).toContain("CONFIRM");
    });
  });
});
