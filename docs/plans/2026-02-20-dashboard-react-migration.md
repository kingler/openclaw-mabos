# MABOS Dashboard: React Migration with Chat-First Architecture

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the vanilla JS dashboard (`src/dashboard/`) with a React + Vite SPA featuring a chat-first interface where users interact with MABOS agents via conversation, while ERP context panels display live business data.

**Architecture:** Chat-centric SPA — a persistent chat panel (right side) is the primary input surface where users message the CEO/business manager agent. The left/center area shows contextual ERP panels (agents, tasks, metrics, inventory, etc.) that update based on conversation context and agent actions. The gateway's existing WebSocket chat system handles message transport. Vite builds to `src/dashboard/dist/`, and the existing `registerHttpRoute` handlers serve it.

**Tech Stack:** React 19, Vite 6, TypeScript, Tailwind CSS 4, shadcn/ui, TanStack Query v5, TanStack Router, Recharts, Lucide React icons

---

## Phase 0: Project Scaffolding

### Task 1: Initialize Vite + React project

**Files:**

- Create: `extensions/mabos/ui/package.json`
- Create: `extensions/mabos/ui/vite.config.ts`
- Create: `extensions/mabos/ui/tsconfig.json`
- Create: `extensions/mabos/ui/tsconfig.node.json`
- Create: `extensions/mabos/ui/index.html`
- Create: `extensions/mabos/ui/src/main.tsx`
- Create: `extensions/mabos/ui/src/App.tsx`
- Create: `extensions/mabos/ui/src/index.css`
- Create: `extensions/mabos/ui/tailwind.config.ts` (if needed by v4)
- Create: `extensions/mabos/ui/postcss.config.js`
- Create: `extensions/mabos/ui/.gitignore`

**Step 1: Scaffold the Vite project**

```bash
cd extensions/mabos
npm create vite@latest ui -- --template react-ts
cd ui
```

**Step 2: Install core dependencies**

```bash
npm install tailwindcss @tailwindcss/vite lucide-react
npm install @tanstack/react-query @tanstack/react-router
npm install recharts
npm install -D @types/node
```

**Step 3: Configure Vite for gateway serving**

The critical config: set `base: "/mabos/dashboard/"` so all asset URLs are gateway-relative. Output to `dist/` which the gateway will serve.

```ts
// ui/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/mabos/dashboard/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    emptyDirBeforeWrite: true,
  },
  server: {
    proxy: {
      "/mabos/api": "http://localhost:18789",
    },
  },
});
```

**Step 4: Set up Tailwind with dark theme defaults**

```css
/* ui/src/index.css */
@import "tailwindcss";

:root {
  --bg-primary: #0a0a0b;
  --bg-secondary: #1a1a1b;
  --bg-tertiary: #252528;
  --bg-card: #161618;
  --bg-hover: #1f1f21;
  --text-primary: #ffffff;
  --text-secondary: #a8a8a8;
  --text-muted: #666666;
  --accent-green: #00d084;
  --accent-purple: #8b5cf6;
  --accent-blue: #3b82f6;
  --accent-orange: #f59e0b;
  --accent-red: #ef4444;
  --border: #2a2a2d;
  --border-hover: #3a3a3d;
}

body {
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family:
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    Roboto,
    sans-serif;
}
```

**Step 5: Create minimal App shell**

```tsx
// ui/src/App.tsx
export default function App() {
  return (
    <div className="flex h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="flex-1 p-6">
        <h1 className="text-2xl font-bold">MABOS Dashboard</h1>
        <p className="text-[var(--text-secondary)]">Migration in progress</p>
      </div>
    </div>
  );
}
```

**Step 6: Verify dev server starts**

```bash
cd extensions/mabos/ui && npm run dev
```

Expected: Vite dev server at localhost:5173, showing "MABOS Dashboard".

**Step 7: Verify production build**

```bash
cd extensions/mabos/ui && npm run build
ls dist/
```

Expected: `index.html`, `assets/` with JS/CSS chunks.

**Step 8: Commit**

```bash
git add extensions/mabos/ui/
git commit -m "feat(mabos): scaffold React + Vite dashboard project

Initialize ui/ with React 19, Vite 6, TypeScript, Tailwind CSS,
TanStack Query/Router, Recharts, and Lucide icons. Configured
base path for gateway serving at /mabos/dashboard/."
```

---

### Task 2: Install and configure shadcn/ui

