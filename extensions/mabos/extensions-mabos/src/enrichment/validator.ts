/**
 * Assumption validation — two paths:
 *  - explicit: a user/harness marks an assumption validated or rejected.
 *  - evidence-based: a Bayesian update over supplied evidence moves the
 *    posterior across thresholds (validated ≥ 0.75, rejected ≤ 0.25).
 *
 * When an assumption becomes `validated` it is promoted into the business fact
 * store (businesses/<id>/agents/knowledge/facts.json) so reasoning over facts
 * only ever sees confirmed knowledge — never speculative guesses.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { generatePrefixedId } from "../tools/common.js";
import type { AssumptionStore } from "./store.js";
import type { Assumption, AssumptionEvidence } from "./types.js";

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

/** Promote a validated assumption into the business knowledge agent's fact store. */
async function promoteToFacts(workspaceDir: string, a: Assumption): Promise<void> {
  const path = join(workspaceDir, "businesses", a.business_id, "agents", "knowledge", "facts.json");
  let store: { facts: Array<Record<string, unknown>>; version: number };
  try {
    store = JSON.parse(await readFile(path, "utf-8"));
  } catch {
    store = { facts: [], version: 0 };
  }
  const now = new Date().toISOString();
  store.facts.push({
    id: generatePrefixedId("F"),
    subject: a.business_id,
    predicate: a.field,
    object: typeof a.value === "string" ? a.value : JSON.stringify(a.value),
    confidence: a.confidence,
    source: `assumption:${a.id}`,
    valid_from: now,
    created_at: now,
    updated_at: now,
  });
  store.version += 1;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2), "utf-8");
}

export async function validateExplicit(
  store: AssumptionStore,
  workspaceDir: string,
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
  if (decision === "validated") await promoteToFacts(workspaceDir, updated);
  return updated;
}

export async function validateByEvidence(
  store: AssumptionStore,
  workspaceDir: string,
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
  if (status === "validated" && transitioned) await promoteToFacts(workspaceDir, assumption);

  return { assumption, posterior, transitioned };
}
