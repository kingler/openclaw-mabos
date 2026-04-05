# MABOS Dashboard — Real Data Mapping Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire every MABOS dashboard page to real VividWalls workspace data, eliminating all seed/placeholder data.

**Architecture:** Each backend route in `extensions/mabos/extensions-mabos/index.ts` reads from JSON files in `~/.openclaw/workspace/businesses/vividwalls/`. Routes transform raw data into the exact types the frontend expects (defined in `ui/src/lib/types.ts`). Where data files don't exist, routes create them on first request with realistic VividWalls seed data persisted to disk.

**Tech Stack:** TypeScript (jiti), Node.js HTTP handlers, React + TanStack Query frontend

---

## Data Source Inventory (VPS: `~/.openclaw/workspace/businesses/vividwalls/`)

| File                               | Records                                          | Used By                        |
| ---------------------------------- | ------------------------------------------------ | ------------------------------ |
| `manifest.json`                    | Business metadata (name, agents, stage)          | Overview, Agents               |
| `agents/*/Beliefs.md,Goals.md,...` | 20 agents x 10 BDI files each                    | Agents, Agent Detail, Overview |
| `product-catalog-live.json`        | 37 Shopify products                              | E-Commerce, Inventory          |
| `marketing.json`                   | 4 campaigns, 95 posts, 19 calendar, 40 snapshots | Marketing                      |
| `kpis.json`                        | 7 KPIs                                           | Marketing, Performance         |
| `metrics.json`                     | 344 metrics                                      | Performance, Analytics         |
| `tropos-goal-model.json`           | 10 actors, 11 goal mappings, 7 constraints       | Goals                          |
| `decision-queue.json`              | 5 decisions                                      | Decisions                      |
| `cron-jobs.json`                   | 59 cron jobs                                     | Workflows, Timeline            |
| `work-packages.json`               | 3 packages                                       | Projects                       |
| `sales-personas.json`              | 13 personas                                      | Customers, Marketing           |
| `departments.json`                 | 12 departments                                   | Overview, Agents               |
| `integrations.json`                | 34 integrations                                  | Supply Chain, E-Commerce       |
| `email-campaigns.json`             | 15 email campaigns                               | Marketing                      |
| `email-sequences.json`             | 6 sequences                                      | Marketing                      |
| `email-lists.json`                 | 1 segment                                        | Customers                      |
| `competitor-list.json`             | 5 competitors                                    | Analytics                      |
| `competitor-snapshots.json`        | Snapshot data                                    | Analytics                      |
| `seo-audits.json`                  | 1 audit                                          | Analytics                      |
| `togaf-architecture.json`          | Business/app/tech architecture                   | Knowledge Graph                |
| `business-model-canvas.json`       | Canvas data                                      | Overview, Strategy             |
| `marketing/apollo-leads.json`      | Lead data                                        | Customers                      |
| `marketing/ig-post-tracker.json`   | IG tracking                                      | Marketing                      |

---

## Page-by-Page Data Mapping

### Task 1: Overview Page (`/`)

**Status:** WORKING — reads agents from filesystem, BDI heartbeat from runtime
**Data source:** `manifest.json` + `agents/*/Beliefs|Goals|Intentions|Desires.md`
**Fix needed:** `/mabos/api/status` hangs (TypeDB). Add TYPEDB_DISABLED guard to status route.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/index.ts` — status route (~line 566)

**Step 1:** Find the status route handler, add `if (TYPEDB_DISABLED) { ... }` early return with filesystem-only data.

---

### Task 2: Performance Page (`/performance`)

**Status:** Returns data from `metrics.json` (344 metrics)
**Data source:** `metrics.json` → `metrics[]` array with `{ category, metric, target, unit, description }`
**Fix needed:** Transform metrics.json data to match frontend Performance component expectations. Check if `useMetrics(businessId)` response shape matches.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/index.ts` — `/mabos/api/metrics/:business` route

**Step 1:** Read `metrics.json`, map each metric to include `value` (current), `target`, `trend` fields.

---

### Task 3: Decisions Page (`/decisions`)

**Status:** WORKING — reads from `decision-queue.json` (5 decisions)
**Data source:** `decision-queue.json`
**Fix needed:** None (already mapped correctly).

---

### Task 4: Goals Page (`/goals`)

**Status:** WORKING — reads from `tropos-goal-model.json`
**Data source:** `tropos-goal-model.json` (10 actors, 11 goal mappings, 7 constraints, 9 dependencies)
**Fix needed:** None.

---

### Task 5: Analytics Page (`/analytics`)

**Status:** Uses seed data only
**Data source:** Map to real data:

