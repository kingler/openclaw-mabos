# Project Context — OpenClaw-MABOS

Quick-reference metrics for cross-conversation context priming.

| Area              | Status                                                     | Last Updated |
| ----------------- | ---------------------------------------------------------- | ------------ |
| Core MABOS Plugin | Active development                                         | 2026-04-06   |
| BDI Agents        | 16 agents + customer-service                               | 2026-04-05   |
| Model Router      | Dual-model (Opus 4.6 + GPT-5.4), 11-model registry         | 2026-04-05   |
| Hooks & Routes    | Extracted across all 5 runtime modules                     | 2026-04-06   |
| Governance        | Budget ledger, RBAC, audit trail                           | 2026-03-29   |
| Email Integration | Graph webhook + cron fallback, 10 templates, 14 categories | 2026-04-04   |
| Onboarding        | Multi-step wizard + GDC pipeline (planned)                 | 2026-04-05   |
| Dashboard         | Next.js Mission Control, workspace landing, dark theme     | 2026-04-04   |
| VividWalls Brand  | Brand guidelines, design tokens (CSS+JSON), voice & tone   | 2026-04-06   |
| Security          | Injection scanning, SSRF, tool guard, content sanitization | 2026-04-06   |
| Session Intel     | FTS5 search, cross-session recall, user modeling           | 2026-04-06   |
| Skill Loop        | Auto-creation, marketplace, nudge system                   | 2026-04-06   |
| Execution Sandbox | Local + Docker + SSH + Modal backends                      | 2026-04-06   |

## MABOS Modules

```
extensions/mabos/extensions-mabos/src/
  cron-bridge.ts        — Email cron job bridge
  dashboard/            — Dashboard UI components
  execution-sandbox/    — Sandbox backends (index, hooks, routes)
  gdc/                  — Goal Decomposition Chain
  governance/           — Budget, RBAC, audit
  knowledge/            — TypeDB knowledge graph
  model-router/         — Multi-model routing (index, hooks, routes, cost-estimator, prompt-cache)
  onboarding/           — Business onboarding wizard
  ontology/             — SBVR ontology schemas
  reasoning/            — 35 reasoning methods
  security/             — Injection/SSRF/tool-guard (index, hooks, routes)
  session-intel/        — Session search & user modeling (index, hooks, routes)
  skill-loop/           — Auto-skill creation (index, hooks, routes)
  sync/                 — Data synchronization
  tools/                — Business tools (Shopify, etc.)
  types/                — Shared TypeScript types
```
