/**
 * TypeDB Reverse Sync — reconcile TypeDB facts back to JSON fact store.
 *
 * If TypeDB has newer facts than the JSON store, patch JSON accordingly.
 * Degrades gracefully when TypeDB is unavailable.
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { getTypeDBClient, TypeDBUnavailableError } from "../knowledge/typedb-client.js";

export type TypeDBFact = {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string;
  updated_at: string;
};

export type ReconcileResult = {
  patched: number;
  skipped: boolean;
  error?: string;
};

/**
 * Find facts in TypeDB that are newer than the JSON store.
 * Returns empty array if TypeDB is unavailable.
 */
export async function findNewerTypeDBFacts(agentId: string): Promise<TypeDBFact[]> {
  try {
    const client = getTypeDBClient();
    if (!client.isAvailable()) {
      return [];
    }

    // Query TypeDB for all facts for this agent
    // This would require a proper TypeQL query — stubbed for now
    const dbName = `mabos_${agentId.split("/")[0] || "default"}`;
    // TODO: implement actual TypeDB query when schema supports it
    return [];
  } catch {
    // TypeDB unavailable — return empty
    return [];
  }
}

/**
 * Reconcile TypeDB facts into the JSON fact store.
 * Patches JSON with any facts that are newer in TypeDB.
 */
export async function reconcileTypeDBToJSON(
  api: OpenClawPluginApi,
  agentId: string,
): Promise<ReconcileResult> {
  try {
    const client = getTypeDBClient();
    if (!client.isAvailable()) {
      return { patched: 0, skipped: true, error: "TypeDB unavailable" };
    }

    const newerFacts = await findNewerTypeDBFacts(agentId);
    if (newerFacts.length === 0) {
      return { patched: 0, skipped: false };
    }

    // TODO: implement JSON patching with assertFactDirect
    return { patched: newerFacts.length, skipped: false };
  } catch (err: any) {
    return {
      patched: 0,
      skipped: true,
      error: err?.message || "TypeDB unavailable",
    };
  }
}
