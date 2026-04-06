/**
 * TypeDB Dashboard Data Access Layer
 *
 * Provides query functions that read from TypeDB and transform results
 * into the exact shapes the dashboard API expects (AgentListItem[],
 * AgentDetail, TroposGoalModel). All functions return null on failure
 * so callers can fall back to filesystem-based logic.
 */

import type { QueryResponse, ConceptRowAnswer, Concept } from "typedb-driver-http";
import { getTypeDBClient } from "./typedb-client.js";

/** When TYPEDB_SKIP=1, all query functions bail out immediately. */
const TYPEDB_DISABLED = process.env.TYPEDB_SKIP === "1";

// ── Types (mirroring ui/src/lib/types.ts) ───────────────────────────────

interface AgentListItem {
  id: string;
  name: string;
  type: "core" | "domain";
  beliefs: number;
  goals: number;
  intentions: number;
  desires: number;
  status: "active" | "idle" | "error" | "paused";
  autonomy_level: "low" | "medium" | "high";
  approval_threshold_usd: number;
}

interface AgentDetail {
  agentId: string;
  beliefCount: number;
  goalCount: number;
  intentionCount: number;
  desireCount: number;
  beliefs: string[];
  goals: string[];
  intentions: string[];
  desires: string[];
}

interface TroposGoalModel {
  actors: { id: string; name: string; type: "principal" | "agent"; goals: string[] }[];
  goals: {
    id: string;
    name: string;
    text?: string;
    description: string;
    level: string;
    type: string;
    priority: number;
    actor?: string;
    desires: string[];
    workflows: any[];
  }[];
  dependencies: { from: string; to: string; type: string; goalId: string }[];
}

function toDashboardId(typedbId: string): string {
  return typedbId;
}

