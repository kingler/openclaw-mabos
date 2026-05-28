/**
 * IRC research wrapper — a single interface over whatever research
 * backends are available, with a graceful analyst-only fallback. The
 * orchestrator depends only on this interface, never on a concrete tool,
 * so the pipeline is fully testable and never blocks on a missing backend.
 */

import type { ResearchSource } from "./types.js";

/**
 * A research backend. Each method is optional — when none are available,
 * `gatherResearch` returns analyst-only mode and the Stage 2 prompt runs
 * without live sources (the validator then requires `unverified: true`).
 */
export interface ResearchBackend {
  /** Generic web search returning cited sources. */
  webSearch?(query: string): Promise<ResearchSource[]>;
  /** Free-text market brief for a topic. */
  marketBrief?(topic: string): Promise<string>;
  /** Free-text competitor scan for a topic. */
  competitorScan?(topic: string): Promise<string>;
}

export interface GatherResult {
  raw: string;
  mode: "researched" | "analyst-only";
  errors: string[];
}

/** True when the backend exposes at least one usable research method. */
export function hasBackend(backend: ResearchBackend | undefined): boolean {
  return (
    !!backend &&
    (typeof backend.webSearch === "function" ||
      typeof backend.marketBrief === "function" ||
      typeof backend.competitorScan === "function")
  );
}

/**
 * Execute research for a set of questions. Per-query failures are
 * collected into `errors` and skipped — never thrown.
 */
export async function gatherResearch(params: {
  questions: string[];
  backend?: ResearchBackend;
  maxQueries: number;
}): Promise<GatherResult> {
  const { questions, backend, maxQueries } = params;
  const errors: string[] = [];

  if (!hasBackend(backend)) {
    return { raw: "", mode: "analyst-only", errors };
  }

  const chunks: string[] = [];
  const queries = questions.slice(0, Math.max(0, maxQueries));

  for (const q of queries) {
    try {
      if (backend!.webSearch) {
        const sources = await backend!.webSearch(q);
        if (sources.length > 0) {
          chunks.push(
            `Q: ${q}\nSources:\n${sources
              .map((s) => `- ${s.title} (${s.url}, retrieved ${s.retrieved_at})`)
              .join("\n")}`,
          );
        }
      }
      if (backend!.marketBrief) {
        const brief = await backend!.marketBrief(q);
        if (brief.trim()) chunks.push(`Q: ${q}\nBrief:\n${brief}`);
      }
    } catch (err) {
      errors.push(`Research query failed (${q}): ${err instanceof Error ? err.message : err}`);
    }
  }

  // A backend was present but produced nothing usable → still analyst-only.
  if (chunks.length === 0) {
    return { raw: "", mode: "analyst-only", errors };
  }

  return { raw: chunks.join("\n\n"), mode: "researched", errors };
}

/** Gather competitor-specific research, falling back silently. */
export async function gatherCompetitorResearch(params: {
  topic: string;
  backend?: ResearchBackend;
}): Promise<{ raw: string; errors: string[] }> {
  const { topic, backend } = params;
  const errors: string[] = [];
  if (!backend?.competitorScan) return { raw: "", errors };
  try {
    return { raw: await backend.competitorScan(topic), errors };
  } catch (err) {
    errors.push(`Competitor scan failed: ${err instanceof Error ? err.message : err}`);
    return { raw: "", errors };
  }
}