- Reports from `seo-audits.json` (1 audit) + `competitor-snapshots.json`
- Dashboards from `kpis.json` + `metrics.json`
  **Fix needed:** Transform real data into AnalyticsReport/Dashboard types in the route handler.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/index.ts` — `/mabos/api/erp/analytics/reports` route
- Modify: `extensions/mabos/extensions-mabos/index.ts` — `/mabos/api/erp/analytics/dashboards` route

**Step 1:** Read `seo-audits.json` + `competitor-snapshots.json`, transform each audit/snapshot into `AnalyticsReport` type.
**Step 2:** Read `kpis.json` + `metrics.json`, generate dashboard configs.

---

### Task 6: Projects Page (`/projects`)

**Status:** Reads tasks from agent `Plans.md` files
**Data source:** `work-packages.json` (3 packages with id, title, description, deliverables, assigned_agent, status, budget_usd, deadline)
**Fix needed:** Currently reads Plans.md for tasks. Should also use `work-packages.json` for project-level view.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/index.ts` — `/mabos/api/businesses/:id/tasks` route

**Step 1:** Read `work-packages.json`, derive `Project` objects from work packages (id, name, sla from deadline proximity, taskCount from deliverables).

---

### Task 7: Tasks Page (`/tasks`)

**Status:** WORKING — parses `Plans.md` from each agent
**Data source:** `agents/*/Plans.md` (20 agents)
**Fix needed:** None (already mapped).

---

### Task 8: Timeline Page (`/timeline`)

**Status:** Depends on tasks data
**Data source:** Same as Tasks — `agents/*/Plans.md` + `cron-jobs.json` (59 jobs)
**Fix needed:** Ensure tasks include date/deadline fields from cron schedule.

---

### Task 9: Workflows Page (`/workflows`)

