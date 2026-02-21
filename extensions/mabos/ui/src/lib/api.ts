import type {
  SystemStatus,
  Business,
  AgentListResponse,
  AgentListItem,
  AgentDetail,
  Task,
  DecisionsResponse,
  DecisionResolution,
  ContractorsResponse,
  TroposGoalModel,
} from "./types";

const BASE = "/mabos/api";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return res.json();
}

export const api = {
  // Status
  getStatus: () => get<SystemStatus>("/status"),

  // Businesses
  getBusinesses: () => get<Business[]>("/businesses"),

  // Agents
  getAgents: (businessId: string) => get<AgentListResponse>(`/businesses/${businessId}/agents`),
  getAgent: (businessId: string, agentId: string) =>
    get<AgentListItem>(`/businesses/${businessId}/agents/${agentId}`),
  getAgentDetail: (agentId: string) => get<AgentDetail>(`/agents/${agentId}`),
  createAgent: (
    businessId: string,
    body: {
      id: string;
      name: string;
      type: "core" | "domain";
      autonomy_level: "low" | "medium" | "high";
      approval_threshold_usd: number;
    },
  ) => post<{ ok: boolean }>(`/businesses/${businessId}/agents`, body),
  updateAgent: (businessId: string, agentId: string, body: Partial<AgentListItem>) =>
    post<{ ok: boolean }>(`/businesses/${businessId}/agents/${agentId}`, body),
  archiveAgent: (businessId: string, agentId: string) =>
    post<{ ok: boolean }>(`/businesses/${businessId}/agents/${agentId}/archive`, {}),

  // Tasks
  getTasks: (businessId: string) => get<Task[]>(`/businesses/${businessId}/tasks`),
  updateTask: (businessId: string, taskId: string, body: unknown) =>
    put<unknown>(`/businesses/${businessId}/tasks/${taskId}`, body),

  // Metrics
  getMetrics: (businessId: string) => get<unknown>(`/metrics/${businessId}`),

  // Goals
  getGoals: (businessId: string) => get<TroposGoalModel>(`/businesses/${businessId}/goals`),
  updateGoals: (businessId: string, body: TroposGoalModel) =>
    put<{ ok: boolean }>(`/businesses/${businessId}/goals`, body),

  // Decisions
  getDecisions: () => get<DecisionsResponse>("/decisions"),
  resolveDecision: (id: string, body: DecisionResolution) =>
    post<{ ok: boolean }>(`/decisions/${id}/resolve`, body),

  // Contractors
  getContractors: () => get<ContractorsResponse>("/contractors"),

  // Campaigns
  getCampaigns: (businessId: string) => get<unknown[]>(`/businesses/${businessId}/campaigns`),

  // Onboarding
  onboard: (body: unknown) => post<unknown>("/onboard", body),

  // Chat
  sendChatMessage: (body: { agentId: string; message: string; businessId: string }) =>
    post<{ ok: boolean; messageId: string; message: string }>("/chat", body),

  // BDI
  triggerBdiCycle: (businessId: string, agentId: string) =>
    post<{ ok: boolean }>(`/bdi/cycle`, { businessId, agentId }),
};
