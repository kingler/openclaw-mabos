import type { BpmnWorkflow, BpmnValidationError } from "./bpmn-types";
import type {
  SystemStatus,
  Business,
  AgentListResponse,
  AgentListItem,
  AgentDetail,
  AgentFileInfo,
  AgentFileContent,
  Decision,
  DecisionResolution,
  Contractor,
  TroposGoalModel,
  CronJob,
  CronJobsResponse,
  StockItem,
  Contact,
  Invoice,
  Account,
  ProfitLoss,
  Product,
  Order,
  Supplier,
  PurchaseOrder,
  Campaign,
  CampaignMetric,
  MarketingKpi,
  Shipment,
  Route,
  CompliancePolicy,
  Violation,
  AnalyticsReport,
  ReportSnapshot,
  AnalyticsDashboard,
  PartnershipContract,
  FreelancerContract,
  CorporateDocument,
  LegalStructure,
  ComplianceGuardrail,
} from "./types";

const BASE = "/mabos/api";
const REQUEST_TIMEOUT_MS = 30_000;

export class ApiError extends Error {
  status: number;
  path: string;
  body: unknown;

  constructor(status: number, path: string, body: unknown) {
    super(`API ${status}: ${path}`);
    this.name = "ApiError";
    this.status = status;
    this.path = path;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => res.text().catch(() => null));
      throw new ApiError(res.status, path, body);
    }

    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      throw new ApiError(res.status, path, `Non-JSON response: ${ct || "no content-type"}`);
    }

    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

function post<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function put<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

