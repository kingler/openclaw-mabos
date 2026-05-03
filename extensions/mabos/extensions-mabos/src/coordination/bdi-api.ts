/**
 * BDI Cognitive State REST API — exposes agent cognitive state
 * as structured JSON via HTTP endpoints.
 *
 * Reads the markdown-based cognitive files and serves them
 * as parsed data for the dashboard.
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveWorkspaceDir } from "../tools/common.js";

interface ParsedCognitiveState {
  agentId: string;
  beliefs: ParsedSection[];
  desires: ParsedSection[];
  goals: ParsedSection[];
  intentions: ParsedSection[];
  plans: ParsedSection[];
  beliefCount: number;
  desireCount: number;
  goalCount: number;
  intentionCount: number;
  planCount: number;
  commitmentStrategy?: string;
  lastCycleAt?: string;
}

interface ParsedSection {
  heading: string;
  content: string;
  metadata: Record<string, string>;
}

function jsonResponse(res: any, data: unknown, status = 200) {
  res.setHeader("Content-Type", "application/json");
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

function parseQuery(req: any): Record<string, string> {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers?.host ?? "localhost"}`);
    const params: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { params[k] = v; });
    return params;
  } catch {
    return {};
  }
}

function parseMarkdownSections(md: string): ParsedSection[] {
  if (!md.trim()) return [];
  const blocks = md.split(/(?=^##\s)/m).filter((b) => b.trim());
  return blocks.map((block) => {
    const lines = block.split("\n");
    const heading = (lines[0] ?? "").replace(/^##\s*/, "").trim();
    const content = lines.slice(1).join("\n").trim();
    const metadata: Record<string, string> = {};
    for (const line of lines) {
      const match = line.match(/[-*]\s*(\w[\w\s]*?):\s*(.+)/);
      if (match) {
        metadata[match[1].trim().toLowerCase()] = match[2].trim();
      }
    }
    return { heading, content, metadata };
  });
}

const COGNITIVE_FILES: Record<string, string> = {
  beliefs: "Beliefs.md",
  desires: "Desires.md",
  goals: "Goals.md",
  intentions: "Intentions.md",
  plans: "Plans.md",
};

async function readCognitiveFile(agentDir: string, file: string): Promise<string> {
  try {
    return await readFile(join(agentDir, file), "utf-8");
  } catch {
    return "";
  }
}

async function getAgentCognitiveState(
  workspaceDir: string,
  agentId: string,
): Promise<ParsedCognitiveState> {
  const agentDir = join(workspaceDir, "agents", agentId);

  const [beliefs, desires, goals, intentions, plans] = await Promise.all([
    readCognitiveFile(agentDir, COGNITIVE_FILES.beliefs),
    readCognitiveFile(agentDir, COGNITIVE_FILES.desires),
    readCognitiveFile(agentDir, COGNITIVE_FILES.goals),
    readCognitiveFile(agentDir, COGNITIVE_FILES.intentions),
    readCognitiveFile(agentDir, COGNITIVE_FILES.plans),
  ]);

  const parsedBeliefs = parseMarkdownSections(beliefs);
  const parsedDesires = parseMarkdownSections(desires);
  const parsedGoals = parseMarkdownSections(goals);
  const parsedIntentions = parseMarkdownSections(intentions);
  const parsedPlans = parseMarkdownSections(plans);

  let commitmentStrategy: string | undefined;
  try {
    const manifestRaw = await readFile(join(agentDir, "agent.json"), "utf-8");
    const manifest = JSON.parse(manifestRaw);
    commitmentStrategy = manifest?.bdi?.commitmentStrategy;
  } catch {}

  return {
    agentId,
    beliefs: parsedBeliefs,
    desires: parsedDesires,
    goals: parsedGoals,
    intentions: parsedIntentions,
    plans: parsedPlans,
    beliefCount: parsedBeliefs.length,
    desireCount: parsedDesires.length,
    goalCount: parsedGoals.length,
    intentionCount: parsedIntentions.length,
    planCount: parsedPlans.length,
    commitmentStrategy,
  };
}

