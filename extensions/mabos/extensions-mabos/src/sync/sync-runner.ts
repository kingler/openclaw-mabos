/**
 * Sync Runner — generic framework for direct API → Fact Store sync.
 *
 * Each adapter fetches data from an external API and maps it to SPO triples.
 * The runner calls assertFactDirect for each triple, bypassing any LLM.
 */
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import {
  assertFactDirect,
  type DirectFactParams,
  type DirectFactResult,
} from "../tools/fact-store.js";

export type SyncTriple = {
  agent_id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string;
  valid_from?: string;
  valid_until?: string;
};

export interface SyncAdapter {
  name: string;
  /** Returns true if required credentials/config are available. */
  isConfigured(): boolean;
  /** Fetch data and map to SPO triples. */
  fetchTriples(): Promise<SyncTriple[]>;
}

export type SyncRunResult = {
  adapter: string;
  results: DirectFactResult[];
  skipped: boolean;
  error?: string;
};

/**
 * Run a sync adapter: fetch triples and assert each into the fact store.
 */
export async function runSync(
  api: OpenClawPluginApi,
  adapter: SyncAdapter,
): Promise<SyncRunResult> {
  if (!adapter.isConfigured()) {
    return { adapter: adapter.name, results: [], skipped: true, error: "Not configured" };
  }

  try {
    const triples = await adapter.fetchTriples();
    const results: DirectFactResult[] = [];

    for (const triple of triples) {
      const params: DirectFactParams = {
        agent_id: triple.agent_id,
        subject: triple.subject,
        predicate: triple.predicate,
        object: triple.object,
        confidence: triple.confidence,
        source: triple.source,
        valid_from: triple.valid_from,
        valid_until: triple.valid_until,
      };
      const result = await assertFactDirect(api, params);
      results.push(result);
    }

    return { adapter: adapter.name, results, skipped: false };
  } catch (err: any) {
    return {
      adapter: adapter.name,
      results: [],
      skipped: false,
      error: err?.message || String(err),
    };
  }
}
