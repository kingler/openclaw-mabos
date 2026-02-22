# VividWalls MAS — Multi-Agent System for Premium Wall Art

**Intelligent e-commerce automation for [vividwalls.co](https://vividwalls.co)**

VividWalls MAS is an AI-powered multi-agent system that orchestrates e-commerce operations for premium limited-edition wall art by Kingler Bercy. Built on the **MABOS** (Multi-Agent Business Operating System) framework running as an [OpenClaw](https://openclaw.ai) extension, it deploys 9 C-suite AI agents that autonomously manage every department of the business — from marketing and finance to inventory and customer relations.

---

## Key Features

### Multi-Agent Communication
Chat directly with department agents (CEO, CFO, CMO, etc.), get real-time status updates, and let intelligent routing send your requests to the right agent automatically.

### Executive Dashboard
Live KPIs, department scorecards, revenue tracking, and alerts — all in one view. Monitor business health at a glance or drill into any department.

### Workflow Automation
Visual workflow monitoring with human-in-the-loop approval gates. Track progress across departments, review agent decisions before execution, and maintain full oversight.

### Responsive Design
Desktop command center for deep analysis, mobile-optimized monitoring for on-the-go oversight.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  React 19 + Vite Dashboard  (/mabos/dashboard/)     │
├─────────────────────────────────────────────────────┤
│  MABOS Extension                                     │
│  ├── BDI Cognitive Architecture                      │
│  ├── 99 Tools · 21 Modules                           │
│  ├── 9 C-Suite AI Agents per Business                │
│  └── SBVR Ontology Engine                            │
├─────────────────────────────────────────────────────┤
│  OpenClaw Gateway (port 18789)                       │
│  ├── Channels: WhatsApp, Telegram, Slack, Discord…   │
│  ├── CLI + WebSocket API                             │
│  └── State: ~/.openclaw                              │
├─────────────────────────────────────────────────────┤
│  TypeDB Knowledge Graph (persistent ontology)        │
└─────────────────────────────────────────────────────┘
```

**The 9 C-Suite Agents:** CEO, CFO, COO, CMO, CTO, HR Director, Legal Counsel, Strategy Officer, Knowledge Manager

---

## Prerequisites

- **Node.js** >= 22.12.0
- **pnpm** >= 10.23.0
- **TypeDB** server (for ontology persistence)
- At least one AI model provider API key (Anthropic recommended)

---

## Installation

### From source

```bash
git clone https://github.com/kingler/openclaw-mabos.git
cd openclaw-mabos
pnpm install
pnpm build
```

### Docker

```bash
docker-compose up -d
```

### Enable the MABOS plugin

In your `openclaw.json` configuration, ensure the MABOS extension is enabled:

```json
{
  "extensions": {
    "mabos": {
      "enabled": true
    }
  }
}
```

---

## Configuration

The OpenClaw backend auto-configures with sensible defaults. No manual configuration is required to get started:

| Setting | Default |
|---------|---------|
| Gateway port | `18789` |
| State directory | `~/.openclaw` |
| BDI cycle interval | 30 minutes |
| Case-based reasoning | Enabled, 10,000 max cases |
| Stakeholder approval threshold | $5,000 |
| Reasoning methods | Deductive, Inductive, Abductive, Bayesian, CBR, Causal, Heuristic, HTN |
| Model hierarchy | Opus for strategic, Sonnet for tactical, Haiku for operational |

All settings can be overridden in `openclaw.json` under the `mabos` extension config.

---

## External SaaS API Key Setup

On first launch, a modal guides you through connecting external services. You only need to provide API keys — base URLs and flags are pre-configured.

| Service | Purpose | Where to get API key | Pre-configured base URL |
|---------|---------|---------------------|------------------------|
| **Anthropic** | AI reasoning (required) | [console.anthropic.com](https://console.anthropic.com) | `https://api.anthropic.com` |
| **OpenAI** | AI reasoning (alternative) | [platform.openai.com](https://platform.openai.com) | `https://api.openai.com` |
| **Stripe** | Payments | [dashboard.stripe.com/apikeys](https://dashboard.stripe.com/apikeys) | `https://api.stripe.com` |
| **Shopify** | E-commerce storefront | admin.shopify.com → Apps → API | Store-specific |
| **QuickBooks** | Accounting | [developer.intuit.com](https://developer.intuit.com) | `https://quickbooks.api.intuit.com` |
| **Salesforce** | CRM | login.salesforce.com → Setup → API | `https://login.salesforce.com` |
| **HubSpot** | Marketing CRM | [app.hubspot.com](https://app.hubspot.com) → Settings → API | `https://api.hubapi.com` |
| **Xero** | Accounting | [developer.xero.com](https://developer.xero.com) | `https://api.xero.com` |
| **GitHub** | Code repos | [github.com/settings/tokens](https://github.com/settings/tokens) | `https://api.github.com` |

Channel API keys (Telegram, Discord, Slack, etc.) follow the same pattern.

---

## MABOS Onboarding

A 5-phase guided pipeline bootstraps your entire business intelligence layer:

### Phase 1: Discovery

Answer 9 TOGAF questionnaire questions about your business — name, industry, business model, channels, pain points, and more.

### Phase 2: Architecture

The system auto-generates:
- **Business Model Canvas** (all 9 blocks)
- **TOGAF enterprise architecture** (business, application, and technology layers)
- **Tropos goal model** mapping stakeholders to 9 C-suite agent roles

### Phase 3: Agent Activation

The system spawns 9 core agents plus domain-specific agents (e.g., Inventory Manager for e-commerce). Each agent is initialized with:
- 10 cognitive files: Persona, Capabilities, Beliefs, Desires, Goals, Intentions, Plans, Playbooks, Knowledge, Memory
- Role-specific desires with priority scoring
- Commitment strategy (default: open-minded)

### Phase 4: Knowledge Graph

SBVR ontology is exported and synced to TypeDB, creating persistent business rules and entity relationships.

### Phase 5: Launch

The dashboard goes live, the BDI heartbeat service starts (30-minute cycles), and the CEO agent runs its first deliberation cycle.

**CLI shortcut:**

```bash
openclaw mabos onboard "VividWalls" --industry ecommerce
```

---

## Dashboard Pages

| Page | Description |
|------|-------------|
| Overview | Executive summary with live KPIs |
| Agents | All active agents and their status |
| Agent Detail | Deep dive into a single agent's cognition |
| Business Goals | Strategic objectives and progress |
| Decisions | Agent decision log with approval gates |
| Workflows | Visual workflow monitoring |
| Timeline | Gantt chart of projects and milestones |
| Tasks | Kanban board for operational tasks |
| Knowledge Graph | Interactive ontology visualization |
| Performance | Department and agent performance metrics |
| Projects | Project portfolio management |
| Accounting | Financial dashboards and reports |
| HR | Team management and org structure |
| Inventory | Stock levels, SKUs, and supply chain |
| Onboarding | Guided business setup wizard |

---

## Tech Stack

**Frontend:**
React 19, TypeScript, Vite 7, TailwindCSS 4, Radix UI + shadcn/ui, TanStack Router + React Query, Recharts, @xyflow/react (knowledge graph), Lucide icons

**Backend:**
OpenClaw gateway (Node.js, WebSocket), MABOS BDI engine, SBVR ontologies (JSON-LD/OWL)

**Data:**
TypeDB for knowledge persistence

---

## Development

```bash
# Start gateway with hot reload
pnpm gateway:watch

# Start UI dev server (from extensions/mabos/ui/)
pnpm dev

# Production build
pnpm build

# Run full test suite
pnpm test:all
```

The UI dev server runs independently at `http://localhost:5173` and proxies API calls to the gateway.

---

## License

MIT
