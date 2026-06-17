/**
 * Prompt builders for enrichment. Kept separate so the token strings stay out
 * of the inference logic and can be tuned independently.
 */

import type { CompanyDNA } from "../gdc/types.js";

/** Human-readable description of each CompanyDNA field the LLM may infer. */
const FIELD_GUIDE: Record<string, string> = {
  mission: "the company's mission statement (one sentence, core purpose + who it serves)",
  vision: "the company's long-term vision (one aspirational sentence)",
  revenue: "an approximate current revenue / stage descriptor (e.g. 'pre-revenue', '$1M ARR')",
  key_products: "array of 2-5 concrete product/service names the company offers",
  channels: "array of 2-5 go-to-market or distribution channels (e.g. 'web', 'B2B sales')",
  constraints: "array of 2-4 realistic operating constraints (budget, regulatory, team, etc.)",
  "bmc.value_propositions": "array of value proposition items {title, description}",
  "bmc.customer_segments": "array of customer segment items {title, description}",
  "bmc.revenue_streams": "array of revenue stream items {title, description}",
};

export function buildGapFillPrompt(
  dna: CompanyDNA,
  missingFields: string[],
): { system: string; user: string } {
  const system =
    "You are a business analyst that fills gaps in a company profile with realistic, " +
    "industry-appropriate assumptions. For each requested field, infer a plausible value " +
    "AND state the assumption you are making and a confidence in [0,1]. " +
    "Respond ONLY with a JSON array; each element: " +
    '{"field": string, "value": <string|string[]|object[]>, "rationale": string, "confidence": number}. ' +
    "Use the exact field names given. Do not invent fields that were not requested.";

  const known = {
    business_description: dna.business_description,
    industry: dna.industry,
    stage: dna.stage,
    mission: dna.mission || undefined,
    vision: dna.vision || undefined,
    key_products: dna.key_products?.length ? dna.key_products : undefined,
    channels: dna.channels?.length ? dna.channels : undefined,
  };

  const requested = missingFields
    .map((f) => `- ${f}: ${FIELD_GUIDE[f] ?? "infer a sensible value"}`)
    .join("\n");

  const user =
    `Known company facts:\n${JSON.stringify(known, null, 2)}\n\n` +
    `Infer the following missing fields:\n${requested}\n\n` +
    "Return the JSON array now.";

  return { system, user };
}
