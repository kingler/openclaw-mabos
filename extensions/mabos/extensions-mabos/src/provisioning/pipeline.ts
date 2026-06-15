/**
 * Provisioning pipeline — the async orchestration a create request kicks off.
 * Composes the existing primitives in order and records progress on the job so
 * the harness can poll `/mabos/provision/jobs/:id`:
 *
 *   scaffold → gdc_bootstrap → cron_seed → deploy
 *
 * Each step updates its own JobStep. A failure marks the step + job failed and
 * the instance failed, but leaves the partially-scaffolded workspace in place
 * for inspection (decommission to remove it).
 */

import { enrichBusiness } from "../enrichment/service.js";
import { AssumptionStore } from "../enrichment/store.js";
import type { EffortLevel } from "../model-router/types.js";
import { runGdcBootstrap } from "./cognitive.js";
import { runDeploy } from "./deploy.js";
import { scaffoldInstance } from "./scaffold.js";
import type { ProvisioningStore } from "./store.js";
import type {
  DeploySpec,
  InstanceRecord,
  JobStep,
  LlmCallFactory,
  ProvisionRequest,
  ProvisioningJob,
} from "./types.js";

export interface PipelineDeps {
  store: ProvisioningStore;
  workspaceDir: string;
  makeCallLlm: LlmCallFactory;
  logger: { info: (m: string) => void; error: (m: string) => void };
}

/** Apply DeploySpec defaults (in-gateway, activate). Shared with the routes. */
export function resolveDeploy(req: Pick<ProvisionRequest, "deploy">): DeploySpec {
  return {
    target: req.deploy?.target ?? "in-gateway",
    provider: req.deploy?.provider,
    channels: req.deploy?.channels,
    activate: req.deploy?.activate ?? true,
    region: req.deploy?.region,
  };
}

async function step<T>(
  job: ProvisioningJob,
  store: ProvisioningStore,
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  const entry: JobStep = { name, status: "running", started_at: new Date().toISOString() };
  job.steps.push(entry);
  await store.saveJob(job);
  try {
    const out = await fn();
    entry.status = "succeeded";
    entry.finished_at = new Date().toISOString();
    await store.saveJob(job);
    return out;
  } catch (err) {
    entry.status = "failed";
    entry.detail = String(err instanceof Error ? err.message : err);
    entry.finished_at = new Date().toISOString();
    throw err;
  }
}

/**
 * Run the full pipeline. Mutates `job` and the instance record through the
 * store as it progresses. Resolves when finished (success or failure); does not
 * throw — failures are recorded on the job.
 */
export async function runProvisioningPipeline(
  deps: PipelineDeps,
  req: ProvisionRequest,
  job: ProvisioningJob,
  instance: InstanceRecord,
): Promise<void> {
  const { store, workspaceDir, makeCallLlm, logger } = deps;
  const deploy = resolveDeploy(req);

  // Build the LLM caller from the request's effort/model; accumulate token cost.
  const effort = (req.effort ?? "medium") as EffortLevel;
  let costUsd = 0;
  const callLlm = makeCallLlm({
    effort,
    model: req.model,
    onUsage: ({ costUsd: c }) => {
      costUsd += c;
    },
  });
  instance.effort = effort;

  job.status = "running";
  await store.saveJob(job);

  let enrichCost = 0;

  try {
    // 1. Scaffold the workspace skeleton.
    const scaffold = await step(job, store, "scaffold", () => scaffoldInstance(workspaceDir, req));
    instance.agents = scaffold.agents;
    await store.saveInstance(instance);

    // 1.5 Enrich the CompanyDNA with smart-default assumptions (default on).
    //     Mutates req.company_dna in-memory so GDC (step 2) consumes the enriched DNA.
    if (req.enrich !== false) {
      const enriched = await step(job, store, "enrich", () =>
        enrichBusiness({
          workspaceDir,
          store: new AssumptionStore(workspaceDir),
          makeCallLlm,
          businessId: req.business_id,
          companyDNA: req.company_dna,
          trigger: "pipeline",
          effort,
          model: req.model,
        }),
      );
      req.company_dna = enriched.enrichedDNA;
      enrichCost = enriched.record.cost_usd;
    }

    // 2. Run GDC to generate goals/plans/tasks and write cognitive state.
    const gdc = await step(job, store, "gdc_bootstrap", () =>
      runGdcBootstrap({
        workspaceDir,
        businessId: req.business_id,
        companyDNA: req.company_dna,
        toolInventory: req.tool_inventory ?? [],
        callLlm,
        maxStage: req.max_stage,
      }),
    );
    instance.agents = gdc.agents;
    instance.goals_count = gdc.result.stage1?.goals.length ?? 0;
    instance.cost_usd = Number((costUsd + enrichCost).toFixed(6));
    await store.saveInstance(instance);

    // 3. Seed an empty cron jobs file so CronBridge can pick the instance up.
    //    Don't clobber one a template may have scaffolded with seeded jobs.
    await step(job, store, "cron_seed", async () => {
      const { existsSync } = await import("node:fs");
      const { mkdir, writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const bizDir = join(workspaceDir, "businesses", req.business_id);
      const cronPath = join(bizDir, "cron-jobs.json");
      if (existsSync(cronPath)) return;
      await mkdir(bizDir, { recursive: true });
      await writeFile(cronPath, JSON.stringify([], null, 2), "utf-8");
    });

    // 4. Deploy to the resolved target.
    const outcome = await step(job, store, "deploy", () =>
      runDeploy({ businessDir: scaffold.businessDir, instanceId: req.business_id, deploy }),
    );

    instance.status =
      deploy.target === "in-gateway" && (deploy.activate ?? true) ? "active" : "provisioning";
    await store.saveInstance(instance);

    job.status = "succeeded";
    job.result = {
      deploy: outcome,
      goals_count: instance.goals_count,
      agents: instance.agents,
      effort,
      cost_usd: instance.cost_usd,
    };
    await store.saveJob(job);
    logger.info(
      `[mabos] provisioned instance '${req.business_id}' (${deploy.target}, effort=${effort}, cost=$${instance.cost_usd})`,
    );
  } catch (err) {
    const message = String(err instanceof Error ? err.message : err);
    job.status = "failed";
    job.error = message;
    await store.saveJob(job);
    instance.status = "failed";
    instance.error = message;
    await store.saveInstance(instance);
    logger.error(`[mabos] provisioning failed for '${req.business_id}': ${message}`);
  }
}