async function discoverAgents(workspaceDir: string): Promise<string[]> {
  const agentsDir = join(workspaceDir, "agents");
  try {
    const entries = await readdir(agentsDir);
    const agents: string[] = [];
    for (const entry of entries) {
      const entryPath = join(agentsDir, entry);
      const s = await stat(entryPath).catch(() => null);
      if (!s?.isDirectory()) continue;
      const hasPersona = await stat(join(entryPath, "Persona.md")).catch(() => null);
      const hasBeliefs = await stat(join(entryPath, "Beliefs.md")).catch(() => null);
      if (hasPersona || hasBeliefs) {
        agents.push(entry);
      }
    }
    return agents;
  } catch {
    return [];
  }
}

function extractAgentId(url: string): string | null {
  const match = url.match(/\/mabos\/api\/bdi\/agents\/([^/]+)/);
  return match ? match[1] : null;
}

export function registerBdiApi(api: OpenClawPluginApi) {
  const workspaceDir = resolveWorkspaceDir(api);

  // GET /mabos/api/bdi/agents — list all agents with cognitive summary
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/bdi/agents",
    handler: async (_req, res) => {
      const agentIds = await discoverAgents(workspaceDir);
      const agents = await Promise.all(
        agentIds.map(async (id) => {
          const state = await getAgentCognitiveState(workspaceDir, id);
          return {
            agentId: id,
            beliefCount: state.beliefCount,
            desireCount: state.desireCount,
            goalCount: state.goalCount,
            intentionCount: state.intentionCount,
            planCount: state.planCount,
            commitmentStrategy: state.commitmentStrategy,
          };
        }),
      );
      jsonResponse(res, { agents });
    },
  });

  // Parameterized routes for /mabos/api/bdi/agents/:id/*
  // Use prefix matching to handle all sub-routes under the agents path
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/bdi/agents",
    match: "prefix",
    handler: async (req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers?.host ?? "localhost"}`);
      const pathname = url.pathname;

      const agentId = extractAgentId(pathname);
      if (!agentId) {
        return false;
      }

      if (pathname.endsWith("/cognitive-state")) {
        const state = await getAgentCognitiveState(workspaceDir, agentId);
        jsonResponse(res, state);
        return true;
      }

      if (pathname.endsWith("/beliefs")) {
        const state = await getAgentCognitiveState(workspaceDir, agentId);
        jsonResponse(res, { agentId, beliefs: state.beliefs });
        return true;
      }

      if (pathname.endsWith("/desires")) {
        const state = await getAgentCognitiveState(workspaceDir, agentId);
        jsonResponse(res, { agentId, desires: state.desires });
        return true;
      }

      if (pathname.endsWith("/goals")) {
        const state = await getAgentCognitiveState(workspaceDir, agentId);
        jsonResponse(res, { agentId, goals: state.goals });
        return true;
      }

      if (pathname.endsWith("/intentions")) {
        const state = await getAgentCognitiveState(workspaceDir, agentId);
        jsonResponse(res, { agentId, intentions: state.intentions });
        return true;
      }

      if (pathname.endsWith("/plans")) {
        const state = await getAgentCognitiveState(workspaceDir, agentId);
        jsonResponse(res, { agentId, plans: state.plans });
        return true;
      }

      if (pathname.endsWith("/cases")) {
        const casesPath = join(workspaceDir, "agents", agentId, "cases.json");
        try {
          const cases = JSON.parse(await readFile(casesPath, "utf-8"));
          jsonResponse(res, { agentId, cases });
        } catch {
          jsonResponse(res, { agentId, cases: [] });
        }
        return true;
      }

      return false;
    },
  });

  // GET /mabos/api/bdi/events — recent BDI events from the event bus
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/bdi/events",
    handler: async (req, res) => {
      const query = parseQuery(req);
      const limit = parseInt(query.limit ?? "50", 10);
      const eventsPath = join(workspaceDir, "events.jsonl");
      try {
        const raw = await readFile(eventsPath, "utf-8");
        const lines = raw.trim().split("\n").filter(Boolean);
        const events = lines
          .slice(-limit)
          .map((line) => { try { return JSON.parse(line); } catch { return null; } })
          .filter((e) => e && (e.type?.startsWith("bdi.") || e.source === "bdi"));
        jsonResponse(res, { events });
      } catch {
        jsonResponse(res, { events: [] });
      }
    },
  });
}