**Status:** BROKEN — TypeDB dependent (500 error)
**Data source:** Should read from `cron-jobs.json` (59 jobs) to derive workflow data
**Fix needed:** Add TYPEDB_DISABLED fallback to workflows route. Read cron-jobs.json and group by agent to generate workflow objects.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/index.ts` — `/mabos/api/workflows` route (~line 2783)

**Step 1:** In workflows GET handler, add check: if TypeDB unavailable, read `cron-jobs.json`, group by agent to construct `BpmnWorkflow[]`.

---

### Task 10: Agents Page (`/agents`)

**Status:** WORKING — reads from `manifest.json` + agent dirs
**Data source:** `agents/` directory (20 agents with BDI files)
**Fix needed:** None.

---

### Task 11: Agent Detail Page (`/agents/$agentId`)

**Status:** WORKING — reads from agent BDI files
**Data source:** `agents/{agentId}/Beliefs.md`, `Goals.md`, `Intentions.md`, `Desires.md`, `config.json`
**Fix needed:** None (TypeDB overlay skipped with TYPEDB_SKIP).

---

### Task 12: Knowledge Graph Page (`/knowledge-graph`)

**Status:** Depends on TypeDB knowledge queries
**Data source:** Should map from:

- `togaf-architecture.json` (business/app/tech architecture)
- `seed-data/01-ontology.json` (ontology structure)
- Agent BDI files (relationships between agents)
  **Fix needed:** Add filesystem fallback for knowledge graph data.

**Files:**

- Check: `ui/src/pages/KnowledgeGraphPage.tsx` — what data shape it expects
- Modify: `extensions/mabos/extensions-mabos/index.ts` — `/mabos/api/agents/:id/knowledge` route

**Step 1:** Read `togaf-architecture.json` + `seed-data/01-ontology.json`, transform into graph nodes/edges for the KnowledgeGraph component.

---

### Task 13: Skills Page (`/skills`)

**Status:** Uses `/mabos/skills` endpoint (direct fetch, not via api.ts)
**Data source:** Skills registered in gateway
**Fix needed:** Verify endpoint returns data (returned 200 earlier).

---

### Task 14: Sessions Page (`/sessions`)

**Status:** Uses `/mabos/api` endpoint for session data
**Data source:** `~/.openclaw/agents/*/sessions/*.jsonl`
**Fix needed:** Verify endpoint returns data.

---

### Task 15: E-Commerce Page (`/ecommerce`)

**Status:** WORKING — products from `product-catalog-live.json` (37 products)
**Data source:** `product-catalog-live.json`
**Fix needed:** Orders route uses seed data. Map to real `conversions.json` if events exist, or derive from product catalog.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/index.ts` — `/mabos/api/erp/orders` route

**Step 1:** Read `conversions.json` `.funnels[]` to derive order data. Fallback to seed data if empty.

---

### Task 16: Customers Page (`/customers`)

**Status:** WORKING with seed data
**Data source:** Map to real:

- `sales-personas.json` (13 personas with id, name, target, channels, approach)
- `marketing/apollo-leads.json` (lead data)
- `email-lists.json` (1 segment)
  **Fix needed:** Transform personas + leads into `Contact[]` type.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/index.ts` — `/mabos/api/erp/contacts` route

**Step 1:** Read `sales-personas.json`, map each persona to Contact type. Also read `marketing/apollo-leads.json` for real lead contacts if available.

---

### Task 17: Marketing Page (`/marketing`)

**Status:** WORKING — campaigns from `marketing.json` (4 campaigns transformed)
**Data source:** `marketing.json` (campaigns, posts, calendar, audiences, landing_pages, organic_snapshots) + `email-campaigns.json` (15 email campaigns) + `kpis.json` (7 KPIs)
**Fix needed:** Campaigns transform already done. KPIs already read from `kpis.json`. Could enrich with `email-campaigns.json` data.

---

### Task 18: Accounting Page (`/accounting`)

**Status:** WORKING with seed data
**Data source:** No real accounting JSON exists. Create `accounting.json` seed file on first request.
**Fix needed:** Persist seed data to `accounting.json` on VPS for consistency across restarts.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/index.ts` — accounting routes

**Step 1:** On first GET, generate realistic VividWalls accounting data and write to `accounting.json`. Subsequent requests read from file.

---

### Task 19: Inventory Page (`/inventory`)

**Status:** WORKING — 37 items from `product-catalog-live.json`
**Data source:** `product-catalog-live.json` + `le-inventory-status.json`
**Fix needed:** Enrich with `le-inventory-status.json` for edition-level inventory data.

---

### Task 20: Suppliers Page (`/suppliers`)

**Status:** WORKING with seed data
**Data source:** `integrations.json` (34 integrations — can derive supplier relationships)
**Fix needed:** Transform integrations into suppliers where type=vendor/supplier.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/index.ts` — `/mabos/api/erp/suppliers` route

**Step 1:** Read `integrations.json`, filter for vendor-type integrations, map to Supplier type.

---

### Task 21: Supply Chain Page (`/supply-chain`)

**Status:** WORKING with seed data
**Data source:** `integrations.json` (shipping integrations) + `le-inventory-status.json`
**Fix needed:** Derive shipment/route data from integrations + inventory status.

---

### Task 22: Legal Page (`/legal`)

**Status:** WORKING with seed data
**Data source:** `manifest.json` (legal_name, jurisdiction) for structure. No real contracts JSON.
**Fix needed:** Read `manifest.json` for legal structure. Persist contract seed data.

---

### Task 23: Compliance Page (`/compliance`)

**Status:** WORKING with seed data
**Data source:** Agent `compliance-director` BDI files contain real compliance rules
**Fix needed:** Read `agents/compliance-director/Goals.md` and `Beliefs.md` to derive policies.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/index.ts` — `/mabos/api/erp/compliance/policies` route

**Step 1:** Read `agents/compliance-director/Goals.md`, parse goal lines as policy names. Read `Beliefs.md` for current compliance state.

---

### Task 24: Governance Page (`/governance`)

**Status:** Uses `/mabos/governance/budget/summary`, `/audit`, `/costs` (all return 200)
**Data source:** Budget ledger SQLite DB if exists, otherwise seed data
**Fix needed:** Verify data quality.

---

### Task 25: Security Page (`/security`)

**Status:** Uses `/mabos/security/approvals` and `/scan-log` (both return 200)
**Data source:** Gateway security module
**Fix needed:** Verify data quality.

---

### Task 26: Onboarding Page (`/onboarding`)

**Status:** Setup wizard — not data-driven
**Fix needed:** None.

---

## Priority Order

1. **Task 1** — Fix `/status` endpoint (Overview depends on it)
2. **Task 9** — Fix `/workflows` endpoint (500 error)
3. **Task 5** — Analytics with real data from seo-audits + competitor snapshots
4. **Task 16** — Customers from real sales-personas + apollo-leads
5. **Task 15** — Orders from real conversions data
6. **Task 20** — Suppliers from real integrations
7. **Task 23** — Compliance from real compliance-director BDI
8. **Task 12** — Knowledge Graph from TOGAF + ontology
9. **Tasks 2,6,18,19** — Enrich Performance, Projects, Accounting, Inventory
10. **Tasks 3,4,7,8,10,11,13,14,17,22,24,25,26** — Already working / verify only
