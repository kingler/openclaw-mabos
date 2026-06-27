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
  actions?: ChatAction[];
};

export type Business = {
  id: string;
  name: string;
  description?: string;
  industry?: string;
  type?: string;
  stage?: string;
  status?: string;
  agentCount: number;
  healthScore?: number;
};

export type Task = {
  id: string;
  plan_id: string;
  plan_name: string;
  step_id: string;
  title: string;
  description?: string;
  status: "backlog" | "todo" | "in_progress" | "review" | "done";
  priority: "low" | "medium" | "high";
  type: string;
  assignedAgents: string[];
  department: string;
  depends_on: string[];
  estimated_duration: string;
  agent_id: string;
};

export type ProjectSLA = "critical" | "standard" | "relaxed";

export type Project = {
  id: string;
  name: string;
  sla: ProjectSLA;
  taskCount: number;
  completedCount: number;
};

export type SystemStatus = {
  product: string;
  version: string;
  bdiHeartbeat: string;
  bdiIntervalMinutes: number;
  agents: Array<{
    agentId: string;
    beliefCount: number;
    goalCount: number;
    intentionCount: number;
    desireCount: number;
  }>;
  businessCount: number;
  workspaceDir: string;
  reasoningToolCount: number;
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

// --- Decisions ---

export type DecisionUrgency = "critical" | "high" | "medium" | "low";

export type DecisionOption = {
  id: string;
  label: string;
  description: string;
  recommended: boolean;
};

export type Decision = {
  id: string;
  title: string;
  summary: string;
  urgency: DecisionUrgency;
  agentId: string;
  agentName: string;
  businessId: string;
  businessName: string;
  options: DecisionOption[];
  agentRecommendation?: string;
  createdAt: string;
};

export type DecisionsResponse = { decisions: Decision[] };

export type DecisionResolution = {
  optionId: string;
  feedback?: string;
  action: "approve" | "reject" | "defer";
};

// --- Goals / Workflows ---

export type GoalLevel = "strategic" | "tactical" | "operational";
export type GoalType = "hardgoal" | "softgoal" | "task" | "resource";

export type GoalPerspective = "level" | "actor" | "type" | "bsc" | "goa-domain";

// Balanced Scorecard perspectives
export type GoalBSCCategory = "financial" | "customer" | "internal-process" | "learning-growth";

// GOA Domain perspectives (from Goal-Oriented Architecture)
export type GoalDomainCategory = "safety" | "efficiency" | "responsiveness" | "robustness";

// Goal refinement relationship (goal-to-goal edges)
export type GoalRefinement = {
  parentGoalId: string;
  childGoalId: string;
  type: "and-refinement" | "or-refinement" | "contribution";
  label?: string;
  inferred?: boolean; // true if AI/hierarchy-inferred, false if explicit
};
export type WorkflowStatus = "active" | "completed" | "paused" | "pending";

export type WorkflowStep = {
  id: string;
  name: string;
  order: number;
  schedule?: CronScheduleInfo;
  action?: string; // tool name mapped to this step
};

export type Workflow = {
  id: string;
  name: string;
  status: WorkflowStatus;
  agents: string[];
  steps: WorkflowStep[];
  schedule?: CronScheduleInfo;
  workflowType?: string;
  trigger?: string;
};

export type BusinessGoal = {
  id: string;
  name: string;
  text?: string;
  description: string;
  level: GoalLevel;
  type: GoalType;
  priority: number;
  actor?: string;
  desires: string[];
  workflows: Workflow[];
  category?: GoalBSCCategory; // BSC perspective
  domain?: GoalDomainCategory; // GOA domain perspective
  parentGoalId?: string; // explicit refinement parent
};

export type TroposActor = {
  id: string;
  name: string;
  type: "principal" | "agent";
  goals: string[];
};

export type TroposDependency = {
  from: string;
  to: string;
  type: "delegation" | "contribution";
  goalId: string;
};

export type TroposGoalModel = {
  actors: TroposActor[];
  goals: BusinessGoal[];
  dependencies: TroposDependency[];
  refinements?: GoalRefinement[]; // goal-to-goal edges
};

// --- Contractors ---

export type Contractor = {
  id: string;
  name: string;
  role: string;
  trustScore: number;
  packages: number;
  status: "active" | "inactive" | "pending";
};

export type ContractorsResponse = { contractors: Contractor[] };

// --- Panel / Layout ---

export type SidebarMode = "collapsed" | "expanded";

export type EntityType =
  | "decision"
  | "goal"
  | "project"
  | "initiative"
  | "task"
  | "agent"
  | "workflow"
  | "bpmn-node"
  | "knowledge-graph-node"
  | "timeline-event";

export type DetailPanelState = {
  open: boolean;
  entityType: EntityType | null;
  entityId: string | null;
  entityData: unknown;
};

// --- Cron / Scheduling ---

export type CronJobStatus = "active" | "paused" | "error";

export type CronScheduleInfo = {
  cronExpression: string; // "0 9 * * MON"
  cronJobId?: string; // link to CronJob.id in cron-jobs.json
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  timezone?: string;
};

export type CronJob = {
  id: string;
  name: string;
  schedule: string; // cron expression
  agentId: string;
  action: string; // tool name or workflow ID to execute
  enabled: boolean;
  lastRun?: string; // ISO timestamp
  nextRun?: string; // ISO timestamp
  status: CronJobStatus;
  workflowId?: string; // links to Workflow.id
  stepId?: string; // links to WorkflowStep.id
  parentCronId?: string; // ID in parent OpenClaw cron store
};

export type CronJobsResponse = { jobs: CronJob[] };

// --- Kanban / SLA Perspectives ---

export type KanbanColumnConfig = {
  id: string;
  title: string;
  color: string;
  statuses: Task["status"][];
};

export type SLAPerspective = {
  id: string;
  label: string;
  description: string;
  columns: KanbanColumnConfig[];
};

// --- Agent Files ---

export type AgentFileInfo = {
  filename: string;
  category: "bdi" | "core";
  size: number;
  modified: string;
};

export type AgentFileContent = {
  filename: string;
  content: string;
  category: "bdi" | "core";
};

// --- Chat Actions ---

export type ChatActionType = "invalidate_query" | "mutate_data" | "navigate" | "open_detail";

export type ChatAction = {
  type: ChatActionType;
  payload: {
    queryKeys?: string[][];
    mutationFn?: string;
    mutationData?: Record<string, unknown>;
    route?: string;
    entityType?: EntityType;
    entityId?: string;
    entityData?: unknown;
  };
};

// --- ERP: E-Commerce ---
export type Product = {
  id: string;
  name: string;
  sku: string;
  price: number;
  currency: string;
  category: string;
  status: "active" | "draft" | "archived";
  stock: number;
  images: string[];
  description?: string;
};

export type Order = {
  id: string;
  customer_name: string;
  customer_email: string;
  status: "pending" | "processing" | "shipped" | "delivered" | "cancelled" | "refunded";
  total: number;
  currency: string;
  items: Array<{ product_id: string; name: string; quantity: number; price: number }>;
  created_at: string;
  updated_at: string;
};

// --- ERP: Customers ---
export type Contact = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  segment: string;
  lifecycle_stage: "lead" | "prospect" | "customer" | "churned";
  total_spent: number;
  order_count: number;
  last_interaction?: string;
  tags: string[];
};

