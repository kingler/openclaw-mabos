/**
 * Smart-default inference. Detects empty/missing CompanyDNA fields, makes ONE
 * batched LLM call to infer plausible values, and records each as an Assumption
 * (status "assumed") plus an enriched CompanyDNA clone and a diff record.
 *
 * Pure: it does not persist or build the LLM router — the caller injects an
 * LlmCallFn (from the effort/cost model router) and persists the result. Skips
 * the LLM entirely when nothing needs filling (token-frugal).
 */

import type { CompanyDNA, LlmCallFn } from "../gdc/types.js";
import { generatePrefixedId } from "../tools/common.js";
import { buildGapFillPrompt } from "./prompts.js";
import type { Assumption, EnrichmentRecord, FieldDiff } from "./types.js";

const STRING_FIELDS = ["mission", "vision", "revenue"] as const;
const ARRAY_FIELDS = ["key_products", "channels", "constraints"] as const;
const BMC_FIELDS = [
  "bmc.value_propositions",
  "bmc.customer_segments",
  "bmc.revenue_streams",
] as const;

const EMPTY_BMC = {
  customer_segments: [],
  value_propositions: [],
  channels: [],
  customer_relationships: [],
  revenue_streams: [],
  key_resources: [],
  key_activities: [],
  key_partners: [],
  cost_structure: [],
};

/** Fields that are empty/missing in the DNA and therefore candidates for inference. */
export function detectMissingFields(dna: CompanyDNA): string[] {
  const missing: string[] = [];
  const rec = dna as unknown as Record<string, unknown>;
  for (const f of STRING_FIELDS) {
    if (!String(rec[f] ?? "").trim()) missing.push(f);
  }
  for (const f of ARRAY_FIELDS) {
    const v = rec[f];
    if (!Array.isArray(v) || v.length === 0) missing.push(f);
  }
  for (const f of BMC_FIELDS) {
    const block = f.split(".")[1] as keyof typeof EMPTY_BMC;
    const arr = dna.bmc?.[block];
    if (!Array.isArray(arr) || arr.length === 0) missing.push(f);
  }
  return missing;
}

interface GapItem {
  field: string;
  value: unknown;
  rationale: string;
  confidence: number;
}

function parseGapFill(text: string): GapItem[] {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is GapItem => p && typeof p === "object" && "field" in p && "value" in p)
      .map((p) => ({
        field: String(p.field),
        value: p.value,
        rationale: String(p.rationale ?? ""),
        confidence: Math.max(0, Math.min(1, Number(p.confidence ?? 0.5))),
      }));
  } catch {
    return [];
  }
}

function applyField(dna: CompanyDNA, field: string, value: unknown): unknown {
  const record = dna as unknown as Record<string, unknown>;
  if (field.startsWith("bmc.")) {
    const block = field.split(".")[1];
    if (!dna.bmc) dna.bmc = { ...EMPTY_BMC } as CompanyDNA["bmc"];
    const bmc = dna.bmc as unknown as Record<string, unknown>;
    const before = bmc[block];
    bmc[block] = value;
    return before;
  }
  const before = record[field];
  record[field] = value;
  return before;
}

export interface EnrichmentParams {
  businessId: string;
  companyDNA: CompanyDNA;
  callLlm: LlmCallFn;
  trigger: EnrichmentRecord["trigger"];
  effort: string;
  /** Restrict inference to these fields (default: all detected-missing). */
  fields?: string[];
  /** New facts to merge before detecting gaps (continuous enrichment). */
  newInfo?: Partial<CompanyDNA>;
}

export interface EnrichmentResult {
  enrichedDNA: CompanyDNA;
  assumptions: Assumption[];
  record: EnrichmentRecord;
  /** True when an LLM call was made (false = nothing to infer). */
  calledLlm: boolean;
}

export async function runEnrichment(params: EnrichmentParams): Promise<EnrichmentResult> {
  const now = new Date().toISOString();
  const enrichmentId = generatePrefixedId("ENR");
  const enrichedDNA: CompanyDNA = structuredClone(params.companyDNA);

  // Continuous enrichment: merge caller-supplied new info first (treated as known).
  if (params.newInfo) Object.assign(enrichedDNA, params.newInfo);

  let candidates = detectMissingFields(enrichedDNA);
  if (params.fields?.length) candidates = candidates.filter((f) => params.fields!.includes(f));

  const baseRecord: EnrichmentRecord = {
    id: enrichmentId,
    business_id: params.businessId,
    trigger: params.trigger,
    effort: params.effort,
    cost_usd: 0,
    inferred_fields: [],
    diffs: [],
    created_at: now,
  };

  if (candidates.length === 0) {
    return { enrichedDNA, assumptions: [], record: baseRecord, calledLlm: false };
  }

  const { system, user } = buildGapFillPrompt(enrichedDNA, candidates);
  const text = await params.callLlm({ model: "", system, user, maxTokens: 2048, temperature: 0.4 });
  const items = parseGapFill(text).filter((i) => candidates.includes(i.field));

  const assumptions: Assumption[] = [];
  const diffs: FieldDiff[] = [];
  for (const item of items) {
    const before = applyField(enrichedDNA, item.field, item.value);
    const id = generatePrefixedId("A");
    assumptions.push({
      id,
      business_id: params.businessId,
      field: item.field,
      value: item.value,
      confidence: item.confidence,
      rationale: item.rationale,
      source: "llm_inference",
      status: "assumed",
      evidence: [],
      history: [],
      enrichment_id: enrichmentId,
      created_at: now,
      updated_at: now,
    });
    diffs.push({ field: item.field, before: before ?? null, after: item.value, assumption_id: id });
  }

  return {
    enrichedDNA,
    assumptions,
    record: { ...baseRecord, inferred_fields: items.map((i) => i.field), diffs },
    calledLlm: true,
  };
}