**Files:**

- Create: `extensions/mabos/ui/components.json`
- Create: `extensions/mabos/ui/src/lib/utils.ts`
- Create: `extensions/mabos/ui/src/components/ui/button.tsx`
- Create: `extensions/mabos/ui/src/components/ui/input.tsx`
- Create: `extensions/mabos/ui/src/components/ui/scroll-area.tsx`
- Create: `extensions/mabos/ui/src/components/ui/avatar.tsx`
- Create: `extensions/mabos/ui/src/components/ui/badge.tsx`
- Create: `extensions/mabos/ui/src/components/ui/card.tsx`
- Create: `extensions/mabos/ui/src/components/ui/sheet.tsx`
- Create: `extensions/mabos/ui/src/components/ui/command.tsx`
- Create: `extensions/mabos/ui/src/components/ui/tooltip.tsx`
- Create: `extensions/mabos/ui/src/components/ui/tabs.tsx`

**Step 1: Initialize shadcn/ui**

```bash
cd extensions/mabos/ui
npx shadcn@latest init
```

Choose: New York style, Zinc color, CSS variables: yes.

**Step 2: Add required components**

```bash
npx shadcn@latest add button input scroll-area avatar badge card sheet command tooltip tabs separator skeleton
```

**Step 3: Verify components import cleanly**

Update App.tsx to render a Button, confirm it works.

**Step 4: Commit**

```bash
git add extensions/mabos/ui/
git commit -m "feat(mabos): add shadcn/ui components for dashboard"
```

---

## Phase 1: Core Layout & Chat Panel

### Task 3: Build the app shell layout

**Files:**

- Create: `extensions/mabos/ui/src/components/layout/AppShell.tsx`
- Create: `extensions/mabos/ui/src/components/layout/Sidebar.tsx`
- Create: `extensions/mabos/ui/src/components/layout/TopBar.tsx`
- Modify: `extensions/mabos/ui/src/App.tsx`

**Description:**

Three-column layout:

1. **Left sidebar** (280px, fixed): Logo, nav items, business switcher
2. **Main content** (flexible): ERP context panels
3. **Chat panel** (400px, fixed right): Persistent agent chat

The sidebar navigation items (with Lucide icons):

- Overview (LayoutDashboard)
- Agents (Users)
- Tasks (ClipboardList)
- Timeline (Calendar)
- Performance (BarChart3)
- Inventory (Package)
- Accounting (DollarSign)
- HR (Heart)
- Onboarding (Rocket)

The sidebar should use the same dark theme CSS variables from the original dashboard. Navigation uses `<NavLink>` from TanStack Router (or simple state for now, router in Task 5).

**Step 1: Create Sidebar component**

```tsx
// ui/src/components/layout/Sidebar.tsx
import {
  Cpu,
  LayoutDashboard,
  Users,
  ClipboardList,
  Calendar,
  BarChart3,
  Package,
  DollarSign,
  Heart,
  Rocket,
  Palette,
  ChevronDown,
} from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/" },
  { icon: BarChart3, label: "Performance", path: "/performance" },
  { icon: Users, label: "Agents", path: "/agents" },
  { icon: ClipboardList, label: "Tasks", path: "/tasks" },
  { icon: Calendar, label: "Timeline", path: "/timeline" },
  { icon: Package, label: "Inventory", path: "/inventory" },
  { icon: DollarSign, label: "Accounting", path: "/accounting" },
  { icon: Heart, label: "HR", path: "/hr" },
  { icon: Rocket, label: "Onboarding", path: "/onboarding" },
];

export function Sidebar({
  activePath,
  onNavigate,
}: {
  activePath: string;
  onNavigate: (path: string) => void;
}) {
  return (
    <aside className="w-[280px] h-screen bg-[var(--bg-secondary)] border-r border-[var(--border)] p-4 flex flex-col fixed left-0 top-0">
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8 px-3 text-xl font-bold">
        <Cpu className="w-5 h-5" />
        <span>MABOS</span>
      </div>

      {/* Business Switcher */}
      <button className="flex items-center gap-3 px-3 py-2 mb-6 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] hover:border-[var(--border-hover)] transition-colors">
        <Palette className="w-4 h-4" />
        <span className="text-sm flex-1 text-left">VividWalls</span>
        <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
      </button>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.path}
            onClick={() => onNavigate(item.path)}
            className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
              activePath === item.path
                ? "bg-[var(--accent-green)] text-[var(--bg-primary)] font-medium"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
            }`}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