// --- ERP: Inventory ---
export type StockItem = {
  id: string;
  product_id: string;
  name: string;
  sku: string;
  quantity: number;
  reorder_point: number;
  status: "in_stock" | "low_stock" | "out_of_stock";
  warehouse: string;
  last_restocked?: string;
};

export type StockAlert = {
  id: string;
  item_id: string;
  name: string;
  sku: string;
  current_qty: number;
  reorder_point: number;
  severity: "warning" | "critical";
};

export type StockMovement = {
  id: string;
  item_id: string;
  type: "inbound" | "outbound" | "adjustment";
  quantity: number;
  reason: string;
  timestamp: string;
};

// --- ERP: Suppliers ---
export type Supplier = {
  id: string;
  name: string;
  contact_email: string;
  category: string;
  status: "active" | "inactive" | "pending";
  rating: number;
  lead_time_days: number;
  total_orders: number;
};

export type PurchaseOrder = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  status: "draft" | "sent" | "confirmed" | "received" | "cancelled";
  total: number;
  items: Array<{ product_id: string; name: string; quantity: number; unit_price: number }>;
  created_at: string;
  expected_delivery?: string;
};

// --- ERP: Supply Chain ---
export type Shipment = {
  id: string;
  order_id: string;
  carrier: string;
  tracking_number?: string;
  status: "preparing" | "in_transit" | "delivered" | "returned";
  origin: string;
  destination: string;
  estimated_delivery?: string;
  actual_delivery?: string;
};

export type ShippingRoute = {
  id: string;
  name: string;
  origin: string;
  destination: string;
  carrier: string;
  avg_transit_days: number;
  cost: number;
  status: "active" | "inactive";
};

// --- ERP: Legal ---
export type LegalContract = {
  id: string;
  title: string;
  type: "partnership" | "freelancer";
  counterparty: string;
  status: "draft" | "active" | "expired" | "terminated";
  start_date: string;
  end_date?: string;
  value?: number;
};

