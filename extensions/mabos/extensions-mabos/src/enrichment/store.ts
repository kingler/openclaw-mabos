/**
 * Append-only, versioned persistence for assumptions + enrichment records,
 * stored per business at `businesses/<id>/assumptions.json`. Existing
 * assumptions are never mutated in place except for status transitions, which
 * append to the assumption's `history[]`. This keeps the enrichment trail
 * auditable across continuous re-enrichment.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Assumption, AssumptionFile, AssumptionStatus, EnrichmentRecord } from "./types.js";

export class AssumptionStore {
  constructor(private readonly workspaceDir: string) {}

  private path(businessId: string): string {
    return join(this.workspaceDir, "businesses", businessId, "assumptions.json");
  }

  async load(businessId: string): Promise<AssumptionFile> {
    try {
      const raw = await readFile(this.path(businessId), "utf-8");
      const parsed = JSON.parse(raw) as Partial<AssumptionFile>;
      return {
        business_id: businessId,
        assumptions: parsed.assumptions ?? [],
        records: parsed.records ?? [],
        version: parsed.version ?? 0,
      };
    } catch {
      return { business_id: businessId, assumptions: [], records: [], version: 0 };
    }
  }

  private async save(file: AssumptionFile): Promise<void> {
    const path = this.path(file.business_id);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.${randomUUID().slice(0, 8)}.tmp`;
    await writeFile(tmp, JSON.stringify(file, null, 2), "utf-8");
    await rename(tmp, path);
  }

  /** Append new assumptions + the enrichment record; bumps version. */
  async append(
    businessId: string,
    assumptions: Assumption[],
    record: EnrichmentRecord,
  ): Promise<void> {
    const file = await this.load(businessId);
    file.assumptions.push(...assumptions);
    file.records.push(record);
    file.version += 1;
    await this.save(file);
  }

  async getById(businessId: string, id: string): Promise<Assumption | null> {
    const file = await this.load(businessId);
    return file.assumptions.find((a) => a.id === id) ?? null;
  }

  async listByStatus(businessId: string, status?: AssumptionStatus, field?: string) {
    const file = await this.load(businessId);
    return {
      version: file.version,
      assumptions: file.assumptions.filter(
        (a) => (!status || a.status === status) && (!field || a.field === field),
      ),
    };
  }

  async records(businessId: string): Promise<EnrichmentRecord[]> {
    return (await this.load(businessId)).records;
  }

  /** Transition an assumption's status, appending to history (never overwrites). */
  async updateStatus(
    businessId: string,
    id: string,
    patch: {
      status: AssumptionStatus;
      by: Assumption["source"];
      note?: string;
      confidence?: number;
      evidence?: Assumption["evidence"];
    },
  ): Promise<Assumption> {
    const file = await this.load(businessId);
    const a = file.assumptions.find((x) => x.id === id);
    if (!a) throw new Error(`Assumption '${id}' not found`);
    const now = new Date().toISOString();
    a.history.push({ from: a.status, to: patch.status, by: patch.by, at: now, note: patch.note });
    a.status = patch.status;
    if (patch.confidence !== undefined) a.confidence = patch.confidence;
    if (patch.evidence?.length) a.evidence.push(...patch.evidence);
    a.updated_at = now;
    file.version += 1;
    await this.save(file);
    return a;
  }
}
