/**
 * Provisioning control-plane — type definitions and TypeBox schemas for the
 * MABOS instance lifecycle API (`/mabos/provision/*`).
 *
 * A "MABOS instance" is a single business: a `businesses/<id>/` workspace with
 * a manifest, a roster of BDI agents, a generated goal/plan/task graph, and a
 * deployment target. This module gives a meta harness one idempotent, async,
 * pollable contract to create + deploy those instances by composing the
 * existing onboarding scaffold, the Goal Decomposition Chain (GDC), and the
 * deployment renderers.
 */

import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import type { LlmCallFn } from "../gdc/types.js";
import type { EffortCallOptions } from "../model-router/provider.js";

/** Builds a per-request LlmCallFn from effort/model/usage options. */
export type LlmCallFactory = (opts: EffortCallOptions) => LlmCallFn;

// ---------------------------------------------------------------------------
// Deployment targets
// ---------------------------------------------------------------------------

/** Where a provisioned instance runs. */
export type DeployTarget = "in-gateway" | "container" | "cloud";

/** Cloud sub-provider for `target: "cloud"`. */
export type CloudProvider = "fly" | "render";

const DeploySpecSchema = Type.Object({
  target: Type.Union(
    [Type.Literal("in-gateway"), Type.Literal("container"), Type.Literal("cloud")],
    {
      default: "in-gateway",
      description:
        "in-gateway = multi-tenant business in this gateway; container = isolated Docker gateway; cloud = new Fly/Render gateway",
    },
  ),
  provider: Type.Optional(
    Type.Union([Type.Literal("fly"), Type.Literal("render")], {
      description: "Cloud sub-provider (target=cloud only)",
    }),
  ),
  channels: Type.Optional(
    Type.Array(Type.String(), {
      description: "Messaging channels to bind once active (e.g. slack, telegram)",
    }),
  ),
  activate: Type.Optional(
    Type.Boolean({
      default: true,
      description: "Mark the instance active and start its BDI heartbeat once provisioned",
    }),
  ),
  region: Type.Optional(Type.String({ description: "Cloud region (target=cloud only)" })),
});

export type DeploySpec = Static<typeof DeploySpecSchema>;

// ---------------------------------------------------------------------------
// CompanyDNA / tool inventory (mirrors src/gdc/types.ts as a wire schema)
// ---------------------------------------------------------------------------

const BmcItemSchema = Type.Object({
  title: Type.String(),
  description: Type.String(),
});

const CompanyDnaSchema = Type.Object({
  business_description: Type.String(),
  mission: Type.String(),
  vision: Type.String(),
  industry: Type.String(),
  stage: Type.String(),
  revenue: Type.String(),
  team_size: Type.Number(),
  key_products: Type.Array(Type.String()),
  channels: Type.Array(Type.String()),
  constraints: Type.Array(Type.String()),
  bmc: Type.Optional(
    Type.Object({
      customer_segments: Type.Array(BmcItemSchema),
      value_propositions: Type.Array(BmcItemSchema),
      channels: Type.Array(BmcItemSchema),
      customer_relationships: Type.Array(BmcItemSchema),
      revenue_streams: Type.Array(BmcItemSchema),
      key_resources: Type.Array(BmcItemSchema),
      key_activities: Type.Array(BmcItemSchema),
      key_partners: Type.Array(BmcItemSchema),
      cost_structure: Type.Array(BmcItemSchema),
    }),
  ),
});

const ToolInventoryItemSchema = Type.Object({
  name: Type.String(),
  description: Type.String(),
  capabilities: Type.Array(Type.String()),
  auth_type: Type.String(),
});

// ---------------------------------------------------------------------------
// Provision request — the single input contract for the harness
// ---------------------------------------------------------------------------

export const ProvisionRequestSchema = Type.Object({
  business_id: Type.String({
    description: "Slug; idempotency key. A second create with the same id returns 409.",
    minLength: 1,
    maxLength: 64,
  }),
  name: Type.String({ description: "Display name", minLength: 1 }),
  legal_name: Type.Optional(Type.String()),
  template: Type.Union(
    [
      Type.Literal("base"),
      Type.Literal("ecommerce"),
      Type.Literal("saas"),
      Type.Literal("consulting"),
    ],
    { default: "base", description: "Instance archetype under templates/" },
  ),
  company_dna: CompanyDnaSchema,
  tool_inventory: Type.Optional(Type.Array(ToolInventoryItemSchema, { default: [] })),
  integrations: Type.Optional(
    Type.Record(Type.String(), Type.Record(Type.String(), Type.Unknown()), {
      description: "Per-service credentials/config written to integrations.json",
    }),
  ),
  max_stage: Type.Optional(
    Type.Number({ minimum: 1, maximum: 7, description: "Highest GDC stage to run (default 7)" }),
  ),
  effort: Type.Optional(
    Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")], {
      default: "medium",
      description:
        "Level of effort for GDC generation. Selects the model pool; the cheapest available provider within it is used (cost-optimized).",
    }),
  ),
  model: Type.Optional(
    Type.String({
      description:
        "Explicit model id override (e.g. 'claude-sonnet-4-6'); bypasses effort selection",
    }),
  ),
  enrich: Type.Optional(
    Type.Boolean({
      default: true,
      description:
        "Infer smart-default assumptions for missing CompanyDNA fields before GDC. Set false to skip.",
    }),
  ),
  deploy: Type.Optional(DeploySpecSchema),
});

export type ProvisionRequest = Static<typeof ProvisionRequestSchema>;

// ---------------------------------------------------------------------------
// Job + instance records (persisted in the workspace)
// ---------------------------------------------------------------------------

export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";

export interface JobStep {
  name: string;
  status: StepStatus;
  detail?: string;
  started_at?: string;
  finished_at?: string;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface ProvisioningJob {
  id: string;
  instance_id: string;
  status: JobStatus;
  steps: JobStep[];
  created_at: string;
  updated_at: string;
  error?: string;
  /** Surfaced once on success: deploy artifacts, generated token, etc. */
  result?: Record<string, unknown>;
}

export type InstanceStatus = "provisioning" | "active" | "failed" | "decommissioned";

export interface InstanceRecord {
  id: string;
  name: string;
  type: string;
  template: string;
  status: InstanceStatus;
  deploy: DeploySpec;
  agents: string[];
  goals_count?: number;
  /** Level of effort used for GDC generation. */
  effort?: string;
  /** Cumulative GDC LLM token cost (USD) once the pipeline runs. */
  cost_usd?: number;
  job_id?: string;
  error?: string;
  created_at: string;
  updated_at: string;
}