export type CorporateDocument = {
  id: string;
  title: string;
  doc_type: string;
  status: "current" | "archived" | "draft";
  last_updated: string;
  url?: string;
};

export type LegalStructure = {
  entity_type: string;
  jurisdiction: string;
  registration_number: string;
  officers: Array<{ name: string; title: string }>;
};

export type ComplianceGuardrail = {
  id: string;
  rule: string;
  category: string;
  severity: "info" | "warning" | "critical";
  active: boolean;
  description?: string;
};

// --- ERP: Marketing ---
export type MarketingCampaign = {
  id: string;
  name: string;
  type: string;
  status: "draft" | "active" | "paused" | "completed";
  budget: number;
  spent: number;
  start_date: string;
  end_date?: string;
  channels: string[];
};

export type CampaignMetrics = {
  campaign_id: string;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  conversion_rate: number;
  cost_per_acquisition: number;
  roi: number;
  revenue_attributed?: number;
};

export type MarketingKpi = {
  id: string;
  name: string;
  value: number;
  target: number;
  unit: string;
  trend: "up" | "down" | "flat";
  period: string;
};

// --- ERP: Initiatives ---
export type Initiative = {
  id: string;
  name: string;
  description: string;
  status: "active" | "planned" | "completed" | "paused";
  category: string;
  priority: number;
  goals: string[];
  campaignCount: number;
};

// --- ERP: Campaign Detail (connected hierarchy) ---
export type CampaignTask = {
  id: string;
  name: string;
  type: string;
  status: string;
  assigned_agent: string;
  actions: { id: string; tool: string; status: string }[];
};

export type CampaignFullDetail = {
  campaign: MarketingCampaign | null;
  project: { id: string; name: string } | null;
  initiative: { id: string; name: string } | null;
  goal: { id: string; name: string } | null;
  tasks: CampaignTask[];
};

// --- ERP: Analytics ---
export type AnalyticsReport = {
  id: string;
  title: string;
  type: string;
  status: "ready" | "generating" | "error";
  created_at: string;
  last_run?: string;
};

export type ReportSnapshot = {
  id: string;
  report_id: string;
  timestamp: string;
  data: Record<string, unknown>;
};

export type AnalyticsDashboard = {
  id: string;
  name: string;
  owner_id: string;
  widgets: Array<{ type: string; config: Record<string, unknown> }>;
};

// --- ERP: Accounting ---
export type Invoice = {
  id: string;
  number: string;
  customer_name: string;
  status: "draft" | "sent" | "paid" | "overdue" | "cancelled";
  amount: number;
  currency: string;
  due_date: string;
  issued_date: string;
};

export type Account = {
  id: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  balance: number;
  currency: string;
};

export type FinancialStatement = {
  period: { from: string; to: string };
  rows: Array<{ label: string; amount: number; category: string }>;
  total: number;
};

// --- ERP: Compliance ---
export type CompliancePolicy = {
  id: string;
  name: string;
  category: string;
  status: "active" | "draft" | "archived";
  description: string;
  last_reviewed: string;
};

export type ComplianceViolation = {
  id: string;
  policy_id: string;
  policy_name: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "open" | "investigating" | "resolved" | "dismissed";
  description: string;
  detected_at: string;
  resolved_at?: string;
};

// ── Channel integration ────────────────────────────────────────────────
export type ChannelField = {
  name: string;
  label: string;
  type: "string" | "password";
  required: boolean;
  secret: boolean;
  configKey: string;
  persist?: boolean;
  placeholder?: string;
  help?: string;
  validationRegex?: string;
};

export type ChannelDescriptor = {
  type: string;
  label: string;
  docsUrl?: string;
  capabilities?: string[];
  pairingType?: "credentials" | "qr";
  fields: ChannelField[];
};

export type WhatsAppLoginStart = { qrDataUrl?: string; message: string };
export type WhatsAppLoginWait = {
  connected: boolean;
  message: string;
  channel?: ConfiguredChannel;
};

export type ConfiguredChannel = {
  id: string;
  type: string;
  name: string;
  status: "active" | "inactive";
  agentId?: string;
  businessId?: string;
  createdAt: string;
  maskedCredentials: Record<string, string>;
};

export type ChannelTestResult = { success: boolean; error?: string; bot_info?: unknown };

export type ProvisionChannelBody = {
  channelType: string;
  credentials: Record<string, string>;
  agentId?: string;
  businessId?: string;
  name?: string;
  test?: boolean;
};

export type ProvisionResult = {
  ok: boolean;
  channel?: ConfiguredChannel;
  test?: ChannelTestResult;
  error?: string;
};
