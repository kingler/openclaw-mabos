/**
 * Task Delegation Engine — higher-level abstraction over Contract Net.
 *
 * Decomposes goals into delegatable sub-tasks, matches agents by
 * capability, tracks delegation lifecycle, and escalates on failure.
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { AgentCapability, DelegatedTask } from "./types.js";
import type { ContractNetManager } from "./contract-net.js";
import type { MessageRouter } from "./message-router.js";

async function readJson<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(p, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function writeJson(p: string, d: unknown): Promise<void> {
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(d, null, 2), "utf-8");
}

export interface TaskDelegationEngine {
  delegate(params: {
    description: string;
    delegatedBy: string;
    parentGoalId?: string;
    requiredSkills?: string[];
    deadline?: string;
    useCfp?: boolean;
  }): Promise<DelegatedTask>;
  updateProgress(taskId: string, progress: number, status?: DelegatedTask["status"]): Promise<void>;
  escalate(taskId: string, reason: string): Promise<void>;
  listDelegations(filter?: { status?: DelegatedTask["status"]; agentId?: string }): Promise<DelegatedTask[]>;
  getCapabilities(): Promise<AgentCapability[]>;
}

export function createTaskDelegationEngine(
  workspaceDir: string,
  contractNet: ContractNetManager,
  router: MessageRouter,
): TaskDelegationEngine {
  const delegationsPath = join(workspaceDir, "coordination", "delegations.json");

  async function loadDelegations(): Promise<DelegatedTask[]> {
    return (await readJson<DelegatedTask[]>(delegationsPath)) || [];
  }

  async function saveDelegations(tasks: DelegatedTask[]): Promise<void> {
    await writeJson(delegationsPath, tasks);
  }

  async function scanCapabilities(): Promise<AgentCapability[]> {
    const agentsDir = join(workspaceDir, "agents");
    const capabilities: AgentCapability[] = [];
    try {
      const entries = await readdir(agentsDir);
      for (const agentId of entries) {
        const capPath = join(agentsDir, agentId, "Capabilities.md");
        const manifestPath = join(agentsDir, agentId, "agent.json");
        try {
          const capContent = await readFile(capPath, "utf-8").catch(() => "");
          const manifest = await readJson<Record<string, unknown>>(manifestPath);

          const skills: string[] = [];
          const skillMatches = capContent.matchAll(/^##\s+(.+)$/gm);
          for (const match of skillMatches) {
            skills.push(match[1].trim());
          }

          const delegations = await loadDelegations();
          const activeTasks = delegations.filter(
            (t) => t.delegatedTo === agentId && (t.status === "pending" || t.status === "in-progress"),
          );

          capabilities.push({
            agentId,
            skills,
            currentLoad: activeTasks.length,
            maxLoad: (manifest?.maxConcurrentTasks as number) ?? 5,
            costPerHour: manifest?.costPerHour as number | undefined,
          });
        } catch {
          // skip agent
        }
      }
    } catch {
      // agents dir may not exist
    }
    return capabilities;
  }

  function matchAgent(
    capabilities: AgentCapability[],
    requiredSkills: string[],
  ): AgentCapability | null {
    const candidates = capabilities
      .filter((c) => c.currentLoad < c.maxLoad)
      .filter((c) => {
        if (requiredSkills.length === 0) return true;
        const agentSkillsLower = c.skills.map((s) => s.toLowerCase());
        return requiredSkills.some((req) =>
          agentSkillsLower.some((s) => s.includes(req.toLowerCase())),
        );
      })
      .sort((a, b) => a.currentLoad - b.currentLoad);

    return candidates[0] ?? null;
  }

  return {
    async delegate(params) {
      const taskId = `TASK-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const capabilities = await scanCapabilities();

      let assignee: string;

      if (params.useCfp) {
        const candidateIds = capabilities
          .filter((c) => c.currentLoad < c.maxLoad)
          .map((c) => c.agentId);

        await contractNet.initiate({
          taskId,
          initiator: params.delegatedBy,
          description: params.description,
          candidates: candidateIds,
          criteria: params.requiredSkills ?? ["quality", "speed"],
          deadline: params.deadline,
        });

        assignee = candidateIds[0] ?? params.delegatedBy;
      } else {
        const match = matchAgent(capabilities, params.requiredSkills ?? []);
        if (!match) {
          assignee = params.delegatedBy;
        } else {
          assignee = match.agentId;
          await router.send({
            from: params.delegatedBy,
            to: assignee,
            performative: "REQUEST",
            content: `Task delegated: ${params.description}${params.deadline ? `\nDeadline: ${params.deadline}` : ""}`,
            priority: "high",
          });
        }
      }

      const task: DelegatedTask = {
        id: taskId,
        parentGoalId: params.parentGoalId,
        description: params.description,
        delegatedTo: assignee,
        delegatedBy: params.delegatedBy,
        auctionId: params.useCfp ? taskId : undefined,
        status: "pending",
        progress: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deadline: params.deadline,
      };

      const delegations = await loadDelegations();
      delegations.push(task);
      await saveDelegations(delegations);

      return task;
    },

    async updateProgress(taskId, progress, status) {
      const delegations = await loadDelegations();
      const task = delegations.find((t) => t.id === taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);

      task.progress = Math.min(100, Math.max(0, progress));
      if (status) task.status = status;
      if (progress >= 100 && !status) task.status = "completed";
      task.updatedAt = new Date().toISOString();

      await saveDelegations(delegations);

      if (task.status === "completed") {
        await router.send({
          from: task.delegatedTo,
          to: task.delegatedBy,
          performative: "INFORM",
          content: `Task ${taskId} completed: ${task.description}`,
          priority: "normal",
        });
      }
    },

    async escalate(taskId, reason) {
      const delegations = await loadDelegations();
      const task = delegations.find((t) => t.id === taskId);
      if (!task) throw new Error(`Task ${taskId} not found`);

      task.status = "escalated";
      task.updatedAt = new Date().toISOString();
      await saveDelegations(delegations);

      await router.send({
        from: task.delegatedTo,
        to: task.delegatedBy,
        performative: "INFORM",
        content: `Task ${taskId} escalated: ${reason}\nOriginal: ${task.description}`,
        priority: "urgent",
      });
    },

    async listDelegations(filter) {
      const delegations = await loadDelegations();
      return delegations.filter((t) => {
        if (filter?.status && t.status !== filter.status) return false;
        if (filter?.agentId && t.delegatedTo !== filter.agentId && t.delegatedBy !== filter.agentId) return false;
        return true;
      });
    },

    async getCapabilities() {
      return scanCapabilities();
    },
  };
}
