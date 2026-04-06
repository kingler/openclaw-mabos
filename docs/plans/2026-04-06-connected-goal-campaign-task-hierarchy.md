# Connected Goal-Campaign-Task Hierarchy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a connected hierarchy in TypeDB: Goals → Initiatives → Campaigns → Tasks → Actions, all linked through Agents as the key connector node.

**Architecture:** Extend the existing TypeDB base schema with an `initiative` entity and new relations (`goal_drives_initiative`, `initiative_contains_campaign`, `campaign_requires_task`, `task_produces_action`). Seed VividWalls ecommerce data covering 4 strategic goals, 6 initiatives, 10 campaigns, ~30 tasks, and ~20 actions. Update the TypeDB dashboard query layer to return connected data, and wire the frontend pages to display the connections.

**Tech Stack:** TypeDB (HTTP driver), TypeScript, React, TanStack Query

---

### Task 1: Extend TypeDB Schema with Initiative Entity and Connecting Relations

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/knowledge/typedb-queries.ts` (base schema)

**Step 1: Add initiative entity and connecting relations to base schema**

Add after the `task` entity in `getBaseSchema()`:

```typescript
// After entity task block (~line 1177):

entity initiative,
  owns uid @key,
  owns name,
  owns description,
  owns status,
  owns category,
  owns priority,
  owns created_at,
  owns updated_at;

// After existing relations (~line 1298):

relation goal_drives_initiative,
  relates driving_goal,
  relates driven_initiative;

relation initiative_contains_campaign,
  relates parent_initiative,
  relates child_campaign;

relation campaign_requires_task,
  relates requiring_campaign,
  relates required_task;

relation task_produces_action,
  relates producing_task,
  relates produced_action;
```

Add role-playing declarations:

```typescript
initiative plays agent_owns:owned;
goal plays goal_drives_initiative:driving_goal;
initiative plays goal_drives_initiative:driven_initiative;
initiative plays initiative_contains_campaign:parent_initiative;
campaign plays initiative_contains_campaign:child_campaign;
campaign plays campaign_requires_task:requiring_campaign;
task plays campaign_requires_task:required_task;
task plays task_produces_action:producing_task;
action_execution plays task_produces_action:produced_action;
```

**Step 2: Commit**

```
feat(mabos): extend TypeDB schema with initiative entity and hierarchy relations
```

---

### Task 2: Seed Connected VividWalls Data into TypeDB

**Files:**

- Modify: `extensions/mabos/extensions-mabos/index.ts` (startup seed logic, expand existing campaign seed)

**Step 1: Replace the campaign-only seed with a full hierarchy seed**

In the TypeDB connect callback (after schema definition), replace the campaign seed block with a comprehensive seed that inserts:

**4 Strategic Goals:**

1. `G-REV` — Grow annual revenue to $2M (strategic, CMO+CFO)
2. `G-CAC` — Reduce customer acquisition cost below $25 (strategic, CMO)
3. `G-RET` — Increase customer retention rate to 65% (strategic, COO)
4. `G-BRD` — Establish VividWalls as premium art brand (strategic, CEO+CMO)

**6 Initiatives:**

1. `INI-DIG` — Q2 Digital Growth Program (G-REV)
2. `INI-REF` — Referral & Retention Program (G-CAC, G-RET)
3. `INI-SEO` — Organic Discovery Initiative (G-REV, G-CAC)
4. `INI-BRD` — Brand Authority Campaign (G-BRD)
5. `INI-EML` — Email Revenue Engine (G-REV, G-RET)
6. `INI-EXP` — New Market Expansion (G-REV)

**10 Campaigns** (existing, now linked to initiatives):

- MC-001 Spring Collection Launch → INI-DIG
- MC-002 Home Office Refresh → INI-DIG
- MC-003 Earth Day Eco Collection → INI-BRD
- MC-004 Influencer Collab Q1 → INI-BRD
- MC-005 Summer Sale 2026 → INI-DIG
- MC-006 Pinterest SEO Push → INI-SEO
- MC-007 Email Win-Back Series → INI-EML
- MC-008 Brand Awareness YouTube → INI-BRD
- MC-009 Referral Program Launch → INI-REF
- MC-010 Holiday Gift Guide → INI-EML

**~30 Tasks** (linked to campaigns):
Each campaign gets 2-4 tasks with realistic ecommerce actions.

**~20 Actions** (linked to tasks):
Tool executions like `send_email`, `meta_create_ad_set`, `shopify_update_product`, `pinterest_create_pin`.

**Agent assignments:**

- Goals owned by relevant C-suite agents (vw-ceo, vw-cmo, vw-cfo, vw-coo)
- Initiatives owned by lead agent
- Campaigns assigned to vw-cmo
- Tasks assigned to appropriate domain agents

**Step 2: Commit**

```
feat(mabos): seed connected goal→initiative→campaign→task→action hierarchy in TypeDB
```

---

### Task 3: Add TypeDB Query Functions for Connected Data

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/knowledge/typedb-dashboard.ts`

