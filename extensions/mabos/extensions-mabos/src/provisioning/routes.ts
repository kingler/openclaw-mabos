/**
 * REST surface for the provisioning control plane. A single prefix route under
 * `/mabos/provision` dispatches by method + path so a meta harness has one
 * authenticated, idempotent, pollable contract:
 *
 *   POST   /mabos/provision/instances            create (202 + jobId)
 *   GET    /mabos/provision/instances            list
 *   GET    /mabos/provision/instances/:id         detail
 *   DELETE /mabos/provision/instances/:id         decommission
 *   POST   /mabos/provision/instances/:id/deploy  (re)deploy / activate
 *   GET    /mabos/provision/jobs/:id              job status (poll)
 *   GET    /mabos/provision/manifest              capabilities
 *
 * Auth is `gateway`: the gateway enforces its bearer token before the handler
 * runs, matching the existing GDC routes.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { Value } from "@sinclair/typebox/value";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { LlmCallFn } from "../gdc/types.js";
import { runDeploy } from "./deploy.js";
import { runProvisioningPipeline } from "./pipeline.js";
import { CORE_ROLES } from "./scaffold.js";
import { ProvisioningStore } from "./store.js";
import { ProvisionRequestSchema } from "./types.js";
import type { InstanceRecord, ProvisionRequest } from "./types.js";

const PREFIX = "/mabos/provision";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

function sanitizeId(id: string): string | null {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id) ? id : null;
}

const CAPABILITY_MANIFEST = {
  api_version: "1",
  templates: ["base", "ecommerce", "saas", "consulting"],
  core_roles: [...CORE_ROLES],
  deploy_targets: ["in-gateway", "container", "cloud"],
  cloud_providers: ["fly", "render"],
  gdc_max_stage: 7,
  endpoints: [
    "POST /mabos/provision/instances",
    "GET /mabos/provision/instances",
    "GET /mabos/provision/instances/:id",
    "DELETE /mabos/provision/instances/:id",
    "POST /mabos/provision/instances/:id/deploy",
    "GET /mabos/provision/jobs/:id",
    "GET /mabos/provision/manifest",
  ],
};

export interface ProvisioningRoutesDeps {
  workspaceDir: string;
  callLlm: LlmCallFn;
  logger: { info: (m: string) => void; error: (m: string) => void };
}

export function registerProvisioningRoutes(
  api: OpenClawPluginApi,
  deps: ProvisioningRoutesDeps,
): void {
  const store = new ProvisioningStore(deps.workspaceDir);

  api.registerHttpRoute({
    path: PREFIX,
    match: "prefix",
    auth: "gateway",
    handler: async (req, res) => {
      const url = new URL(req.url || "/", "http://localhost");
      const path = url.pathname;
      const method = (req.method || "GET").toUpperCase();
      const rest = path.slice(PREFIX.length).replace(/\/$/, ""); // "", "/instances", "/jobs/x"

      try {
        // GET /manifest
        if (method === "GET" && rest === "/manifest") {
          return sendJson(res, 200, CAPABILITY_MANIFEST);
        }

        // GET /instances — list
        if (method === "GET" && rest === "/instances") {
          return sendJson(res, 200, { instances: await store.listInstances() });
        }

        // POST /instances — create
        if (method === "POST" && rest === "/instances") {
          return await handleCreate(req, res, store, deps);
        }

        // /instances/:id ... and /instances/:id/deploy
        const instMatch = rest.match(/^\/instances\/([^/]+)(\/deploy)?$/);
        if (instMatch) {
          const id = sanitizeId(decodeURIComponent(instMatch[1]));
          if (!id) return sendJson(res, 400, { error: "Invalid business_id" });
          const isDeploy = Boolean(instMatch[2]);

          if (method === "GET" && !isDeploy) {
            const inst = await store.getInstance(id);
            return inst
              ? sendJson(res, 200, inst)
              : sendJson(res, 404, { error: "Instance not found" });
          }
          if (method === "DELETE" && !isDeploy) {
            return await handleDecommission(res, store, deps.workspaceDir, id);
          }
          if (method === "POST" && isDeploy) {
            return await handleRedeploy(req, res, store, deps.workspaceDir, id);
          }
        }

        // GET /jobs/:id
        const jobMatch = rest.match(/^\/jobs\/([^/]+)$/);
        if (method === "GET" && jobMatch) {
          const job = await store.getJob(jobMatch[1]);
          return job ? sendJson(res, 200, job) : sendJson(res, 404, { error: "Job not found" });
        }

        return sendJson(res, 404, { error: "Not found" });
      } catch (err) {
        deps.logger.error(`[mabos] provision route error: ${String(err)}`);
        return sendJson(res, 500, { error: String(err) });
      }
    },
  });

  deps.logger.info("[mabos] provisioning control-plane registered (/mabos/provision/*)");
}

async function handleCreate(
  req: IncomingMessage,
  res: ServerResponse,
  store: ProvisioningStore,
  deps: ProvisioningRoutesDeps,
): Promise<void> {
  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  if (!Value.Check(ProvisionRequestSchema, body)) {
    const errors = [...Value.Errors(ProvisionRequestSchema, body)]
      .slice(0, 10)
      .map((e) => `${e.path}: ${e.message}`);
    return sendJson(res, 400, { error: "Validation failed", details: errors });
  }
  const req2 = body as ProvisionRequest;

  const id = sanitizeId(req2.business_id);
  if (!id) return sendJson(res, 400, { error: "Invalid business_id (a-zA-Z0-9_-, 1-64 chars)" });

  if (await store.getInstance(id)) {
    return sendJson(res, 409, { error: `Instance '${id}' already exists` });
  }

  const now = new Date().toISOString();
  const job = store.newJob(id);
  const instance: InstanceRecord = {
    id,
    name: req2.name,
    type: req2.company_dna.industry,
    template: req2.template ?? "base",
    status: "provisioning",
    deploy: {
      target: req2.deploy?.target ?? "in-gateway",
      provider: req2.deploy?.provider,
      channels: req2.deploy?.channels,
      activate: req2.deploy?.activate ?? true,
      region: req2.deploy?.region,
    },
    agents: [],
    job_id: job.id,
    created_at: now,
    updated_at: now,
  };
  await store.saveInstance(instance);
  await store.saveJob(job);

  // Run the pipeline in the background; the harness polls the job.
  void runProvisioningPipeline(
    { store, workspaceDir: deps.workspaceDir, callLlm: deps.callLlm, logger: deps.logger },
    req2,
    job,
    instance,
  );

  return sendJson(res, 202, {
    instance_id: id,
    job_id: job.id,
    status: "queued",
    poll: `/mabos/provision/jobs/${job.id}`,
  });
}

async function handleDecommission(
  res: ServerResponse,
  store: ProvisioningStore,
  workspaceDir: string,
  id: string,
): Promise<void> {
  const inst = await store.getInstance(id);
  if (!inst) return sendJson(res, 404, { error: "Instance not found" });

  // Archive the workspace rather than hard-deleting (reversible).
  const { rename, mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { existsSync } = await import("node:fs");
  const src = join(workspaceDir, "businesses", id);
  if (existsSync(src)) {
    const archiveDir = join(workspaceDir, "provisioning", "archive");
    await mkdir(archiveDir, { recursive: true });
    await rename(src, join(archiveDir, `${id}-${Date.now()}`));
  }
  inst.status = "decommissioned";
  await store.saveInstance(inst);
  return sendJson(res, 200, { ok: true, instance_id: id, status: "decommissioned" });
}

async function handleRedeploy(
  req: IncomingMessage,
  res: ServerResponse,
  store: ProvisioningStore,
  workspaceDir: string,
  id: string,
): Promise<void> {
  const inst = await store.getInstance(id);
  if (!inst) return sendJson(res, 404, { error: "Instance not found" });

  let body: Record<string, unknown> = {};
  try {
    body = (await readBody(req)) as Record<string, unknown>;
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  const deploy = { ...inst.deploy, ...(body as Partial<typeof inst.deploy>) };
  const { join } = await import("node:path");
  const outcome = await runDeploy({
    businessDir: join(workspaceDir, "businesses", id),
    instanceId: id,
    deploy,
  });

  inst.deploy = deploy;
  inst.status =
    deploy.target === "in-gateway" && (deploy.activate ?? true) ? "active" : inst.status;
  await store.saveInstance(inst);
  return sendJson(res, 200, { ok: true, instance_id: id, deploy: outcome });
}
