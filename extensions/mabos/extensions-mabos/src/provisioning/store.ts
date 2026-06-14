/**
 * JSON-file persistence for provisioning instances and jobs. Records live under
 * `<workspace>/provisioning/{instances,jobs}/` so they survive gateway restarts
 * and are visible to the dashboard. Writes are atomic (temp file + rename) to
 * avoid torn reads while a job updates its step state concurrently.
 */

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { InstanceRecord, ProvisioningJob } from "./types.js";

export class ProvisioningStore {
  private readonly root: string;

  constructor(workspaceDir: string) {
    this.root = join(workspaceDir, "provisioning");
  }

  private instancesDir() {
    return join(this.root, "instances");
  }

  private jobsDir() {
    return join(this.root, "jobs");
  }

  private async writeAtomic(path: string, data: unknown): Promise<void> {
    await mkdir(join(path, ".."), { recursive: true });
    const tmp = `${path}.${randomUUID().slice(0, 8)}.tmp`;
    await writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
    await rename(tmp, path);
  }

  private async readJson<T>(path: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(path, "utf-8")) as T;
    } catch {
      return null;
    }
  }

  // ── Instances ──────────────────────────────────────────────────────────

  async getInstance(id: string): Promise<InstanceRecord | null> {
    return this.readJson<InstanceRecord>(join(this.instancesDir(), `${id}.json`));
  }

  async saveInstance(record: InstanceRecord): Promise<void> {
    record.updated_at = new Date().toISOString();
    await this.writeAtomic(join(this.instancesDir(), `${record.id}.json`), record);
  }

  async listInstances(): Promise<InstanceRecord[]> {
    const dir = this.instancesDir();
    const entries = await readdir(dir).catch(() => [] as string[]);
    const out: InstanceRecord[] = [];
    for (const f of entries) {
      if (!f.endsWith(".json")) continue;
      const rec = await this.readJson<InstanceRecord>(join(dir, f));
      if (rec) out.push(rec);
    }
    return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  // ── Jobs ───────────────────────────────────────────────────────────────

  newJob(instanceId: string): ProvisioningJob {
    const now = new Date().toISOString();
    return {
      id: `job-${randomUUID().slice(0, 12)}`,
      instance_id: instanceId,
      status: "queued",
      steps: [],
      created_at: now,
      updated_at: now,
    };
  }

  async getJob(id: string): Promise<ProvisioningJob | null> {
    return this.readJson<ProvisioningJob>(join(this.jobsDir(), `${id}.json`));
  }

  async saveJob(job: ProvisioningJob): Promise<void> {
    job.updated_at = new Date().toISOString();
    await this.writeAtomic(join(this.jobsDir(), `${job.id}.json`), job);
  }
}
