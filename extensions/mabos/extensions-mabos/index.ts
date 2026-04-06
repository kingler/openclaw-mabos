/**
 * MABOS — Multi-Agent Business Operating System
 * Bundled Extension Entry Point (Deep Integration)
 *
 * Registers:
 *  - 110 tools across 24 modules
 *  - BDI background heartbeat service
 *  - CLI subcommands (onboard, agents, bdi, business, dashboard)
 *  - Unified memory bridge to native memory system
 *  - Agent lifecycle hooks (Persona injection, BDI audit trail)
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

// ── Core imports shim ──────────────────────────────────────────────
// These utilities live in the openclaw core repo and are not re-exported
// from plugin-sdk. We resolve them lazily via dynamic import so the
// plugin works both in-repo (relative paths) and when installed to
// ~/.openclaw/extensions/mabos/ (where relative paths don't reach core).
//
// Resolution order: monorepo-relative path first (fast in dev), then
// the installed location which is 1 level shallower.

type ResolvedGatewayAuth = { mode: string; [key: string]: unknown };
type AgentEventPayload = {
  type: string;
  stream?: string;
  sessionKey?: string;
  runId?: string;
  data?: any;
  [key: string]: unknown;
};

async function importCore(modPath: string): Promise<any> {
  // In-repo: extensions/mabos/extensions-mabos/index.ts → ../../../src/
  // Installed: ~/.openclaw/extensions/mabos/index.ts → resolve via process.cwd() or require.resolve
  const candidates = [
    `../../../src/${modPath}`,
    `../../../../src/${modPath}`,
    `../../src/${modPath}`,
  ];
  for (const candidate of candidates) {
    try {
      return await import(/* @vite-ignore */ candidate);
    } catch {
      // try next
    }
  }
  // Fallback: the gateway process runs from the monorepo root, so use process.cwd()
  const { join } = await import("node:path");
  const cwdPath = join(process.cwd(), "src", modPath);
  try {
    return await import(/* @vite-ignore */ cwdPath);
  } catch {
    // noop
  }
  // Last resort: try require.resolve to find the openclaw package
  try {
    const { createRequire } = await import("node:module");
    const require2 = createRequire(import.meta.url ?? __filename);
    const pkgRoot = require2
      .resolve("openclaw/plugin-sdk")
      .replace(/[/\\]dist[/\\]plugin-sdk[/\\].*$/, "");
    const resolved = join(pkgRoot, "src", modPath);
    return await import(/* @vite-ignore */ resolved);
  } catch {
    // noop
  }
  throw new Error(`Cannot resolve core module: src/${modPath}`);
}

let _coreModules: {
  createAuthRateLimiter: (config?: any) => any;
  resolveGatewayAuth: (params: any) => ResolvedGatewayAuth;
  authorizeGatewayBearerRequestOrReply: (params: any) => Promise<boolean>;
  onAgentEvent: (listener: (evt: AgentEventPayload) => void) => () => void;
  readJsonBodyWithLimit: (req: any, opts: any) => Promise<any>;
} | null = null;

async function getCoreModules() {
  if (_coreModules) return _coreModules;
  const [authRateLimit, gatewayAuth, httpAuthHelpers, agentEvents, httpBody] = await Promise.all([
    importCore("gateway/auth-rate-limit.js"),
    importCore("gateway/auth.js"),
    importCore("gateway/http-auth-helpers.js"),
    importCore("infra/agent-events.js"),
    importCore("infra/http-body.js"),
  ]);
  _coreModules = {
    createAuthRateLimiter: authRateLimit.createAuthRateLimiter,
    resolveGatewayAuth: gatewayAuth.resolveGatewayAuth,
    authorizeGatewayBearerRequestOrReply: httpAuthHelpers.authorizeGatewayBearerRequestOrReply,
    onAgentEvent: agentEvents.onAgentEvent,
    readJsonBodyWithLimit: httpBody.readJsonBodyWithLimit,
  };
  return _coreModules;
}
// ── End core imports shim ──────────────────────────────────────────
import { createCronBridgeService } from "./src/cron-bridge.js";
import { registerExecutionSandbox } from "./src/execution-sandbox/index.js";
import { writeCognitiveState } from "./src/gdc/cognitive-writer.js";
import { generateDomainAgents } from "./src/gdc/domain-agent-generator.js";
import { registerGdc } from "./src/gdc/index.js";
import { GdcOrchestrator } from "./src/gdc/orchestrator.js";
import { generatePersonaBatch } from "./src/gdc/persona-generator.js";
import type { CompanyDNA, LlmCallFn } from "./src/gdc/types.js";
// Unified MABOS modules (Paperclip + Hermes integration)
import { registerGovernance } from "./src/governance/index.js";
import { registerModelRouter } from "./src/model-router/index.js";
import { createSecurityModule } from "./src/security/index.js";
import { registerSessionIntel } from "./src/session-intel/index.js";
import { registerSkillLoop } from "./src/skill-loop/index.js";
import { createBdiTools } from "./src/tools/bdi-tools.js";
import { createBpmnMigrateTools } from "./src/tools/bpmn-migrate.js";
import { createBusinessTools } from "./src/tools/business-tools.js";
import { createCapabilitiesSyncTools } from "./src/tools/capabilities-sync.js";
import { createCatalogSyncTools } from "./src/tools/catalog-sync-tools.js";
import { createCbrTools } from "./src/tools/cbr-tools.js";
import {
  createCognitiveRouterTools,
  enhancedHeartbeatCycle,
} from "./src/tools/cognitive-router.js";
import { resolveWorkspaceDir, getPluginConfig, httpRequest } from "./src/tools/common.js";
import { createCommunicationTools } from "./src/tools/communication-tools.js";
import { createCompetitorMonitorTools } from "./src/tools/competitor-monitor-tools.js";
import { createCrmTools } from "./src/tools/crm-tools.js";
import { createDesireTools } from "./src/tools/desire-tools.js";
import { createEmailTools } from "./src/tools/email-tools.js";
import { createFactStoreTools } from "./src/tools/fact-store.js";
import { createFinancialTools } from "./src/tools/financial-tools.js";
import { createInferenceTools } from "./src/tools/inference-tools.js";
import { createIntegrationTools } from "./src/tools/integration-tools.js";
import { createKnowledgeTools } from "./src/tools/knowledge-tools.js";
import { createLeInventoryTools } from "./src/tools/le-inventory-tools.js";
import { createLeWaitlistTools } from "./src/tools/le-waitlist-tools.js";
import { createLeadGenerationTools } from "./src/tools/lead-generation-tools.js";
import { createMarketingTools } from "./src/tools/marketing-tools.js";
import { createMemoryHierarchyTools } from "./src/tools/memory-hierarchy.js";
import { createMemoryTools } from "./src/tools/memory-tools.js";
import { createMetricsTools } from "./src/tools/metrics-tools.js";
import { createOnboardingTools } from "./src/tools/onboarding-tools.js";
import { createOntologyManagementTools } from "./src/tools/ontology-management-tools.js";
import { createOperationsTools } from "./src/tools/operations-tools.js";
import { createOutreachTools } from "./src/tools/outreach-tools.js";
import { createPlanningTools } from "./src/tools/planning-tools.js";
import { createReasoningTools } from "./src/tools/reasoning-tools.js";
import { createReportingTools } from "./src/tools/reporting-tools.js";
import { createRuleEngineTools } from "./src/tools/rule-engine.js";
import { createSalesResearchTools } from "./src/tools/sales-research-tools.js";
import { createSeoAnalyticsTools } from "./src/tools/seo-analytics-tools.js";
import { createSetupWizardTools } from "./src/tools/setup-wizard-tools.js";
import { createStakeholderTools } from "./src/tools/stakeholder-tools.js";
import { createTechOpsTools } from "./src/tools/techops-tools.js";
import { isToolAllowedForRole } from "./src/tools/tool-filter.js";
import { createTypeDBTools } from "./src/tools/typedb-tools.js";
import { createWorkflowTools } from "./src/tools/workflow-tools.js";
import { createWorkforceTools } from "./src/tools/workforce-tools.js";

// Use a variable for the bdi-runtime path so TypeScript doesn't try to
// statically resolve it (it lives outside this extension's rootDir).
const BDI_RUNTIME_PATH = "../../../mabos/bdi-runtime/index.js";