```

**Step 2: Create AppShell with three-column layout**

```tsx
// ui/src/components/layout/AppShell.tsx
import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { ChatPanel } from "../chat/ChatPanel";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [activePath, setActivePath] = useState("/");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar activePath={activePath} onNavigate={setActivePath} />
      <main className="flex-1 ml-[280px] mr-[400px] overflow-y-auto p-6">{children}</main>
      <ChatPanel />
    </div>
  );
}
```

**Step 3: Create placeholder ChatPanel**

```tsx
// ui/src/components/chat/ChatPanel.tsx
export function ChatPanel() {
  return (
    <aside className="w-[400px] h-screen fixed right-0 top-0 bg-[var(--bg-secondary)] border-l border-[var(--border)] flex flex-col">
      <div className="p-4 border-b border-[var(--border)]">
        <h2 className="font-semibold">Chat with Atlas CEO</h2>
      </div>
      <div className="flex-1 p-4">{/* Messages will go here */}</div>
      <div className="p-4 border-t border-[var(--border)]">
        <input
          type="text"
          placeholder="Message Atlas..."
          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] text-sm"
        />
      </div>
    </aside>
  );
}
```

**Step 4: Wire into App.tsx, verify layout**

**Step 5: Commit**

```bash
git commit -m "feat(mabos): add app shell with sidebar, main content, and chat panel"
```

---

### Task 4: Build the chat panel with WebSocket connection

**Files:**

- Create: `extensions/mabos/ui/src/lib/ws.ts`
- Create: `extensions/mabos/ui/src/hooks/useChat.ts`
- Modify: `extensions/mabos/ui/src/components/chat/ChatPanel.tsx`
- Create: `extensions/mabos/ui/src/components/chat/ChatMessage.tsx`
- Create: `extensions/mabos/ui/src/components/chat/AgentSelector.tsx`

**Description:**

The chat panel connects to the OpenClaw gateway's WebSocket endpoint. OpenClaw uses a WS protocol at `ws://localhost:PORT` for real-time chat. The dashboard sends user messages and receives agent responses (including streaming tokens).

Key behaviors:

- User types a message, it's sent via WS to the gateway
- The gateway routes it to the appropriate MABOS agent (CEO by default)
- Agent responses stream back token-by-token
- Messages are displayed in a scrollable area with auto-scroll
- An AgentSelector dropdown lets the user switch which agent they're chatting with
- Messages show agent avatar (Lucide icon), name, timestamp

The WebSocket connection should:

- Auto-reconnect on disconnect
- Show connection status in the panel header
- Buffer messages during reconnection

**Step 1: Create WebSocket connection manager**

```ts
// ui/src/lib/ws.ts
type WsMessage = {
  type: string;
  [key: string]: unknown;
};

type WsOptions = {
  url: string;
  onMessage: (msg: WsMessage) => void;
  onStatusChange: (status: "connecting" | "connected" | "disconnected") => void;
};

export function createWsConnection(opts: WsOptions) {
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout>;

  function connect() {
    opts.onStatusChange("connecting");
    ws = new WebSocket(opts.url);

    ws.onopen = () => opts.onStatusChange("connected");

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        opts.onMessage(msg);
      } catch {
        /* ignore non-JSON */
      }
    };

    ws.onclose = () => {
      opts.onStatusChange("disconnected");
      reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = () => ws?.close();
  }

  function send(msg: WsMessage) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  function disconnect() {
    clearTimeout(reconnectTimer);
    ws?.close();
  }

  connect();
  return { send, disconnect };
}
```

**Step 2: Create useChat hook**

The hook manages chat state: messages array, send function, connection status, active agent.

**Step 3: Build ChatMessage component**

Renders a single message with avatar, agent name, content (with markdown support), and timestamp. User messages align right, agent messages align left.

**Step 4: Build ChatPanel with full functionality**

- Message list in ScrollArea
- Input with Enter-to-send
- Agent selector in header (Star icon for CEO, DollarSign for CFO, etc.)
- Connection status indicator (green/yellow/red dot)
- Auto-scroll on new messages

