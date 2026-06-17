/**
 * Agent-callable enrichment tools (auto-exposed at /mabos/tools/:name via the
 * extension's tool factory loop). They share the same store/enricher/validator/
 * predictor as the REST routes, and route all LLM calls through the effort model
 * router.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { CompanyDNA } from "../gdc/types.js";
import { createEffortModelRouter } from "../model-router/factory.js";
import type { LlmCallFactory } from "../provisioning/types.js";
import { getPluginConfig, resolveWorkspaceDir, textResult } from "../tools/common.js";
import { predictAndPrescribe } from "./predictor.js";
import { enrichBusiness } from "./service.js";
import { AssumptionStore } from "./store.js";
import type { AssumptionEvidence, AssumptionStatus } from "./types.js";
import { validateByEvidence, validateExplicit } from "./validator.js";

const EffortEnum = Type.Optional(
  Type.Union([Type.Literal("low"), Type.Literal("medium"), Type.Literal("high")]),
);

export function createEnrichmentTools(api: OpenClawPluginApi): AnyAgentTool[] {
  const workspaceDir = resolveWorkspaceDir(api);
  const store = new AssumptionStore(workspaceDir);
  const router = createEffortModelRouter(getPluginConfig(api).modelRouter ?? {});
  const makeCallLlm: LlmCallFactory = (opts) => router.makeCallLlm(opts);

  async function loadDna(businessId: string): Promise<CompanyDNA | null> {
    try {
      return JSON.parse(
        await readFile(join(workspaceDir, "businesses", businessId, "company_dna.json"), "utf-8"),
      ) as CompanyDNA;
    } catch {
      return null;
    }
  }

  return [
    {
      name: "enrich_business",
      label: "Enrich Business Model",
      description:
        "Infer smart defaults for missing CompanyDNA fields, recording each as a tracked assumption. " +
        "Pass new_info to enrich a live business as new information arrives.",
      parameters: Type.Object({
        business_id: Type.String(),
        effort: EffortEnum,
        fields: Type.Optional(Type.Array(Type.String())),
        new_info: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      }),
      async execute(
        _id: string,
        params: {
          business_id: string;
          effort?: "low" | "medium" | "high";
          fields?: string[];
          new_info?: Record<string, unknown>;
        },
      ) {
        const dna = await loadDna(params.business_id);
        if (!dna) return textResult(`Business '${params.business_id}' not found.`);
        const out = await enrichBusiness({
          workspaceDir,
          store,
          makeCallLlm,
          businessId: params.business_id,
          companyDNA: dna,
          trigger: params.new_info ? "new_info" : "manual",
          effort: params.effort,
          fields: params.fields,
          newInfo: params.new_info as Partial<CompanyDNA> | undefined,
        });
        return textResult(
          `Enriched ${params.business_id}: ${out.assumptions.length} assumption(s) on [${out.record.inferred_fields.join(", ")}], cost $${out.record.cost_usd}.`,
        );
      },
    },
    {
      name: "list_assumptions",
      label: "List Business Assumptions",
      description: "List a business's assumptions, optionally filtered by status or field.",
      parameters: Type.Object({
        business_id: Type.String(),
        status: Type.Optional(
          Type.Union([
            Type.Literal("assumed"),
            Type.Literal("validated"),
            Type.Literal("rejected"),
          ]),
        ),
        field: Type.Optional(Type.String()),
      }),
      async execute(
        _id: string,
        params: { business_id: string; status?: AssumptionStatus; field?: string },
      ) {
        const out = await store.listByStatus(params.business_id, params.status, params.field);
        return textResult(JSON.stringify(out, null, 2));
      },
    },
    {
      name: "validate_assumption",
      label: "Validate Assumption",
      description:
        "Validate or reject an assumption. With evidence likelihoods, performs a Bayesian update; " +
        "otherwise records an explicit decision. Validated assumptions are promoted to the fact store.",
      parameters: Type.Object({
        business_id: Type.String(),
        assumption_id: Type.String(),
        decision: Type.Optional(Type.Union([Type.Literal("validated"), Type.Literal("rejected")])),
        note: Type.Optional(Type.String()),
        evidence: Type.Optional(
          Type.Array(
            Type.Object({
              description: Type.String(),
              source: Type.String(),
              likelihood: Type.Optional(Type.Number()),
              marginal: Type.Optional(Type.Number()),
            }),
          ),
        ),
      }),
      async execute(
        _id: string,
        params: {
          business_id: string;
          assumption_id: string;
          decision?: "validated" | "rejected";
          note?: string;
          evidence?: Array<Omit<AssumptionEvidence, "observed_at">>;
        },
      ) {
        const now = new Date().toISOString();
        const evidence = params.evidence?.map((e) => ({ ...e, observed_at: now }));
        // Bayesian path when evidence has likelihoods and no explicit decision.
        if (!params.decision && evidence?.some((e) => e.likelihood !== undefined)) {
          const out = await validateByEvidence(
            store,
            api,
            params.business_id,
            params.assumption_id,
            evidence,
          );
          return textResult(
            `Assumption ${params.assumption_id}: posterior ${out.posterior.toFixed(3)}, status ${out.assumption.status}.`,
          );
        }
        const a = await validateExplicit(
          store,
          api,
          params.business_id,
          params.assumption_id,
          params.decision ?? "validated",
          evidence,
          params.note,
        );
        return textResult(`Assumption ${params.assumption_id} → ${a.status}.`);
      },
    },
    {
      name: "predict_prescribe",
      label: "Predict and Prescribe",
      description:
        "Produce predictions and prescriptive actions from a business's assumptions, gated on " +
        "validated assumptions by default. mode=llm adds reasoning-framed narratives/actions.",
      parameters: Type.Object({
        business_id: Type.String(),
        mode: Type.Optional(Type.Union([Type.Literal("fast"), Type.Literal("llm")])),
        gate: Type.Optional(Type.Union([Type.Literal("validated_only"), Type.Literal("all")])),
        effort: EffortEnum,
      }),
      async execute(
        _id: string,
        params: {
          business_id: string;
          mode?: "fast" | "llm";
          gate?: "validated_only" | "all";
          effort?: "low" | "medium" | "high";
        },
      ) {
        const mode = params.mode ?? "fast";
        const result = await predictAndPrescribe({
          store,
          businessId: params.business_id,
          mode,
          gate: params.gate ?? "validated_only",
          callLlm: mode === "llm" ? makeCallLlm({ effort: params.effort ?? "medium" }) : undefined,
        });
        return textResult(JSON.stringify(result, null, 2));
      },
    },
  ] as AnyAgentTool[];
}
