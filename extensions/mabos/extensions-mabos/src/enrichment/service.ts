/**
 * Shared enrichment orchestration used by the pipeline step, the REST routes,
 * and the agent tools so all three do the same thing: build a cost-tracked
 * LlmCallFn from the effort model router, run inference, persist assumptions +
 * record (append-only), and rewrite the business's company_dna.json so the GDC
 * bootstrap and downstream consumers see the enriched DNA.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CompanyDNA } from "../gdc/types.js";
import type { LlmCallFactory } from "../provisioning/types.js";
import { runEnrichment } from "./enricher.js";
import type { AssumptionStore } from "./store.js";
import type { Assumption, EnrichmentRecord } from "./types.js";

export interface EnrichBusinessParams {
  workspaceDir: string;
  store: AssumptionStore;
  makeCallLlm: LlmCallFactory;
  businessId: string;
  companyDNA: CompanyDNA;
  trigger: EnrichmentRecord["trigger"];
  effort?: "low" | "medium" | "high";
  model?: string;
  fields?: string[];
  newInfo?: Partial<CompanyDNA>;
}

export interface EnrichBusinessResult {
  enrichedDNA: CompanyDNA;
  assumptions: Assumption[];
  record: EnrichmentRecord;
}

export async function enrichBusiness(params: EnrichBusinessParams): Promise<EnrichBusinessResult> {
  const effort = params.effort ?? "medium";
  let cost = 0;
  const callLlm = params.makeCallLlm({
    effort,
    model: params.model,
    onUsage: (u) => {
      cost += u.costUsd;
    },
  });

  const result = await runEnrichment({
    businessId: params.businessId,
    companyDNA: params.companyDNA,
    callLlm,
    trigger: params.trigger,
    effort,
    fields: params.fields,
    newInfo: params.newInfo,
  });
  result.record.cost_usd = Number(cost.toFixed(6));

  const changed = result.assumptions.length > 0 || Boolean(params.newInfo);
  if (changed) {
    await params.store.append(params.businessId, result.assumptions, result.record);
    const dnaPath = join(params.workspaceDir, "businesses", params.businessId, "company_dna.json");
    await mkdir(dirname(dnaPath), { recursive: true });
    await writeFile(dnaPath, JSON.stringify(result.enrichedDNA, null, 2), "utf-8");
  }

  return {
    enrichedDNA: result.enrichedDNA,
    assumptions: result.assumptions,
    record: result.record,
  };
}
