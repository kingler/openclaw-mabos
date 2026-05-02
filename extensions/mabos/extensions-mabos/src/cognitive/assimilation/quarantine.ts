/**
 * Quarantine store — append-only JSONL log of LlmActions that failed
 * lift, bind, or validate. Read by the Reflector loop (separate plan)
 * and surfaced to humans for review.
 *
 * Per-tenant isolation is the caller's responsibility (path is the
 * tenancy boundary).
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { QuarantineEntry } from "./types.js";

export class QuarantineStore {
  constructor(private path: string) {}

  async append(entry: QuarantineEntry): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, JSON.stringify(entry) + "\n", "utf-8");
  }

  async appendAll(entries: QuarantineEntry[]): Promise<void> {
    if (entries.length === 0) return;
    await mkdir(dirname(this.path), { recursive: true });
    const payload = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await appendFile(this.path, payload, "utf-8");
  }
}