**Step 1: Add queryInitiativesFromTypeDB()**

Query initiatives with their linked goals and campaign counts.

**Step 2: Add queryGoalHierarchyFromTypeDB()**

Query goals with their connected initiatives, which contain campaigns, which have task counts. Returns a tree structure.

**Step 3: Add queryCampaignDetailFromTypeDB(campaignId)**

Query a single campaign with its parent initiative, linked tasks, and task actions. Used by the campaign detail drawer.

**Step 4: Commit**

```
feat(mabos): add TypeDB query functions for connected hierarchy data
```

---

### Task 4: Add Backend API Endpoints for Connected Data

**Files:**

- Modify: `extensions/mabos/extensions-mabos/index.ts`

**Step 1: Add GET /mabos/api/erp/initiatives endpoint**

Returns initiatives with goal links and campaign counts.

**Step 2: Add GET /mabos/api/erp/goal-hierarchy endpoint**

Returns the full goal→initiative→campaign tree for display.

**Step 3: Update GET /mabos/api/erp/marketing/campaigns/:id/metrics to include tasks**

Extend the response to include linked tasks and their actions.

**Step 4: Commit**

```
feat(mabos): add API endpoints for initiatives and goal hierarchy
```

---

### Task 5: Update Frontend Types

**Files:**

- Modify: `extensions/mabos/extensions-mabos/ui/src/lib/types.ts`

**Step 1: Add Initiative type and extend Campaign/Goal types**

```typescript
export type Initiative = {
  id: string;
  name: string;
  description: string;
  status: "active" | "planned" | "completed" | "paused";
  category: string;
  priority: number;
  goals: string[]; // linked goal IDs
  campaignCount: number;
  taskCount: number;
  assigned_agent: string;
};

// Extend MarketingCampaign to include initiative link
// Add initiative_id and tasks fields

// Extend CampaignMetrics to include tasks
export type CampaignTask = {
  id: string;
  name: string;
  status: string;
  assigned_agent: string;
  actions: { id: string; tool: string; status: string }[];
};
```

**Step 2: Commit**

```
feat(mabos): add Initiative type and connected hierarchy types
```

---

### Task 6: Update Campaign Detail Drawer with Tasks & Actions

**Files:**

- Modify: `extensions/mabos/extensions-mabos/ui/src/components/marketing/CampaignDetail.tsx`
- Modify: `extensions/mabos/extensions-mabos/ui/src/hooks/useMarketing.ts`

**Step 1: Add useCampaignTasks hook**

Fetch tasks linked to a campaign via the updated metrics/detail endpoint.

**Step 2: Add Tasks section to CampaignDetail**

Show linked tasks with their status, assigned agent, and actions as a nested list.

**Step 3: Add Initiative breadcrumb at top of drawer**

Show which initiative and goal this campaign belongs to.

**Step 4: Commit**

```
feat(mabos): show connected tasks, actions, and initiative in campaign detail drawer
```

---

### Task 7: Reinstall Plugin and Verify

**Step 1: Kill gateway, reinstall plugin, restart**
**Step 2: Verify TypeDB seed logs show full hierarchy**
**Step 3: Test /mabos/api/erp/marketing/campaigns returns campaigns with initiative links**
**Step 4: Test campaign detail drawer shows tasks and actions**
**Step 5: Commit any fixes**

---