function formatBusinessName(businessId: string): string {
  return businessId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

function inferBusinessContextFromAgentId(agentId: string): {
  businessId: string;
  businessName: string;
} {
  const separators = [agentId.lastIndexOf("-"), agentId.lastIndexOf("_")];
  const splitAt = Math.max(...separators);
  if (splitAt > 0) {
    const businessId = agentId.slice(0, splitAt);
    return {
      businessId,
      businessName: formatBusinessName(businessId),
    };
  }
  return {
    businessId: "default",
    businessName: "Default Business",
  };
}

// ── Response Parsing ────────────────────────────────────────────────────

function getConceptValue(concept: Concept | undefined): any {
  if (!concept) return null;
  if ("value" in concept) return concept.value;
  return null;
}

function getRows(response: QueryResponse | null): ConceptRowAnswer[] {
  if (!response) return [];
  if (response.answerType === "conceptRows") {
    return response.answers;
  }
  return [];
}

function matchesAgentAlias(requestedAgentId: string, typedbAgentId: string): boolean {
  if (requestedAgentId === typedbAgentId) {
    return true;
  }
  if (requestedAgentId.includes("-") || requestedAgentId.includes("_")) {
    return false;
  }
  return (
    typedbAgentId.endsWith(`-${requestedAgentId}`) || typedbAgentId.endsWith(`_${requestedAgentId}`)
  );
}

async function resolveTypeDBAgentUid(
  client: ReturnType<typeof getTypeDBClient>,
  dbName: string,
  requestedAgentId: string,
): Promise<string | null> {
  const exactRes = await client
    .matchQuery(`match $agent isa agent, has uid ${JSON.stringify(requestedAgentId)};`, dbName)
    .catch(() => null);
  if (getRows(exactRes).length > 0) {
    return requestedAgentId;
  }

  const agentRes = await client
    .matchQuery(`match $agent isa agent, has uid $id;`, dbName)
    .catch(() => null);
  const candidates = getRows(agentRes)
    .map((row) => getConceptValue(row.data["id"]))
    .filter((uid): uid is string => typeof uid === "string");
  const matched = candidates.filter((uid) => matchesAgentAlias(requestedAgentId, uid));
  if (matched.length === 0) {
    return null;
  }

  // Deterministic selection when multiple business-specific matches exist.
  matched.sort((a, b) => a.localeCompare(b));
  return matched[0] ?? null;
}

// ── Query Functions ─────────────────────────────────────────────────────

export async function queryAgentListFromTypeDB(dbName: string): Promise<AgentListItem[] | null> {
  if (TYPEDB_DISABLED) return null;
  try {
    const client = getTypeDBClient();
    if (!client.isAvailable()) {
      const ok = await client.connect();
      if (!ok) return null;
    }

    // Query all agents
    const agentRes = await client.matchQuery(
      `match $agent isa agent, has uid $id, has name $n;`,
      dbName,
    );
    const agentRows = getRows(agentRes);
    if (agentRows.length === 0) return null;

    const agents: AgentListItem[] = [];

    for (const row of agentRows) {
      const uid = getConceptValue(row.data["id"]) as string;
      const name = getConceptValue(row.data["n"]) as string;
      if (!uid || !name) continue;

      // Count beliefs, goals, desires, intentions for this agent
      const [beliefRes, goalRes, desireRes, intentionRes] = await Promise.all([
        client
          .matchQuery(
            `match $agent isa agent, has uid "${uid}"; $b isa belief; (owner: $agent, owned: $b) isa agent_owns;`,
            dbName,
          )
          .catch(() => null),
        client
          .matchQuery(
            `match $agent isa agent, has uid "${uid}"; $g isa goal; (owner: $agent, owned: $g) isa agent_owns;`,
            dbName,
          )
          .catch(() => null),
        client
          .matchQuery(
            `match $agent isa agent, has uid "${uid}"; $d isa desire; (owner: $agent, owned: $d) isa agent_owns;`,
            dbName,
          )
          .catch(() => null),
        client
          .matchQuery(
            `match $agent isa agent, has uid "${uid}"; $int isa intention; (owner: $agent, owned: $int) isa agent_owns;`,
            dbName,
          )
          .catch(() => null),
      ]);

      agents.push({
        id: toDashboardId(uid),
        name,
        type: "core",
        beliefs: getRows(beliefRes).length,
        goals: getRows(goalRes).length,
        intentions: getRows(intentionRes).length,
        desires: getRows(desireRes).length,
        status: "active",
        autonomy_level: "medium",
        approval_threshold_usd: 100,
      });
    }

    return agents;
  } catch {
    return null;
  }
}

export async function queryAgentDetailFromTypeDB(
  agentId: string,
  dbName: string,
): Promise<AgentDetail | null> {
  if (TYPEDB_DISABLED) return null;
  try {
    const client = getTypeDBClient();
    if (!client.isAvailable()) {
      const ok = await client.connect();
      if (!ok) return null;
    }

    const typedbId = await resolveTypeDBAgentUid(client, dbName, agentId);
    if (!typedbId) return null;

    // Query beliefs, goals, desires, intentions with their text content
    const [beliefRes, goalRes, desireRes, intentionRes] = await Promise.all([
      client
        .matchQuery(
          `match $agent isa agent, has uid "${typedbId}"; $b isa belief, has content $c; (owner: $agent, owned: $b) isa agent_owns;`,
          dbName,
        )
        .catch(() => null),
      client
        .matchQuery(
          `match $agent isa agent, has uid "${typedbId}"; $g isa goal, has name $n; (owner: $agent, owned: $g) isa agent_owns;`,
          dbName,
        )
        .catch(() => null),
      client
        .matchQuery(
          `match $agent isa agent, has uid "${typedbId}"; $d isa desire, has name $n; (owner: $agent, owned: $d) isa agent_owns;`,
          dbName,
        )
        .catch(() => null),
      client
        .matchQuery(
          `match $agent isa agent, has uid "${typedbId}"; $int isa intention, has name $n; (owner: $agent, owned: $int) isa agent_owns;`,
          dbName,
        )
        .catch(() => null),
    ]);

    const beliefs = getRows(beliefRes)
      .map((r) => getConceptValue(r.data["c"]) as string)
      .filter(Boolean);
    const goals = getRows(goalRes)
      .map((r) => getConceptValue(r.data["n"]) as string)
      .filter(Boolean);
    const desires = getRows(desireRes)
      .map((r) => getConceptValue(r.data["n"]) as string)
      .filter(Boolean);
    const intentions = getRows(intentionRes)
      .map((r) => getConceptValue(r.data["n"]) as string)
      .filter(Boolean);

    // Get knowledge stats
    let knowledgeStats:
      | { facts: number; rules: number; memories: number; cases: number }
      | undefined;
    try {
      const stats = await queryKnowledgeStatsFromTypeDB(typedbId, dbName);
      if (stats) knowledgeStats = stats;
    } catch {
      /* non-blocking */
    }

    return {
      agentId: toDashboardId(typedbId),
      beliefCount: beliefs.length,
      goalCount: goals.length,
      intentionCount: intentions.length,
      desireCount: desires.length,
      beliefs,
      goals,
      intentions,
      desires,
      ...(knowledgeStats ? { knowledgeStats } : {}),
    } as AgentDetail;
  } catch {
    return null;
  }
}

// ── Decision Types ───────────────────────────────────────────────────

interface Decision {
  id: string;
  title: string;
  summary: string;
  urgency: string;
  agentId: string;
  agentName: string;
  businessId: string;
  businessName: string;
  options: any[];
  agentRecommendation?: string;
  createdAt: string;
  status: string;
}

// ── Workflow / Task Types ────────────────────────────────────────────

interface DashboardWorkflow {
  id: string;
  name: string;
  status: string;
  agents: string[];
  steps: { id: string; name: string; order: number }[];
}

interface DashboardTask {
  id: string;
  plan_id: string;
  plan_name: string;
  step_id: string;
  description: string;
  type: string;
  assigned_to: string;
  depends_on: string[];
  status: string;
  estimated_duration: string;
  agent_id: string;
}

export async function queryDecisionsFromTypeDB(dbName: string): Promise<Decision[] | null> {
  if (TYPEDB_DISABLED) return null;
  try {
    const client = getTypeDBClient();
    if (!client.isAvailable()) {
      const ok = await client.connect();
      if (!ok) return null;
    }

    // Query all decisions with their owning agents
    const res = await client.matchQuery(
      `match $agent isa agent, has uid $aid, has name $aname; $d isa decision, has uid $did, has name $n, has description $desc, has urgency_level $urg, has status $st, has options_json $opts, has created_at $ca; (owner: $agent, owned: $d) isa agent_owns;`,
      dbName,
    );
    const rows = getRows(res);
    if (rows.length === 0) return null;

    const decisions: Decision[] = [];
    for (const row of rows) {
      const did = getConceptValue(row.data["did"]) as string;
      const name = getConceptValue(row.data["n"]) as string;
      const desc = getConceptValue(row.data["desc"]) as string;
      const urg = getConceptValue(row.data["urg"]) as string;
      const st = getConceptValue(row.data["st"]) as string;
      const optsJson = getConceptValue(row.data["opts"]) as string;
      const ca = getConceptValue(row.data["ca"]) as string;
      const aid = getConceptValue(row.data["aid"]) as string;
      const aname = getConceptValue(row.data["aname"]) as string;

      if (!did || !name) continue;
      const businessContext = inferBusinessContextFromAgentId(aid || "");

      let options: any[] = [];
      try {
        options = JSON.parse(optsJson || "[]");
      } catch {
        /* invalid JSON */
      }

      decisions.push({
        id: did,
        title: name,
        summary: desc || "",
        urgency: urg || "medium",
        agentId: aid ? toDashboardId(aid) : "",
        agentName: aname || "",
        businessId: businessContext.businessId,
        businessName: businessContext.businessName,
        options,
        createdAt: ca || new Date().toISOString(),
        status: st || "pending",
      });
    }

    // Try to get recommendation attribute (optional)
    for (const d of decisions) {
      try {
        const recRes = await client.matchQuery(
          `match $d isa decision, has uid "${d.id}", has recommendation $rec;`,
          dbName,
        );
        const recRows = getRows(recRes);
        if (recRows.length > 0) {
          d.agentRecommendation = getConceptValue(recRows[0].data["rec"]) as string;
        }
      } catch {
        /* no recommendation */
      }
    }

    return decisions;
  } catch {
    return null;
  }
}

export async function queryWorkflowsFromTypeDB(
  dbName: string,
): Promise<DashboardWorkflow[] | null> {
  if (TYPEDB_DISABLED) return null;
  try {
    const client = getTypeDBClient();
    if (!client.isAvailable()) {
      const ok = await client.connect();
      if (!ok) return null;
    }

    const res = await client.matchQuery(
      `match $wf isa workflow, has uid $wid, has name $n, has status $st;`,
      dbName,
    );
    const rows = getRows(res);
    if (rows.length === 0) return null;

    const workflows: DashboardWorkflow[] = [];
    for (const row of rows) {
      const wid = getConceptValue(row.data["wid"]) as string;
      const name = getConceptValue(row.data["n"]) as string;
      const st = getConceptValue(row.data["st"]) as string;
      if (!wid || !name) continue;

      // Find agents owning this workflow
      const agentRes = await client
        .matchQuery(
          `match $agent isa agent, has uid $aid; $wf isa workflow, has uid "${wid}"; (owner: $agent, owned: $wf) isa agent_owns;`,
          dbName,
        )
        .catch(() => null);
      const agents = getRows(agentRes)
        .map((r) => toDashboardId(getConceptValue(r.data["aid"]) as string))
        .filter(Boolean);

      workflows.push({
        id: wid,
        name,
        status: st || "active",
        agents,
        steps: [],
      });
    }

    return workflows;
  } catch {
    return null;
  }
}

export async function queryTasksFromTypeDB(dbName: string): Promise<DashboardTask[] | null> {
  if (TYPEDB_DISABLED) return null;
  try {
    const client = getTypeDBClient();
    if (!client.isAvailable()) {
      const ok = await client.connect();
      if (!ok) return null;
    }

    // Query all tasks with their owning agent
    const res = await client.matchQuery(
      `match $agent isa agent, has uid $aid; $t isa task, has uid $tid, has name $n, has description $desc, has task_type $tt, has status $st, has created_at $ca; (owner: $agent, owned: $t) isa agent_owns;`,
      dbName,
    );
    const rows = getRows(res);
    if (rows.length === 0) return null;

    const tasks: DashboardTask[] = [];
    for (const row of rows) {
      const tid = getConceptValue(row.data["tid"]) as string;
      const name = getConceptValue(row.data["n"]) as string;
      const desc = getConceptValue(row.data["desc"]) as string;
      const tt = getConceptValue(row.data["tt"]) as string;
      const st = getConceptValue(row.data["st"]) as string;
      const aid = getConceptValue(row.data["aid"]) as string;

      if (!tid || !name) continue;

      // Try to get optional attributes
      let assignedTo = aid ? toDashboardId(aid) : "";
      let estimatedDuration = "";
      let dependsOn: string[] = [];
      try {
        const optRes = await client
          .matchQuery(`match $t isa task, has uid "${tid}", has assigned_agent_id $aaid;`, dbName)
          .catch(() => null);
        const optRows = getRows(optRes);
        if (optRows.length > 0) {
          assignedTo = (getConceptValue(optRows[0].data["aaid"]) as string) || assignedTo;
        }
      } catch {
        /* no assigned_agent_id */
      }

      try {
        const durRes = await client
          .matchQuery(`match $t isa task, has uid "${tid}", has estimated_duration $dur;`, dbName)
          .catch(() => null);
        const durRows = getRows(durRes);
        if (durRows.length > 0) {
          estimatedDuration = (getConceptValue(durRows[0].data["dur"]) as string) || "";
        }
      } catch {
        /* no duration */
      }

      tasks.push({
        id: tid,
        plan_id: "",
        plan_name: "",
        step_id: tid,
        description: desc || name,
        type: tt || "task",
        assigned_to: assignedTo,
        depends_on: dependsOn,
        status: st || "proposed",
        estimated_duration: estimatedDuration,
        agent_id: aid ? toDashboardId(aid) : "",
      });
    }

    return tasks;
  } catch {
    return null;
  }
}

// ── Campaign Queries ──────────────────────────────────────────────────

export interface DashboardCampaign {
  id: string;
  name: string;
  type: string;
  status: string;
  budget: number;
  spent: number;
  start_date: string;
  end_date: string;
  channels: string[];
  assigned_agent: string;
}

export async function queryCampaignsFromTypeDB(
  dbName: string,
): Promise<DashboardCampaign[] | null> {
  if (TYPEDB_DISABLED) return null;
  try {
    const client = getTypeDBClient();
    if (!client.isAvailable()) {
      const ok = await client.connect();
      if (!ok) return null;
    }

    // Query all campaigns with their attributes
    const res = await client.matchQuery(
      `match $c isa campaign, has campaign_id $cid, has name $n, has status $st, has channel $ch;`,
      dbName,
    );
    const rows = getRows(res);
    if (rows.length === 0) return null;

    // Group rows by campaign_id (multiple channels produce multiple rows)
    const campaignMap = new Map<string, DashboardCampaign>();
    for (const row of rows) {
      const cid = getConceptValue(row.data["cid"]) as string;
      const name = getConceptValue(row.data["n"]) as string;
      const st = getConceptValue(row.data["st"]) as string;
      const ch = getConceptValue(row.data["ch"]) as string;

      if (!cid) continue;

      const existing = campaignMap.get(cid);
      if (existing) {
        if (ch && !existing.channels.includes(ch)) {
          existing.channels.push(ch);
        }
      } else {
        campaignMap.set(cid, {
          id: cid,
          name: name || cid,
          type: "digital",
          status: st || "active",
          budget: 0,
          spent: 0,
          start_date: "",
          end_date: "",
          channels: ch ? [ch] : [],
          assigned_agent: "",
        });
      }
    }

    // Enrich with assigned agent if available
    for (const [cid, campaign] of campaignMap) {
      try {
        const assignedRes = await client
          .matchQuery(
            `match $c isa campaign, has campaign_id "${cid}"; $a isa agent, has name $an; (assignee: $a, work-item: $c) isa assigned-to;`,
            dbName,
          )
          .catch(() => null);
        const assignedRows = getRows(assignedRes);
        if (assignedRows.length > 0) {
          campaign.assigned_agent = (getConceptValue(assignedRows[0].data["an"]) as string) || "";
        }
      } catch {
        /* no assignment */
      }
    }

    return [...campaignMap.values()];
  } catch {
    return null;
  }
}

// ── Initiative Queries ─────────────────────────────────────────────────

export interface DashboardInitiative {
  id: string;
  name: string;
  description: string;
  status: string;
  category: string;
  priority: number;
  goals: string[];
  campaignCount: number;
}

export async function queryInitiativesFromTypeDB(
  dbName: string,
): Promise<DashboardInitiative[] | null> {
  if (TYPEDB_DISABLED) return null;
  try {
    const client = getTypeDBClient();
    if (!client.isAvailable()) {
      const ok = await client.connect();
      if (!ok) return null;
    }

    const res = await client.matchQuery(
      `match $i isa initiative, has uid $id, has name $n, has status $st, has category $cat, has priority $p;`,
      dbName,
    );
    const rows = getRows(res);
    if (rows.length === 0) return null;

    const initiatives: DashboardInitiative[] = [];
    for (const row of rows) {
      const id = getConceptValue(row.data["id"]) as string;
      const name = getConceptValue(row.data["n"]) as string;
      const st = getConceptValue(row.data["st"]) as string;
      const cat = getConceptValue(row.data["cat"]) as string;
      const p = getConceptValue(row.data["p"]) as number;
      if (!id) continue;

      // Get linked goals
      const goalIds: string[] = [];
      try {
        const goalRes = await client
          .matchQuery(
            `match $g isa goal, has uid $gid; $i isa initiative, has uid "${id}"; (driving_goal: $g, driven_initiative: $i) isa goal_drives_initiative;`,
            dbName,
          )
          .catch(() => null);
        for (const gr of getRows(goalRes)) {
          const gid = getConceptValue(gr.data["gid"]) as string;
          if (gid) goalIds.push(gid);
        }
      } catch {
        /* no goals linked */
      }

      // Count campaigns
      let campaignCount = 0;
      try {
        const campRes = await client
          .matchQuery(
            `match $c isa campaign; $i isa initiative, has uid "${id}"; (parent_initiative: $i, child_campaign: $c) isa initiative_contains_campaign;`,
            dbName,
          )
          .catch(() => null);
        campaignCount = getRows(campRes).length;
      } catch {
        /* no campaigns */
      }

      initiatives.push({
        id,
        name: name || id,
        description: name || "",
        status: st || "active",
        category: cat || "",
        priority: p ?? 0.5,
        goals: goalIds,
        campaignCount,
      });
    }

    return initiatives;
  } catch {
    return null;
  }
}

// ── Campaign Detail with Connected Tasks ──────────────────────────────

export interface CampaignTaskDetail {
  id: string;
  name: string;
  type: string;
  status: string;
  assigned_agent: string;
  actions: { id: string; tool: string; status: string }[];
}

export interface CampaignFullDetail {
  campaign: DashboardCampaign;
  project: { id: string; name: string } | null;
  initiative: { id: string; name: string } | null;
  goal: { id: string; name: string } | null;
  tasks: CampaignTaskDetail[];
}

export async function queryCampaignDetailFromTypeDB(
  dbName: string,
  campaignId: string,
): Promise<CampaignFullDetail | null> {
  if (TYPEDB_DISABLED) return null;
  try {
    const client = getTypeDBClient();
    if (!client.isAvailable()) {
      const ok = await client.connect();
      if (!ok) return null;
    }

    // Get campaign
    const campRes = await client.matchQuery(
      `match $c isa campaign, has campaign_id "${campaignId}", has name $n, has status $st, has channel $ch;`,
      dbName,
    );
    const campRows = getRows(campRes);
    if (campRows.length === 0) return null;

    const campaign: DashboardCampaign = {
      id: campaignId,
      name: (getConceptValue(campRows[0].data["n"]) as string) || campaignId,
      type: "digital",
      status: (getConceptValue(campRows[0].data["st"]) as string) || "active",
      budget: 0,
      spent: 0,
      start_date: "",
      end_date: "",
      channels: campRows.map((r) => getConceptValue(r.data["ch"]) as string).filter(Boolean),
      assigned_agent: "",
    };
    // Deduplicate channels
    campaign.channels = [...new Set(campaign.channels)];

    // Get parent initiative
    let initiative: { id: string; name: string } | null = null;
    try {
      const iniRes = await client
        .matchQuery(
          `match $i isa initiative, has uid $iid, has name $iname; $c isa campaign, has campaign_id "${campaignId}"; (parent_initiative: $i, child_campaign: $c) isa initiative_contains_campaign;`,
          dbName,
        )
        .catch(() => null);
      const iniRows = getRows(iniRes);
      if (iniRows.length > 0) {
        initiative = {
          id: (getConceptValue(iniRows[0].data["iid"]) as string) || "",
          name: (getConceptValue(iniRows[0].data["iname"]) as string) || "",
        };
      }
    } catch {
      /* no initiative */
    }

    // Get parent project (via initiative)
    let project: { id: string; name: string } | null = null;
    if (initiative) {
      try {
        const projRes = await client
          .matchQuery(
            `match $p isa project, has uid $pid, has name $pname; $i isa initiative, has uid "${initiative.id}"; (parent_project: $p, child_initiative: $i) isa project_contains_initiative;`,
            dbName,
          )
          .catch(() => null);
        const projRows = getRows(projRes);
        if (projRows.length > 0) {
          project = {
            id: (getConceptValue(projRows[0].data["pid"]) as string) || "",
            name: (getConceptValue(projRows[0].data["pname"]) as string) || "",
          };
        }
      } catch {
        /* no project */
      }
    }

    // Get parent goal (via project or initiative)
    let goal: { id: string; name: string } | null = null;
    const goalLookupId = project?.id ?? initiative?.id;
    const goalLookupType = project ? "project" : "initiative";
    if (goalLookupId) {
      try {
        const goalQuery = project
          ? `match $g isa goal, has uid $gid, has name $gname; $p isa project, has uid "${project.id}"; (parent_goal: $g, child_project: $p) isa goal_has_project;`
          : `match $g isa goal, has uid $gid, has name $gname; $i isa initiative, has uid "${initiative!.id}"; (driving_goal: $g, driven_initiative: $i) isa goal_drives_initiative;`;
        const goalRes = await client.matchQuery(goalQuery, dbName).catch(() => null);
        const goalRows = getRows(goalRes);
        if (goalRows.length > 0) {
          goal = {
            id: (getConceptValue(goalRows[0].data["gid"]) as string) || "",
            name: (getConceptValue(goalRows[0].data["gname"]) as string) || "",
          };
        }
      } catch {
        /* no goal */
      }
    }

    // Get linked tasks
    const tasks: CampaignTaskDetail[] = [];
    try {
      const taskRes = await client
        .matchQuery(
          `match $t isa task, has uid $tid, has name $tn, has task_type $tt, has status $ts; $c isa campaign, has campaign_id "${campaignId}"; (requiring_campaign: $c, required_task: $t) isa campaign_requires_task;`,
          dbName,
        )
        .catch(() => null);
      for (const tr of getRows(taskRes)) {
        const tid = getConceptValue(tr.data["tid"]) as string;
        const tname = getConceptValue(tr.data["tn"]) as string;
        const ttype = getConceptValue(tr.data["tt"]) as string;
        const tstatus = getConceptValue(tr.data["ts"]) as string;
        if (!tid) continue;

        // Get assigned agent
        let assignedAgent = "";
        try {
          const agRes = await client
            .matchQuery(`match $t isa task, has uid "${tid}", has assigned_agent_id $aid;`, dbName)
            .catch(() => null);
          const agRows = getRows(agRes);
          if (agRows.length > 0) {
            assignedAgent = (getConceptValue(agRows[0].data["aid"]) as string) || "";
          }
        } catch {
          /* no agent */
        }

        // Get actions
        const actions: { id: string; tool: string; status: string }[] = [];
        try {
          const actRes = await client
            .matchQuery(
              `match $a isa action_execution, has uid $aid, has tool_used $tool, has success $s; $t isa task, has uid "${tid}"; (producing_task: $t, produced_action: $a) isa task_produces_action;`,
              dbName,
            )
            .catch(() => null);
          for (const ar of getRows(actRes)) {
            actions.push({
              id: (getConceptValue(ar.data["aid"]) as string) || "",
              tool: (getConceptValue(ar.data["tool"]) as string) || "",
              status: (getConceptValue(ar.data["s"]) as boolean) ? "completed" : "pending",
            });
          }
        } catch {
          /* no actions */
        }

        tasks.push({
          id: tid,
          name: tname || tid,
          type: ttype || "task",
          status: tstatus || "proposed",
          assigned_agent: assignedAgent,
          actions,
        });
      }
    } catch {
      /* no tasks */
    }

    return { campaign, project, initiative, goal, tasks };
  } catch {
    return null;
  }
}

export async function writeBdiCycleResultToTypeDB(
  agentId: string,
  dbName: string,
  result: { newBeliefs?: string[]; newIntentions?: string[]; updatedGoals?: string[] },
): Promise<boolean> {
  if (TYPEDB_DISABLED) return null;
  try {
    const client = getTypeDBClient();
    if (!client.isAvailable()) return false;

    const typedbId = await resolveTypeDBAgentUid(client, dbName, agentId);
    if (!typedbId) return false;

    // Insert new intentions
    if (result.newIntentions && result.newIntentions.length > 0) {
      for (const intentionName of result.newIntentions) {
        const uid = `INT-${agentId}-${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        try {
          await client.insertData(
            `match $agent isa agent, has uid "${typedbId}";
insert $int isa intention, has uid "${uid}", has name ${JSON.stringify(intentionName)}, has description ${JSON.stringify(intentionName)}, has status "active", has committed_at "${now}", has created_at "${now}", has updated_at "${now}"; (owner: $agent, owned: $int) isa agent_owns;`,
            dbName,
          );
        } catch {
          /* non-blocking */
        }
      }
    }

    // Insert new beliefs
    if (result.newBeliefs && result.newBeliefs.length > 0) {
      for (const beliefContent of result.newBeliefs) {
        const uid = `BEL-${agentId}-${crypto.randomUUID()}`;
        const now = new Date().toISOString();
        try {
          await client.insertData(
            `match $agent isa agent, has uid "${typedbId}";
insert $b isa belief, has uid "${uid}", has category "environment", has certainty 0.7, has subject "bdi-cycle", has content ${JSON.stringify(beliefContent)}, has source "bdi-heartbeat", has created_at "${now}", has updated_at "${now}"; (owner: $agent, owned: $b) isa agent_owns;`,
            dbName,
          );
        } catch {
          /* non-blocking */
        }
      }
    }

    return true;
  } catch {
    return false;
  }
}

export async function queryKnowledgeStatsFromTypeDB(
  agentId: string,
  dbName: string,
): Promise<{ facts: number; rules: number; memories: number; cases: number } | null> {
  try {
    const client = getTypeDBClient();
    if (!client.isAvailable()) {
      const ok = await client.connect();
      if (!ok) return null;
    }

    const typedbId = await resolveTypeDBAgentUid(client, dbName, agentId);
    if (!typedbId) return null;

    const [factRes, ruleRes, memRes, caseRes] = await Promise.all([
      client
        .matchQuery(
          `match $agent isa agent, has uid "${typedbId}"; $f isa spo_fact; (owner: $agent, owned: $f) isa agent_owns;`,
          dbName,
        )
        .catch(() => null),
      client
        .matchQuery(
          `match $agent isa agent, has uid "${typedbId}"; $r isa knowledge_rule; (owner: $agent, owned: $r) isa agent_owns;`,
          dbName,
        )
        .catch(() => null),
      client
        .matchQuery(
          `match $agent isa agent, has uid "${typedbId}"; $m isa memory_item; (owner: $agent, owned: $m) isa agent_owns;`,
          dbName,
        )
        .catch(() => null),
      client
        .matchQuery(
          `match $agent isa agent, has uid "${typedbId}"; $c isa cbr_case; (owner: $agent, owned: $c) isa agent_owns;`,
          dbName,
        )
        .catch(() => null),
    ]);

    return {
      facts: getRows(factRes).length,
      rules: getRows(ruleRes).length,
      memories: getRows(memRes).length,
      cases: getRows(caseRes).length,
    };
  } catch {
    return null;
  }
}

export async function queryGoalModelFromTypeDB(dbName: string): Promise<TroposGoalModel | null> {
  if (process.env.TYPEDB_SKIP === "1") return null;
  try {
    const client = getTypeDBClient();
    if (!client.isAvailable()) {
      const ok = await Promise.race([
        client.connect(),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 5_000)),
      ]);
      if (!ok) return null;
    }

    // Query all agents
    const agentRes = await client.matchQuery(
      `match $agent isa agent, has uid $id, has name $n;`,
      dbName,
    );
    const agentRows = getRows(agentRes);
    if (agentRows.length === 0) return null;

    // Query all goals with their owning agent
    const goalRes = await client.matchQuery(
      `match $agent isa agent, has uid $aid; $g isa goal, has uid $gid, has name $n, has description $desc, has hierarchy_level $hl, has priority $p; (owner: $agent, owned: $g) isa agent_owns;`,
      dbName,
    );
    const goalRows = getRows(goalRes);

    // Query optional goal_state and goal_type (backwards compat)
    const goalStateMap = new Map<string, string>();
    const goalTypeMap = new Map<string, string>();
    try {
      const stateRes = await client
        .matchQuery(`match $g isa goal, has uid $gid, has goal_state $gs;`, dbName)
        .catch(() => null);
      for (const row of getRows(stateRes)) {
        const gid = getConceptValue(row.data["gid"]) as string;
        const gs = getConceptValue(row.data["gs"]) as string;
        if (gid && gs) goalStateMap.set(gid, gs);
      }
    } catch {
      /* goals may lack goal_state */
    }
    try {
      const typeRes = await client
        .matchQuery(`match $g isa goal, has uid $gid, has goal_type $gt;`, dbName)
        .catch(() => null);
      for (const row of getRows(typeRes)) {
        const gid = getConceptValue(row.data["gid"]) as string;
        const gt = getConceptValue(row.data["gt"]) as string;
        if (gid && gt) goalTypeMap.set(gid, gt);
      }
    } catch {
      /* goals may lack goal_type */
    }

    // Query desire→goal links
    const linkRes = await client.matchQuery(
      `match $d isa desire, has uid $did, has name $dn; $g isa goal, has uid $gid; (motivator: $d, motivated: $g) isa desire_motivates_goal;`,
      dbName,
    );
    const linkRows = getRows(linkRes);

    // Build desire map: goalId → desire names
    const desiresByGoal = new Map<string, string[]>();
    for (const row of linkRows) {
      const goalId = getConceptValue(row.data["gid"]) as string;
      const desireName = getConceptValue(row.data["dn"]) as string;
      if (!goalId || !desireName) continue;
      if (!desiresByGoal.has(goalId)) desiresByGoal.set(goalId, []);
      desiresByGoal.get(goalId)!.push(desireName);
    }

    // Build goal→agent map for actor goal lists
    const goalsByAgent = new Map<string, string[]>();

    // Build goals array
    const goals = goalRows.map((row) => {
      const gid = getConceptValue(row.data["gid"]) as string;
      const aid = getConceptValue(row.data["aid"]) as string;
      const name = getConceptValue(row.data["n"]) as string;
      const desc = getConceptValue(row.data["desc"]) as string;
      const hl = getConceptValue(row.data["hl"]) as string;
      const priority = getConceptValue(row.data["p"]) as number;

      if (aid) {
        if (!goalsByAgent.has(aid)) goalsByAgent.set(aid, []);
        goalsByAgent.get(aid)!.push(gid);
      }

      const levelMap: Record<string, string> = {
        strategic: "strategic",
        tactical: "tactical",
        operational: "operational",
      };

      return {
        id: gid,
        name,
        text: name,
        description: desc || "",
        level: levelMap[hl] || "operational",
        type: (goalTypeMap.get(gid) || "hardgoal") as string,
        priority: priority ?? 0.5,
        actor: aid ? toDashboardId(aid) : undefined,
        desires: desiresByGoal.get(gid) || [],
        workflows: [] as any[],
        goalState: goalStateMap.get(gid) || undefined,
      };
    });

    // Populate workflows via goal_requires_plan → plan → plan_contains_step
    try {
      const planRes = await client
        .matchQuery(
          `match $g isa goal, has uid $gid; $p isa plan, has uid $pid, has name $pn, has status $pst; (requiring: $g, required: $p) isa goal_requires_plan;`,
          dbName,
        )
        .catch(() => null);
      const planRows = getRows(planRes);

      for (const planRow of planRows) {
        const gid = getConceptValue(planRow.data["gid"]) as string;
        const pid = getConceptValue(planRow.data["pid"]) as string;
        const pn = getConceptValue(planRow.data["pn"]) as string;
        const pst = getConceptValue(planRow.data["pst"]) as string;
        if (!gid || !pid) continue;

        const goal = goals.find((g) => g.id === gid);
        if (!goal) continue;

        // Get plan steps
        const stepRes = await client
          .matchQuery(
            `match $p isa plan, has uid "${pid}"; $s isa plan_step, has uid $sid, has name $sn, has sequence_order $so; (container: $p, contained: $s) isa plan_contains_step;`,
            dbName,
          )
          .catch(() => null);
        const stepRows = getRows(stepRes);
        const steps = stepRows
          .map((sr) => ({
            id: getConceptValue(sr.data["sid"]) as string,
            name: getConceptValue(sr.data["sn"]) as string,
            order: (getConceptValue(sr.data["so"]) as number) ?? 0,
          }))
          .sort((a, b) => a.order - b.order);

        goal.workflows.push({
          id: pid,
          name: pn || pid,
          status: pst || "active",
          agents: goal.actor ? [goal.actor] : [],
          steps,
        });
      }
    } catch {
      /* workflows are optional */
    }

    // Build actors
    const actors = [
      { id: "stakeholder", name: "Stakeholder", type: "principal" as const, goals: [] as string[] },
      ...agentRows.map((row) => {
        const uid = getConceptValue(row.data["id"]) as string;
        const name = getConceptValue(row.data["n"]) as string;
        return {
          id: toDashboardId(uid),
          name,
          type: "agent" as const,
          goals: goalsByAgent.get(uid) || [],
        };
      }),
    ];

    // Build dependencies from parent_goal_id relationships
    const dependencies: { from: string; to: string; type: string; goalId: string }[] = [];
    // Query goals with parent references
    const parentRes = await client
      .matchQuery(`match $g isa goal, has uid $gid, has parent_goal_id $pid;`, dbName)
      .catch(() => null);
    for (const row of getRows(parentRes)) {
      const gid = getConceptValue(row.data["gid"]) as string;
      const pid = getConceptValue(row.data["pid"]) as string;
      if (gid && pid) {
        dependencies.push({ from: pid, to: gid, type: "delegation", goalId: gid });
      }
    }

    // Query goal_delegation relations (agent → agent delegation)
    const delegRes = await client
      .matchQuery(
        `match (delegator: $from, delegatee: $to, delegated_goal: $g) isa goal_delegation; $from has uid $fid; $to has uid $tid; $g has uid $gid;`,
        dbName,
      )
      .catch(() => null);
    for (const row of getRows(delegRes)) {
      const fid = getConceptValue(row.data["fid"]) as string;
      const tid = getConceptValue(row.data["tid"]) as string;
      const gid = getConceptValue(row.data["gid"]) as string;
      if (fid && tid && gid) {
        dependencies.push({ from: fid, to: tid, type: "delegation", goalId: gid });
      }
    }

    return { actors, goals, dependencies };
  } catch {
    return null;
  }
}
