export type AuctionStatus = "open" | "evaluating" | "awarded" | "failed" | "expired";

export interface CallForProposal {
  taskId: string;
  initiator: string;
  description: string;
  candidates: string[];
  criteria: string[];
  deadline?: string;
  budget?: number;
}

export interface Proposal {
  agent: string;
  approach: string;
  estimatedCost?: number;
  estimatedDuration?: string;
  confidence: number;
  conditions?: string[];
  submittedAt: string;
}

export interface Auction {
  taskId: string;
  initiator: string;
  description: string;
  candidates: string[];
  criteria: string[];
  deadline?: string;
  budget?: number;
  status: AuctionStatus;
  proposals: Proposal[];
  winner?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface DelegatedTask {
  id: string;
  parentGoalId?: string;
  description: string;
  delegatedTo: string;
  delegatedBy: string;
  auctionId?: string;
  status: "pending" | "in-progress" | "completed" | "failed" | "escalated";
  progress: number;
  createdAt: string;
  updatedAt: string;
  deadline?: string;
}

export interface AgentCapability {
  agentId: string;
  skills: string[];
  currentLoad: number;
  maxLoad: number;
  costPerHour?: number;
}

export interface RoutedMessage {
  id: string;
  from: string;
  to: string;
  performative: string;
  content: string;
  priority: "low" | "normal" | "high" | "urgent";
  timestamp: string;
  delivered: boolean;
  deliveredAt?: string;
}

export interface CoordinationConfig {
  auctionTimeoutMs?: number;
  maxConcurrentDelegations?: number;
  messageRetryAttempts?: number;
  enableKnowledgeSharing?: boolean;
}