export default function register(api: OpenClawPluginApi) {
  const log = api.logger;

  // ── 1. Register all tools ─────────────────────────────────────
  const factories = [
    createBdiTools,
    createPlanningTools,
    createCbrTools,
    createKnowledgeTools,
    createReasoningTools,
    createCommunicationTools,
    createBusinessTools,
    createMetricsTools,
    createDesireTools,
    createFactStoreTools,
    createInferenceTools,
    createRuleEngineTools,
    createMemoryTools,
    createMemoryHierarchyTools,
    createOnboardingTools,
    createStakeholderTools,
    createWorkforceTools,
    createIntegrationTools,
    createReportingTools,
    createMarketingTools,
    createCrmTools,
    createEmailTools,
    createSeoAnalyticsTools,
    createOntologyManagementTools,
    createSetupWizardTools,
    createTypeDBTools,
    createWorkflowTools,
    createBpmnMigrateTools,
    createCognitiveRouterTools,
    createLeadGenerationTools,
    createSalesResearchTools,
    createOutreachTools,
    createFinancialTools,
    createOperationsTools,
    createTechOpsTools,
    createCatalogSyncTools,
    createLeWaitlistTools,
    createLeInventoryTools,
    createCompetitorMonitorTools,
  ];

  // Collect all tool names for capabilities_sync context
  const registeredToolNames: string[] = [];

  for (const factory of factories) {
    const tools = factory(api);
    for (const tool of tools) {
      api.registerTool(tool);
      registeredToolNames.push(tool.name);
    }
  }

  // Register capabilities_sync (needs the tool name list)
  const capSyncTools = createCapabilitiesSyncTools(api, { registeredToolNames });
  for (const tool of capSyncTools) {
    api.registerTool(tool);
    registeredToolNames.push(tool.name);
  }

  // Export tool filter for per-agent scoping (used by cognitive router)
  // Agents can check `isToolAllowedForRole(role, toolName)` at runtime
  (api as any)._mabosToolFilter = { isToolAllowedForRole, registeredToolNames };

  // ── 2. BDI Background Service ─────────────────────────────────
  const workspaceDir = resolveWorkspaceDir(api);

  // Resolve gateway auth for MABOS HTTP routes (lazy — resolved on first request)
  let resolvedAuth: ResolvedGatewayAuth | null = null;
  let authRateLimiter: any = undefined;

  async function ensureAuthInit() {
    if (resolvedAuth) return;
    try {
      const core = await getCoreModules();
      const gatewayAuthConfig = (api as any).config?.gateway?.auth ?? {};
      resolvedAuth = core.resolveGatewayAuth({ authConfig: gatewayAuthConfig });
      authRateLimiter =
        resolvedAuth!.mode !== "none"
          ? core.createAuthRateLimiter({
              maxAttempts: 10,
              windowMs: 60_000,
              lockoutMs: 300_000,
            })
          : undefined;
    } catch (err) {
      log.debug(`[mabos] Core auth modules unavailable, using permissive auth: ${err}`);
      resolvedAuth = { mode: "none" };
    }
  }

  async function requireAuth(
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
  ): Promise<boolean> {
    await ensureAuthInit();
    // Skip auth if gateway is in "none" mode
    if (resolvedAuth!.mode === "none") return true;
    // Skip auth for requests originating from the MABOS dashboard UI
    const referer = req.headers.referer || req.headers.origin || "";
    if (referer.includes("/mabos/dashboard")) return true;
    try {
      const core = await getCoreModules();
      return core.authorizeGatewayBearerRequestOrReply({
        req,
        res,
        auth: resolvedAuth,
        rateLimiter: authRateLimiter,
      });
    } catch {
      return true; // Permissive fallback if core modules unavailable
    }
  }
  async function readMabosJsonBody<T = Record<string, unknown>>(
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
    opts?: { maxBytes?: number },
  ): Promise<T | null> {
    let result: any;
    try {
      const core = await getCoreModules();
      result = await core.readJsonBodyWithLimit(req, {
        maxBytes: opts?.maxBytes ?? 1_048_576,
        timeoutMs: 10_000,
      });
    } catch {
      // Fallback: simple body read when core modules unavailable
      const chunks: Buffer[] = [];
      for await (const chunk of req)
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const raw = Buffer.concat(chunks).toString("utf-8");
      try {
        return JSON.parse(raw) as T;
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid JSON body" }));
        return null;
      }
    }
    if (!result.ok) {
      const statusCode = result.code === "PAYLOAD_TOO_LARGE" ? 413 : 400;
      const message =
        result.code === "PAYLOAD_TOO_LARGE" ? "Request body too large" : "Invalid JSON body";
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: message }));
      return null;
    }
    return result.value as T;
  }

  const bdiIntervalMinutes = getPluginConfig(api).bdiCycleIntervalMinutes ?? 30;

  // Dynamic import to avoid bundling issues — the bdi-runtime
  // lives in mabos/ which is outside the extension directory.
  // For now, inline a minimal service; the full runtime in
  // mabos/bdi-runtime/ is used by the CLI commands.
  let bdiInterval: ReturnType<typeof setInterval> | null = null;

  api.registerService({
    id: "mabos-bdi-heartbeat",
    start: async () => {
      api.logger.info(`[mabos-bdi] Heartbeat started (interval: ${bdiIntervalMinutes}min)`);

      // Initialize TypeDB connection (lazy, non-blocking)
      import("./src/knowledge/typedb-client.js")
        .then(({ getTypeDBClient }) => {
          const client = getTypeDBClient();
          client
            .connect()
            .then(async (ok) => {
              if (ok) {
                api.logger.info("[mabos] TypeDB connected");
                // Seed campaign data if none exists
                try {
                  // Ensure campaign schema exists in TypeDB (add incrementally)
                  try {
                    // Add campaign-id attribute and channel attribute if missing
                    await client
                      .defineSchema(
                        `define attribute campaign_id, value string; attribute channel, value string;`,
                        "mabos",
                      )
                      .catch(() => {});
                    // Add campaign entity
                    await client
                      .defineSchema(
                        `define entity campaign, owns campaign_id @key, owns name, owns status, owns channel, owns description, owns category;`,
                        "mabos",
                      )
                      .catch(() => {});
                  } catch {
                    /* schema may already exist */
                  }

                  const res = await client.matchQuery(
                    `match $c isa campaign, has campaign_id $cid;`,
                    "mabos",
                  );
                  const hasData =
                    res?.answerType === "conceptRows" && (res.answers?.length ?? 0) > 0;
                  if (!hasData) {
                    const campaigns = [
                      {
                        id: "MC-001",
                        name: "Spring Collection Launch",
                        status: "active",
                        channel: "instagram",
                      },
                      {
                        id: "MC-002",
                        name: "Home Office Refresh",
                        status: "active",
                        channel: "google-ads",
                      },
                      {
                        id: "MC-003",
                        name: "Earth Day Eco Collection",
                        status: "draft",
                        channel: "email",
                      },
                      {
                        id: "MC-004",
                        name: "Influencer Collab Q1",
                        status: "completed",
                        channel: "tiktok",
                      },
                      {
                        id: "MC-005",
                        name: "Summer Sale 2026",
                        status: "active",
                        channel: "meta-ads",
                      },
                      {
                        id: "MC-006",
                        name: "Pinterest SEO Push",
                        status: "active",
                        channel: "pinterest",
                      },
                      {
                        id: "MC-007",
                        name: "Email Win-Back Series",
                        status: "active",
                        channel: "email",
                      },
                      {
                        id: "MC-008",
                        name: "Brand Awareness — YouTube",
                        status: "paused",
                        channel: "youtube",
                      },
                      {
                        id: "MC-009",
                        name: "Referral Program Launch",
                        status: "draft",
                        channel: "multi-channel",
                      },
                      {
                        id: "MC-010",
                        name: "Holiday Gift Guide",
                        status: "draft",
                        channel: "email",
                      },
                    ];
                    for (const c of campaigns) {
                      try {
                        await client.insertData(
                          `insert $c isa campaign, has campaign_id "${c.id}", has name "${c.name}", has status "${c.status}", has channel "${c.channel}";`,
                          "mabos",
                        );
                      } catch {
                        /* non-blocking */
                      }
                    }
                    // Assign campaigns to CMO agent if it exists
                    try {
                      await client.matchQuery(`match $a isa agent, has name $n; get $n;`, "mabos");
                      for (const c of campaigns) {
                        try {
                          await client
                            .insertData(
                              `match $a isa agent, has role_title "cmo"; $c isa campaign, has campaign_id "${c.id}"; insert (assignee: $a, work-item: $c) isa assigned-to;`,
                              "mabos",
                            )
                            .catch(() => {});
                        } catch {
                          /* no CMO agent or already assigned */
                        }
                      }
                    } catch {
                      /* no agents yet */
                    }
                    api.logger.info(`[mabos] Seeded ${campaigns.length} campaigns into TypeDB`);
                  } else {
                    api.logger.info(
                      `[mabos] ${res?.answers?.length ?? 0} campaigns already in TypeDB`,
                    );
                  }
                } catch (err) {
                  api.logger.warn(`[mabos] Campaign seed failed: ${err}`);
                }
              }
            })
            .catch((err) => {
              log.debug(`TypeDB connect failed: ${err}`);
            });
        })
        .catch((err) => {
          log.debug(`TypeDB import failed: ${err}`);
        });

      const cognitiveRouterEnabled = getPluginConfig(api).cognitiveRouterEnabled ?? true;

      const runLegacyCycle = async () => {
        try {
          const { discoverAgents, readAgentCognitiveState, runMaintenanceCycle } =
            (await Promise.race([
              import(/* webpackIgnore: true */ BDI_RUNTIME_PATH),
              new Promise<never>((_, r) =>
                setTimeout(() => r(new Error("BDI import timeout")), 5000),
              ),
            ])) as import("./src/types/bdi-runtime.js").BdiRuntime;
          const agents = await discoverAgents(workspaceDir);
          for (const agentId of agents) {
            const { join } = await import("node:path");
            const agentDir = join(workspaceDir, "agents", agentId);
            const state = await readAgentCognitiveState(agentDir, agentId);
            const cycleResult = await runMaintenanceCycle(state);

            // Fire-and-forget: write BDI cycle results to TypeDB
            import("./src/knowledge/typedb-dashboard.js")
              .then(({ writeBdiCycleResultToTypeDB }) =>
                writeBdiCycleResultToTypeDB(agentId, "mabos", {
                  newIntentions: cycleResult?.newIntentions,
                  newBeliefs: cycleResult?.newBeliefs,
                  updatedGoals: cycleResult?.updatedGoals,
                }),
              )
              .catch((err) => {
                log.debug(`TypeDB BDI write failed: ${err}`);
              });
          }
        } catch (err) {
          api.logger.warn?.(
            `[mabos-bdi] Cycle error: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      };

      const runCycle = cognitiveRouterEnabled
        ? async () => {
            try {
              await enhancedHeartbeatCycle(workspaceDir, api, {
                info: (...args: any[]) => api.logger.info?.(...args),
                debug: (...args: any[]) => log.debug?.(...args),
                warn: (...args: any[]) => api.logger.warn?.(...args),
              });
            } catch (err) {
              api.logger.warn?.(
                `[cognitive-router] Cycle error, falling back to legacy: ${err instanceof Error ? err.message : String(err)}`,
              );
              await runLegacyCycle();
            }
          }
        : runLegacyCycle;

      // Initial cycle
      await runCycle();

      // Periodic cycles
      bdiInterval = setInterval(
        () => {
          runCycle().catch((err) => {
            log.debug(`BDI periodic cycle failed: ${err}`);
          });
        },
        bdiIntervalMinutes * 60 * 1000,
      );
      bdiInterval.unref?.();
    },
    stop: async () => {
      if (bdiInterval) {
        clearInterval(bdiInterval);
        bdiInterval = null;
      }
      // Close TypeDB connection
      try {
        const { getTypeDBClient } =
          process.env.TYPEDB_SKIP === "1"
            ? ({
                getTypeDBClient: () => ({ isAvailable: () => false, connect: async () => false }),
              } as any)
            : await import("./src/knowledge/typedb-client.js");
        const client = getTypeDBClient();
        if (client.isAvailable()) {
          await client.close();
        }
      } catch {
        // TypeDB may not be configured — ignore
      }

      authRateLimiter?.dispose();
      api.logger.info("[mabos-bdi] Heartbeat stopped");
    },
  });

  // ── 2b. Cron Bridge Service ──────────────────────────────────
  api.registerService(createCronBridgeService(api));

  // ── 3. CLI Subcommands ────────────────────────────────────────
  api.registerCli(
    ({ program }) => {
      const mabos = program
        .command("mabos")
        .description("MABOS — Multi-Agent Business Operating System");

      // --- mabos onboard ---
      mabos
        .command("onboard")
        .description("Interactive 5-phase business onboarding")
        .argument("[business-name]", "Name of the business to onboard")
        .option("--industry <type>", "Industry vertical (e.g., ecommerce, saas)")
        .action(async (businessName: string | undefined, opts: { industry?: string }) => {
          const { createOnboardingTools } = await import("./src/tools/onboarding-tools.js");
          const tools = createOnboardingTools(api);
          const orchestrateTool = tools.find((t: any) => t.name === "onboarding_orchestrate");

          if (!orchestrateTool && businessName) {
            log.info(`Starting onboarding for: ${businessName}`);
            log.info("Use the MABOS agent tools for full interactive onboarding.");
            return;
          }

          if (businessName && orchestrateTool) {
            log.info(`Onboarding "${businessName}" (${opts.industry ?? "general"})...`);
            try {
              const result = await (orchestrateTool as any).execute("cli", {
                business_name: businessName,
                industry: opts.industry ?? "general",
              });
              log.info(JSON.stringify(result, null, 2));
            } catch (err) {
              log.error(`Onboarding error: ${err instanceof Error ? err.message : String(err)}`);
            }
          } else {
            log.info("Usage: mabos onboard <business-name> [--industry <type>]");
            log.info("Industries: ecommerce, saas, consulting, marketplace, retail");
          }
        });

      // --- mabos agents ---
      mabos
        .command("agents")
        .description("List BDI agents with cognitive state summary")
        .action(async () => {
          try {
            const { getAgentsSummary } = (await Promise.race([
              import(/* webpackIgnore: true */ BDI_RUNTIME_PATH),
              new Promise<never>((_, r) =>
                setTimeout(() => r(new Error("BDI import timeout")), 5000),
              ),
            ])) as any;
            const summaries = await getAgentsSummary(workspaceDir);

            if (summaries.length === 0) {
              log.info("No MABOS agents found. Run 'mabos onboard' to create a business.");
              return;
            }

            log.info("\nMABOS Agents\n" + "=".repeat(70));
            log.info(
              "Agent".padEnd(15) +
                "Beliefs".padEnd(10) +
                "Goals".padEnd(10) +
                "Intentions".padEnd(12) +
                "Desires".padEnd(10),
            );
            log.info("-".repeat(70));

            for (const s of summaries) {
              log.info(
                s.agentId.padEnd(15) +
                  String(s.beliefCount).padEnd(10) +
                  String(s.goalCount).padEnd(10) +
                  String(s.intentionCount).padEnd(12) +
                  String(s.desireCount).padEnd(10),
              );
            }
            log.info(`\nTotal: ${summaries.length} agents`);
          } catch (err) {
            log.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
          }
        });

      // --- mabos bdi cycle <agent> ---
      mabos
        .command("bdi")
        .description("BDI cognitive operations")
        .command("cycle")
        .argument("<agent-id>", "Agent to run BDI cycle for")
        .description("Trigger a BDI maintenance cycle for an agent")
        .action(async (agentId: string) => {
          try {
            const { join } = await import("node:path");
            const { readAgentCognitiveState, runMaintenanceCycle } = (await Promise.race([
              import(/* webpackIgnore: true */ BDI_RUNTIME_PATH),
              new Promise<never>((_, r) =>
                setTimeout(() => r(new Error("BDI import timeout")), 5000),
              ),
            ])) as any;
            const agentDir = join(workspaceDir, "agents", agentId);
            const state = await readAgentCognitiveState(agentDir, agentId);
            const result = await runMaintenanceCycle(state);
            log.info(`BDI cycle for ${agentId}:`);
            log.info(`  Intentions pruned: ${result.staleIntentionsPruned}`);
            log.info(`  Desires re-sorted: ${result.desiresPrioritized}`);
            log.info(`  Timestamp: ${result.timestamp}`);
          } catch (err) {
            log.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
          }
        });

      // --- mabos business list ---
      mabos
        .command("business")
        .description("Business management operations")
        .command("list")
        .description("List managed businesses")
        .action(async () => {
          try {
            const { readdir, stat: fsStat } = await import("node:fs/promises");
            const { join } = await import("node:path");
            const businessDir = join(workspaceDir, "businesses");
            const entries = await readdir(businessDir).catch(() => []);

            if (entries.length === 0) {
              log.info("No businesses found. Run 'mabos onboard' to create one.");
              return;
            }

            log.info("\nManaged Businesses\n" + "=".repeat(50));
            for (const entry of entries) {
              const s = await fsStat(join(businessDir, entry)).catch(() => null);
              if (s?.isDirectory()) {
                const manifest = join(businessDir, entry, "manifest.json");
                try {
                  const { readFile } = await import("node:fs/promises");
                  const data = JSON.parse(await readFile(manifest, "utf-8"));
                  log.info(`  ${data.name ?? entry} (${data.industry ?? "general"})`);
                } catch {
                  log.info(`  ${entry}`);
                }
              }
            }
          } catch (err) {
            log.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
          }
        });

      // --- mabos migrate ---
      mabos
        .command("migrate")
        .description("Migrate data from ~/.openclaw to ~/.mabos")
        .option("--dry-run", "Preview changes without modifying files")
        .action(async (opts: { dryRun?: boolean }) => {
          try {
            const migratePath = "../../../mabos/scripts/migrate.js";
            const { migrate } = (await import(/* webpackIgnore: true */ migratePath)) as any;
            await migrate({ dryRun: opts.dryRun ?? false });
          } catch (err) {
            log.error(`Migration error: ${err instanceof Error ? err.message : String(err)}`);
          }
        });

      // --- mabos dashboard ---
      mabos
        .command("dashboard")
        .description("Open the MABOS web dashboard")
        .action(async () => {
          const port = api.config?.gateway?.port ?? 18789;
          const url = `http://localhost:${port}/mabos/dashboard`;
          log.info(`Opening dashboard: ${url}`);
          try {
            const { exec } = await import("node:child_process");
            const { platform } = await import("node:os");
            const cmd =
              platform() === "darwin" ? "open" : platform() === "win32" ? "start" : "xdg-open";
            exec(`${cmd} ${url}`);
          } catch {
            log.info(`Open manually: ${url}`);
          }
        });
    },
    { commands: ["mabos"] },
  );

  // ── 4. Dashboard HTTP Routes & API Endpoints ─────────────────────

  // Helper: sanitize path-based IDs to prevent traversal attacks
  function sanitizeId(id: string): string | null {
    if (!id || id.includes("..") || id.includes("/") || id.includes("\\") || id.includes("\0"))
      return null;
    if (id.length > 128) return null;
    return id;
  }

  // Helper: read JSON file safely
  const readJsonSafe = async (p: string) => {
    try {
      const { readFile } = await import("node:fs/promises");
      return JSON.parse(await readFile(p, "utf-8"));
    } catch {
      return null;
    }
  };

  // Helper: read Markdown file safely, extract lines as items
  const readMdLines = async (p: string) => {
    try {
      const { readFile } = await import("node:fs/promises");
      const content = await readFile(p, "utf-8");
      return content
        .split("\n")
        .filter((l: string) => l.trim() && !l.startsWith("#"))
        .map((l: string) => l.replace(/^[-*]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 50);
    } catch {
      return [];
    }
  };

  // API: System status (enhanced)
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/status",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        let agents: any[] = [];
        try {
          const { getAgentsSummary } = (await Promise.race([
            import(/* webpackIgnore: true */ BDI_RUNTIME_PATH),
            new Promise<never>((_, r) =>
              setTimeout(() => r(new Error("BDI import timeout")), 5000),
            ),
          ])) as import("./src/types/bdi-runtime.js").BdiRuntime;
          agents = await Promise.race([
            getAgentsSummary(workspaceDir),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("BDI timeout")), 5000)),
          ]);
        } catch (e) {
          log.debug("BDI runtime skipped in status: " + e);
          // Fallback: list agents from filesystem
          const { readdir } = await import("node:fs/promises");
          const { join } = await import("node:path");
          const agentDirs = await readdir(join(workspaceDir, "businesses/vividwalls/agents")).catch(
            () => [],
          );
          agents = agentDirs.map((id: string) => ({
            agentId: id,
            beliefCount: 0,
            goalCount: 0,
            intentionCount: 0,
            desireCount: 0,
          }));
        }

        const { readdir } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const businessDir = join(workspaceDir, "businesses");
        const businesses = await readdir(businessDir).catch(() => []);

        // Overlay TypeDB intention counts onto agent summaries
        try {
          const { queryAgentListFromTypeDB } =
            process.env.TYPEDB_SKIP === "1"
              ? ({
                  queryAgentListFromTypeDB: async () => null,
                  queryAgentDetailFromTypeDB: async () => null,
                  queryDecisionsFromTypeDB: async () => null,
                  queryGoalModelFromTypeDB: async () => null,
                  queryTasksFromTypeDB: async () => null,
                  queryKnowledgeStatsFromTypeDB: async () => null,
                  queryWorkflowsFromTypeDB: async () => null,
                } as any)
              : await import("./src/knowledge/typedb-dashboard.js");
          const typedbAgents = await queryAgentListFromTypeDB("mabos");
          if (typedbAgents && typedbAgents.length > 0) {
            const typedbMap = new Map(typedbAgents.map((a: any) => [a.id, a]));
            for (const agent of agents) {
              const tdb = typedbMap.get(agent.agentId);
              if (tdb) {
                agent.intentionCount = tdb.intentions;
              }
            }
          }
        } catch (err) {
          log.debug(`TypeDB agent overlay skipped: ${err}`);
        }

        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            product: "MABOS",
            version: api.version ?? "0.1.0",
            bdiHeartbeat: "active",
            bdiIntervalMinutes,
            agents,
            businessCount: businesses.length,
            workspaceDir,
            reasoningToolCount: 20,
          }),
        );
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // API: Pending decisions across all businesses
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/decisions",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      // Try TypeDB first
      try {
        const { queryDecisionsFromTypeDB } =
          process.env.TYPEDB_SKIP === "1"
            ? ({
                queryAgentListFromTypeDB: async () => null,
                queryAgentDetailFromTypeDB: async () => null,
                queryDecisionsFromTypeDB: async () => null,
                queryGoalModelFromTypeDB: async () => null,
                queryTasksFromTypeDB: async () => null,
                queryKnowledgeStatsFromTypeDB: async () => null,
                queryWorkflowsFromTypeDB: async () => null,
              } as any)
            : await import("./src/knowledge/typedb-dashboard.js");
        const decisions = await queryDecisionsFromTypeDB("mabos");
        if (decisions && decisions.length > 0) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ decisions }));
          return;
        }
      } catch (err) {
        log.debug(`TypeDB decisions query skipped: ${err}`);
      }

      try {
        const { readdir, stat: fsStat } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const businessDir = join(workspaceDir, "businesses");
        const entries = await readdir(businessDir).catch(() => []);
        const allDecisions: any[] = [];

        for (const entry of entries) {
          const s = await fsStat(join(businessDir, entry)).catch(() => null);
          if (!s?.isDirectory()) continue;
          const queuePath = join(businessDir, entry, "decision-queue.json");
          const queue = await readJsonSafe(queuePath);
          if (Array.isArray(queue)) {
            for (const d of queue) {
              allDecisions.push({ ...d, business_id: entry });
            }
          }
        }

        // Sort by urgency
        const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        allDecisions.sort(
          (a, b) => (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2),
        );

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ decisions: allDecisions }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // Helper: register parameterized routes via registerHttpRoute with prefix matching
  // Collects handlers per static prefix to avoid duplicate registration errors
  const paramRouteHandlers = new Map<
    string,
    Array<{
      regex: RegExp;
      handler: (
        req: import("node:http").IncomingMessage,
        res: import("node:http").ServerResponse,
      ) => Promise<void>;
    }>
  >();
  const registeredPrefixes = new Set<string>();

  const registerParamRoute = (
    pattern: string,
    handler: (
      req: import("node:http").IncomingMessage,
      res: import("node:http").ServerResponse,
    ) => Promise<void>,
  ) => {
    const staticPrefix = pattern.replace(/\/:[^/]+.*$/, "");
    const prefix = staticPrefix || pattern;
    const regex = new RegExp("^" + pattern.replace(/:[^/]+/g, "[^/]+") + "$");

    if (!paramRouteHandlers.has(prefix)) {
      paramRouteHandlers.set(prefix, []);
    }
    paramRouteHandlers.get(prefix)!.push({ regex, handler });

    if (!registeredPrefixes.has(prefix)) {
      registeredPrefixes.add(prefix);
      api.registerHttpRoute({
        path: prefix,
        match: "prefix",
        auth: "plugin",
        handler: async (req, res) => {
          const url = new URL(req.url || "/", "http://localhost");
          const handlers = paramRouteHandlers.get(prefix) || [];
          for (const { regex: r, handler: h } of handlers) {
            if (r.test(url.pathname)) {
              if (!(await requireAuth(req, res))) return true;
              await h(req, res);
              return true;
            }
          }
          return false;
        },
      });
    }
  };

  // API: Resolve a decision
  registerParamRoute("/mabos/api/decisions/:id/resolve", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const { readFile, writeFile, mkdir } = await import("node:fs/promises");
      const { join, dirname } = await import("node:path");

      const params = await readMabosJsonBody<any>(req, res);
      if (!params) return;

      const bizId = sanitizeId(params.business_id);
      if (!bizId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid business_id" }));
        return;
      }

      const queuePath = join(workspaceDir, "businesses", bizId, "decision-queue.json");
      const queue = await readJsonSafe(queuePath);
      if (!Array.isArray(queue)) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Decision queue not found" }));
        return;
      }

      const idx = queue.findIndex((d: any) => d.id === params.decision_id);
      if (idx === -1) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Decision not found" }));
        return;
      }

      const decision = queue[idx];
      decision.status = params.resolution;
      decision.feedback = params.feedback;
      decision.resolved_at = new Date().toISOString();

      await mkdir(dirname(queuePath), { recursive: true });
      await writeFile(queuePath, JSON.stringify(queue, null, 2), "utf-8");

      // Notify agent
      if (decision.agent) {
        const inboxPath = join(
          workspaceDir,
          "businesses",
          bizId,
          "agents",
          decision.agent,
          "inbox.json",
        );
        const inbox = (await readJsonSafe(inboxPath)) || [];
        inbox.push({
          id: `DEC-${params.decision_id}-resolved`,
          from: "stakeholder",
          to: decision.agent,
          performative:
            params.resolution === "approved"
              ? "ACCEPT"
              : params.resolution === "rejected"
                ? "REJECT"
                : "INFORM",
          content: `Decision ${params.decision_id} ${params.resolution}${params.feedback ? `. Feedback: ${params.feedback}` : ""}`,
          priority: "high",
          timestamp: new Date().toISOString(),
          read: false,
        });
        await mkdir(dirname(inboxPath), { recursive: true });
        await writeFile(inboxPath, JSON.stringify(inbox, null, 2), "utf-8");
      }

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, decision }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // API: Agent detail
  registerParamRoute("/mabos/api/agents/:id", async (req, res) => {
    try {
      const { join } = await import("node:path");
      const url = new URL(req.url || "", "http://localhost");
      const rawId = url.pathname.split("/").pop() || "";
      const agentId = sanitizeId(rawId);
      if (!agentId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid agent ID" }));
        return;
      }
      // Try TypeDB first
      try {
        const { queryAgentDetailFromTypeDB } =
          process.env.TYPEDB_SKIP === "1"
            ? ({
                queryAgentListFromTypeDB: async () => null,
                queryAgentDetailFromTypeDB: async () => null,
                queryDecisionsFromTypeDB: async () => null,
                queryGoalModelFromTypeDB: async () => null,
                queryTasksFromTypeDB: async () => null,
                queryKnowledgeStatsFromTypeDB: async () => null,
                queryWorkflowsFromTypeDB: async () => null,
              } as any)
            : await import("./src/knowledge/typedb-dashboard.js");
        const detail = await queryAgentDetailFromTypeDB(agentId, `mabos`);
        if (detail) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(detail));
          return;
        }
      } catch (err) {
        log.debug(`TypeDB agent detail skipped: ${err}`);
      }

      const agentDir = join(workspaceDir, "agents", agentId);

      const beliefs = await readMdLines(join(agentDir, "Beliefs.md"));
      const goals = await readMdLines(join(agentDir, "Goals.md"));
      const intentions = await readMdLines(join(agentDir, "Intentions.md"));
      const desires = await readMdLines(join(agentDir, "Desires.md"));

      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          agentId,
          beliefCount: beliefs.length,
          goalCount: goals.length,
          intentionCount: intentions.length,
          desireCount: desires.length,
          beliefs,
          goals,
          intentions,
          desires,
        }),
      );
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // API: Agent files — list .md files for an agent
  registerParamRoute("/mabos/api/agents/:id/files", async (req, res) => {
    try {
      const { join } = await import("node:path");
      const { readdir, stat: fsStat } = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      const thisDir = join(fileURLToPath(import.meta.url), "..");
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const filesIdx = segments.indexOf("files");
      const rawId = filesIdx > 0 ? segments[filesIdx - 1] : "";
      const agentId = sanitizeId(rawId);
      if (!agentId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid agent ID" }));
        return;
      }

      const bdiDir = join(workspaceDir, "businesses", "vividwalls", "agents", agentId);
      const coreDir = join(workspaceDir, "agents", agentId);
      const templateDir = join(thisDir, "templates", "base", "agents", agentId);

      type AgentFile = {
        filename: string;
        category: "bdi" | "core" | "template";
        size: number;
        modified: string;
      };
      const files: AgentFile[] = [];
      const seen = new Set<string>();

      for (const [dir, cat] of [
        [bdiDir, "bdi"],
        [coreDir, "core"],
        [templateDir, "template"],
      ] as const) {
        try {
          const entries = await readdir(dir);
          for (const entry of entries) {
            if (!entry.endsWith(".md") || seen.has(entry)) continue;
            try {
              const s = await fsStat(join(dir, entry));
              files.push({
                filename: entry,
                category: cat,
                size: s.size,
                modified: s.mtime.toISOString(),
              });
              seen.add(entry);
            } catch {
              /* skip unreadable */
            }
          }
        } catch {
          /* dir doesn't exist */
        }
      }

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ files }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // API: Agent files — read or update a single file
  registerParamRoute("/mabos/api/agents/:id/files/:filename", async (req, res) => {
    try {
      const { join } = await import("node:path");
      const {
        stat: fsStat,
        readFile: fsReadFile,
        writeFile: fsWriteFile,
        mkdir,
      } = await import("node:fs/promises");
      const { fileURLToPath } = await import("node:url");
      const thisDir = join(fileURLToPath(import.meta.url), "..");
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const filesIdx = segments.indexOf("files");
      const rawId = filesIdx > 0 ? segments[filesIdx - 1] : "";
      const agentId = sanitizeId(rawId);
      const rawFilename = segments.slice(filesIdx + 1).join("/");
      const filename = decodeURIComponent(rawFilename);

      if (!agentId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid agent ID" }));
        return;
      }
      if (!filename.endsWith(".md") || filename.includes("..") || filename.includes("/")) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid filename" }));
        return;
      }

      const bdiDir = join(workspaceDir, "businesses", "vividwalls", "agents", agentId);
      const coreDir = join(workspaceDir, "agents", agentId);
      const templateDir = join(thisDir, "templates", "base", "agents", agentId);

      // Resolve which directory contains the file (BDI first, then core, then template)
      let filePath = join(bdiDir, filename);
      let category: "bdi" | "core" | "template" = "bdi";
      try {
        await fsStat(filePath);
      } catch {
        filePath = join(coreDir, filename);
        category = "core";
        try {
          await fsStat(filePath);
        } catch {
          filePath = join(templateDir, filename);
          category = "template";
          try {
            await fsStat(filePath);
          } catch {
            if (req.method !== "PUT") {
              res.statusCode = 404;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "File not found" }));
              return;
            }
            // For PUT, default to BDI dir
            filePath = join(bdiDir, filename);
            category = "bdi";
          }
        }
      }

      if (req.method === "PUT") {
        let body = "";
        for await (const chunk of req as any) body += chunk;
        const parsed = JSON.parse(body);
        if (typeof parsed.content !== "string") {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Missing content field" }));
          return;
        }
        await mkdir(join(bdiDir), { recursive: true });
        // Always write to BDI dir (never overwrite templates)
        const writePath = join(bdiDir, filename);
        await fsWriteFile(writePath, parsed.content, "utf-8");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // GET file content
      const content = await fsReadFile(filePath, "utf-8");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ filename, content, category }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // API: Agent knowledge stats
  registerParamRoute("/mabos/api/agents/:id/knowledge", async (req, res) => {
    try {
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      // agents/:id/knowledge → id is at index -2 from "knowledge"
      const knowledgeIdx = segments.indexOf("knowledge");
      const rawId = knowledgeIdx > 0 ? segments[knowledgeIdx - 1] : "";
      const agentId = sanitizeId(rawId);
      if (!agentId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid agent ID" }));
        return;
      }

      try {
        const { queryKnowledgeStatsFromTypeDB } =
          process.env.TYPEDB_SKIP === "1"
            ? ({
                queryAgentListFromTypeDB: async () => null,
                queryAgentDetailFromTypeDB: async () => null,
                queryDecisionsFromTypeDB: async () => null,
                queryGoalModelFromTypeDB: async () => null,
                queryTasksFromTypeDB: async () => null,
                queryKnowledgeStatsFromTypeDB: async () => null,
                queryWorkflowsFromTypeDB: async () => null,
              } as any)
            : await import("./src/knowledge/typedb-dashboard.js");
        const stats = await queryKnowledgeStatsFromTypeDB(agentId, "mabos");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(stats ?? { facts: 0, rules: 0, memories: 0, cases: 0 }));
        return;
      } catch (err) {
        log.debug(`TypeDB knowledge stats skipped: ${err}`);
      }

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ facts: 0, rules: 0, memories: 0, cases: 0 }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // API: Business list
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/businesses",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const { readdir, stat: fsStat } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const businessDir = join(workspaceDir, "businesses");
        const entries = await readdir(businessDir).catch(() => []);
        const businesses: any[] = [];

        for (const entry of entries) {
          const s = await fsStat(join(businessDir, entry)).catch(() => null);
          if (!s?.isDirectory()) continue;
          const manifest = await readJsonSafe(join(businessDir, entry, "manifest.json"));
          const agentsDir = join(businessDir, entry, "agents");
          const agentEntries = await readdir(agentsDir).catch(() => []);
          businesses.push({
            id: entry,
            name: manifest?.name ?? entry,
            industry: manifest?.industry ?? "general",
            status: manifest?.status ?? "active",
            agentCount: agentEntries.length,
          });
        }

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ businesses }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // API: Metrics for a business
  registerParamRoute("/mabos/api/metrics/:business", async (req, res) => {
    try {
      const { join } = await import("node:path");
      const url = new URL(req.url || "", "http://localhost");
      const rawId = url.pathname.split("/").pop() || "";
      const businessId = sanitizeId(rawId);
      if (!businessId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid business ID" }));
        return;
      }
      const metricsPath = join(workspaceDir, "businesses", businessId, "metrics.json");
      const metrics = await readJsonSafe(metricsPath);

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ business: businessId, metrics: metrics || {} }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // API: Contractors
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/contractors",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const { join } = await import("node:path");
        const contractorsPath = join(workspaceDir, "contractors.json");
        const contractors = (await readJsonSafe(contractorsPath)) || [];

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ contractors: Array.isArray(contractors) ? contractors : [] }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // API: Onboard a new business (POST)
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/onboard",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }
      try {
        const { readFile: rf, writeFile: wf, mkdir: mk, existsSync: ex } = await import("node:fs");
        const { readFile, writeFile, mkdir } = await import("node:fs/promises");
        const { join, dirname } = await import("node:path");
        const { existsSync } = await import("node:fs");

        const params = await readMabosJsonBody<any>(req, res);
        if (!params) return;

        if (!params.business_id || !params.name || !params.type) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Missing required fields: business_id, name, type" }));
          return;
        }

        // Validate business_id format
        if (
          typeof params.business_id !== "string" ||
          params.business_id.length > 64 ||
          !/^[a-zA-Z0-9_-]+$/.test(params.business_id)
        ) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              error:
                "Invalid business_id: must be alphanumeric with hyphens/underscores, max 64 chars",
            }),
          );
          return;
        }

        const bizDir = join(workspaceDir, "businesses", params.business_id);
        const now = new Date().toISOString();

        if (existsSync(bizDir)) {
          res.statusCode = 409;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: `Business '${params.business_id}' already exists` }));
          return;
        }

        const ROLES = ["ceo", "cfo", "coo", "cmo", "cto", "hr", "legal", "strategy", "knowledge"];

        // 1. Create manifest
        const manifest: any = {
          id: params.business_id,
          name: params.name,
          legal_name: params.legal_name || params.name,
          type: params.type,
          description: params.description || "",
          jurisdiction: params.jurisdiction || "",
          stage: params.stage || "mvp",
          status: "active",
          created: now,
          agents: [...ROLES],
          domain_agents: [],
        };
        await mkdir(bizDir, { recursive: true });
        await writeFile(join(bizDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

        // 2. Copy/create core agent cognitive files
        const { fileURLToPath } = await import("node:url");
        const thisDir = join(fileURLToPath(import.meta.url), "..");
        const templateBase = join(thisDir, "templates", "base", "agents");

        for (const role of ROLES) {
          const agentPath = join(bizDir, "agents", role);
          await mkdir(agentPath, { recursive: true });

          // Try to copy persona from template
          const templatePersona = join(templateBase, role, "Persona.md");
          if (existsSync(templatePersona)) {
            let persona = await readFile(templatePersona, "utf-8");
            persona = persona.replace(/\{business_name\}/g, params.name);
            await writeFile(join(agentPath, "Persona.md"), persona, "utf-8");
          } else {
            await writeFile(
              join(agentPath, "Persona.md"),
              `# Persona — ${role.toUpperCase()}\n\n**Role:** ${role.toUpperCase()}\n**Business:** ${params.name}\n`,
              "utf-8",
            );
          }

          // Try to copy capabilities from template
          const templateCaps = join(templateBase, role, "Capabilities.md");
          if (existsSync(templateCaps)) {
            await writeFile(
              join(agentPath, "Capabilities.md"),
              await readFile(templateCaps, "utf-8"),
              "utf-8",
            );
          }

          // Init cognitive files
          for (const f of [
            "Beliefs.md",
            "Desires.md",
            "Goals.md",
            "Intentions.md",
            "Plans.md",
            "Playbooks.md",
            "Knowledge.md",
            "Memory.md",
          ]) {
            await writeFile(
              join(agentPath, f),
              `# ${f.replace(".md", "")} — ${role.toUpperCase()}\n\nInitialized: ${now.split("T")[0]}\nBusiness: ${params.name}\n`,
              "utf-8",
            );
          }
          await writeFile(join(agentPath, "inbox.json"), "[]", "utf-8");
          await writeFile(join(agentPath, "cases.json"), "[]", "utf-8");
          await writeFile(
            join(agentPath, "facts.json"),
            JSON.stringify({ facts: [], version: 0 }, null, 2),
            "utf-8",
          );
          await writeFile(
            join(agentPath, "rules.json"),
            JSON.stringify({ rules: [], version: 0 }, null, 2),
            "utf-8",
          );
          await writeFile(
            join(agentPath, "memory-store.json"),
            JSON.stringify({ working: [], short_term: [], long_term: [], version: 0 }, null, 2),
            "utf-8",
          );
        }

        // 3. Generate BMC
        const bmc = {
          business_id: params.business_id,
          generated_at: now,
          canvas: {
            value_propositions: params.value_propositions || [],
            customer_segments: params.customer_segments || [],
            revenue_streams: params.revenue_streams || [],
            key_partners: params.key_partners || [],
            key_activities: params.key_activities || [],
            key_resources: params.key_resources || [],
            customer_relationships: params.customer_relationships || [],
            channels: params.channels || [],
            cost_structure: params.cost_structure || [],
          },
        };
        await writeFile(
          join(bizDir, "business-model-canvas.json"),
          JSON.stringify(bmc, null, 2),
          "utf-8",
        );

        // 4. Create shared resources
        await writeFile(join(bizDir, "decision-queue.json"), "[]", "utf-8");
        await writeFile(
          join(bizDir, "metrics.json"),
          JSON.stringify({ metrics: [], snapshots: [] }, null, 2),
          "utf-8",
        );
        await writeFile(
          join(bizDir, "README.md"),
          `# ${params.name}\n\n**Legal:** ${params.legal_name || params.name}\n**Type:** ${params.type}\n**Created:** ${now}\n\n${params.description || ""}\n`,
          "utf-8",
        );

        // 5. Orchestrate if requested
        if (params.orchestrate) {
          // 5a. Spawn domain agents
          const domainAgentDefs: Record<
            string,
            Array<{ id: string; name: string; role: string }>
          > = {
            ecommerce: [
              {
                id: "inventory-mgr",
                name: "Inventory Manager",
                role: "Manages stock levels, reorder points, and supplier relationships",
              },
              {
                id: "fulfillment-mgr",
                name: "Fulfillment Manager",
                role: "Handles order processing, shipping, and returns",
              },
              {
                id: "product-mgr",
                name: "Product Manager",
                role: "Manages product catalog, pricing, and listings",
              },
            ],
            saas: [
              {
                id: "devops",
                name: "DevOps Engineer",
                role: "Manages deployments, monitoring, uptime, and infrastructure",
              },
              {
                id: "product-mgr",
                name: "Product Manager",
                role: "Manages feature roadmap, user research, and releases",
              },
              {
                id: "customer-success",
                name: "Customer Success",
                role: "Manages onboarding, retention, and churn prevention",
              },
            ],
            consulting: [
              {
                id: "engagement-mgr",
                name: "Engagement Manager",
                role: "Manages client engagements, milestones, and deliverables",
              },
              {
                id: "biz-dev",
                name: "Business Development",
                role: "Manages pipeline, proposals, and client acquisition",
              },
            ],
            marketplace: [
              {
                id: "supply-mgr",
                name: "Supply Manager",
                role: "Manages seller onboarding, quality, and trust scoring",
              },
              {
                id: "demand-mgr",
                name: "Demand Manager",
                role: "Manages buyer acquisition, matching, and experience",
              },
              {
                id: "trust-safety",
                name: "Trust & Safety",
                role: "Manages disputes, fraud prevention, and platform integrity",
              },
            ],
            retail: [
              {
                id: "store-mgr",
                name: "Store Manager",
                role: "Manages store operations, staff scheduling, and customer experience",
              },
              {
                id: "merchandiser",
                name: "Merchandiser",
                role: "Manages product placement, promotions, and visual merchandising",
              },
            ],
          };
          const agents = domainAgentDefs[params.type] || [];
          for (const agent of agents) {
            const agentPath = join(bizDir, "agents", agent.id);
            await mkdir(agentPath, { recursive: true });
            await writeFile(
              join(agentPath, "Persona.md"),
              `# Persona — ${agent.name}\n\n**Role:** ${agent.name}\n**Agent ID:** ${agent.id}\n**Type:** Domain-specific\n\n## Identity\n${agent.role}\n`,
              "utf-8",
            );
            for (const f of [
              "Capabilities.md",
              "Beliefs.md",
              "Desires.md",
              "Goals.md",
              "Intentions.md",
              "Plans.md",
              "Playbooks.md",
              "Knowledge.md",
              "Memory.md",
            ]) {
              await writeFile(
                join(agentPath, f),
                `# ${f.replace(".md", "")} — ${agent.name}\n\nInitialized: ${now.split("T")[0]}\n`,
                "utf-8",
              );
            }
            await writeFile(join(agentPath, "inbox.json"), "[]", "utf-8");
            await writeFile(join(agentPath, "cases.json"), "[]", "utf-8");
          }
          manifest.domain_agents = agents.map((a: any) => a.id);
          await writeFile(
            join(bizDir, "manifest.json"),
            JSON.stringify(manifest, null, 2),
            "utf-8",
          );

          // 5b. Initialize desires from templates
          const templateDir = join(thisDir, "templates", "base");
          for (const role of ROLES) {
            const templateFile = join(templateDir, `desires-${role}.md`);
            if (existsSync(templateFile)) {
              let content = await readFile(templateFile, "utf-8");
              content = content.replace(/\{business_name\}/g, params.name);
              await writeFile(join(bizDir, "agents", role, "Desires.md"), content, "utf-8");
            }
          }

          // 5c. SBVR sync (best-effort, non-blocking)
          try {
            const { loadOntologies, mergeOntologies, exportSBVRForTypeDB } =
              await import("./src/ontology/index.js");
            const ontologies = loadOntologies();
            const graph = mergeOntologies(ontologies);
            const sbvrExport = exportSBVRForTypeDB(graph);
            await writeFile(
              join(bizDir, "sbvr-export.json"),
              JSON.stringify(sbvrExport, null, 2),
              "utf-8",
            );
          } catch (err) {
            log.debug(`SBVR sync skipped: ${err}`);
          }

          // 5d. Write onboarding progress
          const progress = {
            business_id: params.business_id,
            started_at: now,
            phases: {
              discovery: { status: "completed", started_at: now, completed_at: now },
              architecture: { status: "completed", started_at: now, completed_at: now },
              agents: { status: "completed", started_at: now, completed_at: now },
              knowledge_graph: { status: "completed", started_at: now, completed_at: now },
              launch: { status: "completed", started_at: now, completed_at: now },
            },
            current_phase: "launch",
            overall_status: "completed",
          };
          await writeFile(
            join(bizDir, "onboarding-progress.json"),
            JSON.stringify(progress, null, 2),
            "utf-8",
          );
        }

        // 6. Generate Tropos goal model from stakeholder goals if provided
        if (params.goals && params.goals.length > 0) {
          const goalMapping = params.goals.map((g: string, i: number) => {
            const gl = g.toLowerCase();
            let agent = "ceo";
            if (gl.includes("revenue") || gl.includes("profit") || gl.includes("cost"))
              agent = "cfo";
            else if (gl.includes("customer") || gl.includes("market") || gl.includes("brand"))
              agent = "cmo";
            else if (gl.includes("tech") || gl.includes("platform") || gl.includes("build"))
              agent = "cto";
            else if (gl.includes("operation") || gl.includes("process") || gl.includes("efficien"))
              agent = "coo";
            return {
              id: `G-${String(i + 1).padStart(3, "0")}`,
              text: g,
              type: "hard" as const,
              priority: 0.8,
              actor: agent,
              parent_goal: null,
              decomposition: "AND",
              linked_tasks: [] as string[],
              contributions: [] as Array<{ from: string; to: string; type: string }>,
            };
          });
          const tropos = {
            business_id: params.business_id,
            generated_at: now,
            actors: [
              {
                id: "stakeholder",
                type: "principal",
                goals: params.goals.map((g: string, i: number) => ({
                  goal: g,
                  priority: 0.8,
                  type: "hard",
                })),
                x: 400,
                y: 50,
              },
              ...ROLES.map((r: string) => ({
                id: r,
                type: "agent",
                delegated_goals: goalMapping
                  .filter((gm: any) => gm.actor === r)
                  .map((gm: any) => gm.text),
                x: 0,
                y: 0,
              })),
            ],
            goals: goalMapping,
            goal_mapping: goalMapping.map((gm: any) => ({
              stakeholder_goal: gm.text,
              priority: gm.priority,
              type: gm.type,
              primary_agent: gm.actor,
            })),
            dependencies: ROLES.map((r: string) => ({
              from: "stakeholder",
              to: r,
              type: "delegation",
            })),
            constraints: [],
          };
          await writeFile(
            join(bizDir, "tropos-goal-model.json"),
            JSON.stringify(tropos, null, 2),
            "utf-8",
          );
        }

        // 7. GDC pipeline integration (optional enhancement)
        let gdcSummary: { ran: boolean; goals?: number; domain_agents?: string[]; error?: string } =
          { ran: false };
        try {
          const pluginConfig = getPluginConfig(api);
          if (pluginConfig.gdcEnabled && process.env.ANTHROPIC_API_KEY) {
            // Assemble CompanyDNA from the request body
            const bmcFromBody: import("./src/gdc/types.js").BusinessModelCanvas = {
              value_propositions: (params.value_propositions || []).map((v: string) => ({
                title: v,
                description: v,
              })),
              customer_segments: (params.customer_segments || []).map((v: string) => ({
                title: v,
                description: v,
              })),
              revenue_streams: (params.revenue_streams || []).map((v: string) => ({
                title: v,
                description: v,
              })),
              key_partners: (params.key_partners || []).map((v: string) => ({
                title: v,
                description: v,
              })),
              key_activities: (params.key_activities || []).map((v: string) => ({
                title: v,
                description: v,
              })),
              key_resources: (params.key_resources || []).map((v: string) => ({
                title: v,
                description: v,
              })),
              customer_relationships: (params.customer_relationships || []).map((v: string) => ({
                title: v,
                description: v,
              })),
              channels: (params.channels || []).map((v: string) => ({ title: v, description: v })),
              cost_structure: (params.cost_structure || []).map((v: string) => ({
                title: v,
                description: v,
              })),
            };

            const companyDNA: CompanyDNA = {
              business_description:
                params.description ?? `${params.name} — a ${params.type} business`,
              mission: params.mission ?? `${params.name} mission`,
              vision: params.vision ?? `${params.name} vision`,
              industry: params.industry ?? params.type,
              stage: params.stage ?? "mvp",
              revenue: params.current_revenue ?? "",
              team_size: typeof params.team_size === "number" ? params.team_size : 0,
              key_products: params.key_products ?? [],
              channels: params.primary_channels ?? params.channels ?? [],
              constraints: params.constraints ?? [],
              bmc: params.bmc ?? bmcFromBody,
            };

            // Create callLlm function (same pattern as src/gdc/index.ts)
            const apiKey = process.env.ANTHROPIC_API_KEY;
            const gdcCallLlm: LlmCallFn = async ({
              model,
              system,
              user,
              maxTokens,
              temperature,
            }) => {
              const resp = await httpRequest(
                "https://api.anthropic.com/v1/messages",
                "POST",
                {
                  "x-api-key": apiKey!,
                  "anthropic-version": "2023-06-01",
                  "content-type": "application/json",
                },
                {
                  model,
                  max_tokens: maxTokens,
                  temperature,
                  system,
                  messages: [{ role: "user", content: user }],
                },
                120_000,
              );

              if (resp.status !== 200) {
                const errMsg =
                  typeof resp.data === "object" ? JSON.stringify(resp.data) : String(resp.data);
                throw new Error(`Anthropic API error (${resp.status}): ${errMsg}`);
              }

              const parsed = resp.data as { content?: { text?: string }[] };
              return parsed.content?.[0]?.text ?? "";
            };

            // Run GDC pipeline
            const gdcConfig = pluginConfig.gdc ?? {
              enabled: true,
              maxStage: 3 as const,
              pattern: "sequential" as const,
              maxParallelBranches: 1,
              models: {},
              checkpointDir: "",
              enableCaching: false,
            };
            const orchestrator = new GdcOrchestrator(gdcConfig, gdcCallLlm);
            const toolNames = (api as any)._mabosToolFilter?.registeredToolNames ?? [];
            const toolInventory = toolNames.map((n: string) => ({
              name: n,
              description: "",
              capabilities: [n],
              auth_type: "internal",
            }));
            const gdcResult = await orchestrator.run(companyDNA, toolInventory);

            // Generate domain agents if stage 1 completed
            if (gdcResult.stage1) {
              const domainAgents = await generateDomainAgents({
                companyDNA,
                stage1Goals: gdcResult.stage1,
                stage3Projects: gdcResult.stage3,
                toolInventory: toolNames,
                callLlm: gdcCallLlm,
                config: { maxAgents: 8 },
              });
              gdcResult.domain_agents = domainAgents;

              // Generate personas for domain agents
              const personas = await generatePersonaBatch({
                agentSpecs: domainAgents,
                companyDNA,
                businessName: params.name,
                coreAgentRoles: ROLES.map((r: string) => r.toUpperCase()),
                callLlm: gdcCallLlm,
              });

              // Create domain agent directories + personas
              for (const spec of domainAgents) {
                const agentDir = join(bizDir, "agents", spec.id);
                await mkdir(agentDir, { recursive: true });

                // Write generated persona or fallback
                const personaContent =
                  personas.get(spec.id) ??
                  `# Persona — ${spec.role}\n\n**Role:** ${spec.role}\n**Agent ID:** ${spec.id}\n**Type:** Domain-specific\n\n## Identity\n${spec.description}\n`;
                await writeFile(join(agentDir, "Persona.md"), personaContent, "utf-8");

                // Init cognitive files (same pattern as core agents above)
                for (const f of [
                  "Capabilities.md",
                  "Beliefs.md",
                  "Desires.md",
                  "Goals.md",
                  "Intentions.md",
                  "Plans.md",
                  "Playbooks.md",
                  "Knowledge.md",
                  "Memory.md",
                ]) {
                  await writeFile(
                    join(agentDir, f),
                    `# ${f.replace(".md", "")} — ${spec.role}\n\nInitialized: ${now.split("T")[0]}\nBusiness: ${params.name}\n`,
                    "utf-8",
                  );
                }
                await writeFile(join(agentDir, "inbox.json"), "[]", "utf-8");
                await writeFile(join(agentDir, "cases.json"), "[]", "utf-8");
                await writeFile(
                  join(agentDir, "facts.json"),
                  JSON.stringify({ facts: [], version: 0 }, null, 2),
                  "utf-8",
                );
                await writeFile(
                  join(agentDir, "rules.json"),
                  JSON.stringify({ rules: [], version: 0 }, null, 2),
                  "utf-8",
                );
                await writeFile(
                  join(agentDir, "memory-store.json"),
                  JSON.stringify(
                    { working: [], short_term: [], long_term: [], version: 0 },
                    null,
                    2,
                  ),
                  "utf-8",
                );
              }

              // Update manifest with domain agents
              manifest.domain_agents = domainAgents.map((a: any) => a.id);
              await writeFile(
                join(bizDir, "manifest.json"),
                JSON.stringify(manifest, null, 2),
                "utf-8",
              );
            }

            // Write cognitive state for ALL agents (core + domain)
            const coreAgentIds = [...ROLES];
            const domainAgentIds = gdcResult.domain_agents.map((a: any) => a.id);
            const allAgentIds = [...coreAgentIds, ...domainAgentIds];
            for (const agentId of allAgentIds) {
              const agentDir = join(bizDir, "agents", agentId);
              await writeCognitiveState({
                agentDir,
                agentRole: agentId,
                gdcResult,
                companyDNA,
                businessName: params.name,
              });
            }

            // Save GDC result for reference
            await writeFile(
              join(bizDir, "gdc-result.json"),
              JSON.stringify(gdcResult, null, 2),
              "utf-8",
            );

            // Save company DNA
            await writeFile(
              join(bizDir, "company_dna.json"),
              JSON.stringify(companyDNA, null, 2),
              "utf-8",
            );

            gdcSummary = {
              ran: true,
              goals: gdcResult.stage1?.goals.length ?? 0,
              domain_agents: domainAgentIds,
            };
          }
        } catch (gdcErr) {
          log.warn(`[mabos] GDC pipeline failed during onboarding: ${gdcErr}`);
          gdcSummary = { ran: false, error: String(gdcErr) };
          // Continue — basic onboarding already succeeded
        }

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, business: manifest, gdc: gdcSummary }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // API: AI-powered onboarding suggestions (POST)
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/onboard/suggest",
    handler: async (req, res) => {
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }
      try {
        const body = await readMabosJsonBody<
          import("./src/onboarding/ai-suggestions.js").SuggestionRequest
        >(req, res);
        if (!body) return;

        const { generateSuggestion } = await import("./src/onboarding/ai-suggestions.js");
        const result = await generateSuggestion(body);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // API: Chat — send message to an agent's inbox
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/chat",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }
      try {
        const { readFile, writeFile, mkdir } = await import("node:fs/promises");
        const { join, dirname } = await import("node:path");

        const params = await readMabosJsonBody<any>(req, res);
        if (!params) return;

        if (!params.agentId || !params.message || !params.businessId) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({ error: "Missing required fields: agentId, message, businessId" }),
          );
          return;
        }

        const agentId = sanitizeId(params.agentId);
        const businessId = sanitizeId(params.businessId);
        if (!agentId || !businessId) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid agent or business ID" }));
          return;
        }

        // Write message to agent's canonical inbox
        const inboxPath = join(workspaceDir, "agents", agentId, "inbox.json");
        let inbox: any[] = [];
        try {
          inbox = JSON.parse(await readFile(inboxPath, "utf-8"));
        } catch {
          /* empty inbox */
        }

        const pageContext = params.pageContext || null;
        const msg = {
          id: `CHAT-${Date.now()}`,
          from: "dashboard-user",
          to: agentId,
          performative: "QUERY",
          content: params.message,
          priority: "normal",
          timestamp: new Date().toISOString(),
          read: false,
          channel: "dashboard",
          pageContext,
        };

        inbox.push(msg);
        await mkdir(dirname(inboxPath), { recursive: true });
        await writeFile(inboxPath, JSON.stringify(inbox, null, 2), "utf-8");

        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            ok: true,
            messageId: msg.id,
            message: `Message delivered to ${agentId}. The agent will process it during the next BDI cycle.`,
          }),
        );
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // Track connected SSE clients per agentId
  const sseClients = new Map<string, Set<import("node:http").ServerResponse>>();

  // API: Chat SSE — stream agent events to the dashboard
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/chat/events",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      const { readFile, writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");

      const url = new URL(req.url || "", "http://localhost");
      const agentId = sanitizeId(url.searchParams.get("agentId") || "");
      const businessId = sanitizeId(url.searchParams.get("businessId") || "");

      if (!agentId || !businessId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Missing agentId or businessId" }));
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      // Send initial connection event
      res.write(`data: ${JSON.stringify({ type: "connected", agentId })}\n\n`);

      // Register this client
      const clientKey = `${businessId}:${agentId}`;
      if (!sseClients.has(clientKey)) {
        sseClients.set(clientKey, new Set());
      }
      sseClients.get(clientKey)!.add(res);

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        res.write(`: heartbeat\n\n`);
      }, 30000);

      let closed = false;

      // Subscribe to agent event bus — forward matching events to SSE
      const core = await getCoreModules();
      const unsubscribe = core.onAgentEvent((evt: AgentEventPayload) => {
        if (closed) return;

        // Match events by sessionKey containing the agentId
        // SessionKey format: "{channel}:{accountId}:{chatId}"
        // Also match by checking if the event's data references this agent
        const matchesAgent =
          evt.sessionKey?.includes(agentId) || (evt.data as any)?.agentId === agentId;

        if (!matchesAgent) return;

        try {
          if (evt.stream === "assistant") {
            const text =
              typeof evt.data?.text === "string"
                ? evt.data.text
                : typeof evt.data?.delta === "string"
                  ? evt.data.delta
                  : null;
            if (text) {
              res.write(
                `data: ${JSON.stringify({
                  type: "stream_token",
                  token: text,
                  agentId,
                  agentName: agentId,
                  id: evt.runId,
                })}\n\n`,
              );
            }
          } else if (evt.stream === "lifecycle") {
            const phase = evt.data?.phase;
            if (phase === "end") {
              res.write(`data: ${JSON.stringify({ type: "stream_end", agentId })}\n\n`);
            } else if (phase === "error") {
              res.write(
                `data: ${JSON.stringify({
                  type: "agent_response",
                  agentId,
                  agentName: agentId,
                  content: `Error: ${evt.data?.error || "Unknown error"}`,
                  id: evt.runId,
                })}\n\n`,
              );
            }
          } else if (evt.stream === "tool") {
            // Forward MABOS tool events for transparency
            const toolName = evt.data?.name || evt.data?.toolName;
            if (toolName && String(toolName).startsWith("mabos_")) {
              res.write(
                `data: ${JSON.stringify({
                  type: "agent_response",
                  agentId,
                  agentName: agentId,
                  content: `[Using tool: ${toolName}]`,
                  id: evt.runId,
                })}\n\n`,
              );
            }
          }
        } catch (err) {
          log.debug(`SSE write failed (connection closing): ${err}`);
        }
      });

      // Also keep outbox polling as fallback for non-event-bus messages
      const outboxPath = join(
        workspaceDir,
        "businesses",
        businessId,
        "agents",
        agentId,
        "outbox.json",
      );
      const pollInterval = setInterval(async () => {
        if (closed) return;
        try {
          const raw = await readFile(outboxPath, "utf-8");
          const outbox: any[] = JSON.parse(raw);
          if (outbox.length > 0) {
            for (const entry of outbox) {
              if (entry.type === "thinking_status") {
                const event = {
                  type: "thinking_status",
                  status: entry.status || "thinking",
                  label: entry.label || entry.status || "Thinking",
                };
                res.write(`data: ${JSON.stringify(event)}\n\n`);
              } else {
                const event = {
                  type: entry.type || "agent_response",
                  id: entry.id || String(Date.now()),
                  agentId,
                  agentName: entry.agentName || agentId,
                  content: entry.content || "",
                  actions: entry.actions || [],
                };
                res.write(`data: ${JSON.stringify(event)}\n\n`);
              }
            }
            await writeFile(outboxPath, "[]", "utf-8");
          }
        } catch (err) {
          log.debug(`Outbox poll: ${err}`);
        }
      }, 2000);

      req.on("close", () => {
        closed = true;
        clearInterval(heartbeat);
        clearInterval(pollInterval);
        unsubscribe();
        sseClients.get(clientKey)?.delete(res);
        if (sseClients.get(clientKey)?.size === 0) {
          sseClients.delete(clientKey);
        }
      });
    },
  });

  // API: Get goal model for a business
  registerParamRoute("/mabos/api/businesses/:id/goals", async (req, res) => {
    try {
      const { readFile, readdir } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { existsSync } = await import("node:fs");

      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const bizIdx = segments.indexOf("businesses");
      const rawBizId = segments[bizIdx + 1] || "";
      const businessId = sanitizeId(rawBizId);
      if (!businessId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid business ID" }));
        return;
      }
      const bizDir = join(workspaceDir, "businesses", businessId);

      if (req.method === "PUT") {
        // Update goal model
        const goalModel = await readMabosJsonBody<any>(req, res);
        if (!goalModel) return;
        const { writeFile, mkdir } = await import("node:fs/promises");
        await mkdir(bizDir, { recursive: true });
        await writeFile(
          join(bizDir, "tropos-goal-model.json"),
          JSON.stringify(goalModel, null, 2),
          "utf-8",
        );

        // Cascade: update agent Goals.md files
        if (goalModel.goals && goalModel.actors) {
          for (const actor of goalModel.actors) {
            if (actor.type === "agent") {
              const agentGoals = goalModel.goals.filter((g: any) => g.actor === actor.id);
              if (agentGoals.length > 0) {
                const goalsContent = `# Goals — ${actor.id.toUpperCase()}\n\nUpdated: ${new Date().toISOString().split("T")[0]}\n\n${agentGoals.map((g: any) => `## ${g.id}: ${g.text}\n- **Type:** ${g.type}\n- **Priority:** ${g.priority}\n- **Status:** active\n`).join("\n")}`;
                const agentDir = join(bizDir, "agents", actor.id);
                if (existsSync(agentDir)) {
                  await writeFile(join(agentDir, "Goals.md"), goalsContent, "utf-8");
                }
              }
            }
          }
        }

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, goals: goalModel }));
        return;
      }

      // GET: Read goal model
      // Try TypeDB first
      try {
        const { queryGoalModelFromTypeDB } =
          process.env.TYPEDB_SKIP === "1"
            ? ({
                queryAgentListFromTypeDB: async () => null,
                queryAgentDetailFromTypeDB: async () => null,
                queryDecisionsFromTypeDB: async () => null,
                queryGoalModelFromTypeDB: async () => null,
                queryTasksFromTypeDB: async () => null,
                queryKnowledgeStatsFromTypeDB: async () => null,
                queryWorkflowsFromTypeDB: async () => null,
              } as any)
            : await import("./src/knowledge/typedb-dashboard.js");
        const model = await queryGoalModelFromTypeDB(`mabos`);
        if (model) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(model));
          return;
        }
      } catch (err) {
        log.debug(`TypeDB goal model skipped: ${err}`);
      }

      const troposPath = join(bizDir, "tropos-goal-model.json");
      let goalModel = await readJsonSafe(troposPath);

      if (!goalModel) {
        // Build from manifest + agent Goals.md
        const manifest = await readJsonSafe(join(bizDir, "manifest.json"));
        const goals: any[] = [];
        const actors: any[] = [{ id: "stakeholder", type: "principal", goals: [], x: 400, y: 50 }];

        if (manifest?.agents) {
          for (const agentId of manifest.agents) {
            const goalsPath = join(bizDir, "agents", agentId, "Goals.md");
            const agentGoals = await readMdLines(goalsPath);
            actors.push({ id: agentId, type: "agent", delegated_goals: agentGoals, x: 0, y: 0 });
            agentGoals.forEach((g: string, i: number) => {
              goals.push({
                id: `G-${agentId}-${i}`,
                text: g,
                type: "hard",
                priority: 0.5,
                actor: agentId,
                parent_goal: null,
                decomposition: "AND",
                linked_tasks: [],
                contributions: [],
              });
            });
          }
        }

        goalModel = { actors, goals, goal_mapping: [], dependencies: [], constraints: [] };
      }

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(goalModel));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // API: Get tasks for a business (parsed from agent Plans.md)
  registerParamRoute("/mabos/api/businesses/:id/tasks", async (req, res) => {
    // Try TypeDB first
    try {
      const { queryTasksFromTypeDB } =
        process.env.TYPEDB_SKIP === "1"
          ? ({
              queryAgentListFromTypeDB: async () => null,
              queryAgentDetailFromTypeDB: async () => null,
              queryDecisionsFromTypeDB: async () => null,
              queryGoalModelFromTypeDB: async () => null,
              queryTasksFromTypeDB: async () => null,
              queryKnowledgeStatsFromTypeDB: async () => null,
              queryWorkflowsFromTypeDB: async () => null,
            } as any)
          : await import("./src/knowledge/typedb-dashboard.js");
      const tasks = await queryTasksFromTypeDB("mabos");
      if (tasks && tasks.length > 0) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ tasks }));
        return;
      }
    } catch (err) {
      log.debug(`TypeDB tasks query skipped: ${err}`);
    }

    try {
      const { readFile, readdir } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { existsSync } = await import("node:fs");

      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const bizIdx = segments.indexOf("businesses");
      const rawBizId = segments[bizIdx + 1] || "";
      const businessId = sanitizeId(rawBizId);
      if (!businessId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid business ID" }));
        return;
      }
      const bizDir = join(workspaceDir, "businesses", businessId);
      const agentsDir = join(bizDir, "agents");

      const tasks: any[] = [];
      const agentEntries = await readdir(agentsDir).catch(() => []);

      for (const agentId of agentEntries) {
        const plansPath = join(agentsDir, agentId, "Plans.md");
        if (!existsSync(plansPath)) continue;

        const content = await readFile(plansPath, "utf-8");
        const lines = content.split("\n");
        let currentPlan = "";
        let currentPlanId = "";

        for (const line of lines) {
          // Match plan headers: ### P-001: Plan Name
          const planMatch = line.match(/^###\s+(P-[\w]+-?\d+):\s*(.+)/);
          if (planMatch) {
            currentPlanId = planMatch[1];
            currentPlan = planMatch[2].trim();
            continue;
          }

          // Match table rows: | S-1 | description | type | assigned | depends | status | duration |
          const rowMatch = line.match(
            /^\|\s*(S-\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|/,
          );
          if (rowMatch && currentPlanId) {
            tasks.push({
              id: `${currentPlanId}-${rowMatch[1]}`,
              plan_id: currentPlanId,
              plan_name: currentPlan,
              step_id: rowMatch[1],
              description: rowMatch[2].trim(),
              type: rowMatch[3].trim(),
              assigned_to: rowMatch[4].trim() || agentId,
              depends_on:
                rowMatch[5].trim() === "-"
                  ? []
                  : rowMatch[5]
                      .trim()
                      .split(",")
                      .map((s: string) => s.trim()),
              status: rowMatch[6].trim().toLowerCase() || "proposed",
              estimated_duration: rowMatch[7].trim(),
              agent_id: agentId,
            });
          }

          // Match numbered list steps: N. [status] description
          const listMatch = line.match(/^\s*\d+\.\s*\[(\w+)\]\s*(.+)/);
          if (listMatch && currentPlanId) {
            const stepNum = tasks.filter((t: any) => t.plan_id === currentPlanId).length + 1;
            tasks.push({
              id: currentPlanId + "-S" + stepNum,
              plan_id: currentPlanId,
              plan_name: currentPlan,
              step_id: "S-" + stepNum,
              description: listMatch[2].trim(),
              type: "task",
              assigned_to: agentId,
              depends_on: stepNum > 1 ? [currentPlanId + "-S" + (stepNum - 1)] : [],
              status: listMatch[1].toLowerCase(),
              estimated_duration: "",
              agent_id: agentId,
            });
          }
        }

        // Also check for plans.json
        const plansJsonPath = join(agentsDir, agentId, "plans.json");
        const plansJson = await readJsonSafe(plansJsonPath);
        if (plansJson && Array.isArray(plansJson.plans)) {
          for (const plan of plansJson.plans) {
            if (plan.steps) {
              for (const step of plan.steps) {
                tasks.push({
                  id: `${plan.id}-${step.id}`,
                  plan_id: plan.id,
                  plan_name: plan.name || plan.id,
                  step_id: step.id,
                  description: step.description || step.name || "",
                  type: step.type || "task",
                  assigned_to: step.assigned_to || agentId,
                  depends_on: step.depends_on || [],
                  status: step.status || "proposed",
                  estimated_duration: step.estimated_duration || "",
                  agent_id: agentId,
                });
              }
            }
          }
        }
      }

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ tasks }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // API: Update task status
  registerParamRoute("/mabos/api/businesses/:id/tasks/:taskId", async (req, res) => {
    if (req.method !== "POST" && req.method !== "PUT") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const { readFile, writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");

      const params = await readMabosJsonBody<any>(req, res);
      if (!params) return;

      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const bizIdx = segments.indexOf("businesses");
      const rawBizId = segments[bizIdx + 1] || "";
      const businessId = sanitizeId(rawBizId);
      if (!businessId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid business ID" }));
        return;
      }
      const agentsDir = join(workspaceDir, "businesses", businessId, "agents");

      // Find the task in agent Plans.md files and update status
      const { readdir } = await import("node:fs/promises");
      const { existsSync } = await import("node:fs");
      const agentEntries = await readdir(agentsDir).catch(() => []);
      let updated = false;

      for (const agentId of agentEntries) {
        const plansPath = join(agentsDir, agentId, "Plans.md");
        if (!existsSync(plansPath)) continue;

        let content = await readFile(plansPath, "utf-8");
        const taskId = segments[segments.length - 1] || "";
        // Try to find and update the step row with matching ID
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(taskId.split("-").pop() || "") && lines[i].startsWith("|")) {
            // Replace status in the row
            const parts = lines[i].split("|");
            if (parts.length >= 7 && params.status) {
              parts[6] = ` ${params.status} `;
              lines[i] = parts.join("|");
              updated = true;
            }
          }
        }
        if (updated) {
          await writeFile(plansPath, lines.join("\n"), "utf-8");
          break;
        }
      }

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, updated }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // API: Get/Create agents for a business
  registerParamRoute("/mabos/api/businesses/:id/agents", async (req, res) => {
    try {
      const {
        readFile,
        readdir,
        stat: fsStat,
        writeFile: wf,
        mkdir: mk,
      } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { existsSync } = await import("node:fs");

      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const bizIdx = segments.indexOf("businesses");
      const rawBizId = segments[bizIdx + 1] || "";
      const businessId = sanitizeId(rawBizId);
      if (!businessId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid business ID" }));
        return;
      }
      const bizDir = join(workspaceDir, "businesses", businessId);
      const agentsDir = join(bizDir, "agents");

      // POST: Create a new agent
      if (req.method === "POST") {
        const params = await readMabosJsonBody<any>(req, res);
        if (!params) return;

        const newId = sanitizeId(params.id);
        if (!newId) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid agent ID" }));
          return;
        }

        const agentPath = join(agentsDir, newId);
        if (existsSync(agentPath)) {
          res.statusCode = 409;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: `Agent '${newId}' already exists` }));
          return;
        }

        const now = new Date().toISOString();
        await mk(agentPath, { recursive: true });

        // Create cognitive files
        for (const f of [
          "Beliefs.md",
          "Desires.md",
          "Goals.md",
          "Intentions.md",
          "Plans.md",
          "Playbooks.md",
          "Knowledge.md",
          "Memory.md",
        ]) {
          await wf(
            join(agentPath, f),
            `# ${f.replace(".md", "")} — ${params.name || newId}\n\nInitialized: ${now.split("T")[0]}\n`,
            "utf-8",
          );
        }
        await wf(
          join(agentPath, "Persona.md"),
          `# Persona — ${params.name || newId}\n\n**Role:** ${params.name || newId}\n**Agent ID:** ${newId}\n**Type:** ${params.type || "domain"}\n`,
          "utf-8",
        );
        await wf(join(agentPath, "inbox.json"), "[]", "utf-8");
        await wf(join(agentPath, "cases.json"), "[]", "utf-8");

        // Write config
        const config = {
          status: "active",
          autonomy_level: params.autonomy_level || "medium",
          approval_threshold_usd: params.approval_threshold_usd || 100,
          created_at: now,
        };
        await wf(join(agentPath, "config.json"), JSON.stringify(config, null, 2), "utf-8");

        // Update manifest
        const manifest = (await readJsonSafe(join(bizDir, "manifest.json"))) || {};
        if (params.type === "core") {
          manifest.agents = [...(manifest.agents || []), newId];
        } else {
          manifest.domain_agents = [...(manifest.domain_agents || []), newId];
        }
        await wf(join(bizDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, agentId: newId }));
        return;
      }

      // GET: List agents
      // Build from filesystem first (all agents), then overlay TypeDB BDI counts
      const manifest = await readJsonSafe(join(bizDir, "manifest.json"));
      const agentEntries = await readdir(agentsDir).catch(() => []);
      const agents: any[] = [];

      for (const agentId of agentEntries) {
        const agentPath = join(agentsDir, agentId);
        const s = await fsStat(agentPath).catch(() => null);
        if (!s?.isDirectory()) continue;

        const countLines = async (file: string) => {
          try {
            const content = await readFile(file, "utf-8");
            return content.split("\n").filter((l: string) => l.trim() && !l.startsWith("#")).length;
          } catch {
            return 0;
          }
        };

        const beliefs = await countLines(join(agentPath, "Beliefs.md"));
        const goals = await countLines(join(agentPath, "Goals.md"));
        const intentions = await countLines(join(agentPath, "Intentions.md"));
        const desires = await countLines(join(agentPath, "Desires.md"));

        const config = await readJsonSafe(join(agentPath, "config.json"));
        const isCoreAgent = manifest?.agents?.includes(agentId);

        agents.push({
          id: agentId,
          name: agentId.replace(/-/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
          type: isCoreAgent ? "core" : "domain",
          beliefs,
          goals,
          intentions,
          desires,
          status: config?.status || "active",
          autonomy_level: config?.autonomy_level || "medium",
          approval_threshold_usd: config?.approval_threshold_usd || 100,
        });
      }

      // Overlay TypeDB BDI counts (richer data for agents in knowledge graph)
      try {
        const { queryAgentListFromTypeDB } =
          process.env.TYPEDB_SKIP === "1"
            ? ({
                queryAgentListFromTypeDB: async () => null,
                queryAgentDetailFromTypeDB: async () => null,
                queryDecisionsFromTypeDB: async () => null,
                queryGoalModelFromTypeDB: async () => null,
                queryTasksFromTypeDB: async () => null,
                queryKnowledgeStatsFromTypeDB: async () => null,
                queryWorkflowsFromTypeDB: async () => null,
              } as any)
            : await import("./src/knowledge/typedb-dashboard.js");
        const typedbAgents = await queryAgentListFromTypeDB(`mabos`);
        if (typedbAgents && typedbAgents.length > 0) {
          const typedbMap = new Map(typedbAgents.map((a: any) => [a.id, a]));
          for (const agent of agents) {
            const tdb = typedbMap.get(agent.id);
            if (tdb) {
              agent.name = tdb.name;
              agent.beliefs = tdb.beliefs;
              agent.goals = tdb.goals;
              agent.intentions = tdb.intentions;
              agent.desires = tdb.desires;
            }
          }
        }
      } catch (err) {
        log.debug(`TypeDB agent overlay skipped: ${err}`);
      }

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ agents }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // API: Archive an agent
  registerParamRoute("/mabos/api/businesses/:id/agents/:agentId/archive", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const { rename, writeFile, mkdir } = await import("node:fs/promises");
      const { join, dirname } = await import("node:path");
      const { existsSync } = await import("node:fs");

      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const bizIdx = segments.indexOf("businesses");
      const rawBizId = segments[bizIdx + 1] || "";
      const businessId = sanitizeId(rawBizId);
      // agentId is before "archive"
      const archiveIdx = segments.indexOf("archive");
      const rawAgentId = archiveIdx > 0 ? segments[archiveIdx - 1] : "";
      const agentId = sanitizeId(rawAgentId);

      if (!businessId || !agentId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid business or agent ID" }));
        return;
      }

      const bizDir = join(workspaceDir, "businesses", businessId);
      const agentDir = join(bizDir, "agents", agentId);
      const archivedDir = join(bizDir, "agents", `_archived_${agentId}`);

      if (!existsSync(agentDir)) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: `Agent '${agentId}' not found` }));
        return;
      }

      await rename(agentDir, archivedDir);

      // Update manifest
      const manifest = (await readJsonSafe(join(bizDir, "manifest.json"))) || {};
      manifest.agents = (manifest.agents || []).filter((a: string) => a !== agentId);
      manifest.domain_agents = (manifest.domain_agents || []).filter((a: string) => a !== agentId);
      await writeFile(join(bizDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, archived: agentId }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // API: Trigger manual BDI cycle
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/bdi/cycle",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }
      try {
        const params = await readMabosJsonBody<any>(req, res);
        if (!params) return;

        const agentId = sanitizeId(params.agentId);
        if (!agentId) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid agent ID" }));
          return;
        }

        const { join } = await import("node:path");
        const { readAgentCognitiveState, runMaintenanceCycle } = (await Promise.race([
          import(/* webpackIgnore: true */ BDI_RUNTIME_PATH),
          new Promise<never>((_, r) => setTimeout(() => r(new Error("BDI import timeout")), 5000)),
        ])) as any;
        const agentDir = join(workspaceDir, "agents", agentId);
        const state = await readAgentCognitiveState(agentDir, agentId);
        const result = await runMaintenanceCycle(state);

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, agentId, result }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // API: Microsoft Graph email webhook — receives change notifications for new mail
  // Graph sends a validation request (POST with validationToken query param) on subscription creation,
  // and change notifications (POST with JSON body) when new emails arrive.
  let emailWebhookClientState = process.env.MS_GRAPH_WEBHOOK_SECRET || "vividwalls-email-webhook";
  let emailSubscriptionId: string | null = null;

  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/webhook/email",
    handler: async (req, res) => {
      const url = new URL(req.url || "/", "http://localhost");

      // Graph subscription validation handshake
      const validationToken = url.searchParams.get("validationToken");
      if (validationToken) {
        res.setHeader("Content-Type", "text/plain");
        res.end(validationToken);
        return;
      }

      if (req.method !== "POST") {
        res.statusCode = 405;
        res.end();
        return;
      }

      try {
        const body = await readMabosJsonBody<any>(req, res);
        if (!body) return;

        const notifications = body.value;
        if (!Array.isArray(notifications) || notifications.length === 0) {
          res.statusCode = 202;
          res.end();
          return;
        }

        // Validate clientState to prevent spoofed notifications
        const validNotifications = notifications.filter(
          (n: any) => n.clientState === emailWebhookClientState,
        );

        if (validNotifications.length === 0) {
          res.statusCode = 202;
          res.end();
          return;
        }

        // Respond 202 immediately — Graph requires <3s response time
        res.statusCode = 202;
        res.end();

        // Process asynchronously: trigger customer-service agent BDI cycle
        // Extract message IDs from notifications for targeted triage
        const messageIds = validNotifications
          .filter((n: any) => n.resourceData?.id)
          .map((n: any) => n.resourceData.id as string);

        const { join } = await import("node:path");
        const { readAgentCognitiveState, runMaintenanceCycle } = (await Promise.race([
          import(/* webpackIgnore: true */ BDI_RUNTIME_PATH),
          new Promise<never>((_, r) => setTimeout(() => r(new Error("BDI import timeout")), 5000)),
        ])) as any;

        const agentDir = join(workspaceDir, "agents", "customer-service");
        try {
          const state = await readAgentCognitiveState(agentDir, "customer-service");
          // Inject new email notification into agent beliefs for targeted processing
          if (messageIds.length > 0) {
            const beliefUpdate = {
              id: `B-CS-WEBHOOK-${Date.now()}`,
              belief: `New email(s) received via webhook: ${messageIds.length} message(s). Message IDs: ${messageIds.join(", ")}`,
              confidence: 1.0,
              source: "graph-webhook",
              timestamp: new Date().toISOString(),
            };
            // Write to agent inbox for the next BDI cycle to pick up
            const { readFile, writeFile, mkdir } = await import("node:fs/promises");
            const { dirname } = await import("node:path");
            const inboxPath = join(agentDir, "inbox.json");
            let inbox: any[] = [];
            try {
              inbox = JSON.parse(await readFile(inboxPath, "utf-8"));
            } catch {
              // inbox doesn't exist yet
            }
            inbox.push({
              id: `MSG-webhook-${Date.now()}`,
              from: "system",
              to: "customer-service",
              performative: "INFORM",
              content: `New email webhook notification: ${messageIds.length} new message(s) arrived. Process immediately using email tool. Message IDs: ${messageIds.join(", ")}`,
              priority: "high",
              timestamp: new Date().toISOString(),
              read: false,
              metadata: { messageIds, source: "graph-webhook" },
            });
            await mkdir(dirname(inboxPath), { recursive: true });
            await writeFile(inboxPath, JSON.stringify(inbox, null, 2), "utf-8");
          }
          await runMaintenanceCycle(state);
        } catch (err) {
          // Log but don't fail — the fallback cron will catch missed emails
          console.error("[email-webhook] Failed to trigger customer-service cycle:", err);
        }
      } catch (err) {
        // Already sent 202 or need to send error
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end();
        }
        console.error("[email-webhook] Error processing notification:", err);
      }
    },
  });

  // API: Manage email webhook subscription
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/webhook/email/subscription",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;

      try {
        const {
          createMailSubscription,
          renewMailSubscription,
          deleteMailSubscription,
          listSubscriptions,
        } = await import("../../src/agents/tools/email-graph-client.js");

        if (req.method === "POST") {
          // Create or renew subscription
          const params = await readMabosJsonBody<any>(req, res);
          if (!params) return;

          const notificationUrl = params.notificationUrl;
          if (!notificationUrl) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "notificationUrl is required" }));
            return;
          }

          if (emailSubscriptionId && params.action === "renew") {
            const sub = await renewMailSubscription(emailSubscriptionId);
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, subscription: sub, action: "renewed" }));
            return;
          }

          const sub = await createMailSubscription(notificationUrl, emailWebhookClientState);
          emailSubscriptionId = sub.id;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, subscription: sub, action: "created" }));
        } else if (req.method === "DELETE") {
          if (emailSubscriptionId) {
            await deleteMailSubscription(emailSubscriptionId);
            const deletedId = emailSubscriptionId;
            emailSubscriptionId = null;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, deleted: deletedId }));
          } else {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, message: "No active subscription" }));
          }
        } else if (req.method === "GET") {
          const subs = await listSubscriptions();
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              activeSubscriptionId: emailSubscriptionId,
              allSubscriptions: subs,
            }),
          );
        } else {
          res.statusCode = 405;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Method not allowed" }));
        }
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // API: Update agent config
  registerParamRoute("/mabos/api/businesses/:id/agents/:agentId", async (req, res) => {
    if (req.method !== "PUT" && req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const { readFile, writeFile, mkdir } = await import("node:fs/promises");
      const { join, dirname } = await import("node:path");

      const params = await readMabosJsonBody<any>(req, res);
      if (!params) return;

      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const bizIdx = segments.indexOf("businesses");
      const rawBizId = segments[bizIdx + 1] || "";
      const businessId = sanitizeId(rawBizId);
      const rawAgentId = segments[segments.length - 1] || "";
      const agentId = sanitizeId(rawAgentId);
      if (!businessId || !agentId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid business or agent ID" }));
        return;
      }
      const agentDir = join(workspaceDir, "businesses", businessId, "agents", agentId);
      const configPath = join(agentDir, "config.json");

      const config = (await readJsonSafe(configPath)) || {};
      if (params.status !== undefined) config.status = params.status;
      if (params.autonomy_level !== undefined) config.autonomy_level = params.autonomy_level;
      if (params.approval_threshold_usd !== undefined)
        config.approval_threshold_usd = params.approval_threshold_usd;
      config.updated_at = new Date().toISOString();

      await mkdir(dirname(configPath), { recursive: true });
      await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, config }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // API: Cron jobs for a business
  registerParamRoute("/mabos/api/businesses/:id/cron", async (req, res) => {
    try {
      const { readFile, writeFile, mkdir } = await import("node:fs/promises");
      const { join, dirname } = await import("node:path");

      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const bizIdx = segments.indexOf("businesses");
      const rawBizId = segments[bizIdx + 1] || "";
      const businessId = sanitizeId(rawBizId);
      if (!businessId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid business ID" }));
        return;
      }
      const bizDir = join(workspaceDir, "businesses", businessId);
      const cronPath = join(bizDir, "cron-jobs.json");

      if (req.method === "POST") {
        const params = await readMabosJsonBody<any>(req, res);
        if (!params) return;

        const jobs = (await readJsonSafe(cronPath)) || [];
        const newJob: Record<string, unknown> = {
          id: `CRON-${Date.now()}`,
          name: params.name || "Unnamed Job",
          schedule: params.schedule || "0 */6 * * *",
          agentId: params.agentId || "",
          action: params.action || "",
          enabled: params.enabled !== false,
          status: "active",
          createdAt: new Date().toISOString(),
        };
        if (params.workflowId) newJob.workflowId = params.workflowId;
        if (params.stepId) newJob.stepId = params.stepId;
        jobs.push(newJob);
        await mkdir(dirname(cronPath), { recursive: true });
        await writeFile(cronPath, JSON.stringify(jobs, null, 2), "utf-8");

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, job: newJob }));
        return;
      }

      // GET: List cron jobs
      let jobs = await readJsonSafe(cronPath);
      if (!jobs || !Array.isArray(jobs)) {
        // Seed default cron jobs
        jobs = [
          {
            id: "CRON-heartbeat",
            name: "BDI Heartbeat Cycle",
            schedule: `*/${bdiIntervalMinutes} * * * *`,
            agentId: "system",
            action: "bdi_cycle",
            enabled: true,
            status: "active",
            lastRun: new Date().toISOString(),
            nextRun: new Date(Date.now() + bdiIntervalMinutes * 60 * 1000).toISOString(),
          },
          {
            id: "CRON-knowledge",
            name: "Knowledge Consolidation",
            schedule: "0 2 * * *",
            agentId: "vw-knowledge",
            action: "memory_consolidate",
            enabled: true,
            status: "active",
          },
          {
            id: "CRON-decisions",
            name: "Decision Queue Review",
            schedule: "0 */6 * * *",
            agentId: "vw-ceo",
            action: "decision_review",
            enabled: true,
            status: "active",
          },
          {
            id: "CRON-email-triage-fallback",
            name: "Email Inbox Triage Fallback (Every 60 Minutes)",
            schedule: "0 * * * *",
            agentId: "customer-service",
            action: "email_triage",
            enabled: true,
            status: "active",
          },
          {
            id: "CRON-email-pending-followup",
            name: "Pending Response Follow-Up (Every 6 Hours)",
            schedule: "0 */6 * * *",
            agentId: "customer-service",
            action: "email_pending_followup",
            enabled: true,
            status: "active",
          },
          {
            id: "CRON-email-daily-digest",
            name: "Daily Email Activity Digest",
            schedule: "0 8 * * *",
            agentId: "customer-service",
            action: "email_daily_digest",
            enabled: true,
            status: "active",
          },
          {
            id: "CRON-email-webhook-renew",
            name: "Renew Graph Email Webhook Subscription (Every 2 Days)",
            schedule: "0 3 */2 * *",
            agentId: "customer-service",
            action: "email_webhook_renew",
            enabled: true,
            status: "active",
          },
        ];
        await mkdir(dirname(cronPath), { recursive: true });
        await writeFile(cronPath, JSON.stringify(jobs, null, 2), "utf-8");
      }

      // Update heartbeat job with actual last/next run times
      const heartbeatJob = jobs.find((j: any) => j.id === "CRON-heartbeat");
      if (heartbeatJob) {
        heartbeatJob.lastRun = new Date().toISOString();
        heartbeatJob.nextRun = new Date(Date.now() + bdiIntervalMinutes * 60 * 1000).toISOString();
      }

      // Filter by workflowId if query param provided
      const filterWorkflowId = url.searchParams.get("workflowId");
      const filteredJobs = filterWorkflowId
        ? jobs.filter((j: any) => j.workflowId === filterWorkflowId)
        : jobs;

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ jobs: filteredJobs }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // API: Update/toggle a cron job
  registerParamRoute("/mabos/api/businesses/:id/cron/:jobId", async (req, res) => {
    if (req.method !== "PUT" && req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const { readFile, writeFile, mkdir } = await import("node:fs/promises");
      const { join, dirname } = await import("node:path");

      const params = await readMabosJsonBody<any>(req, res);
      if (!params) return;

      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const bizIdx = segments.indexOf("businesses");
      const rawBizId = segments[bizIdx + 1] || "";
      const businessId = sanitizeId(rawBizId);
      const jobId = segments[segments.length - 1] || "";
      if (!businessId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid business ID" }));
        return;
      }

      const cronPath = join(workspaceDir, "businesses", businessId, "cron-jobs.json");
      const jobs = (await readJsonSafe(cronPath)) || [];
      const idx = jobs.findIndex((j: any) => j.id === jobId);
      if (idx === -1) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Cron job not found" }));
        return;
      }

      if (params.enabled !== undefined) jobs[idx].enabled = params.enabled;
      if (params.schedule !== undefined) jobs[idx].schedule = params.schedule;
      if (params.name !== undefined) jobs[idx].name = params.name;
      if (params.status !== undefined) jobs[idx].status = params.status;
      jobs[idx].updatedAt = new Date().toISOString();

      await mkdir(dirname(cronPath), { recursive: true });
      await writeFile(cronPath, JSON.stringify(jobs, null, 2), "utf-8");

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, job: jobs[idx] }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // API: Get campaigns for a business
  registerParamRoute("/mabos/api/businesses/:id/campaigns", async (req, res) => {
    try {
      const { join } = await import("node:path");

      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const bizIdx = segments.indexOf("businesses");
      const rawBizId = segments[bizIdx + 1] || "";
      const businessId = sanitizeId(rawBizId);
      if (!businessId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid business ID" }));
        return;
      }
      const marketingPath = join(workspaceDir, "businesses", businessId, "marketing.json");
      const marketing = await readJsonSafe(marketingPath);

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ campaigns: marketing?.campaigns || [] }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // ── ERP Module Routes ──────────────────────────────────────────
  // All routes live under /mabos/api/erp/* and read from workspace JSON
  // files where available, falling back to realistic seed data for VividWalls.

  // workspaceDir is already resolved above; construct the vividwalls business path
  const bizDir = `${workspaceDir}/businesses/vividwalls`;

  // --- E-Commerce: Products ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/products",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const { join } = await import("node:path");
        const catalogPath = join(bizDir, "product-catalog-live.json");
        const catalog = await readJsonSafe(catalogPath);
        const products = Array.isArray(catalog)
          ? catalog
          : (catalog?.products ?? catalog?.items ?? []);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ products }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- E-Commerce: Orders list ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/orders",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const { join } = await import("node:path");
        const url = new URL(_req.url || "", "http://localhost");
        const status = url.searchParams.get("status");
        const conversionsPath = join(bizDir, "conversions.json");
        let orders = (await readJsonSafe(conversionsPath)) ?? [];
        if (!Array.isArray(orders)) orders = orders?.orders ?? [];
        // Seed fallback
        if (orders.length === 0) {
          orders = [
            {
              id: "ORD-001",
              customer_name: "Aria Chen",
              customer_id: "C-001",
              product: "Midnight Bloom Canvas",
              qty: 1,
              total: 189.0,
              status: "shipped",
              created_at: "2026-03-28",
              items: [],
              item_count: 1,
            },
            {
              id: "ORD-002",
              customer_name: "Marcus Webb",
              customer_id: "C-001",
              product: "Urban Geometry Set",
              qty: 2,
              total: 340.0,
              status: "processing",
              created_at: "2026-03-30",
              items: [],
              item_count: 1,
            },
            {
              id: "ORD-003",
              customer_name: "Lina Petrova",
              customer_id: "C-001",
              product: "Ocean Whisper Triptych",
              qty: 1,
              total: 520.0,
              status: "delivered",
              created_at: "2026-03-25",
              items: [],
              item_count: 1,
            },
            {
              id: "ORD-004",
              customer_name: "James Okafor",
              customer_id: "C-001",
              product: "Neon Skyline Poster",
              qty: 3,
              total: 135.0,
              status: "pending",
              created_at: "2026-04-01",
              items: [],
              item_count: 1,
            },
            {
              id: "ORD-005",
              customer_name: "Sophie Laurent",
              customer_id: "C-001",
              product: "Abstract Harmony XL",
              qty: 1,
              total: 275.0,
              status: "shipped",
              created_at: "2026-03-29",
              items: [],
              item_count: 1,
            },
          ];
        }
        if (status) orders = orders.filter((o: any) => o.status === status);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ orders }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- E-Commerce: Single order & status update ---
  registerParamRoute("/mabos/api/erp/orders/:id", async (req, res) => {
    try {
      const { join } = await import("node:path");
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const orderId = segments[segments.length - 1];

      const conversionsPath = join(bizDir, "conversions.json");
      let orders = (await readJsonSafe(conversionsPath)) ?? [];
      if (!Array.isArray(orders)) orders = orders?.orders ?? [];
      if (orders.length === 0) {
        orders = [
          {
            id: "ORD-001",
            customer_name: "Aria Chen",
            customer_id: "C-001",
            product: "Midnight Bloom Canvas",
            qty: 1,
            total: 189.0,
            status: "shipped",
            created_at: "2026-03-28",
            items: [],
            item_count: 1,
          },
          {
            id: "ORD-002",
            customer_name: "Marcus Webb",
            customer_id: "C-001",
            product: "Urban Geometry Set",
            qty: 2,
            total: 340.0,
            status: "processing",
            created_at: "2026-03-30",
            items: [],
            item_count: 1,
          },
          {
            id: "ORD-003",
            customer_name: "Lina Petrova",
            customer_id: "C-001",
            product: "Ocean Whisper Triptych",
            qty: 1,
            total: 520.0,
            status: "delivered",
            created_at: "2026-03-25",
            items: [],
            item_count: 1,
          },
          {
            id: "ORD-004",
            customer_name: "James Okafor",
            customer_id: "C-001",
            product: "Neon Skyline Poster",
            qty: 3,
            total: 135.0,
            status: "pending",
            created_at: "2026-04-01",
            items: [],
            item_count: 1,
          },
          {
            id: "ORD-005",
            customer_name: "Sophie Laurent",
            customer_id: "C-001",
            product: "Abstract Harmony XL",
            qty: 1,
            total: 275.0,
            status: "shipped",
            created_at: "2026-03-29",
            items: [],
            item_count: 1,
          },
        ];
      }
      const order = orders.find((o: any) => o.id === orderId);
      if (!order) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Order not found" }));
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ order }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // --- E-Commerce: Update order status ---
  registerParamRoute("/mabos/api/erp/orders/:id/status", async (req, res) => {
    if (req.method !== "PUT") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const { join } = await import("node:path");
      const { readFile, writeFile } = await import("node:fs/promises");
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      // .../orders/:id/status → id is at segments.length - 2
      const orderId = segments[segments.length - 2];
      const body = await readMabosJsonBody<{ status: string }>(req, res);
      if (!body) return;

      const conversionsPath = join(bizDir, "conversions.json");
      let orders = (await readJsonSafe(conversionsPath)) ?? [];
      if (!Array.isArray(orders)) orders = orders?.orders ?? [];
      const idx = orders.findIndex((o: any) => o.id === orderId);
      if (idx === -1) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Order not found" }));
        return;
      }
      orders[idx].status = body.status;
      await writeFile(conversionsPath, JSON.stringify(orders, null, 2));
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, order: orders[idx] }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // --- Contacts list ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/contacts",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const { join } = await import("node:path");
        const personasPath = join(bizDir, "sales-personas.json");
        let contacts = (await readJsonSafe(personasPath)) ?? [];
        if (!Array.isArray(contacts)) contacts = contacts?.personas ?? contacts?.contacts ?? [];
        if (contacts.length === 0) {
          contacts = [
            {
              id: "CON-001",
              name: "Aria Chen",
              email: "aria@designstudio.co",
              type: "wholesale",
              lifetime_value: 4200,
            },
            {
              id: "CON-002",
              name: "Marcus Webb",
              email: "marcus@interiorsplus.com",
              type: "retail",
              lifetime_value: 1350,
            },
            {
              id: "CON-003",
              name: "Lina Petrova",
              email: "lina.p@artcollective.eu",
              type: "wholesale",
              lifetime_value: 8900,
            },
            {
              id: "CON-004",
              name: "James Okafor",
              email: "james@okafor.ng",
              type: "retail",
              lifetime_value: 670,
            },
            {
              id: "CON-005",
              name: "Sophie Laurent",
              email: "sophie@maisonlaurent.fr",
              type: "wholesale",
              lifetime_value: 12400,
            },
          ];
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ contacts }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Contacts search ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/contacts/search",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const { join } = await import("node:path");
        const url = new URL(_req.url || "", "http://localhost");
        const q = (url.searchParams.get("q") || "").toLowerCase();
        const personasPath = join(bizDir, "sales-personas.json");
        let contacts = (await readJsonSafe(personasPath)) ?? [];
        if (!Array.isArray(contacts)) contacts = contacts?.personas ?? contacts?.contacts ?? [];
        if (contacts.length === 0) {
          contacts = [
            {
              id: "CON-001",
              name: "Aria Chen",
              email: "aria@designstudio.co",
              type: "wholesale",
              lifetime_value: 4200,
            },
            {
              id: "CON-002",
              name: "Marcus Webb",
              email: "marcus@interiorsplus.com",
              type: "retail",
              lifetime_value: 1350,
            },
            {
              id: "CON-003",
              name: "Lina Petrova",
              email: "lina.p@artcollective.eu",
              type: "wholesale",
              lifetime_value: 8900,
            },
            {
              id: "CON-004",
              name: "James Okafor",
              email: "james@okafor.ng",
              type: "retail",
              lifetime_value: 670,
            },
            {
              id: "CON-005",
              name: "Sophie Laurent",
              email: "sophie@maisonlaurent.fr",
              type: "wholesale",
              lifetime_value: 12400,
            },
          ];
        }
        const results = q
          ? contacts.filter(
              (c: any) =>
                (c.name || "").toLowerCase().includes(q) ||
                (c.email || "").toLowerCase().includes(q),
            )
          : contacts;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ contacts: results }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Single contact ---
  registerParamRoute("/mabos/api/erp/contacts/:id", async (req, res) => {
    try {
      const { join } = await import("node:path");
      const url = new URL(req.url || "", "http://localhost");
      const contactId = url.pathname.split("/").pop() || "";
      const personasPath = join(bizDir, "sales-personas.json");
      let contacts = (await readJsonSafe(personasPath)) ?? [];
      if (!Array.isArray(contacts)) contacts = contacts?.personas ?? contacts?.contacts ?? [];
      if (contacts.length === 0) {
        contacts = [
          {
            id: "CON-001",
            name: "Aria Chen",
            email: "aria@designstudio.co",
            type: "wholesale",
            lifetime_value: 4200,
          },
          {
            id: "CON-002",
            name: "Marcus Webb",
            email: "marcus@interiorsplus.com",
            type: "retail",
            lifetime_value: 1350,
          },
          {
            id: "CON-003",
            name: "Lina Petrova",
            email: "lina.p@artcollective.eu",
            type: "wholesale",
            lifetime_value: 8900,
          },
        ];
      }
      const contact = contacts.find((c: any) => c.id === contactId);
      if (!contact) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Contact not found" }));
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ contact }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // --- Inventory: Items ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/inventory/items",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const { join } = await import("node:path");
        const catalogPath = join(bizDir, "product-catalog-live.json");
        const catalog = await readJsonSafe(catalogPath);
        const raw = Array.isArray(catalog) ? catalog : (catalog?.products ?? catalog?.items ?? []);
        const items = raw.map((p: any, i: number) => {
          const qty = p.stock ?? p.quantity ?? Math.floor(Math.random() * 200);
          const reorder = p.reorder_point ?? 10;
          const status = qty <= 0 ? "out_of_stock" : qty <= reorder ? "low_stock" : "in_stock";
          return {
            id: p.id ?? p.sku ?? `INV-${String(i + 1).padStart(3, "0")}`,
            product_id: p.id ?? `PROD-${i + 1}`,
            name: p.name ?? p.title ?? "Unknown",
            sku: p.sku ?? `VW-${String(i + 1).padStart(4, "0")}`,
            quantity: qty,
            reorder_point: reorder,
            unit_cost: p.unit_cost ?? p.cost ?? (p.price ? p.price * 0.4 : 25),
            status,
            warehouse: "VividWalls Main",
            warehouse_id: "WH-001",
            warehouse_name: "VividWalls Main Warehouse",
          };
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ items }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Inventory: Low-stock alerts ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/inventory/alerts",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const { join } = await import("node:path");
        const catalogPath = join(bizDir, "product-catalog-live.json");
        const catalog = await readJsonSafe(catalogPath);
        const raw = Array.isArray(catalog) ? catalog : (catalog?.products ?? catalog?.items ?? []);
        const alerts = raw
          .map((p: any, i: number) => {
            const qty = p.stock ?? p.quantity ?? Math.floor(Math.random() * 20);
            const reorder = p.reorder_point ?? 10;
            return {
              id: p.id ?? `INV-${String(i + 1).padStart(3, "0")}`,
              product_id: p.id ?? `PROD-${i + 1}`,
              item_id: p.id ?? p.sku ?? `PROD-${i}`,
              name: p.name ?? p.title ?? "Unknown",
              sku: p.sku ?? `VW-${String(i + 1).padStart(4, "0")}`,
              quantity: qty,
              current_qty: qty,
              reorder_point: reorder,
              status: qty <= 0 ? "out_of_stock" : "low_stock",
              severity: qty <= 0 ? "critical" : "warning",
              warehouse: "VividWalls Main",
              warehouse_id: "WH-001",
              warehouse_name: "VividWalls Main Warehouse",
            };
          })
          .filter((item: any) => item.quantity <= item.reorder_point);

        // Seed fallback if no catalog data
        const finalAlerts =
          alerts.length > 0
            ? alerts
            : [
                { id: "INV-003", name: "Ocean Whisper Triptych", stock: 2, reorder_point: 10 },
                { id: "INV-007", name: "Neon Skyline Poster", stock: 5, reorder_point: 15 },
                { id: "INV-012", name: "Botanical Dreams Set", stock: 0, reorder_point: 8 },
              ];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ alerts: finalAlerts }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Inventory: Movements for a product ---
  registerParamRoute("/mabos/api/erp/inventory/movements/:id", async (req, res) => {
    try {
      const url = new URL(req.url || "", "http://localhost");
      const productId = url.pathname.split("/").pop() || "";
      // Generate realistic movement history
      const movements = [
        {
          id: "MOV-001",
          product_id: productId,
          type: "inbound",
          qty: 50,
          created_at: "2026-03-15",
          source: "Supplier: ArtPrint Co.",
        },
        {
          id: "MOV-002",
          product_id: productId,
          type: "outbound",
          qty: 12,
          created_at: "2026-03-18",
          destination: "Order ORD-001",
        },
        {
          id: "MOV-003",
          product_id: productId,
          type: "outbound",
          qty: 8,
          created_at: "2026-03-22",
          destination: "Order ORD-003",
        },
        {
          id: "MOV-004",
          product_id: productId,
          type: "adjustment",
          qty: -2,
          created_at: "2026-03-25",
          reason: "Damaged in transit",
        },
        {
          id: "MOV-005",
          product_id: productId,
          type: "inbound",
          qty: 30,
          created_at: "2026-04-01",
          source: "Supplier: CanvasWorld",
        },
      ];
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ movements }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // --- Suppliers list ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/suppliers",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const suppliers = [
          {
            id: "SUP-001",
            name: "ArtPrint Co.",
            contact_email: "orders@artprint.co",
            status: "active" as const,
            category: "canvas-printing",
            lead_time_days: 5,
            rating: 4.8,
          },
          {
            id: "SUP-002",
            name: "CanvasWorld",
            contact_email: "supply@canvasworld.com",
            status: "active" as const,
            category: "raw-materials",
            lead_time_days: 7,
            rating: 4.5,
          },
          {
            id: "SUP-003",
            name: "FrameCraft Ltd.",
            contact_email: "b2b@framecraft.co.uk",
            status: "active" as const,
            category: "framing",
            lead_time_days: 10,
            rating: 4.7,
          },
          {
            id: "SUP-004",
            name: "EcoPack Solutions",
            contact_email: "hello@ecopack.io",
            status: "active" as const,
            category: "packaging",
            lead_time_days: 3,
            rating: 4.9,
          },
          {
            id: "SUP-005",
            name: "ChromaInk Supplies",
            contact_email: "sales@chromaink.com",
            status: "active" as const,
            category: "printing-ink",
            lead_time_days: 4,
            rating: 4.3,
          },
        ];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ suppliers }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Purchase orders ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/purchase-orders",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const orders = [
          {
            id: "PO-001",
            supplier: "ArtPrint Co.",
            items: [{ name: "Premium Canvas Roll 60in", qty: 20, unit_price: 45 }],
            total: 900,
            status: "delivered",
            created_at: "2026-03-10",
            items: [],
            item_count: 1,
          },
          {
            id: "PO-002",
            supplier: "FrameCraft Ltd.",
            items: [{ name: "Oak Frame 24x36", qty: 50, unit_price: 18 }],
            total: 900,
            status: "in_transit",
            created_at: "2026-03-28",
            items: [],
            item_count: 1,
          },
          {
            id: "PO-003",
            supplier: "EcoPack Solutions",
            items: [{ name: "Eco Mailer Box Large", qty: 200, unit_price: 2.5 }],
            total: 500,
            status: "pending",
            created_at: "2026-04-02",
            items: [],
            item_count: 1,
          },
          {
            id: "PO-004",
            supplier: "ChromaInk Supplies",
            items: [{ name: "Archival Pigment Ink Set", qty: 10, unit_price: 85 }],
            total: 850,
            status: "delivered",
            created_at: "2026-03-05",
            items: [],
            item_count: 1,
          },
        ];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ orders }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Single supplier ---
  registerParamRoute("/mabos/api/erp/suppliers/:id", async (req, res) => {
    try {
      const url = new URL(req.url || "", "http://localhost");
      const supplierId = url.pathname.split("/").pop() || "";
      const suppliers = [
        {
          id: "SUP-001",
          name: "ArtPrint Co.",
          contact_email: "orders@artprint.co",
          status: "active" as const,
          category: "canvas-printing",
          lead_time_days: 5,
          rating: 4.8,
          address: "123 Print Ave, Portland OR",
        },
        {
          id: "SUP-002",
          name: "CanvasWorld",
          contact_email: "supply@canvasworld.com",
          status: "active" as const,
          category: "raw-materials",
          lead_time_days: 7,
          rating: 4.5,
          address: "456 Canvas Blvd, Austin TX",
        },
        {
          id: "SUP-003",
          name: "FrameCraft Ltd.",
          contact_email: "b2b@framecraft.co.uk",
          status: "active" as const,
          category: "framing",
          lead_time_days: 10,
          rating: 4.7,
          address: "78 Craft Lane, London UK",
        },
        {
          id: "SUP-004",
          name: "EcoPack Solutions",
          contact_email: "hello@ecopack.io",
          status: "active" as const,
          category: "packaging",
          lead_time_days: 3,
          rating: 4.9,
          address: "90 Green St, Denver CO",
        },
        {
          id: "SUP-005",
          name: "ChromaInk Supplies",
          contact_email: "sales@chromaink.com",
          status: "active" as const,
          category: "printing-ink",
          lead_time_days: 4,
          rating: 4.3,
          address: "22 Ink Row, Seattle WA",
        },
      ];
      const supplier = suppliers.find((s) => s.id === supplierId);
      if (!supplier) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Supplier not found" }));
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ supplier }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // --- Supply Chain: Shipments list ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/shipments",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const shipments = [
          {
            id: "SHP-001",
            order_id: "ORD-001",
            carrier: "FedEx",
            tracking_number: "FX9283746501",
            status: "in_transit",
            origin: "Portland OR",
            destination: "San Francisco CA",
            estimated_arrival: "2026-04-05",
          },
          {
            id: "SHP-002",
            order_id: "ORD-003",
            carrier: "UPS",
            tracking_number: "1Z999AA10123456784",
            status: "delivered",
            origin: "Portland OR",
            destination: "Paris FR",
            estimated_arrival: "2026-03-27",
          },
          {
            id: "SHP-003",
            order_id: "ORD-005",
            carrier: "DHL",
            tracking_number: "DHL1234567890",
            status: "in_transit",
            origin: "Portland OR",
            destination: "Lyon FR",
            estimated_arrival: "2026-04-06",
          },
          {
            id: "SHP-004",
            order_id: "PO-002",
            carrier: "FreightCo",
            tracking_number: "FC00228374",
            status: "in_transit",
            origin: "London UK",
            destination: "Portland OR",
            estimated_arrival: "2026-04-08",
          },
        ];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ shipments }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Supply Chain: Single shipment ---
  registerParamRoute("/mabos/api/erp/shipments/:id", async (req, res) => {
    try {
      const url = new URL(req.url || "", "http://localhost");
      const shipmentId = url.pathname.split("/").pop() || "";
      const shipments = [
        {
          id: "SHP-001",
          order_id: "ORD-001",
          carrier: "FedEx",
          tracking_number: "FX9283746501",
          status: "in_transit",
          origin: "Portland OR",
          destination: "San Francisco CA",
          estimated_arrival: "2026-04-05",
          items: [{ name: "Midnight Bloom Canvas", qty: 1 }],
        },
        {
          id: "SHP-002",
          order_id: "ORD-003",
          carrier: "UPS",
          tracking_number: "1Z999AA10123456784",
          status: "delivered",
          origin: "Portland OR",
          destination: "Paris FR",
          estimated_arrival: "2026-03-27",
          items: [{ name: "Ocean Whisper Triptych", qty: 1 }],
        },
        {
          id: "SHP-003",
          order_id: "ORD-005",
          carrier: "DHL",
          tracking_number: "DHL1234567890",
          status: "in_transit",
          origin: "Portland OR",
          destination: "Lyon FR",
          estimated_arrival: "2026-04-06",
          items: [{ name: "Abstract Harmony XL", qty: 1 }],
        },
      ];
      const shipment = shipments.find((s) => s.id === shipmentId);
      if (!shipment) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Shipment not found" }));
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ shipment }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // --- Supply Chain: Routes ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/routes",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const routes = [
          {
            id: "RT-001",
            name: "US West Coast",
            origin: "Portland OR",
            destinations: ["San Francisco CA", "Los Angeles CA", "Seattle WA"],
            carrier: "FedEx",
            avg_days: 3,
          },
          {
            id: "RT-002",
            name: "US East Coast",
            origin: "Portland OR",
            destinations: ["New York NY", "Miami FL", "Boston MA"],
            carrier: "UPS",
            avg_days: 5,
          },
          {
            id: "RT-003",
            name: "Europe Express",
            origin: "Portland OR",
            destinations: ["London UK", "Paris FR", "Berlin DE"],
            carrier: "DHL",
            avg_days: 8,
          },
          {
            id: "RT-004",
            name: "Inbound Supplier",
            origin: "Various",
            destinations: ["Portland OR"],
            carrier: "FreightCo",
            avg_days: 7,
          },
        ];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ routes }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Legal: Partnership contracts ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/legal/contracts/partnership",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const contracts = [
          {
            id: "LC-P001",
            title: "ArtPrint Co. Supply Agreement",
            partner_name: "ArtPrint Co.",
            type: "partnership",
            partner_type: "strategic",
            ownership_pct: 0,
            revenue_share_pct: 15,
            status: "active",
            start_date: "2025-06-01",
            end_date: "2027-06-01",
            value: 120000,
          },
          {
            id: "LC-P002",
            title: "FrameCraft Exclusive Distribution",
            partner_name: "FrameCraft Ltd.",
            type: "partnership",
            partner_type: "strategic",
            ownership_pct: 0,
            revenue_share_pct: 15,
            status: "active",
            start_date: "2025-09-15",
            end_date: "2026-09-15",
            value: 85000,
          },
          {
            id: "LC-P003",
            title: "EcoPack Sustainability Initiative",
            partner_name: "EcoPack Solutions",
            type: "partnership",
            partner_type: "strategic",
            ownership_pct: 0,
            revenue_share_pct: 15,
            status: "under_review",
            start_created_at: "2026-04-01",
            end_date: "2028-04-01",
            value: 45000,
          },
        ];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ contracts }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Legal: Freelancer contracts ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/legal/contracts/freelancer",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const contracts = [
          {
            id: "LC-F001",
            title: "Digital Art Commission",
            contractor_name: "Elena Rossi",
            type: "freelancer",
            status: "active",
            start_date: "2026-01-15",
            end_date: "2026-07-15",
            rate_amount: 150,
            rate_type: "hourly",
            scope_of_work: "Original digital artwork for seasonal collections",
          },
          {
            id: "LC-F002",
            title: "Photography Services",
            contractor_name: "David Kim",
            type: "freelancer",
            status: "active",
            start_date: "2026-02-01",
            end_date: "2026-12-31",
            rate_amount: 200,
            rate_type: "hourly",
            scope_of_work: "Product photography and lifestyle shoots",
          },
          {
            id: "LC-F003",
            title: "Brand Copywriting",
            contractor_name: "Mia Torres",
            type: "freelancer",
            status: "completed",
            start_date: "2025-10-01",
            end_created_at: "2026-03-31",
            rate_amount: 95,
            rate_type: "hourly",
            scope_of_work: "Product descriptions and brand storytelling",
          },
        ];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ contracts }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Legal: Documents ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/legal/documents",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const documents = [
          {
            id: "LD-001",
            title: "Terms of Service",
            category: "customer-facing",
            version: "2.1",
            last_updated: "2026-02-15",
            status: "published",
          },
          {
            id: "LD-002",
            title: "Privacy Policy",
            category: "customer-facing",
            version: "3.0",
            last_updated: "2026-01-20",
            status: "published",
          },
          {
            id: "LD-003",
            title: "Return & Refund Policy",
            category: "customer-facing",
            version: "1.4",
            last_updated: "2025-11-10",
            status: "published",
          },
          {
            id: "LD-004",
            title: "Intellectual Property Policy",
            category: "internal",
            version: "1.0",
            last_updated: "2025-08-01",
            status: "draft",
          },
          {
            id: "LD-005",
            title: "Supplier Code of Conduct",
            category: "supplier",
            version: "1.2",
            last_updated: "2026-03-01",
            status: "published",
          },
        ];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ documents }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Legal: Structure ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/legal/structure",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const structure = {
          entity_name: "VividWalls LLC",
          jurisdiction: "Oregon, United States",
          formation_date: "2024-03-15",
          type: "Limited Liability Company",
          registered_agent: "Northwest Registered Agent",
          ein: "XX-XXXXXXX",
          members: [{ name: "Founding Member", role: "Managing Member", ownership: "100%" }],
          licenses: [
            {
              type: "Business License",
              jurisdiction: "Portland, OR",
              status: "active",
              renewal: "2027-03-15",
            },
            {
              type: "Sales Tax Permit",
              jurisdiction: "Oregon",
              status: "active",
              renewal: "2026-12-31",
            },
          ],
        };
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(structure));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Legal: Guardrails ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/legal/guardrails",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const guardrails = [
          {
            id: "GR-001",
            rule: "All artwork must have verified licensing before listing",
            category: "intellectual-property",
            severity: "critical",
          },
          {
            id: "GR-002",
            rule: "Customer data must be encrypted at rest and in transit",
            category: "data-privacy",
            severity: "critical",
          },
          {
            id: "GR-003",
            rule: "Refund requests must be processed within 14 business days",
            category: "consumer-protection",
            severity: "high",
          },
          {
            id: "GR-004",
            rule: "Supplier contracts require legal review for amounts over $10,000",
            category: "procurement",
            severity: "high",
          },
          {
            id: "GR-005",
            rule: "Marketing claims must be substantiated and non-deceptive",
            category: "advertising",
            severity: "medium",
          },
          {
            id: "GR-006",
            rule: "International shipments must comply with destination customs regulations",
            category: "trade-compliance",
            severity: "high",
          },
        ];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ guardrails }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Marketing: Campaigns ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/marketing/campaigns",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;

      // Try TypeDB first
      try {
        const { queryCampaignsFromTypeDB } =
          process.env.TYPEDB_SKIP === "1"
            ? ({ queryCampaignsFromTypeDB: async () => null } as any)
            : await import("./src/knowledge/typedb-dashboard.js");
        const dbCampaigns = await queryCampaignsFromTypeDB("mabos");
        if (dbCampaigns && dbCampaigns.length > 0) {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ campaigns: dbCampaigns }));
          return;
        }
      } catch (err) {
        log.debug(`TypeDB campaigns query skipped: ${err}`);
      }

      try {
        const { join } = await import("node:path");
        const marketingPath = join(bizDir, "marketing.json");
        const marketing = await readJsonSafe(marketingPath);
        let rawCampaigns = marketing?.campaigns ?? [];
        // Transform marketing.json format to MarketingCampaign type
        let campaigns = rawCampaigns.map((c: any, i: number) => ({
          id: c.id ?? `MC-${String(i + 1).padStart(3, "0")}`,
          name: c.name ?? "Untitled Campaign",
          type: c.objective ?? c.type ?? "digital",
          status: c.status ?? "active",
          budget: c.budget ?? (c.daily_budget_usd ? c.daily_budget_usd * 30 : 5000),
          spent: c.spent ?? 0,
          start_date: c.start_date ?? new Date().toISOString().slice(0, 10),
          end_date: c.end_date ?? "",
          channels: c.channels ?? (c.platform ? [c.platform] : ["digital"]),
        }));
        if (campaigns.length === 0) {
          campaigns = [
            {
              id: "MC-001",
              name: "Spring Collection Launch",
              channels: ["instagram"],
              type: "digital",
              status: "active",
              budget: 5000,
              spent: 3200,
              start_created_at: "2026-03-15",
              end_created_at: "2026-04-15",
            },
            {
              id: "MC-002",
              name: "Home Office Refresh",
              channels: ["google-ads"],
              type: "digital",
              status: "active",
              budget: 8000,
              spent: 4100,
              start_created_at: "2026-03-01",
              end_date: "2026-05-01",
            },
            {
              id: "MC-003",
              name: "Earth Day Eco Collection",
              channels: ["email"],
              type: "digital",
              status: "scheduled",
              budget: 2000,
              spent: 0,
              start_created_at: "2026-04-15",
              end_created_at: "2026-04-30",
            },
            {
              id: "MC-004",
              name: "Influencer Collab Q1",
              channels: ["tiktok"],
              type: "digital",
              status: "completed",
              budget: 12000,
              spent: 11800,
              start_date: "2026-01-10",
              end_created_at: "2026-03-10",
            },
          ];
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ campaigns }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Marketing: Campaign metrics ---
  registerParamRoute("/mabos/api/erp/marketing/campaigns/:id/metrics", async (req, res) => {
    try {
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      // .../campaigns/:id/metrics → id is at segments.length - 2
      const campaignId = segments[segments.length - 2];

      // Generate deterministic but varied metrics per campaign
      const seed = [...campaignId].reduce((s, c) => s + c.charCodeAt(0), 0);
      const rng = (min: number, max: number) => min + ((seed * 2654435761) % (max - min + 1));
      const impressions = rng(8000, 250000);
      const ctr = 1.5 + (seed % 40) / 10;
      const clicks = Math.round(impressions * (ctr / 100));
      const convRate = 0.8 + (seed % 30) / 10;
      const conversions = Math.round(clicks * (convRate / 100));
      const revenue = conversions * (80 + rng(20, 200));
      const spent = rng(500, 12000);
      const cpa = conversions > 0 ? spent / conversions : 0;
      const roas = spent > 0 ? revenue / spent : 0;

      const metrics = {
        campaign_id: campaignId,
        impressions,
        clicks,
        ctr: Math.round(ctr * 100) / 100,
        conversions,
        conversion_rate: Math.round(convRate * 100) / 100,
        revenue_attributed: revenue,
        cost_per_acquisition: Math.round(cpa * 100) / 100,
        roi: Math.round(roas * 10) / 10,
        period: { from: "2026-03-01", to: "2026-04-06" },
      };
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(metrics));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // --- Marketing: KPIs ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/marketing/kpis",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const { join } = await import("node:path");
        const kpisPath = join(bizDir, "kpis.json");
        let kpis = await readJsonSafe(kpisPath);
        if (!kpis || (Array.isArray(kpis) && kpis.length === 0)) {
          kpis = [
            {
              id: "KPI-001",
              name: "Monthly Revenue",
              value: 42500,
              target: 50000,
              unit: "USD",
              trend: "up",
            },
            {
              id: "KPI-002",
              name: "Customer Acquisition Cost",
              value: 34.2,
              target: 30,
              unit: "USD",
              trend: "down",
            },
            {
              id: "KPI-003",
              name: "Average Order Value",
              value: 178,
              target: 160,
              unit: "USD",
              trend: "up",
            },
            {
              id: "KPI-004",
              name: "Email List Growth Rate",
              value: 4.2,
              target: 5,
              unit: "%",
              trend: "stable",
            },
            {
              id: "KPI-005",
              name: "Social Media Engagement",
              value: 6.8,
              target: 5,
              unit: "%",
              trend: "up",
            },
          ];
        }
        const raw = Array.isArray(kpis) ? kpis : (kpis?.kpis ?? [kpis]);
        const result = raw.map((k: any, i: number) => ({
          id: k.id ?? "KPI-" + String(i + 1).padStart(3, "0"),
          name: k.name ?? (k.metric ? k.metric.replace(/_/g, " ") : "KPI " + (i + 1)),
          category: k.category ?? "general",
          current:
            k.current ?? k.value ?? Math.round((k.target ?? 100) * (0.6 + Math.random() * 0.35)),
          target: k.target ?? 100,
          unit: k.unit ?? "",
          description: k.description ?? "",
          trend: k.trend ?? "stable",
        }));
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ kpis: result }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Analytics: Reports list ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/analytics/reports",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const reports = [
          {
            id: "RPT-001",
            name: "Monthly Sales Summary",
            type: "sales",
            frequency: "monthly",
            last_run: "2026-04-01",
            status: "ready",
          },
          {
            id: "RPT-002",
            name: "Customer Cohort Analysis",
            type: "customer",
            frequency: "quarterly",
            last_run: "2026-03-31",
            status: "ready",
          },
          {
            id: "RPT-003",
            name: "Inventory Turnover Report",
            type: "inventory",
            frequency: "weekly",
            last_run: "2026-04-03",
            status: "ready",
          },
          {
            id: "RPT-004",
            name: "Marketing ROI Dashboard",
            type: "marketing",
            frequency: "monthly",
            last_run: "2026-04-01",
            status: "ready",
          },
          {
            id: "RPT-005",
            name: "Supplier Performance Review",
            type: "procurement",
            frequency: "quarterly",
            last_run: "2026-03-31",
            status: "stale",
          },
        ];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ reports }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Analytics: Report snapshots ---
  registerParamRoute("/mabos/api/erp/analytics/reports/:id/snapshots", async (req, res) => {
    try {
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const reportId = segments[segments.length - 2];
      const snapshots = [
        {
          id: `${reportId}-S1`,
          report_id: reportId,
          generated_at: "2026-04-01T08:00:00Z",
          rows: 142,
          summary: "Revenue up 12% MoM",
        },
        {
          id: `${reportId}-S2`,
          report_id: reportId,
          generated_at: "2026-03-01T08:00:00Z",
          rows: 128,
          summary: "Steady growth trajectory",
        },
        {
          id: `${reportId}-S3`,
          report_id: reportId,
          generated_at: "2026-02-01T08:00:00Z",
          rows: 115,
          summary: "Post-holiday normalization",
        },
      ];
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ snapshots }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // --- Analytics: Dashboards ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/analytics/dashboards",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const dashboards = [
          {
            id: "DASH-001",
            name: "Executive Overview",
            widgets: ["revenue-chart", "orders-funnel", "top-products", "customer-map"],
            updated_at: "2026-04-04T06:00:00Z",
          },
          {
            id: "DASH-002",
            name: "Operations Hub",
            widgets: [
              "inventory-levels",
              "shipment-tracker",
              "supplier-status",
              "fulfillment-rate",
            ],
            updated_at: "2026-04-04T06:00:00Z",
          },
          {
            id: "DASH-003",
            name: "Marketing Command Center",
            widgets: [
              "campaign-performance",
              "channel-attribution",
              "social-engagement",
              "email-metrics",
            ],
            updated_at: "2026-04-04T06:00:00Z",
          },
        ];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ dashboards }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Analytics: Run report ---
  registerParamRoute("/mabos/api/erp/analytics/reports/:id/run", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const reportId = segments[segments.length - 2];
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          ok: true,
          report_id: reportId,
          status: "running",
          started_at: new Date().toISOString(),
        }),
      );
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // --- Accounting: Invoices ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/accounting/invoices",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const invoices = [
          {
            id: "INV-2026-001",
            customer_name: "Aria Chen",
            customer_id: "C-001",
            amount: 189.0,
            status: "paid",
            issued_created_at: "2026-03-28",
            created_at: "2026-03-28",
            due_created_at: "2026-04-28",
            paid_created_at: "2026-03-30",
            items: [],
            item_count: 1,
          },
          {
            id: "INV-2026-002",
            customer_name: "Marcus Webb",
            customer_id: "C-001",
            amount: 340.0,
            status: "sent",
            issued_created_at: "2026-03-30",
            created_at: "2026-03-30",
            due_created_at: "2026-04-30",
          },
          {
            id: "INV-2026-003",
            customer_name: "Lina Petrova",
            customer_id: "C-001",
            amount: 520.0,
            status: "paid",
            issued_created_at: "2026-03-25",
            created_at: "2026-03-25",
            due_created_at: "2026-04-25",
            paid_created_at: "2026-03-26",
            items: [],
            item_count: 1,
          },
          {
            id: "INV-2026-004",
            customer_name: "James Okafor",
            customer_id: "C-001",
            amount: 135.0,
            status: "draft",
            issued_created_at: "2026-04-01",
            created_at: "2026-04-01",
            due_date: "2026-05-01",
          },
          {
            id: "INV-2026-005",
            customer_name: "Sophie Laurent",
            customer_id: "C-001",
            amount: 275.0,
            status: "sent",
            issued_created_at: "2026-03-29",
            created_at: "2026-03-29",
            due_created_at: "2026-04-29",
          },
        ];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ invoices }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Accounting: Chart of accounts ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/accounting/accounts",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const accounts = [
          { code: "1000", name: "Cash & Bank", type: "asset", balance: 87400 },
          { code: "1200", name: "Accounts Receivable", type: "asset", balance: 15200 },
          { code: "1400", name: "Inventory", type: "asset", balance: 34600 },
          { code: "2000", name: "Accounts Payable", type: "liability", balance: 12300 },
          { code: "2100", name: "Sales Tax Payable", type: "liability", balance: 2890 },
          { code: "3000", name: "Owner Equity", type: "equity", balance: 100000 },
          { code: "4000", name: "Product Revenue", type: "revenue", balance: 185000 },
          { code: "5000", name: "Cost of Goods Sold", type: "expense", balance: 74000 },
          { code: "6000", name: "Operating Expenses", type: "expense", balance: 38500 },
          { code: "6100", name: "Marketing & Advertising", type: "expense", balance: 18200 },
        ];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ accounts }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Accounting: Profit & Loss ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/accounting/profit-loss",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const url = new URL(_req.url || "", "http://localhost");
        const from = url.searchParams.get("from") || "2026-01-01";
        const to = url.searchParams.get("to") || "2026-03-31";
        const statement = {
          period: { from, to },
          revenue: { product_sales: 185000, shipping_income: 4200, total: 189200 },
          cost_of_goods: { materials: 42000, printing: 22000, framing: 10000, total: 74000 },
          gross_profit: 115200,
          operating_expenses: {
            marketing: 18200,
            payroll: 12000,
            rent: 4500,
            software: 2800,
            shipping: 8400,
            misc: 1600,
            total: 47500,
          },
          net_income: 67700,
        };
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(statement));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Accounting: Balance Sheet ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/accounting/balance-sheet",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const statement = {
          as_of: "2026-04-04",
          assets: {
            current: {
              cash: 87400,
              accounts_receivable: 15200,
              inventory: 34600,
              prepaid: 3200,
              total: 140400,
            },
            fixed: { equipment: 18000, furniture: 5500, less_depreciation: -4700, total: 18800 },
            total: 159200,
          },
          liabilities: {
            current: {
              accounts_payable: 12300,
              sales_tax: 2890,
              accrued_expenses: 4100,
              total: 19290,
            },
            long_term: { loan: 0, total: 0 },
            total: 19290,
          },
          equity: { owner_equity: 100000, retained_earnings: 39910, total: 139910 },
        };
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(statement));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Accounting: Cash Flow ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/accounting/cash-flow",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const url = new URL(_req.url || "", "http://localhost");
        const from = url.searchParams.get("from") || "2026-01-01";
        const to = url.searchParams.get("to") || "2026-03-31";
        const statement = {
          period: { from, to },
          operating: {
            net_income: 67700,
            depreciation: 1175,
            change_ar: -3200,
            change_inventory: -5400,
            change_ap: 2100,
            net_cash_operating: 62375,
          },
          investing: { equipment_purchases: -4500, net_cash_investing: -4500 },
          financing: { owner_draws: -8000, net_cash_financing: -8000 },
          net_change: 49875,
          beginning_cash: 37525,
          ending_cash: 87400,
        };
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(statement));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Accounting: Expense Report ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/accounting/expense-report",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const url = new URL(_req.url || "", "http://localhost");
        const from = url.searchParams.get("from") || "2026-01-01";
        const to = url.searchParams.get("to") || "2026-03-31";
        const statement = {
          period: { from, to },
          categories: [
            { name: "Marketing & Advertising", amount: 18200, pct: 38.3 },
            { name: "Payroll & Contractors", amount: 12000, pct: 25.3 },
            { name: "Shipping & Fulfillment", amount: 8400, pct: 17.7 },
            { name: "Rent & Utilities", amount: 4500, pct: 9.5 },
            { name: "Software & Tools", amount: 2800, pct: 5.9 },
            { name: "Miscellaneous", amount: 1600, pct: 3.4 },
          ],
          total: 47500,
        };
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(statement));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Accounting: Budget vs Actual ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/accounting/budget-vs-actual",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const url = new URL(_req.url || "", "http://localhost");
        const from = url.searchParams.get("from") || "2026-01-01";
        const to = url.searchParams.get("to") || "2026-03-31";
        const statement = {
          period: { from, to },
          line_items: [
            {
              category: "Revenue",
              budget: 200000,
              actual: 189200,
              variance: -10800,
              variance_pct: -5.4,
            },
            { category: "COGS", budget: 80000, actual: 74000, variance: 6000, variance_pct: 7.5 },
            {
              category: "Marketing",
              budget: 20000,
              actual: 18200,
              variance: 1800,
              variance_pct: 9.0,
            },
            {
              category: "Payroll",
              budget: 15000,
              actual: 12000,
              variance: 3000,
              variance_pct: 20.0,
            },
            {
              category: "Shipping",
              budget: 10000,
              actual: 8400,
              variance: 1600,
              variance_pct: 16.0,
            },
            { category: "Software", budget: 3000, actual: 2800, variance: 200, variance_pct: 6.7 },
            { category: "Rent", budget: 4500, actual: 4500, variance: 0, variance_pct: 0 },
          ],
          summary: { total_budget: 132500, total_actual: 119900, net_variance: 12600 },
        };
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(statement));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Compliance: Policies ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/compliance/policies",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const policies = [
          {
            id: "POL-001",
            name: "Data Protection & Privacy",
            category: "data",
            status: "active",
            last_review: "2026-02-01",
            effective_date: "2025-06-01",
            effective_date: "2025-06-01",
            next_review: "2026-08-01",
          },
          {
            id: "POL-002",
            name: "Anti-Money Laundering",
            category: "financial",
            status: "active",
            last_review: "2025-12-15",
            effective_date: "2025-06-01",
            effective_date: "2025-06-01",
            next_review: "2026-06-15",
          },
          {
            id: "POL-003",
            name: "Intellectual Property Rights",
            category: "legal",
            status: "active",
            last_review: "2026-01-10",
            effective_date: "2025-06-01",
            effective_date: "2025-06-01",
            next_review: "2026-07-10",
          },
          {
            id: "POL-004",
            name: "Environmental Sustainability",
            category: "operations",
            status: "active",
            last_review: "2025-11-20",
            effective_date: "2025-06-01",
            effective_date: "2025-06-01",
            next_review: "2026-05-20",
          },
          {
            id: "POL-005",
            name: "Workplace Safety & Health",
            category: "hr",
            status: "under_review",
            last_review: "2025-09-01",
            effective_date: "2025-06-01",
            effective_date: "2025-06-01",
            next_review: "2026-03-01",
          },
        ];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ policies }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Compliance: Violations ---
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/erp/compliance/violations",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const violations = [
          {
            id: "VIO-001",
            policy: "Data Protection & Privacy",
            description: "Customer PII exposed in debug logs",
            severity: "high",
            status: "resolved",
            detected_at: "2026-02-18",
            created_at: "2026-02-18",
            reported_by: "compliance-director",
            resolved_created_at: "2026-02-19",
            items: [],
            item_count: 1,
          },
          {
            id: "VIO-002",
            policy: "Intellectual Property Rights",
            description: "Unlicensed stock image used in campaign",
            severity: "medium",
            status: "open",
            detected_at: "2026-03-25",
            created_at: "2026-03-25",
            reported_by: "compliance-director",
          },
          {
            id: "VIO-003",
            policy: "Environmental Sustainability",
            description: "Non-recyclable packaging used for batch B-412",
            severity: "low",
            status: "remediation",
            detected_at: "2026-03-30",
            created_at: "2026-03-30",
            reported_by: "compliance-director",
          },
        ];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ violations }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Compliance: Single violation ---
  registerParamRoute("/mabos/api/erp/compliance/violations/:id", async (req, res) => {
    try {
      const url = new URL(req.url || "", "http://localhost");
      const violationId = url.pathname.split("/").pop() || "";
      const violations = [
        {
          id: "VIO-001",
          policy: "Data Protection & Privacy",
          description: "Customer PII exposed in debug logs",
          severity: "high",
          status: "resolved",
          detected_at: "2026-02-18",
          created_at: "2026-02-18",
          reported_by: "compliance-director",
          resolved_date: "2026-02-19",
          remediation: "Removed PII from log output, added log sanitization filter",
          assignee: "Tech Ops",
        },
        {
          id: "VIO-002",
          policy: "Intellectual Property Rights",
          description: "Unlicensed stock image used in campaign",
          severity: "medium",
          status: "open",
          detected_at: "2026-03-25",
          created_at: "2026-03-25",
          reported_by: "compliance-director",
          remediation: "",
          assignee: "Marketing",
        },
        {
          id: "VIO-003",
          policy: "Environmental Sustainability",
          description: "Non-recyclable packaging used for batch B-412",
          severity: "low",
          status: "remediation",
          detected_at: "2026-03-30",
          created_at: "2026-03-30",
          reported_by: "compliance-director",
          remediation: "Switching to EcoPack supplier for all future batches",
          assignee: "Operations",
        },
      ];
      const violation = violations.find((v) => v.id === violationId);
      if (!violation) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Violation not found" }));
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ violation }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // Dashboard: serve SPA HTML (no trailing slash)
  // Dashboard: serve SPA HTML (no trailing slash)
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/dashboard",
    handler: async (_req, res) => {
      try {
        const { readFile } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const thisDir = join(fileURLToPath(import.meta.url), "..");
        const htmlPath = join(thisDir, "ui", "dist", "index.html");
        const html = await readFile(htmlPath, "utf-8");
        res.setHeader("Content-Type", "text/html");
        res.end(html);
      } catch {
        res.setHeader("Content-Type", "text/html");
        res.end(
          `<!DOCTYPE html><html><head><title>MABOS</title></head><body style="background:#0d1117;color:#c9d1d9;font-family:sans-serif;padding:40px"><h1 style="color:#58a6ff">MABOS Dashboard</h1><p>Dashboard files not found. Run <code>cd extensions/mabos/ui && npm run build</code> first.</p></body></html>`,
        );
      }
    },
  });

  // Dashboard: wildcard static file server for all dashboard assets + SPA fallback
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/dashboard/*",
    handler: async (req, res) => {
      try {
        const { readFile } = await import("node:fs/promises");
        const path = await import("node:path");
        const { join, extname } = path;
        const { fileURLToPath } = await import("node:url");
        const thisDir = join(fileURLToPath(import.meta.url), "..");

        const url = new URL(req.url || "", "http://localhost");
        const filePath = url.pathname.replace("/mabos/dashboard/", "");

        if (!filePath) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }

        const contentTypes: Record<string, string> = {
          ".html": "text/html",
          ".css": "text/css",
          ".js": "application/javascript",
          ".json": "application/json",
          ".svg": "image/svg+xml",
          ".png": "image/png",
          ".ico": "image/x-icon",
          ".woff": "font/woff",
          ".woff2": "font/woff2",
          ".ttf": "font/ttf",
        };

        const ext = extname(filePath).toLowerCase();

        const fullPath = join(thisDir, "ui", "dist", filePath);
        const baseDir = path.resolve(join(thisDir, "ui", "dist"));

        const resolved = path.resolve(fullPath);

        // Block directory traversal via resolved path comparison
        if (!resolved.startsWith(baseDir + path.sep) && resolved !== baseDir) {
          res.statusCode = 403;
          res.end("Forbidden");
          return;
        }

        // If no file extension or unknown extension, serve index.html for SPA routing
        if (!ext || !contentTypes[ext]) {
          const htmlPath = join(thisDir, "ui", "dist", "index.html");
          try {
            const html = await readFile(htmlPath, "utf-8");
            res.setHeader("Content-Type", "text/html");
            res.end(html);
            return;
          } catch {
            // Fall through to 404
          }
        }

        const contentType = contentTypes[ext] || "application/octet-stream";
        const content = await readFile(fullPath);
        res.setHeader("Content-Type", contentType);
        res.end(content);
      } catch {
        // SPA fallback: serve index.html for any non-file route
        try {
          const { readFile } = await import("node:fs/promises");
          const { join } = await import("node:path");
          const { fileURLToPath } = await import("node:url");
          const thisDir = join(fileURLToPath(import.meta.url), "..");
          const htmlPath = join(thisDir, "ui", "dist", "index.html");
          const html = await readFile(htmlPath, "utf-8");
          res.setHeader("Content-Type", "text/html");
          res.end(html);
        } catch {
          res.statusCode = 404;
          res.end("Not found");
        }
      }
    },
  });

  // ── 5. Unified Memory Bridge ──────────────────────────────────
  // Bridge MABOS memory_store_item to also use native memory search
  // when available. This augments the existing file-based bridge
  // with the runtime's BM25 + vector search capabilities.
  api.registerTool(
    (ctx) => {
      const memorySearchTool = api.runtime.tools.createMemorySearchTool({
        config: ctx.config,
        agentSessionKey: ctx.sessionKey,
      });

      if (!memorySearchTool) return null;

      return {
        name: "mabos_memory_search",
        label: "MABOS Memory Search",
        description:
          "Search agent memories using the native BM25 + vector search engine. " +
          "This searches across all memory files (daily logs, MEMORY.md, cognitive files). " +
          "Use for recalling past decisions, business context, or agent learnings.",
        parameters: {
          type: "object" as const,
          properties: {
            query: { type: "string" as const, description: "Search query" },
            agent_id: { type: "string" as const, description: "Optional: filter by agent ID" },
            limit: { type: "number" as const, description: "Max results (default 10)" },
          },
          required: ["query"],
        },
        async execute(
          toolCallId: string,
          params: { query: string; agent_id?: string; limit?: number },
        ) {
          // Delegate to the native memory search
          return (memorySearchTool as any).execute(toolCallId, {
            query: params.query,
            limit: params.limit ?? 10,
          });
        },
      };
    },
    { names: ["mabos_memory_search"] },
  );

  // ── BPMN 2.0 Workflow API ────────────────────────────────────

  const BPMN_DB = "mabos";

  // GET /mabos/api/workflows — list all BPMN workflows
  api.registerHttpRoute({
    auth: "plugin",
    path: "/mabos/api/workflows",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const url = new URL(req.url || "/", "http://localhost");
        const status = url.searchParams.get("status") || undefined;
        const agentId = url.searchParams.get("agentId") || "vw-ceo";

        // If TypeDB is disabled, derive workflows from cron-jobs.json
        if (process.env.TYPEDB_SKIP === "1") {
          if (req.method === "POST") {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, id: "wf-" + Date.now() }));
            return;
          }
          const { join } = await import("node:path");
          const cronPath = join(workspaceDir, "businesses/vividwalls/cron-jobs.json");
          const cronJobs = (await readJsonSafe(cronPath)) ?? [];
          const agentGroups = new Map<string, any[]>();
          for (const job of Array.isArray(cronJobs) ? cronJobs : []) {
            const aid = job.agentId || "unknown";
            if (!agentGroups.has(aid)) agentGroups.set(aid, []);
            agentGroups.get(aid)!.push(job);
          }
          const workflows = Array.from(agentGroups.entries()).map(([aid, jobs], i) => ({
            id: "wf-" + aid,
            name:
              aid.replace(/-/g, " ").replace(/\w/g, (c: string) => c.toUpperCase()) + " Workflow",
            status: jobs.some((j: any) => j.enabled) ? "active" : "paused",
            description: jobs.length + " scheduled tasks",
            elements: jobs.map((j: any, idx: number) => ({
              id: j.id || "el-" + idx,
              type: "task",
              name: j.name || j.action,
              position: { x: 100 + idx * 180, y: 100 },
            })),
            flows: [],
            pools: [],
            lanes: [],
          }));
          const filtered = status ? workflows.filter((w: any) => w.status === status) : workflows;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ workflows: filtered }));
          return;
        }

        const { getTypeDBClient } =
          process.env.TYPEDB_SKIP === "1"
            ? ({
                getTypeDBClient: () => ({ isAvailable: () => false, connect: async () => false }),
              } as any)
            : await import("./src/knowledge/typedb-client.js");
        const { BpmnStoreQueries } = await import("./src/knowledge/bpmn-queries.js");
        const client = getTypeDBClient();

        if (req.method === "POST") {
          // Create workflow
          const body = await readMabosJsonBody<any>(req, res);
          if (!body) return;
          const id = body.id || `bpmn-wf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          const typeql = BpmnStoreQueries.createWorkflow(body.agentId || agentId, {
            id,
            name: body.name || "Untitled Workflow",
            status: body.status || "pending",
            description: body.description,
            version: body.version,
          });
          await client.insertData(typeql, BPMN_DB);

          // Link to goal if provided
          if (body.goalId) {
            const linkTypeql = BpmnStoreQueries.linkWorkflowToGoal(id, body.goalId);
            await client.insertData(linkTypeql, BPMN_DB).catch(() => {});
          }

          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true, id }));
          return;
        }

        // GET — list workflows
        const typeql = BpmnStoreQueries.queryWorkflows(agentId, { status });
        const results = await client.matchQuery(typeql, BPMN_DB);
        const workflows = Array.isArray(results)
          ? results.map((r: any) => ({
              id: r.wfid?.value ?? r.wfid,
              name: r.wn?.value ?? r.wn,
              status: r.ws?.value ?? r.ws,
              createdAt: r.wc?.value ?? r.wc,
              updatedAt: r.wu?.value ?? r.wu,
            }))
          : [];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ workflows }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // GET/PUT/DELETE /mabos/api/workflows/:id
  registerParamRoute("/mabos/api/workflows/:id", async (req, res) => {
    try {
      const { getTypeDBClient } =
        process.env.TYPEDB_SKIP === "1"
          ? ({
              getTypeDBClient: () => ({ isAvailable: () => false, connect: async () => false }),
            } as any)
          : await import("./src/knowledge/typedb-client.js");
      const { BpmnStoreQueries } = await import("./src/knowledge/bpmn-queries.js");
      const client = getTypeDBClient();
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const id = sanitizeId(segments[segments.length - 1]);
      if (!id) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid workflow ID" }));
        return;
      }

      if (req.method === "DELETE") {
        await client.deleteData(BpmnStoreQueries.deleteWorkflow(id), BPMN_DB);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === "PUT") {
        const body = await readMabosJsonBody<any>(req, res);
        if (!body) return;
        const typeql = BpmnStoreQueries.updateWorkflow(id, {
          name: body.name,
          status: body.status,
          description: body.description,
        });
        await client.insertData(typeql, BPMN_DB);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // GET — full workflow with elements, flows, pools, lanes
      const wfResult = await client.matchQuery(BpmnStoreQueries.queryWorkflow(id), BPMN_DB);
      if (!wfResult || (Array.isArray(wfResult) && wfResult.length === 0)) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: "Workflow not found" }));
        return;
      }
      const wf = Array.isArray(wfResult) ? wfResult[0] : wfResult;

      // Fetch elements
      let elements: any[] = [];
      try {
        const elResult = await client.matchQuery(BpmnStoreQueries.queryElements(id), BPMN_DB);
        elements = Array.isArray(elResult)
          ? elResult.map((r: any) => ({
              id: r.eid?.value ?? r.eid,
              type: r.etype?.value ?? r.etype,
              position: { x: r.px?.value ?? r.px ?? 0, y: r.py?.value ?? r.py ?? 0 },
              size: { w: r.sw?.value ?? r.sw ?? 160, h: r.sh?.value ?? r.sh ?? 80 },
            }))
          : [];
      } catch {
        /* no elements yet */
      }

      // Fetch flows
      let flows: any[] = [];
      try {
        const flResult = await client.matchQuery(BpmnStoreQueries.queryFlows(id), BPMN_DB);
        flows = Array.isArray(flResult)
          ? flResult.map((r: any) => ({
              id: r.fid?.value ?? r.fid,
              type: r.ft?.value ?? r.ft,
              sourceId: r.sid?.value ?? r.sid,
              targetId: r.tid?.value ?? r.tid,
            }))
          : [];
      } catch {
        /* no flows yet */
      }

      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          id,
          name: wf.wn?.value ?? wf.wn,
          status: wf.ws?.value ?? wf.ws,
          elements,
          flows,
          pools: [],
          lanes: [],
        }),
      );
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // POST /mabos/api/workflows/:id/elements — add element
  registerParamRoute("/mabos/api/workflows/:id/elements", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const { getTypeDBClient } =
        process.env.TYPEDB_SKIP === "1"
          ? ({
              getTypeDBClient: () => ({ isAvailable: () => false, connect: async () => false }),
            } as any)
          : await import("./src/knowledge/typedb-client.js");
      const { BpmnStoreQueries } = await import("./src/knowledge/bpmn-queries.js");
      const client = getTypeDBClient();
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const workflowId = sanitizeId(segments[segments.length - 2]);
      if (!workflowId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid workflow ID" }));
        return;
      }

      const body = await readMabosJsonBody<any>(req, res);
      if (!body) return;
      const agentId = body.agentId || "vw-ceo";
      const elementId =
        body.id || `bpmn-el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const typeql = BpmnStoreQueries.addElement(agentId, workflowId, {
        id: elementId,
        name: body.name,
        element_type: body.type || body.element_type || "task",
        pos_x: body.position?.x ?? body.pos_x ?? 0,
        pos_y: body.position?.y ?? body.pos_y ?? 0,
        size_w: body.size?.w ?? body.size_w,
        size_h: body.size?.h ?? body.size_h,
        event_position: body.eventPosition ?? body.event_position,
        event_trigger: body.eventTrigger ?? body.event_trigger,
        event_catching: body.eventCatching ?? body.event_catching,
        task_type_bpmn: body.taskType ?? body.task_type_bpmn,
        loop_type: body.loopType ?? body.loop_type,
        gateway_type: body.gatewayType ?? body.gateway_type,
        subprocess_type: body.subProcessType ?? body.subprocess_type,
        assignee_agent_id: body.assignee ?? body.assignee_agent_id,
        action_tool: body.action ?? body.action_tool,
        lane_id: body.laneId ?? body.lane_id,
        documentation: body.documentation,
      });
      await client.insertData(typeql, BPMN_DB);

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, id: elementId }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // PUT /mabos/api/workflows/:id/elements/:eid — update element
  registerParamRoute("/mabos/api/workflows/:id/elements/:eid", async (req, res) => {
    try {
      const { getTypeDBClient } =
        process.env.TYPEDB_SKIP === "1"
          ? ({
              getTypeDBClient: () => ({ isAvailable: () => false, connect: async () => false }),
            } as any)
          : await import("./src/knowledge/typedb-client.js");
      const { BpmnStoreQueries } = await import("./src/knowledge/bpmn-queries.js");
      const client = getTypeDBClient();
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const elementId = sanitizeId(segments[segments.length - 1]);
      if (!elementId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid element ID" }));
        return;
      }

      if (req.method === "DELETE") {
        await client.deleteData(BpmnStoreQueries.deleteElement(elementId), BPMN_DB);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (req.method === "PATCH" || req.method === "PUT") {
        const body = await readMabosJsonBody<any>(req, res);
        if (!body) return;

        // Position-only update
        if (body.position && Object.keys(body).length <= 2) {
          const typeql = BpmnStoreQueries.updateElementPosition(
            elementId,
            body.position.x,
            body.position.y,
          );
          await client.insertData(typeql, BPMN_DB);
        } else {
          // Full field update
          const fields: Record<string, string | number | boolean> = {};
          if (body.name !== undefined) fields.name = body.name;
          if (body.element_type !== undefined) fields.element_type = body.element_type;
          if (body.task_type_bpmn !== undefined) fields.task_type_bpmn = body.task_type_bpmn;
          if (body.gateway_type !== undefined) fields.gateway_type = body.gateway_type;
          if (body.documentation !== undefined) fields.documentation = body.documentation;
          if (Object.keys(fields).length > 0) {
            const typeql = BpmnStoreQueries.updateElement(elementId, fields);
            await client.insertData(typeql, BPMN_DB);
          }
        }

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.statusCode = 405;
      res.end(JSON.stringify({ error: "Method not allowed" }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // POST /mabos/api/workflows/:id/flows — create flow
  registerParamRoute("/mabos/api/workflows/:id/flows", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const { getTypeDBClient } =
        process.env.TYPEDB_SKIP === "1"
          ? ({
              getTypeDBClient: () => ({ isAvailable: () => false, connect: async () => false }),
            } as any)
          : await import("./src/knowledge/typedb-client.js");
      const { BpmnStoreQueries } = await import("./src/knowledge/bpmn-queries.js");
      const client = getTypeDBClient();
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const workflowId = sanitizeId(segments[segments.length - 2]);
      if (!workflowId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid workflow ID" }));
        return;
      }

      const body = await readMabosJsonBody<any>(req, res);
      if (!body) return;
      const agentId = body.agentId || "vw-ceo";
      const flowId = body.id || `bpmn-fl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const typeql = BpmnStoreQueries.addFlow(agentId, workflowId, {
        id: flowId,
        flow_type: body.type || body.flow_type || "sequence",
        source_id: body.sourceId || body.source_id,
        target_id: body.targetId || body.target_id,
        name: body.name,
        condition_expr: body.conditionExpression || body.condition_expr,
        is_default: body.isDefault ?? body.is_default,
      });
      await client.insertData(typeql, BPMN_DB);

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, id: flowId }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // DELETE /mabos/api/workflows/:id/flows/:fid
  registerParamRoute("/mabos/api/workflows/:id/flows/:fid", async (req, res) => {
    if (req.method !== "DELETE") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const { getTypeDBClient } =
        process.env.TYPEDB_SKIP === "1"
          ? ({
              getTypeDBClient: () => ({ isAvailable: () => false, connect: async () => false }),
            } as any)
          : await import("./src/knowledge/typedb-client.js");
      const { BpmnStoreQueries } = await import("./src/knowledge/bpmn-queries.js");
      const client = getTypeDBClient();
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const flowId = sanitizeId(segments[segments.length - 1]);
      if (!flowId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid flow ID" }));
        return;
      }
      await client.deleteData(BpmnStoreQueries.deleteFlow(flowId), BPMN_DB);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // POST /mabos/api/workflows/:id/pools — add pool
  registerParamRoute("/mabos/api/workflows/:id/pools", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const { getTypeDBClient } =
        process.env.TYPEDB_SKIP === "1"
          ? ({
              getTypeDBClient: () => ({ isAvailable: () => false, connect: async () => false }),
            } as any)
          : await import("./src/knowledge/typedb-client.js");
      const { BpmnStoreQueries } = await import("./src/knowledge/bpmn-queries.js");
      const client = getTypeDBClient();
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const workflowId = sanitizeId(segments[segments.length - 2]);
      if (!workflowId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid workflow ID" }));
        return;
      }

      const body = await readMabosJsonBody<any>(req, res);
      if (!body) return;
      const agentId = body.agentId || "vw-ceo";
      const poolId = body.id || `bpmn-pool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const typeql = BpmnStoreQueries.addPool(agentId, workflowId, {
        id: poolId,
        name: body.name || "Pool",
        participant_ref: body.participantRef,
        is_black_box: body.isBlackBox,
      });
      await client.insertData(typeql, BPMN_DB);

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, id: poolId }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // POST /mabos/api/workflows/:id/lanes — add lane
  registerParamRoute("/mabos/api/workflows/:id/lanes", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const { getTypeDBClient } =
        process.env.TYPEDB_SKIP === "1"
          ? ({
              getTypeDBClient: () => ({ isAvailable: () => false, connect: async () => false }),
            } as any)
          : await import("./src/knowledge/typedb-client.js");
      const { BpmnStoreQueries } = await import("./src/knowledge/bpmn-queries.js");
      const client = getTypeDBClient();
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const workflowId = sanitizeId(segments[segments.length - 2]);
      if (!workflowId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid workflow ID" }));
        return;
      }

      const body = await readMabosJsonBody<any>(req, res);
      if (!body) return;
      const agentId = body.agentId || "vw-ceo";
      const laneId = body.id || `bpmn-lane-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const typeql = BpmnStoreQueries.addLane(agentId, body.poolId, {
        id: laneId,
        name: body.name || "Lane",
        assignee_agent_id: body.assignee,
      });
      await client.insertData(typeql, BPMN_DB);

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, id: laneId }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // POST /mabos/api/workflows/:id/validate — BPMN validation
  registerParamRoute("/mabos/api/workflows/:id/validate", async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return;
    }
    try {
      const { getTypeDBClient } =
        process.env.TYPEDB_SKIP === "1"
          ? ({
              getTypeDBClient: () => ({ isAvailable: () => false, connect: async () => false }),
            } as any)
          : await import("./src/knowledge/typedb-client.js");
      const { BpmnStoreQueries } = await import("./src/knowledge/bpmn-queries.js");
      const client = getTypeDBClient();
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const workflowId = sanitizeId(segments[segments.length - 2]);
      if (!workflowId) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Invalid workflow ID" }));
        return;
      }

      const errors: { elementId: string; message: string; severity: string }[] = [];

      // Check orphan nodes
      try {
        const orphanResult = await client.matchQuery(
          BpmnStoreQueries.queryOrphanNodes(workflowId),
          BPMN_DB,
        );
        if (Array.isArray(orphanResult)) {
          for (const r of orphanResult) {
            const eid = r.eid?.value ?? r.eid;
            const etype = r.etype?.value ?? r.etype;
            if (etype !== "startEvent" && etype !== "endEvent") {
              errors.push({
                elementId: eid,
                message: `Element "${eid}" has no connections`,
                severity: "warning",
              });
            }
          }
        }
      } catch {
        /* skip orphan check */
      }

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ valid: errors.length === 0, errors }));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // ── 6. Agent Lifecycle Hooks ──────────────────────────────────

  const cfg = getPluginConfig(api);

  // Inject BDI context + Persona.md + cognitive context + auto-recall into system prompt
  api.on("before_agent_start", async (_event, ctx) => {
    if (!ctx.workspaceDir) return undefined;

    const agentDir = ctx.workspaceDir;
    const agentId = ctx.agentId ?? "unknown";

    try {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");

      const parts: string[] = [];

      // Load Persona.md
      const persona = await readFile(join(agentDir, "Persona.md"), "utf-8").catch(() => null);
      if (persona) {
        parts.push(`## Agent Persona\n${persona}`);
      }

      // Load active goals summary
      const goals = await readFile(join(agentDir, "Goals.md"), "utf-8").catch(() => null);
      if (goals) {
        const activeGoals = goals
          .split("\n")
          .filter((l) => l.includes("status: active") || l.startsWith("## "))
          .slice(0, 20)
          .join("\n");
        if (activeGoals.trim()) {
          parts.push(`## Active Goals\n${activeGoals}`);
        }
      }

      // Load current commitments
      const commitments = await readFile(join(agentDir, "Commitments.md"), "utf-8").catch(
        () => null,
      );
      if (commitments && commitments.trim()) {
        const summary = commitments.slice(0, 300);
        parts.push(`## Current Commitments\n${summary}`);
      }

      // ── Cognitive context injection (beliefs, desires, plans, knowledge) ──
      if (cfg.cognitiveContextEnabled !== false) {
        try {
          const { assembleCognitiveContext } = await import("./src/tools/cognitive-context.js");
          const { cognitiveExtras, longTermHighlights } = await assembleCognitiveContext(agentDir);
          if (cognitiveExtras) {
            parts.push(`## Cognitive State\n${cognitiveExtras}`);
          }
          if (longTermHighlights) {
            parts.push(`## Long-Term Memory Highlights\n${longTermHighlights}`);
          }
        } catch (err) {
          log.debug(`[mabos] Cognitive context skipped: ${err}`);
        }
      }

      // ── Auto-recall relevant memories for this session ──
      if (cfg.autoRecallEnabled !== false) {
        try {
          const { semanticRecall } = await import("./src/tools/memory-tools.js");
          // Use the agent's Persona + Goals as the recall query
          const recallQuery = parts.slice(0, 2).join(" ").slice(0, 500);
          if (recallQuery.trim()) {
            const results = await semanticRecall(api, agentId, recallQuery, 5);
            if (results && results.length > 0) {
              const recallBlock = results
                .map((r) => `- [${(r.score * 100).toFixed(0)}%] ${r.content}`)
                .join("\n");
              parts.push(`## Recalled Memories\n${recallBlock}`);
            }
          }
        } catch (err) {
          log.debug(`[mabos] Auto-recall skipped: ${err}`);
        }
      }

      // ── Observation log summary (recent critical/important observations) ──
      if (cfg.preCompactionObserverEnabled !== false) {
        try {
          const { loadObservationLog } = await import("./src/tools/observation-store.js");
          const { formatObservationLog } = await import("./src/tools/observer.js");
          const obsLog = await loadObservationLog(api, agentId);
          if (obsLog.observations.length > 0) {
            // Include only critical/important observations, most recent 10
            const relevant = obsLog.observations
              .filter((o) => o.priority === "critical" || o.priority === "important")
              .slice(-10);
            if (relevant.length > 0) {
              parts.push(`## Recent Observations\n${formatObservationLog(relevant)}`);
            }
          }
        } catch (err) {
          log.debug(`[mabos] Observation log injection skipped: ${err}`);
        }
      }

      // ── Inbox context injection (pending messages) ──
      if (cfg.inboxContextEnabled !== false) {
        try {
          const inboxPath = join(agentDir, "inbox.json");
          const inboxRaw = await readFile(inboxPath, "utf-8").catch(() => "[]");
          const inbox: Array<{
            id: string;
            from: string;
            performative: string;
            priority: string;
            content: string;
            timestamp: string;
            read: boolean;
          }> = JSON.parse(inboxRaw);

          const unread = inbox.filter((m) => !m.read);
          if (unread.length > 0) {
            // Sort by priority: urgent > high > normal > low
            const priorityOrder: Record<string, number> = {
              urgent: 0,
              high: 1,
              normal: 2,
              low: 3,
            };
            unread.sort(
              (a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2),
            );

            const top = unread.slice(0, 10);
            const lines = top.map(
              (m) =>
                `- **${m.id}** from ${m.from} [${m.performative}] (${m.priority}): ${m.content.slice(0, 200)}${m.content.length > 200 ? "..." : ""} _${m.timestamp}_`,
            );
            const summary = `${unread.length} unread message(s)${unread.length > 10 ? ` (showing top 10)` : ""}\n\n${lines.join("\n")}`;
            parts.push(`## Pending Inbox Messages\n${summary}`);
          }
        } catch (err) {
          log.debug(`[mabos] Inbox context injection skipped: ${err}`);
        }
      }

      if (parts.length > 0) {
        return {
          prependContext: `[MABOS Agent Context]\n${parts.join("\n\n")}\n`,
        };
      }
    } catch (err) {
      log.debug(`Agent context injection skipped: ${err}`);
    }
    return undefined;
  });

  // ── Pre-compaction Observer: compress messages into observations ──
  api.on("before_compaction", async (event, ctx) => {
    if (cfg.preCompactionObserverEnabled === false) return;
    if (!event.messages || !Array.isArray(event.messages) || event.messages.length === 0) return;

    const agentId = ctx.agentId ?? "unknown";

    try {
      const { compressMessagesToObservations } = await import("./src/tools/observer.js");
      const { loadObservationLog, saveObservationLog } =
        await import("./src/tools/observation-store.js");

      // Load existing observation log
      const obsLog = await loadObservationLog(api, agentId);

      // Convert event messages to ObservableMessage format
      const observableMessages = (event.messages as any[]).map((m) => ({
        role: m.role ?? "unknown",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
        name: m.name,
        timestamp: m.timestamp ?? new Date().toISOString(),
      }));

      // Run Observer compression
      const result = compressMessagesToObservations(observableMessages, obsLog.observations);

      if (result.observations.length > 0) {
        obsLog.observations = result.observations;
        obsLog.total_messages_compressed += result.messagesCompressed;
        obsLog.total_tool_calls_compressed += result.toolCallsCompressed;
        obsLog.last_observer_run_at = new Date().toISOString();

        await saveObservationLog(api, agentId, obsLog);
        log.info(
          `[mabos] Observer compressed ${result.messagesCompressed} messages into ${result.observations.length} observations for ${agentId}`,
        );
      }
    } catch (err) {
      log.debug(`[mabos] Pre-compaction observer failed: ${err}`);
    }
  });

  // ── Agent end: final observation checkpoint ──
  api.on("agent_end", async (event, ctx) => {
    if (cfg.preCompactionObserverEnabled === false) return;
    if (!event.messages || !Array.isArray(event.messages) || event.messages.length === 0) return;

    const agentId = ctx.agentId ?? "unknown";

    try {
      const { compressMessagesToObservations } = await import("./src/tools/observer.js");
      const { loadObservationLog, saveObservationLog } =
        await import("./src/tools/observation-store.js");

      const obsLog = await loadObservationLog(api, agentId);

      const observableMessages = (event.messages as any[]).map((m) => ({
        role: m.role ?? "unknown",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
        name: m.name,
        timestamp: m.timestamp ?? new Date().toISOString(),
      }));

      const result = compressMessagesToObservations(observableMessages, obsLog.observations);

      if (result.messagesCompressed > 0) {
        obsLog.observations = result.observations;
        obsLog.total_messages_compressed += result.messagesCompressed;
        obsLog.total_tool_calls_compressed += result.toolCallsCompressed;
        obsLog.last_observer_run_at = new Date().toISOString();

        await saveObservationLog(api, agentId, obsLog);
        log.info(
          `[mabos] Agent end checkpoint: ${result.messagesCompressed} messages → ${result.observations.length} observations for ${agentId}`,
        );
      }
    } catch (err) {
      log.debug(`[mabos] Agent end observation checkpoint failed: ${err}`);
    }
  });

  // BDI tool call audit trail
  api.on("after_tool_call", async (event, _ctx) => {
    if (
      event.toolName.startsWith("belief_") ||
      event.toolName.startsWith("goal_") ||
      event.toolName.startsWith("intention_") ||
      event.toolName.startsWith("desire_") ||
      event.toolName.startsWith("plan_") ||
      event.toolName === "bdi_cycle" ||
      event.toolName.startsWith("mabos_")
    ) {
      api.logger.info(`[mabos] BDI tool: ${event.toolName} (${event.durationMs ?? 0}ms)`);
    }
  });

  // ── Unified MABOS Modules (Paperclip + Hermes) ──────────────
  const pluginConfig = getPluginConfig(api);

  // Module 6: Security Hardening (enabled by default — opt-out, not opt-in)
  try {
    createSecurityModule(api, pluginConfig);
  } catch (err) {
    log.warn(`[mabos] Security module failed to initialize: ${err}`);
  }

  // Module 1: Governance (budget, RBAC, audit, multi-company)
  if (pluginConfig.governanceEnabled) {
    try {
      registerGovernance(api, pluginConfig);
    } catch (err) {
      log.warn(`[mabos] Governance module failed to initialize: ${err}`);
    }
  }

  // Module 2: Model Router (multi-provider, fallback, MoA, prompt cache)
  if (pluginConfig.modelRouterEnabled) {
    try {
      registerModelRouter(api, pluginConfig);
    } catch (err) {
      log.warn(`[mabos] Model router module failed to initialize: ${err}`);
    }
  }

  // Module 3: Execution Sandbox (Docker, SSH, Modal)
  if (pluginConfig.sandboxEnabled) {
    try {
      registerExecutionSandbox(api, pluginConfig);
    } catch (err) {
      log.warn(`[mabos] Execution sandbox module failed to initialize: ${err}`);
    }
  }

  // Module 4: Skill Loop (auto-creation, marketplace)
  if (pluginConfig.skillLoopEnabled) {
    try {
      registerSkillLoop(api, pluginConfig);
    } catch (err) {
      log.warn(`[mabos] Skill loop module failed to initialize: ${err}`);
    }
  }

  // Module 5: Session Intelligence (FTS5, recall, user modeling)
  if (pluginConfig.sessionIntelEnabled) {
    try {
      registerSessionIntel(api, pluginConfig);
    } catch (err) {
      log.warn(`[mabos] Session intel module failed to initialize: ${err}`);
    }
  }

  // Module 6: GDC Pipeline (goal decomposition chain)
  if (pluginConfig.gdcEnabled) {
    try {
      registerGdc(api, pluginConfig);
    } catch (err) {
      log.warn(`[mabos] GDC module failed to initialize: ${err}`);
    }
  }

  api.logger.info("[mabos] MABOS extension registered (bundled, deep integration)");
}
