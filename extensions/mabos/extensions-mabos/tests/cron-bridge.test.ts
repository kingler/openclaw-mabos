import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, assert, describe, it } from "vitest";
import { CronBridge } from "../src/cron-bridge.js";

let workspaceDir: string | null = null;

async function writeCronJobs(businessId: string, jobs: unknown[]) {
  if (!workspaceDir) throw new Error("workspace not initialized");
  const businessDir = join(workspaceDir, "businesses", businessId);
  await mkdir(businessDir, { recursive: true });
  await writeFile(join(businessDir, "cron-jobs.json"), JSON.stringify(jobs, null, 2), "utf-8");
}

async function readCronJobs(businessId: string) {
  if (!workspaceDir) throw new Error("workspace not initialized");
  const raw = await readFile(
    join(workspaceDir, "businesses", businessId, "cron-jobs.json"),
    "utf-8",
  );
  return JSON.parse(raw) as Array<{ parentCronId?: string }>;
}

describe("CronBridge", () => {
  afterEach(async () => {
    if (workspaceDir) {
      await rm(workspaceDir, { recursive: true, force: true });
      workspaceDir = null;
    }
  });

  it("rebinds stale parent cron ids by adding a replacement parent job", async () => {
    workspaceDir = join(tmpdir(), `mabos-cron-bridge-${randomUUID()}`);
    const businessId = "acme";
    await writeCronJobs(businessId, [
      {
        id: "job-1",
        name: "Daily workflow",
        schedule: "0 9 * * *",
        enabled: true,
        workflowId: "wf-1",
        parentCronId: "stale-parent",
      },
    ]);

    const calls: Array<{ method: string; params?: unknown }> = [];
    const bridge = new CronBridge({
      gatewayUrl: "ws://127.0.0.1:18789",
      workspaceDir,
      logger: { info: () => {}, warn: () => {} },
      rpcCall: async (method, params) => {
        calls.push({ method, params });
        if (method === "cron.update") {
          throw new Error("unknown cron job id: stale-parent");
        }
        if (method === "cron.add") {
          return { id: "replacement-parent", name: "Daily workflow", enabled: true };
        }
        if (method === "cron.list") {
          return {
            jobs: [
              { id: "replacement-parent", name: "[mabos:acme] Daily workflow", enabled: true },
            ],
          };
        }
        throw new Error(`unexpected RPC method: ${method}`);
      },
    });

    const result = await bridge.syncAll(businessId);
    const jobs = await readCronJobs(businessId);

    assert.deepEqual(result, { added: 1, updated: 0, removed: 0 });
    assert.equal(jobs[0].parentCronId, "replacement-parent");
    assert.deepEqual(
      calls.map((call) => call.method),
      ["cron.update", "cron.add", "cron.list"],
    );
  });
});