export const api = {
  // Status
  getStatus: () => get<SystemStatus>("/status"),

  // Businesses
  getBusinesses: () => get<{ businesses: Business[] }>("/businesses"),

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

  // Agent Files
  getAgentFiles: (agentId: string) => get<{ files: AgentFileInfo[] }>(`/agents/${agentId}/files`),
  getAgentFile: (agentId: string, filename: string) =>
    get<AgentFileContent>(`/agents/${agentId}/files/${encodeURIComponent(filename)}`),
  updateAgentFile: (agentId: string, filename: string, content: string) =>
    put<{ ok: boolean }>(`/agents/${agentId}/files/${encodeURIComponent(filename)}`, { content }),

  // Tasks
  getTasks: (businessId: string) => get<{ tasks: unknown[] }>(`/businesses/${businessId}/tasks`),
  updateTask: (businessId: string, taskId: string, body: unknown) =>
    put<unknown>(`/businesses/${businessId}/tasks/${taskId}`, body),

  // Metrics
  getMetrics: (businessId: string) => get<unknown>(`/metrics/${businessId}`),

  // Goals
  getGoals: (businessId: string) => get<TroposGoalModel>(`/businesses/${businessId}/goals`),
  updateGoals: (businessId: string, body: TroposGoalModel) =>
    put<{ ok: boolean }>(`/businesses/${businessId}/goals`, body),

  // Decisions
  getDecisions: () => get<{ decisions: Decision[] }>("/decisions"),
  resolveDecision: (id: string, body: DecisionResolution) =>
    post<{ ok: boolean }>(`/decisions/${id}/resolve`, body),

  // Contractors
  getContractors: () => get<{ contractors: Contractor[] }>("/contractors"),

  // Campaigns
  getCampaigns: (businessId: string) => get<unknown[]>(`/businesses/${businessId}/campaigns`),

  // Onboarding
  onboard: (body: unknown) => post<unknown>("/onboard", body),

  // Chat
  sendChatMessage: (body: {
    agentId: string;
    message: string;
    businessId: string;
    pageContext?: { page: string; capabilities: string[] };
  }) => post<{ ok: boolean; messageId: string; message: string }>("/chat", body),

  // BDI
  triggerBdiCycle: (businessId: string, agentId: string) =>
    post<{ ok: boolean }>(`/bdi/cycle`, { businessId, agentId }),

  // Cron Jobs
  getCronJobs: (businessId: string) => get<CronJobsResponse>(`/businesses/${businessId}/cron`),
  getCronJobsByWorkflow: (businessId: string, workflowId: string) =>
    get<CronJobsResponse>(`/businesses/${businessId}/cron?workflowId=${workflowId}`),
  createCronJob: (
    businessId: string,
    body: {
      name: string;
      schedule: string;
      agentId: string;
      action: string;
      enabled?: boolean;
      workflowId?: string;
      stepId?: string;
    },
  ) => post<{ ok: boolean; job: CronJob }>(`/businesses/${businessId}/cron`, body),
  updateCronJob: (businessId: string, jobId: string, body: Partial<CronJob>) =>
    put<{ ok: boolean; job: CronJob }>(`/businesses/${businessId}/cron/${jobId}`, body),

  // BPMN Workflows
  getWorkflows: (params?: { status?: string; agentId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.agentId) qs.set("agentId", params.agentId);
    const q = qs.toString();
    return get<{ workflows: BpmnWorkflow[] }>(`/workflows${q ? `?${q}` : ""}`);
  },
  getWorkflow: (id: string) => get<BpmnWorkflow>(`/workflows/${id}`),
  createWorkflow: (body: {
    name: string;
    description?: string;
    goalId?: string;
    agentId?: string;
    status?: string;
  }) => post<{ ok: boolean; id: string }>("/workflows", body),
  updateWorkflow: (id: string, body: { name?: string; status?: string; description?: string }) =>
    put<{ ok: boolean }>(`/workflows/${id}`, body),
  deleteWorkflow: (id: string) => del<{ ok: boolean }>(`/workflows/${id}`),

  // BPMN Elements
  addElement: (workflowId: string, body: Record<string, unknown>) =>
    post<{ ok: boolean; id: string }>(`/workflows/${workflowId}/elements`, body),
  updateElement: (workflowId: string, elementId: string, body: Record<string, unknown>) =>
    put<{ ok: boolean }>(`/workflows/${workflowId}/elements/${elementId}`, body),
  updateElementPosition: (
    workflowId: string,
    elementId: string,
    position: { x: number; y: number },
  ) => patch<{ ok: boolean }>(`/workflows/${workflowId}/elements/${elementId}`, { position }),
  deleteElement: (workflowId: string, elementId: string) =>
    del<{ ok: boolean }>(`/workflows/${workflowId}/elements/${elementId}`),

  // BPMN Flows
  addFlow: (workflowId: string, body: { sourceId: string; targetId: string; type?: string }) =>
    post<{ ok: boolean; id: string }>(`/workflows/${workflowId}/flows`, body),
  deleteFlow: (workflowId: string, flowId: string) =>
    del<{ ok: boolean }>(`/workflows/${workflowId}/flows/${flowId}`),

  // BPMN Pools/Lanes
  addPool: (workflowId: string, body: { name: string }) =>
    post<{ ok: boolean; id: string }>(`/workflows/${workflowId}/pools`, body),
  addLane: (workflowId: string, body: { poolId: string; name: string; assignee?: string }) =>
    post<{ ok: boolean; id: string }>(`/workflows/${workflowId}/lanes`, body),

  // BPMN Validation
  validateWorkflow: (workflowId: string) =>
    post<{ valid: boolean; errors: BpmnValidationError[] }>(
      `/workflows/${workflowId}/validate`,
      {},
    ),

  // ── ERP: Inventory ──────────────────────────────────────────
  getStockItems: (params?: { status?: string; warehouse_id?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.warehouse_id) qs.set("warehouse_id", params.warehouse_id);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ items: StockItem[] }>(`/erp/inventory/items${q ? `?${q}` : ""}`);
  },
  getLowStockAlerts: () => get<{ alerts: StockItem[] }>("/erp/inventory/alerts"),
  getStockMovements: (itemId: string) =>
    get<{ movements: unknown[] }>(`/erp/inventory/items/${itemId}/movements`),

  // ── ERP: Customers ──────────────────────────────────────────
  getContacts: (params?: { segment?: string; lifecycle_stage?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.segment) qs.set("segment", params.segment);
    if (params?.lifecycle_stage) qs.set("lifecycle_stage", params.lifecycle_stage);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ contacts: Contact[] }>(`/erp/customers/contacts${q ? `?${q}` : ""}`);
  },
  searchContacts: (q: string) =>
    get<{ contacts: Contact[] }>(`/erp/customers/contacts?q=${encodeURIComponent(q)}`),
  getContact: (id: string) => get<Contact>(`/erp/customers/contacts/${id}`),

  // ── ERP: Finance / Accounting ───────────────────────────────
  getInvoices: (params?: { status?: string; customer_id?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.customer_id) qs.set("customer_id", params.customer_id);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ invoices: Invoice[] }>(`/erp/finance/invoices${q ? `?${q}` : ""}`);
  },
  getAccounts: () => get<{ accounts: Account[] }>("/erp/finance/accounts"),
  getProfitLoss: (from: string, to: string) =>
    get<ProfitLoss>(
      `/erp/finance/profit-loss?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),

  // ── ERP: E-Commerce ─────────────────────────────────────────
  getProducts: (params?: { category?: string; status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ products: Product[] }>(`/erp/ecommerce/products${q ? `?${q}` : ""}`);
  },
  getOrders: (params?: { status?: string; customer_id?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.customer_id) qs.set("customer_id", params.customer_id);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ orders: Order[] }>(`/erp/ecommerce/orders${q ? `?${q}` : ""}`);
  },
  getOrder: (id: string) => get<Order>(`/erp/ecommerce/orders/${id}`),
  updateOrderStatus: (id: string, status: string) =>
    put<{ ok: boolean; order: Order }>(`/erp/ecommerce/orders/${id}`, { status }),

  // ── ERP: Suppliers ──────────────────────────────────────────
  getSuppliers: (params?: { status?: string; category?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.category) qs.set("category", params.category);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ suppliers: Supplier[] }>(`/erp/suppliers/list${q ? `?${q}` : ""}`);
  },
  getSupplier: (id: string) => get<Supplier>(`/erp/suppliers/${id}`),
  getPurchaseOrders: (params?: { supplier_id?: string; status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.supplier_id) qs.set("supplier_id", params.supplier_id);
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ orders: PurchaseOrder[] }>(`/erp/suppliers/purchase-orders${q ? `?${q}` : ""}`);
  },
  getPurchaseOrder: (id: string) => get<PurchaseOrder>(`/erp/suppliers/purchase-orders/${id}`),

  // ── ERP: Marketing ──────────────────────────────────────────
  getMarketingCampaigns: (params?: { status?: string; type?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.type) qs.set("type", params.type);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ campaigns: Campaign[] }>(`/erp/marketing/campaigns${q ? `?${q}` : ""}`);
  },
  getCampaignMetrics: (id: string) =>
    get<{ metrics: CampaignMetric[] }>(`/erp/marketing/campaigns/${id}/metrics`),
  getMarketingKpis: () => get<{ kpis: MarketingKpi[] }>("/erp/marketing/kpis"),

  // ── ERP: Supply Chain ───────────────────────────────────────
  getShipments: (params?: { status?: string; supplier_id?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.supplier_id) qs.set("supplier_id", params.supplier_id);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ shipments: Shipment[] }>(`/erp/supply-chain/shipments${q ? `?${q}` : ""}`);
  },
  getShipment: (id: string) => get<Shipment>(`/erp/supply-chain/shipments/${id}`),
  trackShipment: (tracking: string) =>
    get<{ shipment: Shipment | null }>(
      `/erp/supply-chain/shipments?tracking=${encodeURIComponent(tracking)}`,
    ),
  getRoutes: (params?: { status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ routes: Route[] }>(`/erp/supply-chain/routes${q ? `?${q}` : ""}`);
  },

  // ── ERP: Compliance ─────────────────────────────────────────
  getPolicies: (params?: { status?: string; category?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.category) qs.set("category", params.category);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ policies: CompliancePolicy[] }>(`/erp/compliance/policies${q ? `?${q}` : ""}`);
  },
  getViolations: (params?: { status?: string; severity?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.severity) qs.set("severity", params.severity);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ violations: Violation[] }>(`/erp/compliance/violations${q ? `?${q}` : ""}`);
  },
  getViolation: (id: string) => get<Violation>(`/erp/compliance/violations/${id}`),

  // ── ERP: Legal ──────────────────────────────────────────────
  getLegalContracts: (params?: { status?: string; type?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.type) qs.set("type", params.type);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ contracts: unknown[] }>(`/erp/legal/contracts${q ? `?${q}` : ""}`);
  },
  getLegalCases: (params?: { status?: string; case_type?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.case_type) qs.set("case_type", params.case_type);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ cases: unknown[] }>(`/erp/legal/cases${q ? `?${q}` : ""}`);
  },
  // New legal endpoints
  getPartnershipContracts: (params?: { status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    const q = qs.toString();
    return get<{ contracts: PartnershipContract[] }>(
      `/erp/legal/partnership-contracts${q ? `?${q}` : ""}`,
    );
  },
  getFreelancerContracts: (params?: { status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    const q = qs.toString();
    return get<{ contracts: FreelancerContract[] }>(
      `/erp/legal/freelancer-contracts${q ? `?${q}` : ""}`,
    );
  },
  getCorporateDocuments: (params?: { doc_type?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.doc_type) qs.set("doc_type", params.doc_type);
    if (params?.status) qs.set("status", params.status);
    const q = qs.toString();
    return get<{ documents: CorporateDocument[] }>(
      `/erp/legal/corporate-documents${q ? `?${q}` : ""}`,
    );
  },
  getLegalStructure: () => get<{ structure: LegalStructure | null }>("/erp/legal/structure"),
  getComplianceGuardrails: (params?: { active?: boolean; category?: string }) => {
    const qs = new URLSearchParams();
    if (params?.active !== undefined) qs.set("active", String(params.active));
    if (params?.category) qs.set("category", params.category);
    const q = qs.toString();
    return get<{ guardrails: ComplianceGuardrail[] }>(`/erp/legal/guardrails${q ? `?${q}` : ""}`);
  },

  // ── ERP: Analytics ──────────────────────────────────────────
  getReports: (params?: { type?: string; status?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.type) qs.set("type", params.type);
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ reports: AnalyticsReport[] }>(`/erp/analytics/reports${q ? `?${q}` : ""}`);
  },
  getReport: (id: string) => get<AnalyticsReport>(`/erp/analytics/reports/${id}`),
  runReport: (id: string) =>
    post<{ ok: boolean; result: unknown }>(`/erp/analytics/reports/${id}/run`, {}),
  getReportSnapshots: (id: string) =>
    get<{ snapshots: ReportSnapshot[] }>(`/erp/analytics/reports/${id}/snapshots`),
  getDashboards: (params?: { owner_id?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.owner_id) qs.set("owner_id", params.owner_id);
    if (params?.limit) qs.set("limit", String(params.limit));
    const q = qs.toString();
    return get<{ dashboards: AnalyticsDashboard[] }>(
      `/erp/analytics/dashboards${q ? `?${q}` : ""}`,
    );
  },
};