**Step 5: Verify chat renders and connects (may fail without gateway, that's OK)**

**Step 6: Commit**

```bash
git commit -m "feat(mabos): add chat panel with WebSocket connection to gateway"
```

---

### Task 5: Set up TanStack Router

**Files:**

- Create: `extensions/mabos/ui/src/routes/__root.tsx`
- Create: `extensions/mabos/ui/src/routes/index.tsx`
- Create: `extensions/mabos/ui/src/routes/agents.tsx`
- Create: `extensions/mabos/ui/src/routes/tasks.tsx`
- Create: `extensions/mabos/ui/src/routes/performance.tsx`
- Create: `extensions/mabos/ui/src/routes/timeline.tsx`
- Create: `extensions/mabos/ui/src/routes/inventory.tsx`
- Create: `extensions/mabos/ui/src/routes/accounting.tsx`
- Create: `extensions/mabos/ui/src/routes/hr.tsx`
- Create: `extensions/mabos/ui/src/routes/onboarding.tsx`
- Modify: `extensions/mabos/ui/src/App.tsx`
- Modify: `extensions/mabos/ui/src/components/layout/Sidebar.tsx`

**Description:**

Set up file-based routing with TanStack Router. The root route wraps everything in AppShell. Each ERP module gets its own route with a placeholder page. The Sidebar nav items become `<Link>` components.

Use `basepath: "/mabos/dashboard"` in the router config so client-side routing works when served from the gateway.

**Step 1: Configure router with basepath**

**Step 2: Create root layout route (AppShell wrapper)**

**Step 3: Create placeholder pages for each route**

Each page: a heading, subtitle, and empty card. Enough to verify routing works.

**Step 4: Update Sidebar to use router Link components**

**Step 5: Verify all routes navigate correctly**

**Step 6: Commit**

```bash
git commit -m "feat(mabos): add TanStack Router with ERP module routes"
```

---

## Phase 2: API Layer & Data

### Task 6: Build typed API client

**Files:**

- Create: `extensions/mabos/ui/src/lib/api.ts`
- Create: `extensions/mabos/ui/src/lib/types.ts`
- Create: `extensions/mabos/ui/src/hooks/useAgents.ts`
- Create: `extensions/mabos/ui/src/hooks/useBusiness.ts`
- Create: `extensions/mabos/ui/src/hooks/useTasks.ts`
- Create: `extensions/mabos/ui/src/hooks/useMetrics.ts`
- Modify: `extensions/mabos/ui/src/App.tsx` (wrap with QueryClientProvider)

**Description:**

Typed fetch wrappers for every `/mabos/api/*` endpoint, consumed via TanStack Query hooks.

Existing API endpoints (from `index.ts`):

```
GET  /mabos/api/status
GET  /mabos/api/decisions
POST /mabos/api/decisions/:id/resolve
GET  /mabos/api/agents/:id
GET  /mabos/api/businesses
GET  /mabos/api/metrics/:business
GET  /mabos/api/contractors
POST /mabos/api/onboard
GET  /mabos/api/businesses/:id/goals
GET  /mabos/api/businesses/:id/tasks
PUT  /mabos/api/businesses/:id/tasks/:taskId
GET  /mabos/api/businesses/:id/agents
GET  /mabos/api/businesses/:id/agents/:agentId
GET  /mabos/api/businesses/:id/campaigns
```

**Step 1: Define TypeScript types matching API responses**

```ts
// ui/src/lib/types.ts
export type AgentStatus = "active" | "idle" | "error" | "paused";

export type Agent = {
  id: string;
  name: string;
  role: string;
  department: string;
  status: AgentStatus;
  description?: string;
  currentTask?: string;
  beliefs?: number;
  goals?: number;
  intentions?: number;
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

// ... more types for metrics, goals, campaigns, etc.
```

**Step 2: Create API client with fetch wrappers**

```ts
// ui/src/lib/api.ts
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

export const api = {
  getStatus: () => get<SystemStatus>("/status"),
  getBusinesses: () => get<Business[]>("/businesses"),
  getAgents: (businessId: string) => get<Agent[]>(`/businesses/${businessId}/agents`),
  getAgent: (businessId: string, agentId: string) =>
    get<Agent>(`/businesses/${businessId}/agents/${agentId}`),
  getTasks: (businessId: string) => get<Task[]>(`/businesses/${businessId}/tasks`),
  getMetrics: (businessId: string) => get<any>(`/metrics/${businessId}`),
  getGoals: (businessId: string) => get<any>(`/businesses/${businessId}/goals`),
  getDecisions: () => get<any[]>("/decisions"),
  getContractors: () => get<any[]>("/contractors"),
  getCampaigns: (businessId: string) => get<any[]>(`/businesses/${businessId}/campaigns`),
  resolveDecision: (id: string, body: unknown) => post<any>(`/decisions/${id}/resolve`, body),
  onboard: (body: unknown) => post<any>("/onboard", body),
};
```

**Step 3: Create TanStack Query hooks**

```ts
// ui/src/hooks/useAgents.ts
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function useAgents(businessId: string) {
  return useQuery({
    queryKey: ["agents", businessId],
    queryFn: () => api.getAgents(businessId),
    enabled: !!businessId,
    refetchInterval: 30_000, // Poll every 30s for agent status
  });
}
```

**Step 4: Wrap App in QueryClientProvider**

**Step 5: Verify one hook works (useAgents returns data or graceful error)**

**Step 6: Commit**

```bash
git commit -m "feat(mabos): add typed API client and TanStack Query hooks"
```

---

## Phase 3: ERP Module Pages

### Task 7: Overview dashboard page

**Files:**

- Modify: `extensions/mabos/ui/src/routes/index.tsx`
- Create: `extensions/mabos/ui/src/components/dashboard/StatusCards.tsx`
- Create: `extensions/mabos/ui/src/components/dashboard/AgentStatusGrid.tsx`
- Create: `extensions/mabos/ui/src/components/dashboard/RecentActivity.tsx`

**Description:**

The overview page shows:

- 4 stat cards at top (total agents, active tasks, health score, BDI cycles)
- Agent status grid (17 agent cards with icons, status dots, current task)
- Recent activity feed (from decision queue and task updates)

Port the existing overview from the vanilla dashboard but with real data from TanStack Query hooks.

Agent icons use the same Lucide mapping from the SVG migration:

```ts
const agentIcons: Record<string, LucideIcon> = {
  ceo: Star,
  cfo: DollarSign,
  cmo: Megaphone,
  coo: Settings,
  cto: Terminal,
  hr: Heart,
  knowledge: BookOpen,
  legal: Scale,
  strategy: Compass,
  inventory: Package,
  fulfillment: Truck,
  product: Target,
  marketing: Briefcase,
  sales: UserPlus,
  compliance: ShieldCheck,
  creative: Pen,
  cs: MessageCircle,
};
```

**Step 1: Build StatusCards component**

**Step 2: Build AgentStatusGrid with icons and live status**

**Step 3: Build RecentActivity feed**

**Step 4: Wire into overview route with hooks**

**Step 5: Commit**

```bash
git commit -m "feat(mabos): add overview dashboard with agent grid and status cards"
```

---

### Task 8: Agents management page

**Files:**

- Modify: `extensions/mabos/ui/src/routes/agents.tsx`
- Create: `extensions/mabos/ui/src/routes/agents.$agentId.tsx`
- Create: `extensions/mabos/ui/src/components/agents/AgentCard.tsx`
- Create: `extensions/mabos/ui/src/components/agents/AgentDetail.tsx`
- Create: `extensions/mabos/ui/src/components/agents/BdiViewer.tsx`

**Description:**

- Grid of 17 agent cards (same as overview but larger, more detail)
- Click an agent card to navigate to `/agents/:agentId`
- Agent detail page shows: BDI state (beliefs, desires, intentions), current plans, cognitive file contents, activity log
- BdiViewer component renders the 10-file markdown cognitive system as expandable sections

The agent detail page is key for observability — it shows the agent's internal reasoning state.

**Step 1: Build AgentCard component**

**Step 2: Build agent list page with grid**

**Step 3: Build BdiViewer component (renders markdown cognitive files)**

**Step 4: Build AgentDetail page with tabs (Overview, BDI State, Activity)**

**Step 5: Commit**

```bash
git commit -m "feat(mabos): add agent management with BDI state viewer"
```

---

### Task 9: Task management (Kanban) page

**Files:**

- Modify: `extensions/mabos/ui/src/routes/tasks.tsx`
- Create: `extensions/mabos/ui/src/components/tasks/KanbanBoard.tsx`
- Create: `extensions/mabos/ui/src/components/tasks/KanbanColumn.tsx`
- Create: `extensions/mabos/ui/src/components/tasks/TaskCard.tsx`
- Create: `extensions/mabos/ui/src/components/tasks/TaskDetail.tsx`

**Description:**

Port the kanban board from the vanilla dashboard. 5 columns: Backlog, To Do, In Progress, Review, Done. Task cards show priority badge, title, assigned agent avatars, department tag. Click to open task detail in a Sheet (slide-over panel).

Use TanStack Query mutation for task status updates (PUT `/businesses/:id/tasks/:taskId`).

**Step 1-5:** Build column, card, board, detail sheet, wire with hooks.

**Step 6: Commit**

```bash
git commit -m "feat(mabos): add kanban task board with drag-free columns"
```

---

### Task 10: Performance & metrics page

**Files:**

- Modify: `extensions/mabos/ui/src/routes/performance.tsx`
- Create: `extensions/mabos/ui/src/components/performance/MetricsCharts.tsx`
- Create: `extensions/mabos/ui/src/components/performance/AgentPerformance.tsx`

**Description:**

Charts showing business metrics from `/mabos/api/metrics/:business`. Use Recharts for:

- Revenue/sales line chart
- Agent efficiency bar chart
- Task completion rate over time
- BDI cycle frequency

Polls every 60s via TanStack Query refetchInterval.

**Step 1-4:** Build chart components, wire with hooks.

**Step 5: Commit**

```bash
git commit -m "feat(mabos): add performance metrics with Recharts"
```

---

### Task 11: Timeline (Gantt) page

**Files:**

- Modify: `extensions/mabos/ui/src/routes/timeline.tsx`
- Create: `extensions/mabos/ui/src/components/timeline/GanttChart.tsx`

**Description:**

Port the Gantt chart from the vanilla dashboard. Renders project phases and milestones on a horizontal timeline. Can be simplified initially — a CSS-based horizontal bar chart grouped by phase.

**Step 1-3:** Build GanttChart, wire to goals/tasks API.

**Step 4: Commit**

```bash
git commit -m "feat(mabos): add project timeline view"
```

---

### Task 12: Onboarding wizard page

**Files:**

- Modify: `extensions/mabos/ui/src/routes/onboarding.tsx`
- Create: `extensions/mabos/ui/src/components/onboarding/WizardSteps.tsx`
- Create: `extensions/mabos/ui/src/components/onboarding/StepForm.tsx`

**Description:**

Port the 5-step business onboarding wizard from `wizard.js`. Steps:

1. Business info (name, type, description)
2. Industry selection
3. Agent configuration
4. Ontology selection
5. Review & launch

Uses the POST `/mabos/api/onboard` endpoint. Each step is a form section with validation. The wizard can also be triggered via chat ("onboard a new business").

**Step 1-5:** Build wizard steps, form validation, submission.

**Step 6: Commit**

```bash
git commit -m "feat(mabos): add business onboarding wizard"
```

---

### Task 13: Stub pages for future ERP modules

**Files:**

- Modify: `extensions/mabos/ui/src/routes/inventory.tsx`
- Modify: `extensions/mabos/ui/src/routes/accounting.tsx`
- Modify: `extensions/mabos/ui/src/routes/hr.tsx`

**Description:**

Create placeholder pages for Inventory, Accounting, and HR modules. Each shows a card with the module name, a brief description, and a "Coming Soon" badge. These will be built out in future iterations. The chat panel is the primary way to interact with these domains for now — users can ask agents about inventory levels, financial reports, etc.

**Step 1: Create stub pages with consistent layout**

**Step 2: Commit**

```bash
git commit -m "feat(mabos): add stub pages for inventory, accounting, HR modules"
```

---

## Phase 4: Gateway Integration

### Task 14: Update gateway to serve Vite build output

**Files:**

- Modify: `extensions/mabos/index.ts:1560-1634`

**Description:**

Update the two `registerHttpRoute` handlers to serve from `ui/dist/` instead of `src/dashboard/`. The gateway should:

1. Serve `ui/dist/index.html` for `/mabos/dashboard` (and any non-file routes for SPA fallback)
2. Serve static assets from `ui/dist/assets/` for `/mabos/dashboard/*`
3. Fall back to `index.html` for client-side routes (e.g., `/mabos/dashboard/agents/ceo`)

```ts
// Updated dashboard route handler
api.registerHttpRoute({
  path: "/mabos/dashboard",
  handler: async (_req, res) => {
    try {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const thisDir = join(fileURLToPath(import.meta.url), "..");
      // Try Vite build output first, fall back to src/dashboard/
      let htmlPath = join(thisDir, "ui", "dist", "index.html");
      try {
        await import("node:fs/promises").then((fs) => fs.access(htmlPath));
      } catch {
        htmlPath = join(thisDir, "src", "dashboard", "index.html");
      }
      const html = await readFile(htmlPath, "utf-8");
      res.setHeader("Content-Type", "text/html");
      res.end(html);
    } catch {
      res.setHeader("Content-Type", "text/html");
      res.end(`<!DOCTYPE html><html><body>Dashboard not found.</body></html>`);
    }
  },
});
```

The wildcard handler should serve files from `ui/dist/` first, falling back to `src/dashboard/`. Any non-file request (no extension, or unknown extension) should return `index.html` for SPA routing.

**Step 1: Update the `/mabos/dashboard` handler**

**Step 2: Update the `/mabos/dashboard/*` wildcard handler with SPA fallback**

**Step 3: Build the UI and test via gateway**

```bash
cd extensions/mabos/ui && npm run build
# Then access http://localhost:18789/mabos/dashboard
```

**Step 4: Verify client-side routing works (navigate to /agents, refresh page)**

**Step 5: Commit**

```bash
git commit -m "feat(mabos): update gateway to serve Vite build with SPA fallback"
```

---

### Task 15: Add chat WebSocket API endpoint

**Files:**

- Modify: `extensions/mabos/index.ts` (add new HTTP route for chat)
- Create: `extensions/mabos/src/tools/dashboard-chat-tools.ts` (optional)

**Description:**

The dashboard chat needs a way to send messages to MABOS agents and receive responses. Two approaches:

**Option A (recommended):** Add a REST endpoint `POST /mabos/api/chat` that accepts `{ agentId, message, businessId }` and returns the agent's response. This is simpler than WebSocket and works with TanStack Query mutations. For streaming, use Server-Sent Events (SSE) via `GET /mabos/api/chat/stream?sessionId=X`.

**Option B:** Use OpenClaw's existing WebSocket infrastructure directly. The gateway already has WS support at its root — the dashboard just connects and sends chat messages through the existing protocol.

Start with Option A (REST + SSE) for simplicity. The chat hook sends a POST, then subscribes to SSE for streaming tokens.

```ts
// New API endpoint
api.registerHttpRoute({
  path: "/mabos/api/chat",
  handler: async (req, res) => {
    // Parse body: { agentId, message, businessId }
    // Route message to the specified agent
    // Return agent response as JSON
    // For streaming: use Transfer-Encoding: chunked
  },
});
```

**Step 1: Add POST /mabos/api/chat endpoint**

**Step 2: Add GET /mabos/api/chat/events SSE endpoint for streaming responses**

**Step 3: Update useChat hook to use REST + SSE instead of raw WebSocket**

**Step 4: Test chat round-trip with a running gateway**

**Step 5: Commit**

```bash
git commit -m "feat(mabos): add chat REST API with SSE streaming for dashboard"
```

---

## Phase 5: Polish & Cleanup

### Task 16: Add build script to extension package.json

**Files:**

- Modify: `extensions/mabos/package.json`

**Description:**

Add `"build:ui"` script that builds the Vite app. Add a `"prebuild"` script that builds UI before the TypeScript compilation.

```json
{
  "scripts": {
    "build:ui": "cd ui && npm run build",
    "build": "npm run build:ui && tsc",
    "dev:ui": "cd ui && npm run dev"
  }
}
```

**Step 1: Update package.json**

**Step 2: Verify `npm run build` builds both UI and TS**

**Step 3: Commit**

```bash
git commit -m "feat(mabos): add UI build to extension build pipeline"
```

---

### Task 17: Remove old vanilla dashboard

**Files:**

- Delete: `extensions/mabos/dashboard/index.html` (the monolithic 103KB file)
- Keep: `extensions/mabos/src/dashboard/` (as fallback until migration is verified)

**Description:**

Remove the monolithic dashboard file. The `src/dashboard/` vanilla JS files stay as a fallback — the gateway handler tries `ui/dist/` first and falls back to `src/dashboard/`. Once the React dashboard is fully verified, `src/dashboard/` can be removed in a follow-up.

**Step 1: Delete the monolithic file**

```bash
rm extensions/mabos/dashboard/index.html
rmdir extensions/mabos/dashboard/
```

**Step 2: Commit**

```bash
git commit -m "chore(mabos): remove monolithic dashboard HTML (replaced by React UI)"
```

---

### Task 18: End-to-end verification

**Description:**

Verify the full migration works:

1. `cd extensions/mabos/ui && npm run build` succeeds
2. Gateway serves the React app at `http://localhost:18789/mabos/dashboard`
3. All routes render correctly (overview, agents, tasks, performance, timeline, onboarding)
4. Chat panel connects and displays messages
5. Agent cards show correct Lucide icons
6. Navigation works (both clicking and direct URL access)
7. API calls succeed (or gracefully show loading/error states)
8. Dark theme renders correctly across all pages
9. Business switcher shows current business
10. Responsive layout doesn't break at reasonable widths

---

## Agent Icon Mapping Reference

Used across agent cards, avatars, and chat:

```ts
import {
  Star,
  DollarSign,
  Megaphone,
  Settings,
  Terminal,
  Heart,
  BookOpen,
  Scale,
  Compass,
  Package,
  Truck,
  Target,
  Briefcase,
  UserPlus,
  ShieldCheck,
  Pen,
  MessageCircle,
} from "lucide-react";

export const agentIconMap: Record<string, LucideIcon> = {
  ceo: Star, // Atlas CEO
  cfo: DollarSign, // Ledger CFO
  cmo: Megaphone, // Spark CMO
  coo: Settings, // Ops COO
  cto: Terminal, // Circuit CTO
  hr: Heart, // Harbor HR
  knowledge: BookOpen, // Oracle Knowledge
  legal: Scale, // Shield Legal
  strategy: Compass, // Compass Strategy
  inventory: Package, // Inventory Manager
  fulfillment: Truck, // Fulfillment Manager
  product: Target, // Product Manager
  marketing: Briefcase, // Marketing Director
  sales: UserPlus, // Sales Director
  compliance: ShieldCheck, // Compliance Director
  creative: Pen, // Creative Director
  cs: MessageCircle, // CS Director
};
```

---

## Chat-First Design Principles

1. **Chat is the primary input** — users ask the CEO agent to do things ("show me inventory levels", "create a marketing campaign", "what's our revenue this month")
2. **ERP panels are context displays** — they show data relevant to the conversation, not standalone CRUD forms
3. **Agents respond with actions** — when a user says "approve that purchase order", the agent executes via MABOS tools and the UI updates
4. **The chat panel is always visible** — it's 400px fixed on the right, never hidden
5. **Deep links work** — `/agents/ceo` shows agent detail AND the chat panel, so users can browse while chatting
6. **Agent switching** — the chat header has a dropdown to switch which agent you're talking to (CEO, CFO, etc.)

---

## File Structure After Migration

```
extensions/mabos/
  ui/                          # NEW: React + Vite app
    package.json
    vite.config.ts
    tsconfig.json
    index.html
    src/
      main.tsx
      App.tsx
      index.css
      lib/
        api.ts                 # Typed API client
        types.ts               # Shared TypeScript types
        ws.ts                  # WebSocket connection manager
        utils.ts               # shadcn utility (cn)
      hooks/
        useChat.ts
        useAgents.ts
        useBusiness.ts
        useTasks.ts
        useMetrics.ts
      components/
        ui/                    # shadcn/ui components
        layout/
          AppShell.tsx
          Sidebar.tsx
          TopBar.tsx
        chat/
          ChatPanel.tsx
          ChatMessage.tsx
          AgentSelector.tsx
        dashboard/
          StatusCards.tsx
          AgentStatusGrid.tsx
          RecentActivity.tsx
        agents/
          AgentCard.tsx
          AgentDetail.tsx
          BdiViewer.tsx
        tasks/
          KanbanBoard.tsx
          KanbanColumn.tsx
          TaskCard.tsx
          TaskDetail.tsx
        performance/
          MetricsCharts.tsx
          AgentPerformance.tsx
        timeline/
          GanttChart.tsx
        onboarding/
          WizardSteps.tsx
          StepForm.tsx
      routes/
        __root.tsx
        index.tsx
        agents.tsx
        agents.$agentId.tsx
        tasks.tsx
        performance.tsx
        timeline.tsx
        inventory.tsx
        accounting.tsx
        hr.tsx
        onboarding.tsx
    dist/                      # Built output (served by gateway)
  src/dashboard/               # OLD: vanilla JS (kept as fallback)
  index.ts                     # Plugin entry (updated gateway handlers)
```
