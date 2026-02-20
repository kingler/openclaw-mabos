export type AgentStatus = "active" | "idle" | "error" | "paused";

export type Agent = {
  id: string;
  name: string;
  role: string;
  department: string;
  status: AgentStatus;
  description?: string;
  currentTask?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "agent";
  agentId?: string;
  agentName?: string;
  content: string;
  timestamp: Date;
  streaming?: boolean;
};

export type Business = {
  id: string;
  name: string;
  description: string;
  stage: string;
  agentCount: number;
  healthScore: number;
};

export type Task = {
  id: string;
  title: string;
  status: "backlog" | "todo" | "in_progress" | "review" | "done";
  priority: "low" | "medium" | "high";
  assignedAgents: string[];
  department: string;
  description?: string;
};

export type SystemStatus = {
  version: string;
  uptime: number;
  businesses: number;
  agents: { total: number; active: number; idle: number; error: number };
  bdiCycles: number;
};

export type AgentListItem = {
  id: string;
  name: string;
  type: "core" | "domain";
  beliefs: number;
  goals: number;
  intentions: number;
  desires: number;
  status: AgentStatus;
  autonomy_level: "low" | "medium" | "high";
  approval_threshold_usd: number;
};

export type AgentListResponse = {
  agents: AgentListItem[];
};

export type AgentDetail = {
  agentId: string;
  beliefCount: number;
  goalCount: number;
  intentionCount: number;
  desireCount: number;
  beliefs: string[];
  goals: string[];
  intentions: string[];
  desires: string[];
};
