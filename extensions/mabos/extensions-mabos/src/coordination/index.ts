/**
 * Coordination module — multi-agent task delegation, contract-net
 * runtime, message routing, and knowledge sharing.
 *
 * Registers API routes for coordination state and tools for
 * agent-driven delegation workflows.
 */

import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi, AnyAgentTool } from "openclaw/plugin-sdk";
import { resolveWorkspaceDir } from "../tools/common.js";
import { createContractNetManager } from "./contract-net.js";
import { createMessageRouter } from "./message-router.js";
import { createTaskDelegationEngine } from "./task-delegation.js";

function textResult(text: string) {
  return [{ type: "text" as const, text }];
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
    url.searchParams.forEach((v, k) => {
      params[k] = v;
    });
    return params;
  } catch {
    return {};
  }
}

async function readBody(req: any): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

export function registerCoordination(api: OpenClawPluginApi) {
  const workspaceDir = resolveWorkspaceDir(api);
  const contractNet = createContractNetManager(workspaceDir);
  const router = createMessageRouter(workspaceDir);
  const delegation = createTaskDelegationEngine(workspaceDir, contractNet, router);

  // ── API Routes ──────────────────────────────────────────────

  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/coordination/auctions",
    handler: async (_req, res) => {
      const auctions = await contractNet.listActive();
      jsonResponse(res, { auctions });
    },
  });

  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/coordination/delegations",
    handler: async (req, res) => {
      const query = parseQuery(req);
      const tasks = await delegation.listDelegations({
        status: query.status as any,
        agentId: query.agentId,
      });
      jsonResponse(res, { delegations: tasks });
    },
  });

  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/coordination/capabilities",
    handler: async (_req, res) => {
      const capabilities = await delegation.getCapabilities();
      jsonResponse(res, { capabilities });
    },
  });

  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/coordination/messages",
    handler: async (req, res) => {
      const query = parseQuery(req);
      const limit = parseInt(query.limit ?? "50", 10);
      const log = await router.getDeliveryLog(limit);
      jsonResponse(res, { messages: log });
    },
  });

  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/coordination/delegate",
    handler: async (req, res) => {
      const body = await readBody(req);
      const task = await delegation.delegate({
        description: String(body.description ?? ""),
        delegatedBy: String(body.delegatedBy ?? ""),
        parentGoalId: body.parentGoalId as string | undefined,
        requiredSkills: body.requiredSkills as string[] | undefined,
        deadline: body.deadline as string | undefined,
        useCfp: body.useCfp as boolean | undefined,
      });
      jsonResponse(res, { task });
    },
  });

  // ── Agent Tools ─────────────────────────────────────────────

  const tools: AnyAgentTool[] = [
    {
      name: "delegate_task",
      label: "Delegate Task",
      description:
        "Delegate a task to the best-matched agent based on capabilities and current load. Optionally uses Contract Net Protocol for competitive bidding.",
      parameters: Type.Object({
        description: Type.String({ description: "Task description" }),
        delegated_by: Type.String({ description: "Delegating agent ID" }),
        parent_goal_id: Type.Optional(Type.String({ description: "Parent goal ID" })),
        required_skills: Type.Optional(
          Type.Array(Type.String(), { description: "Required skills for the task" }),
        ),
        deadline: Type.Optional(Type.String({ description: "Task deadline (ISO date)" })),
        use_cfp: Type.Optional(
          Type.Boolean({ description: "Use Contract Net Protocol for competitive bidding" }),
        ),
      }),
      async execute(
        _id: string,
        params: {
          description: string;
          delegated_by: string;
          parent_goal_id?: string;
          required_skills?: string[];
          deadline?: string;
          use_cfp?: boolean;
        },
      ) {
        const task = await delegation.delegate({
          description: params.description,
          delegatedBy: params.delegated_by,
          parentGoalId: params.parent_goal_id,
          requiredSkills: params.required_skills,
          deadline: params.deadline,
          useCfp: params.use_cfp,
        });
        return textResult(
          `Task ${task.id} delegated to ${task.delegatedTo}.\n` +
            `Status: ${task.status}\n` +
            `${task.auctionId ? `CFP auction: ${task.auctionId}` : "Direct assignment"}`,
        );
      },
    },

    {
      name: "delegation_status",
      label: "Check Delegation Status",
      description: "List delegated tasks, optionally filtered by status or agent.",
      parameters: Type.Object({
        status: Type.Optional(
          Type.Union([
            Type.Literal("pending"),
            Type.Literal("in-progress"),
            Type.Literal("completed"),
            Type.Literal("failed"),
            Type.Literal("escalated"),
          ]),
        ),
        agent_id: Type.Optional(Type.String({ description: "Filter by agent ID" })),
      }),
      async execute(_id: string, params: { status?: string; agent_id?: string }) {
        const tasks = await delegation.listDelegations({
          status: params.status as any,
          agentId: params.agent_id,
        });
        if (tasks.length === 0) {
          return textResult("No delegated tasks found matching the filter.");
        }
        const lines = tasks.map(
          (t) =>
            `- **${t.id}** [${t.status}] → ${t.delegatedTo} (${t.progress}%)\n  ${t.description.slice(0, 120)}`,
        );
        return textResult(`${tasks.length} delegated task(s):\n\n${lines.join("\n\n")}`);
      },
    },

    {
      name: "update_delegation_progress",
      label: "Update Delegation Progress",
      description: "Update progress on a delegated task.",
      parameters: Type.Object({
        task_id: Type.String({ description: "Delegated task ID" }),
        progress: Type.Number({ description: "Progress percentage (0-100)" }),
        status: Type.Optional(
          Type.Union([
            Type.Literal("pending"),
            Type.Literal("in-progress"),
            Type.Literal("completed"),
            Type.Literal("failed"),
          ]),
        ),
      }),
      async execute(_id: string, params: { task_id: string; progress: number; status?: string }) {
        await delegation.updateProgress(params.task_id, params.progress, params.status as any);
        return textResult(
          `Task ${params.task_id} updated: ${params.progress}%${params.status ? ` (${params.status})` : ""}`,
        );
      },
    },

    {
      name: "escalate_task",
      label: "Escalate Task",
      description: "Escalate a delegated task back to the delegator with a reason.",
      parameters: Type.Object({
        task_id: Type.String({ description: "Task ID to escalate" }),
        reason: Type.String({ description: "Reason for escalation" }),
      }),
      async execute(_id: string, params: { task_id: string; reason: string }) {
        await delegation.escalate(params.task_id, params.reason);
        return textResult(`Task ${params.task_id} escalated: ${params.reason}`);
      },
    },

    {
      name: "agent_capabilities",
      label: "List Agent Capabilities",
      description:
        "Scan all agents and report their skills, current task load, and availability for delegation.",
      parameters: Type.Object({}),
      async execute() {
        const caps = await delegation.getCapabilities();
        if (caps.length === 0) {
          return textResult("No agents with capability files found.");
        }
        const lines = caps.map(
          (c) =>
            `- **${c.agentId}**: ${c.skills.length} skills, load ${c.currentLoad}/${c.maxLoad}${c.costPerHour ? ` ($${c.costPerHour}/hr)` : ""}\n  Skills: ${c.skills.slice(0, 5).join(", ")}${c.skills.length > 5 ? ` (+${c.skills.length - 5} more)` : ""}`,
        );
        return textResult(`${caps.length} agent(s) discovered:\n\n${lines.join("\n\n")}`);
      },
    },
  ];

  for (const tool of tools) {
    api.registerTool(tool);
  }

  // ── Heartbeat hook: expire stale auctions ───────────────────
  mabosHeartbeat("coordination", async () => {
    const expired = await contractNet.expireStale();
    if (expired.length > 0) {
      api.logger.info(
        `[coordination] Expired ${expired.length} stale auction(s): ${expired.join(", ")}`,
      );
    }
  });
}

// ── MABOS heartbeat shim ──────────────────────────────────────────────
// The core plugin API exposes no "heartbeat" hook (valid hooks are the 24
// PluginHookName values, e.g. agent_end / gateway_start). Periodic work is
// therefore driven by a timer here instead of api.hook(...).
function mabosHeartbeat(label, fn, ms = 60_000) {
  const timer = setInterval(async () => {
    try {
      await fn();
    } catch (err) {
      console.warn(`[mabos] ${label} heartbeat failed: ${err}`);
    }
  }, ms);
  timer?.unref?.();
  return timer;
}
