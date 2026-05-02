/**
 * N-ary fact-store adapter.
 *
 * The legacy fact-store at src/tools/fact-store.ts stores binary
 * (subject, predicate, object) triples. SBVR fact types are n-ary; deontic
 * checks need count/aggregate over n-ary facts. This store is the canonical
 * SBVR-shaped fact backing for the assimilation pipeline.
 *
 * JSON-file persistence with hash-based dedupe. Per-tenant isolation is the
 * caller's responsibility (path is the tenancy boundary).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface NaryFact {
  id: string; // hash(factTypeId + sorted roles)
  factTypeId: string;
  roles: Record<string, string>;
  provenance: { run_id: string; ts: string; model?: string };
}

export interface NaryAssertion {
  factTypeId: string;
  roles: Record<string, string>;
  provenance: { run_id: string; ts: string; model?: string };
}

interface StoreShape {
  facts: NaryFact[];
  version: number;
}

function hash(factTypeId: string, roles: Record<string, string>): string {
  const sortedKeys = Object.keys(roles).sort();
  const tuple = sortedKeys.map((k) => `${k}=${roles[k]}`).join("|");
  return `${factTypeId}#${tuple}`;
}

export class NaryFactStore {
  constructor(private path: string) {}

  private async load(): Promise<StoreShape> {
    try {
      return JSON.parse(await readFile(this.path, "utf-8"));
    } catch {
      return { facts: [], version: 0 };
    }
  }

  private async save(s: StoreShape): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(s, null, 2), "utf-8");
  }

  async assertNary(a: NaryAssertion): Promise<{ id: string; action: "asserted" | "deduped" }> {
    const s = await this.load();
    const id = hash(a.factTypeId, a.roles);
    const existing = s.facts.findIndex((f) => f.id === id);
    if (existing !== -1) return { id, action: "deduped" };
    s.facts.push({
      id,
      factTypeId: a.factTypeId,
      roles: a.roles,
      provenance: a.provenance,
    });
    s.version++;
    await this.save(s);
    return { id, action: "asserted" };
  }

  async countNary(factTypeId: string, where: Partial<Record<string, string>>): Promise<number> {
    const s = await this.load();
    return s.facts.filter(
      (f) =>
        f.factTypeId === factTypeId && Object.entries(where).every(([k, v]) => f.roles[k] === v),
    ).length;
  }

  async queryNary(factTypeId: string, where: Partial<Record<string, string>>): Promise<NaryFact[]> {
    const s = await this.load();
    return s.facts.filter(
      (f) =>
        f.factTypeId === factTypeId && Object.entries(where).every(([k, v]) => f.roles[k] === v),
    );
  }
}
