/**
 * Assumption validation — two paths:
 *  - explicit: a user/harness marks an assumption validated or rejected.
 *  - evidence-based: a Bayesian update over supplied evidence moves the
 *    posterior across thresholds (validated ≥ 0.75, rejected ≤ 0.25).
 *
 * When an assumption becomes `validated` it is promoted into the canonical
 * fact store via `assertFactDirect`, so it lands in TypeDB (the graph
 * db/ontology) and the JSON mirror exactly like every other fact — and gets
 * contradiction detection + materialization for free. Reasoning over facts
 * then only ever sees confirmed knowledge, never speculative guesses.
 *
 * Following the canonical convention (see src/sync/shopify-sync.ts,
 * src/tools/outreach-tools.ts), the agent is the role — here the "knowledge"
 * agent — and the business identity is carried as the SPO subject.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { assertFactDirect } from "../tools/fact-store.js";
import type { AssumptionStore } from "./store.js";
import type { Assumption, AssumptionEvidence } from "./types.js";

/** The core "knowledge" agent that owns business facts (CORE_AGENT_IDS). */
const KNOWLEDGE_AGENT_ID = "knowledge";

export const VALIDATE_THRESHOLD = 0.75;
export const REJECT_THRESHOLD = 0.25;

/** Sequentially apply Bayes' rule over evidence: post = (likelihood * prior) / marginal. */
export function bayesUpdate(prior: number, evidence: AssumptionEvidence[]): number {
  return evidence.reduce((post, e) => {
    const likelihood = e.likelihood ?? 1;
    const marginal = e.marginal && e.marginal > 0 ? e.marginal : 1;
    return Math.max(0, Math.min(1, (likelihood * post) / marginal));
  }, prior);
}

/**
 * Promote a validated assumption into the canonical knowledge-agent fact store.
 * Routes through `assertFactDirect` so the triple is written to TypeDB (db
 * `mabos_knowledge`, scoped via `agent_owns`) and the JSON mirror, with
 * contradiction detection + materialization applied.
 */
async function promoteToFacts(api: OpenClawPluginApi, a: Assumption): Promise<void> {
  await assertFactDirect(api, {
    agent_id: KNOWLEDGE_AGENT_ID,
    subject: a.business_id,
    predicate: a.field,
    object: typeof a.value === "string" ? a.value : JSON.stringify(a.value),
    confidence: a.confidence,
    source: `assumption:${a.id}`,
    valid_from: new Date().toISOString(),
  });
}

export async function validateExplicit(
  store: AssumptionStore,
  api: OpenClawPluginApi,
  businessId: string,
  assumptionId: string,
  decision: "validated" | "rejected",
  evidence?: AssumptionEvidence[],
  note?: string,
): Promise<Assumption> {
  const updated = await store.updateStatus(businessId, assumptionId, {
    status: decision,
    by: "user",
    note,
    evidence,
  });
  if (decision === "validated") await promoteToFacts(api, updated);
  return updated;
}

export async function validateByEvidence(
  store: AssumptionStore,
  api: OpenClawPluginApi,
  businessId: string,
  assumptionId: string,
  evidence: AssumptionEvidence[],
): Promise<{ assumption: Assumption; posterior: number; transitioned: boolean }> {
  const current = await store.getById(businessId, assumptionId);
  if (!current) throw new Error(`Assumption '${assumptionId}' not found`);

  const posterior = bayesUpdate(current.confidence, evidence);
  const status =
    posterior >= VALIDATE_THRESHOLD
      ? "validated"
      : posterior <= REJECT_THRESHOLD
        ? "rejected"
        : current.status;

  const assumption = await store.updateStatus(businessId, assumptionId, {
    status,
    by: "bayesian",
    confidence: posterior,
    evidence,
    note: `Bayesian posterior ${posterior.toFixed(3)} from ${evidence.length} evidence item(s)`,
  });

  const transitioned = status !== current.status;
  if (status === "validated" && transitioned) await promoteToFacts(api, assumption);

  return { assumption, posterior, transitioned };
}
