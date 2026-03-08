/**
 * MABOS — Multi-Agent Business Operating System
 * Bundled Extension Entry Point (Deep Integration)
 *
 * Registers:
 *  - 133 tools across 22 modules (includes 34 Shopify Admin tools)
 *  - BDI background heartbeat service
 *  - CLI subcommands (onboard, agents, bdi, business, dashboard)
 *  - Unified memory bridge to native memory system
 *  - Agent lifecycle hooks (Persona injection, BDI audit trail)
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { isMabosProduct } from "../../src/config/paths.js";
import { createAuthRateLimiter } from "../../src/gateway/auth-rate-limit.js";
import { resolveGatewayAuth, type ResolvedGatewayAuth } from "../../src/gateway/auth.js";
import { authorizeGatewayBearerRequestOrReply } from "../../src/gateway/http-auth-helpers.js";
import { onAgentEvent, type AgentEventPayload } from "../../src/infra/agent-events.js";
import { readJsonBodyWithLimit } from "../../src/infra/http-body.js";
import { createCronBridgeService, callGatewayRpc } from "./src/cron-bridge.js";
import { createApprovalTools } from "./src/tools/approval-tools.js";
import { createBdiTools } from "./src/tools/bdi-tools.js";
import { createBpmnMigrateTools } from "./src/tools/bpmn-migrate.js";
import { createBusinessTools } from "./src/tools/business-tools.js";
import { createCapabilitiesSyncTools, categorize } from "./src/tools/capabilities-sync.js";
import { createCbrTools } from "./src/tools/cbr-tools.js";
import { createCloudflareTools } from "./src/tools/cloudflare-tools.js";
import {
  resolveWorkspaceDir,
  getPluginConfig,
  generatePrefixedId,
  listWorkspaceBusinessIds,
} from "./src/tools/common.js";
import { createCommunicationTools } from "./src/tools/communication-tools.js";
import { createCrmTools } from "./src/tools/crm-tools.js";
import { createDesireTools } from "./src/tools/desire-tools.js";
import { classifyDirective, buildRoutingDecision } from "./src/tools/directive-router.js";
import { createDirectiveTools } from "./src/tools/directive-tools.js";
import { createEmailTools } from "./src/tools/email-tools.js";
import { createFactStoreTools } from "./src/tools/fact-store.js";
import { createGoDaddyTools } from "./src/tools/godaddy-tools.js";
import { createInferenceTools } from "./src/tools/inference-tools.js";
import { createIntegrationTools } from "./src/tools/integration-tools.js";
import { createKnowledgeTools } from "./src/tools/knowledge-tools.js";
import { createLifestyleGalleryTools } from "./src/tools/lifestyle-gallery-tools.js";
import { createMarketingTools } from "./src/tools/marketing-tools.js";
import { createMemoryHierarchyTools } from "./src/tools/memory-hierarchy.js";
import { createMemoryTools } from "./src/tools/memory-tools.js";
import { createMetricsTools } from "./src/tools/metrics-tools.js";
import { createOnboardingTools } from "./src/tools/onboarding-tools.js";
import { createOntologyManagementTools } from "./src/tools/ontology-management-tools.js";
import { createPictoremTools } from "./src/tools/pictorem-tools.js";
import { createPlanningTools } from "./src/tools/planning-tools.js";
import { createReasoningTools } from "./src/tools/reasoning-tools.js";
import { createReportingTools } from "./src/tools/reporting-tools.js";
import { createRuleEngineTools } from "./src/tools/rule-engine.js";
import { createSendGridTools } from "./src/tools/sendgrid-tools.js";
import { createSeoAnalyticsTools } from "./src/tools/seo-analytics-tools.js";
import { createSetupWizardTools } from "./src/tools/setup-wizard-tools.js";
import { createShopifyTools } from "./src/tools/shopify-tools.js";
import { createShopifyAdminTools } from "./src/tools/shopify/index.js";
import { createStakeholderTools } from "./src/tools/stakeholder-tools.js";
import { createTwilioTools } from "./src/tools/twilio-tools.js";
import { createTypeDBTools } from "./src/tools/typedb-tools.js";
import { createWorkflowTools } from "./src/tools/workflow-tools.js";
import { createWorkforceTools } from "./src/tools/workforce-tools.js";

// Use a variable for the bdi-runtime path so TypeScript doesn't try to
// statically resolve it (it lives outside this extension's rootDir).
const BDI_RUNTIME_PATH = "../../mabos/bdi-runtime/index.js";

export default function register(api: OpenClawPluginApi) {
  const log = api.logger;

  // ── ERP PostgreSQL (lazy) ───────────────────────────────────
  type PgClient = import("pg").Pool;
  let _erpPg: PgClient | null = null;
  async function getErpPg(): Promise<PgClient> {
    if (!_erpPg) {
      const { getErpPgPool } = await import("../../mabos/erp/db/postgres.js");
      _erpPg = getErpPgPool();
    }
    return _erpPg;
  }

  // ── 1. Register all 99 tools ──────────────────────────────────
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
    createSendGridTools,
    createTwilioTools,
    createCloudflareTools,
    createGoDaddyTools,
    createShopifyTools,
    createShopifyAdminTools,
    createPictoremTools,
    createLifestyleGalleryTools,
    createApprovalTools,
    createDirectiveTools,
  ];

  const registeredToolNames: Array<{ name: string; description: string }> = [];
  for (const factory of factories) {
    const tools = factory(api);
    for (const tool of tools) {
      api.registerTool(tool);
      registeredToolNames.push({
        name: tool.name,
        description: (tool as any).description ?? "",
      });
    }
  }

  // Register capabilities_sync with knowledge of all registered tools
  const capSyncTools = createCapabilitiesSyncTools(api, {
    registeredToolNames: [...registeredToolNames], // snapshot, not live reference
  });
  for (const tool of capSyncTools) {
    registeredToolNames.push(tool.name);
    api.registerTool(tool);
  }

  // ── 2. BDI Background Service ─────────────────────────────────
  const workspaceDir = resolveWorkspaceDir(api);

  // Resolve gateway auth for MABOS HTTP routes
  const gatewayAuthConfig = (api as any).config?.gateway?.auth ?? {};
  const resolvedAuth: ResolvedGatewayAuth = resolveGatewayAuth({
    authConfig: gatewayAuthConfig,
  });

  const authRateLimiter =
    resolvedAuth.mode !== "none"
      ? createAuthRateLimiter({
          maxAttempts: 10,
          windowMs: 60_000,
          lockoutMs: 300_000,
        })
      : undefined;

  async function requireAuth(
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
  ): Promise<boolean> {
    // Skip auth if gateway is in "none" mode
    if (resolvedAuth.mode === "none") return true;
    // Skip auth for requests originating from the MABOS dashboard UI
    const referer = req.headers.referer || req.headers.origin || "";
    if (referer.includes("/mabos/dashboard")) return true;
    return authorizeGatewayBearerRequestOrReply({
      req,
      res,
      auth: resolvedAuth,
      rateLimiter: authRateLimiter,
    });
  }
  async function readMabosJsonBody<T = Record<string, unknown>>(
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
    opts?: { maxBytes?: number },
  ): Promise<T | null> {
    const result = await readJsonBodyWithLimit(req, {
      maxBytes: opts?.maxBytes ?? 1_048_576,
      timeoutMs: 10_000,
    });
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
            .then((ok) => {
              if (ok) api.logger.info("[mabos] TypeDB connected");
            })
            .catch((err) => {
              log.debug(`TypeDB connect failed: ${err}`);
            });
        })
        .catch((err) => {
          log.debug(`TypeDB import failed: ${err}`);
        });

      const runCycle = async () => {
        try {
          const { discoverAgents, readAgentCognitiveState, runMaintenanceCycle } = (await import(
            /* webpackIgnore: true */ BDI_RUNTIME_PATH
          )) as import("./src/types/bdi-runtime.js").BdiRuntime;
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
        const { getTypeDBClient } = await import("./src/knowledge/typedb-client.js");
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

  // ── 2c. Capabilities Auto-Sync Service ──────────────────────
  api.registerService({
    id: "capabilities-auto-sync",
    start: async () => {
      // Non-blocking: fire-and-forget so gateway startup is not delayed
      void (async () => {
        const { readdir, writeFile, readFile } = await import("node:fs/promises");
        const { join } = await import("node:path");

        const agentsDir = join(workspaceDir, "agents");
        try {
          const entries = await readdir(agentsDir, { withFileTypes: true });
          const agentIds = entries.filter((d) => d.isDirectory()).map((d) => d.name);

          // Build the tool listing section from registered MABOS tools
          const toolLines = registeredToolNames
            .map((t) => `- \`${t.name}\` — ${t.description || "(no description)"}`)
            .join("\n");

          let synced = 0;
          for (const agentId of agentIds) {
            try {
              const agentDir = join(agentsDir, agentId);

              // Preserve any hand-crafted sections (Constraints, Delegated Capabilities, etc.)
              let existingSections = "";
              try {
                const existing = await readFile(join(agentDir, "Capabilities.md"), "utf-8");
                // Extract sections after the auto-generated tools block
                const customMarker = "## Agent-Specific";
                const customIdx = existing.indexOf(customMarker);
                if (customIdx >= 0) {
                  existingSections = "\n" + existing.slice(customIdx);
                }
              } catch {
                // No existing file — that's fine
              }

              const now = new Date().toISOString();
              const content = `# Capabilities — ${agentId}

> Auto-synced on ${now}

## MABOS Tools (${registeredToolNames.length} registered)

${toolLines}
${existingSections}
`;

              await writeFile(join(agentDir, "Capabilities.md"), content, "utf-8");
              synced++;
            } catch (err) {
              log.debug?.(`Capabilities sync skipped for ${agentId}: ${err}`);
            }
          }
          log.info(
            `[mabos] Capabilities.md synced for ${synced}/${agentIds.length} agents on startup.`,
          );
        } catch (err) {
          log.debug?.(`[mabos] Agent capabilities auto-sync skipped: ${err}`);
        }
      })();
    },
  });

  // ── 3. CLI Subcommands ────────────────────────────────────────
  const registerMabosCliCommands = (
    root: { command: (name: string) => any },
    usagePrefix: string,
    legacyAlias = false,
  ) => {
    const maybeWarnLegacyAlias = () => {
      if (!legacyAlias) {
        return;
      }
      log.warn("[mabos] Legacy command prefix detected. Use `mabos <command>` instead.");
    };

    root
      .command("onboard")
      .description("Interactive 5-phase business onboarding")
      .argument("[business-name]", "Name of the business to onboard")
      .option("--industry <type>", "Industry vertical (e.g., ecommerce, saas)")
      .action(async (businessName: string | undefined, opts: { industry?: string }) => {
        maybeWarnLegacyAlias();
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
          log.info(`Usage: ${usagePrefix} onboard <business-name> [--industry <type>]`);
          log.info("Industries: ecommerce, saas, consulting, marketplace, retail");
        }
      });

    root
      .command("agents")
      .description("List BDI agents with cognitive state summary")
      .action(async () => {
        maybeWarnLegacyAlias();
        try {
          const { getAgentsSummary } = (await import(
            /* webpackIgnore: true */ BDI_RUNTIME_PATH
          )) as any;
          const summaries = await getAgentsSummary(workspaceDir);

          if (summaries.length === 0) {
            log.info(`No MABOS agents found. Run '${usagePrefix} onboard' to create a business.`);
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

    root
      .command("bdi")
      .description("BDI cognitive operations")
      .command("cycle")
      .argument("<agent-id>", "Agent to run BDI cycle for")
      .description("Trigger a BDI maintenance cycle for an agent")
      .action(async (agentId: string) => {
        maybeWarnLegacyAlias();
        try {
          const { join } = await import("node:path");
          const { readAgentCognitiveState, runMaintenanceCycle } = (await import(
            /* webpackIgnore: true */ BDI_RUNTIME_PATH
          )) as any;
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

    root
      .command("business")
      .description("Business management operations")
      .command("list")
      .description("List managed businesses")
      .action(async () => {
        maybeWarnLegacyAlias();
        try {
          const { readdir, stat: fsStat } = await import("node:fs/promises");
          const { join } = await import("node:path");
          const businessDir = join(workspaceDir, "businesses");
          const entries = await readdir(businessDir).catch(() => []);

          if (entries.length === 0) {
            log.info(`No businesses found. Run '${usagePrefix} onboard' to create one.`);
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

    root
      .command("migrate")
      .description("Migrate data from ~/.openclaw to ~/.mabos")
      .option("--dry-run", "Preview changes without modifying files")
      .action(async (opts: { dryRun?: boolean }) => {
        maybeWarnLegacyAlias();
        try {
          const migratePath = "../../mabos/scripts/migrate.js";
          const { migrate } = (await import(/* webpackIgnore: true */ migratePath)) as any;
          await migrate({ dryRun: opts.dryRun ?? false });
        } catch (err) {
          log.error(`Migration error: ${err instanceof Error ? err.message : String(err)}`);
        }
      });

    root
      .command("dashboard")
      .description("Open the MABOS web dashboard")
      .action(async () => {
        maybeWarnLegacyAlias();
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
  };

  const mabosProductMode = isMabosProduct();
  api.registerCli(
    ({ program }) => {
      if (mabosProductMode) {
        registerMabosCliCommands(program, "mabos");
        const legacyMabosPrefix = program
          .command("mabos")
          .description("Legacy command prefix alias (deprecated)");
        registerMabosCliCommands(legacyMabosPrefix, "mabos mabos", true);
        return;
      }

      const mabos = program
        .command("mabos")
        .description("MABOS — Multi-Agent Business Operating System");
      registerMabosCliCommands(mabos, "mabos");
    },
    {
      commands: mabosProductMode
        ? ["onboard", "agents", "bdi", "business", "migrate", "dashboard", "mabos"]
        : ["mabos"],
    },
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

  // API: Unified capabilities listing
  api.registerHttpRoute({
    path: "/mabos/api/capabilities",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;

      try {
        const INTERNAL_TOOLS = new Set(["capabilities_sync"]);
        const mabosTools = registeredToolNames
          .filter((name) => !INTERNAL_TOOLS.has(name))
          .map((name) => ({
            name,
            source: "mabos" as const,
            category: categorize(name),
          }));

        let openclawSkills: Array<{ name: string; primaryEnv?: string; source: string }> = [];
        try {
          const snapshot = api.getSkillSnapshot({ workspaceDir });
          openclawSkills = (snapshot.skills ?? []).map((s: any) => ({
            name: s.name,
            primaryEnv: s.primaryEnv,
            source: "openclaw",
          }));
        } catch {
          // getSkillSnapshot unavailable — non-critical
        }

        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            mabosTools,
            openclawSkills,
            totalCount: mabosTools.length + openclawSkills.length,
            generatedAt: new Date().toISOString(),
          }),
        );
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  const listBusinessCandidates = async (preferredBusinessId?: string): Promise<string[]> => {
    const candidates = new Set<string>();
    const safePreferred = preferredBusinessId ? sanitizeId(preferredBusinessId) : null;
    if (safePreferred) {
      candidates.add(safePreferred);
    }
    for (const businessId of await listWorkspaceBusinessIds(workspaceDir)) {
      const safeBusinessId = sanitizeId(businessId);
      if (safeBusinessId) {
        candidates.add(safeBusinessId);
      }
    }
    return [...candidates];
  };

  const findBusinessIdForAgent = async (
    agentId: string,
    preferredBusinessId?: string,
  ): Promise<string | null> => {
    const { stat: fsStat } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const candidates = await listBusinessCandidates(preferredBusinessId);

    for (const businessId of candidates) {
      const agentDir = join(workspaceDir, "businesses", businessId, "agents", agentId);
      try {
        if ((await fsStat(agentDir)).isDirectory()) {
          return businessId;
        }
      } catch {
        // Continue scanning candidates.
      }
    }

    return candidates[0] ?? null;
  };

  const readBusinessAgentIds = async (businessId: string): Promise<string[]> => {
    const { readdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    try {
      const entries = await readdir(join(workspaceDir, "businesses", businessId, "agents"), {
        withFileTypes: true,
      });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => sanitizeId(entry.name))
        .filter((entry): entry is string => !!entry);
    } catch {
      return [];
    }
  };

  const selectRoleAgentId = (agentIds: string[], role: string): string | null => {
    if (agentIds.includes(role)) {
      return role;
    }
    return (
      agentIds.find((agentId) => agentId.endsWith(`-${role}`) || agentId.endsWith(`_${role}`)) ??
      null
    );
  };

  const resolveRoleAgentIdForBusiness = async (
    businessId: string,
    role: string,
  ): Promise<string> => {
    const agentIds = await readBusinessAgentIds(businessId);
    return selectRoleAgentId(agentIds, role) ?? role;
  };

  const resolveDefaultRoleAgentId = async (role: string): Promise<string> => {
    for (const businessId of await listBusinessCandidates()) {
      const match = selectRoleAgentId(await readBusinessAgentIds(businessId), role);
      if (match) {
        return match;
      }
    }
    return role;
  };

  // API: System status (enhanced)
  api.registerHttpRoute({
    path: "/mabos/api/status",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      try {
        const { getAgentsSummary } = (await import(
          /* webpackIgnore: true */ BDI_RUNTIME_PATH
        )) as import("./src/types/bdi-runtime.js").BdiRuntime;
        const agents = await getAgentsSummary(workspaceDir);

        const { readdir } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const businessDir = join(workspaceDir, "businesses");
        const businesses = await readdir(businessDir).catch(() => []);

        // Overlay TypeDB intention counts onto agent summaries
        try {
          const { queryAgentListFromTypeDB } = await import("./src/knowledge/typedb-dashboard.js");
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
    path: "/mabos/api/decisions",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;
      // Try TypeDB first
      try {
        const { queryDecisionsFromTypeDB } = await import("./src/knowledge/typedb-dashboard.js");
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
              if (d.status === "pending") {
                allDecisions.push({ ...d, business_id: entry });
              }
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

  // Helper: register parameterized routes via registerHttpHandler
  // (registerHttpRoute only supports exact path matching)
  const registerParamRoute = (
    pattern: string,
    handler: (
      req: import("node:http").IncomingMessage,
      res: import("node:http").ServerResponse,
    ) => Promise<void>,
  ) => {
    const regex = new RegExp("^" + pattern.replace(/:[^/]+/g, "[^/]+") + "$");
    api.registerHttpHandler(async (req, res) => {
      const url = new URL(req.url || "/", "http://localhost");
      if (regex.test(url.pathname)) {
        if (!(await requireAuth(req, res))) return true;
        await handler(req, res);
        return true;
      }
      return false;
    });
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
        const { queryAgentDetailFromTypeDB } = await import("./src/knowledge/typedb-dashboard.js");
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
      const skills = await readMdLines(join(agentDir, "Skill.md"));
      const plans = await readMdLines(join(agentDir, "Plans.md"));
      const tasks = await readMdLines(join(agentDir, "Task.md"));
      const actionItems = await readMdLines(join(agentDir, "Actions.md"));

      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          agentId,
          beliefCount: beliefs.length,
          goalCount: goals.length,
          intentionCount: intentions.length,
          desireCount: desires.length,
          skillCount: skills.length,
          planCount: plans.length,
          taskCount: tasks.length,
          actionCount: actionItems.length,
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

  // API: Agent cognitive state (structured JSON of entire mind)
  registerParamRoute("/mabos/api/agents/:id/cognitive", async (req, res) => {
    try {
      const { join } = await import("node:path");
      const { readFile: rf } = await import("node:fs/promises");
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const agentId = sanitizeId(segments[segments.indexOf("agents") + 1] || "");
      if (!agentId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid agent ID" }));
        return;
      }

      const agentDir = join(workspaceDir, "agents", agentId);

      const readSafe = async (file: string) => {
        try {
          return await rf(join(agentDir, file), "utf-8");
        } catch {
          return "";
        }
      };

      const countNonHeaderLines = (content: string) =>
        content.split("\n").filter((l: string) => l.trim() && !l.startsWith("#")).length;

      const extractCategories = (content: string) =>
        [...content.matchAll(/^## (.+)/gm)].map((m) => m[1]);

      const countActive = (content: string) => {
        const activeSection = content.match(/## Active[\s\S]*?(?=\n## |$)/);
        return activeSection
          ? activeSection[0].split("\n").filter((l: string) => l.startsWith("### ")).length
          : 0;
      };

      const countByStatus = (content: string) => {
        const statuses: Record<string, number> = {};
        const statusMatches = content.matchAll(/\*\*Status:\*\*\s*(\w+)/g);
        for (const m of statusMatches) {
          statuses[m[1]] = (statuses[m[1]] || 0) + 1;
        }
        return statuses;
      };

      // Read all cognitive files
      const [
        beliefsContent,
        desiresContent,
        goalsContent,
        intentionsContent,
        skillsContent,
        plansContent,
        tasksContent,
        actionsContent,
      ] = await Promise.all([
        readSafe("Beliefs.md"),
        readSafe("Desires.md"),
        readSafe("Goals.md"),
        readSafe("Intentions.md"),
        readSafe("Skill.md"),
        readSafe("Plans.md"),
        readSafe("Task.md"),
        readSafe("Actions.md"),
      ]);

      // Read agent.json for commitment strategy and BDI config
      let agentConfig: Record<string, unknown> = {};
      try {
        agentConfig = JSON.parse(await rf(join(agentDir, "agent.json"), "utf-8"));
      } catch {
        // No config
      }

      // Count aligned goals (have Business Goal reference)
      const goalLines = goalsContent.split("\n");
      const totalGoals = goalLines.filter((l: string) => l.startsWith("### ")).length;
      const alignedGoals = goalsContent.split("**Business Goal:**").length - 1;

      // Extract skill items
      const skillItems = [
        ...skillsContent.matchAll(/\|\s*SK-\d+\s*\|\s*([^|]+)\s*\|[^|]*\|\s*(\w+)\s*\|/g),
      ].map((m) => ({ name: m[1].trim(), status: m[2].trim() }));

      // Count recent actions (last 24h)
      const actionLines = actionsContent
        .split("\n")
        .filter(
          (l: string) => l.startsWith("|") && !l.startsWith("|---") && !l.startsWith("| Timestamp"),
        );
      const now = Date.now();
      const recentActions = actionLines.filter((l: string) => {
        const tsMatch = l.match(/\|\s*(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s*\|/);
        if (!tsMatch) return false;
        return now - new Date(tsMatch[1]).getTime() < 86400000;
      }).length;

      // Stalled intentions (active but 0% progress)
      const stalledIntentions = (intentionsContent.match(/\*\*Progress:\*\*\s*0%/g) || []).length;

      // Last BDI cycle timestamp
      const lastCycleMatch =
        intentionsContent.match(/Last updated: (.+)/) || goalsContent.match(/Last evaluated: (.+)/);

      const bdiConfig =
        agentConfig.bdi && typeof agentConfig.bdi === "object"
          ? (agentConfig.bdi as Record<string, unknown>)
          : null;

      const cognitive = {
        agentId,
        beliefs: {
          count: countNonHeaderLines(beliefsContent),
          categories: extractCategories(beliefsContent),
        },
        desires: {
          count: countNonHeaderLines(desiresContent),
          active: countActive(desiresContent),
        },
        goals: {
          count: totalGoals,
          aligned: alignedGoals,
          unaligned: totalGoals - alignedGoals,
        },
        intentions: {
          count: countNonHeaderLines(intentionsContent),
          active: countActive(intentionsContent),
          stalled: stalledIntentions,
        },
        skills: {
          count: skillItems.length,
          items: skillItems,
        },
        plans: {
          count: countNonHeaderLines(plansContent),
          active: countActive(plansContent),
        },
        tasks: {
          count: countNonHeaderLines(tasksContent),
          byStatus: countByStatus(tasksContent),
        },
        actions: {
          count: actionLines.length,
          recent: recentActions,
        },
        commitmentStrategy: bdiConfig?.commitmentStrategy || "unknown",
        lastBdiCycleAt: lastCycleMatch ? lastCycleMatch[1].trim() : null,
      };

      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(cognitive));
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // API: Agent files (list, read, update)
  // Matches both /agents/:id/files and /agents/:id/files/:filename
  api.registerHttpHandler(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const filesMatch = url.pathname.match(/^\/mabos\/api\/agents\/([^/]+)\/files(?:\/(.+))?$/);
    if (!filesMatch) return false;
    if (!(await requireAuth(req, res))) return true;

    try {
      const { join } = await import("node:path");
      const {
        readdir,
        stat: fsStat,
        readFile: fsReadFile,
        writeFile: fsWriteFile,
      } = await import("node:fs/promises");

      const rawId = filesMatch[1];
      const agentId = sanitizeId(rawId);
      if (!agentId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid agent ID" }));
        return true;
      }

      const requestedBusinessId = sanitizeId(url.searchParams.get("businessId") || "");
      const businessId = await findBusinessIdForAgent(agentId, requestedBusinessId || undefined);
      const bdiDir = businessId
        ? join(workspaceDir, "businesses", businessId, "agents", agentId)
        : null;
      const coreDir = join(workspaceDir, "agents", agentId);
      const rawFilename = filesMatch[2];

      // --- Single file operations (GET / PUT) ---
      if (rawFilename) {
        const filename = decodeURIComponent(rawFilename);
        if (!filename.endsWith(".md") || filename.includes("..") || filename.includes("/")) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid filename" }));
          return true;
        }

        // Resolve which directory contains the file (BDI first, then core)
        let filePath = bdiDir ? join(bdiDir, filename) : join(coreDir, filename);
        let category: "bdi" | "core" = bdiDir ? "bdi" : "core";
        try {
          await fsStat(filePath);
        } catch {
          if (bdiDir) {
            filePath = join(coreDir, filename);
            category = "core";
            try {
              await fsStat(filePath);
            } catch {
              if (req.method !== "PUT") {
                res.statusCode = 404;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "File not found" }));
                return true;
              }
              // For PUT, default to business-scoped BDI dir.
              filePath = join(bdiDir, filename);
              category = "bdi";
            }
          } else if (req.method !== "PUT") {
            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "File not found" }));
            return true;
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
            return true;
          }
          await fsWriteFile(filePath, parsed.content, "utf-8");
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
          return true;
        }

        // GET file content
        const content = await fsReadFile(filePath, "utf-8");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ filename, content, category }));
        return true;
      }

      // --- List all files ---
      type AgentFile = {
        filename: string;
        category: "bdi" | "core";
        size: number;
        modified: string;
      };
      const files: AgentFile[] = [];

      const candidateDirs: Array<[string, "bdi" | "core"]> = [];
      if (bdiDir) {
        candidateDirs.push([bdiDir, "bdi"]);
      }
      candidateDirs.push([coreDir, "core"]);

      for (const [dir, cat] of candidateDirs) {
        try {
          const entries = await readdir(dir);
          for (const entry of entries) {
            if (!entry.endsWith(".md")) continue;
            try {
              const s = await fsStat(join(dir, entry));
              files.push({
                filename: entry,
                category: cat,
                size: s.size,
                modified: s.mtime.toISOString(),
              });
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
      return true;
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
      return true;
    }
  });

  // API: Agent avatar (GET serve / POST upload)
  api.registerHttpHandler(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const avatarMatch = url.pathname.match(/^\/mabos\/api\/agents\/([^/]+)\/avatar$/);
    if (!avatarMatch) return false;
    if (!(await requireAuth(req, res))) return true;

    try {
      const { join } = await import("node:path");
      const {
        readFile: fsReadFile,
        writeFile: fsWriteFile,
        unlink,
        stat: fsStat,
        mkdir,
      } = await import("node:fs/promises");

      const rawId = avatarMatch[1];
      const agentId = sanitizeId(rawId);
      if (!agentId) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Invalid agent ID" }));
        return true;
      }

      const requestedBusinessId = sanitizeId(url.searchParams.get("businessId") || "");
      const businessId = await findBusinessIdForAgent(agentId, requestedBusinessId || undefined);
      if (!businessId) {
        res.statusCode = req.method === "POST" ? 400 : 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Business context not found for agent" }));
        return true;
      }

      const bdiDir = join(workspaceDir, "businesses", businessId, "agents", agentId);

      if (req.method === "GET") {
        // Try png first, then jpg
        for (const ext of ["png", "jpg"] as const) {
          const avatarPath = join(bdiDir, `avatar.${ext}`);
          try {
            await fsStat(avatarPath);
            const data = await fsReadFile(avatarPath);
            res.setHeader("Content-Type", ext === "png" ? "image/png" : "image/jpeg");
            res.setHeader("Cache-Control", "public, max-age=3600");
            res.end(data);
            return true;
          } catch {
            // try next extension
          }
        }
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Avatar not found" }));
        return true;
      }

      if (req.method === "POST") {
        let body = "";
        for await (const chunk of req as any) body += chunk;
        const parsed = JSON.parse(body);
        const { data: dataUrl, ext } = parsed as { data: string; ext: string };

        if (!dataUrl || !["png", "jpg"].includes(ext)) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid data or ext" }));
          return true;
        }

        // Strip base64 prefix (e.g. "data:image/png;base64,...")
        const base64Data = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
        const buffer = Buffer.from(base64Data, "base64");

        await mkdir(bdiDir, { recursive: true });
        const avatarPath = join(bdiDir, `avatar.${ext}`);
        await fsWriteFile(avatarPath, buffer);

        // Delete other extension if it exists
        const otherExt = ext === "png" ? "jpg" : "png";
        try {
          await unlink(join(bdiDir, `avatar.${otherExt}`));
        } catch {
          // ignore if not found
        }

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
        return true;
      }

      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Method not allowed" }));
      return true;
    } catch (err) {
      res.setHeader("Content-Type", "application/json");
      res.statusCode = 500;
      res.end(JSON.stringify({ error: String(err) }));
      return true;
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
          await import("./src/knowledge/typedb-dashboard.js");
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

        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, business: manifest }));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // API: Chat — send message to an agent's inbox
  api.registerHttpRoute({
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

        // Write message to agent's inbox
        const inboxPath = join(
          workspaceDir,
          "businesses",
          businessId,
          "agents",
          agentId,
          "inbox.json",
        );
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

        // Fire-and-forget: dispatch through gateway LLM pipeline and poll for response
        const gatewayPort = (api as any).config?.gateway?.port ?? 18789;
        const gatewayWsUrl = `ws://127.0.0.1:${gatewayPort}`;
        const sessionKey = `mabos-dashboard:${businessId}:${agentId}`;
        const gatewayAuthToken = process.env.OPENCLAW_GATEWAY_TOKEN;
        const outboxPath = join(
          workspaceDir,
          "businesses",
          businessId,
          "agents",
          agentId,
          "outbox.json",
        );

        (async () => {
          try {
            // Send message to gateway LLM pipeline
            const ack = await callGatewayRpc<{ runId?: string; status?: string }>(
              gatewayWsUrl,
              "chat.send",
              {
                sessionKey,
                message: params.message,
                idempotencyKey: msg.id,
                timeoutMs: 120_000,
              },
              gatewayAuthToken,
              120_000,
            );
            log.info?.(`chat.send ack for ${agentId}: runId=${ack.runId} status=${ack.status}`);

            // Get baseline message count so we can detect the NEW assistant response
            let baselineCount = 0;
            try {
              const baseline = await callGatewayRpc<{ messages?: any[] }>(
                gatewayWsUrl,
                "chat.history",
                { sessionKey, limit: 200 },
                gatewayAuthToken,
              );
              baselineCount = (baseline.messages ?? []).length;
            } catch {
              // If baseline fails, we'll just look for any assistant message
            }

            // Poll chat.history for the NEW assistant response
            const maxPollMs = 60_000;
            const pollIntervalMs = 2_000;
            const startTime = Date.now();
            let assistantText = "";

            while (Date.now() - startTime < maxPollMs) {
              await new Promise((r) => setTimeout(r, pollIntervalMs));
              try {
                const history = await callGatewayRpc<{ messages?: any[] }>(
                  gatewayWsUrl,
                  "chat.history",
                  { sessionKey, limit: 200 },
                  gatewayAuthToken,
                );
                const messages = history.messages ?? [];

                // Only look at messages beyond the baseline (new messages since we sent)
                if (messages.length > baselineCount) {
                  // Check new messages (from end) for an assistant response
                  for (let i = messages.length - 1; i >= baselineCount; i--) {
                    const m = messages[i];
                    if (m.role === "assistant") {
                      const content = m.content;
                      if (typeof content === "string") {
                        assistantText = content;
                      } else if (Array.isArray(content)) {
                        assistantText = content
                          .filter((c: any) => c.type === "text")
                          .map((c: any) => c.text)
                          .join("");
                      }
                      if (!assistantText) assistantText = ""; // reset if content empty
                      break;
                    }
                  }
                }
                if (assistantText) break;
              } catch (histErr) {
                log.debug?.(`chat.history poll error: ${histErr}`);
              }
            }

            if (assistantText) {
              await mkdir(dirname(outboxPath), { recursive: true });
              await writeFile(
                outboxPath,
                JSON.stringify([
                  {
                    type: "agent_response",
                    id: msg.id,
                    agentId,
                    agentName: agentId,
                    content: assistantText,
                  },
                ]),
                "utf-8",
              );
            } else {
              log.warn?.(`No assistant response received for ${agentId} within timeout`);
            }
          } catch (err) {
            log.warn?.(`chat.send dispatch failed for ${agentId}: ${err}`);
            await mkdir(dirname(outboxPath), { recursive: true }).catch(() => {});
            await writeFile(
              outboxPath,
              JSON.stringify([
                {
                  type: "agent_response",
                  id: String(Date.now()),
                  agentId,
                  agentName: agentId,
                  content: `Sorry, I encountered an error processing your message. Please try again.`,
                },
              ]),
              "utf-8",
            ).catch(() => {});
          }
        })();

        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            ok: true,
            messageId: msg.id,
            message: `Message delivered to ${agentId}. Processing via LLM pipeline.`,
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
      const unsubscribe = onAgentEvent((evt: AgentEventPayload) => {
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
        const { queryGoalModelFromTypeDB } = await import("./src/knowledge/typedb-dashboard.js");
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
      const { queryTasksFromTypeDB } = await import("./src/knowledge/typedb-dashboard.js");
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
          const planMatch = line.match(/^###\s+(P-\d+):\s*(.+)/);
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
          "Skill.md",
          "Task.md",
          "Actions.md",
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
        const skills = await countLines(join(agentPath, "Skill.md"));
        const plans = await countLines(join(agentPath, "Plans.md"));
        const tasks = await countLines(join(agentPath, "Task.md"));
        const actions = await countLines(join(agentPath, "Actions.md"));

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
          skills,
          plans,
          tasks,
          actions,
          status: config?.status || "active",
          autonomy_level: config?.autonomy_level || "medium",
          approval_threshold_usd: config?.approval_threshold_usd || 100,
        });
      }

      // Overlay TypeDB BDI counts (richer data for agents in knowledge graph)
      try {
        const { queryAgentListFromTypeDB } = await import("./src/knowledge/typedb-dashboard.js");
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
        const { readAgentCognitiveState, runMaintenanceCycle } = (await import(
          /* webpackIgnore: true */ BDI_RUNTIME_PATH
        )) as any;
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
        const knowledgeAgentId = await resolveRoleAgentIdForBusiness(businessId, "knowledge");
        const ceoAgentId = await resolveRoleAgentIdForBusiness(businessId, "ceo");

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
            agentId: knowledgeAgentId,
            action: "memory_consolidate",
            enabled: true,
            status: "active",
          },
          {
            id: "CRON-decisions",
            name: "Decision Queue Review",
            schedule: "0 */6 * * *",
            agentId: ceoAgentId,
            action: "decision_review",
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

      // Tag local jobs with source
      for (const j of jobs) j.source = "local";

      // ── Merge parent CronService jobs ──
      const openclawHome = join(process.env.HOME || "/tmp", ".openclaw");
      const parentCronPath = join(openclawHome, "cron", "jobs.json");
      const parentStore = await readJsonSafe(parentCronPath);
      if (
        parentStore &&
        typeof parentStore === "object" &&
        Array.isArray((parentStore as any).jobs)
      ) {
        const parentJobs: any[] = (parentStore as any).jobs;
        // Collect parentCronIds already present in local jobs to avoid duplicates
        const localParentIds = new Set(
          jobs.filter((j: any) => j.parentCronId).map((j: any) => j.parentCronId),
        );
        for (const pj of parentJobs) {
          if (localParentIds.has(pj.id)) continue; // already represented by a local job
          const schedExpr =
            pj.schedule?.kind === "cron"
              ? pj.schedule.expr
              : pj.schedule?.kind === "every"
                ? `every ${Math.round((pj.schedule.everyMs || 0) / 60000)}m`
                : pj.schedule?.kind === "at"
                  ? `at ${pj.schedule.at}`
                  : "unknown";
          jobs.push({
            id: pj.id,
            name: pj.name || "Unnamed",
            schedule: schedExpr,
            agentId: pj.agentId || "",
            action: pj.payload?.kind || "",
            enabled: pj.enabled ?? true,
            status: pj.state?.lastStatus === "error" ? "error" : pj.enabled ? "active" : "paused",
            lastRun: pj.state?.lastRunAtMs
              ? new Date(pj.state.lastRunAtMs).toISOString()
              : undefined,
            nextRun: pj.state?.nextRunAtMs
              ? new Date(pj.state.nextRunAtMs).toISOString()
              : undefined,
            lastStatus: pj.state?.lastStatus,
            consecutiveErrors: pj.state?.consecutiveErrors,
            parentCronId: pj.id,
            source: "gateway",
          });
        }
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

      // ── Handle parent (gateway) cron jobs ──
      if (idx === -1) {
        const openclawHome = join(process.env.HOME || "/tmp", ".openclaw");
        const parentCronPath = join(openclawHome, "cron", "jobs.json");
        const parentStore = await readJsonSafe(parentCronPath);
        if (
          parentStore &&
          typeof parentStore === "object" &&
          Array.isArray((parentStore as any).jobs)
        ) {
          const parentJobs: any[] = (parentStore as any).jobs;
          const pIdx = parentJobs.findIndex((pj: any) => pj.id === jobId);
          if (pIdx !== -1) {
            if (params.enabled !== undefined) parentJobs[pIdx].enabled = params.enabled;
            if (params.name !== undefined) parentJobs[pIdx].name = params.name;
            parentJobs[pIdx].updatedAtMs = Date.now();
            await writeFile(parentCronPath, JSON.stringify(parentStore, null, 2), "utf-8");
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, job: parentJobs[pIdx], source: "gateway" }));
            return;
          }
        }
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

  // Dashboard: serve SPA HTML (no trailing slash)
  api.registerHttpRoute({
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

  // ── ERP Dashboard API ────────────────────────────────────────
  // Shared helper: parse URL query params
  const erpQueryParams = (req: import("node:http").IncomingMessage) => {
    const url = new URL(req.url || "/", "http://localhost");
    return Object.fromEntries(url.searchParams.entries());
  };

  // --- Inventory ---
  api.registerHttpRoute({
    path: "/mabos/api/erp/inventory/items",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listStockItems } = await import("../../mabos/erp/inventory/queries.js");
        const params = erpQueryParams(req);
        const items = await listStockItems(pg, {
          status: params.status || undefined,
          warehouse_id: params.warehouse_id || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ items }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/inventory/alerts",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { lowStockAlerts } = await import("../../mabos/erp/inventory/queries.js");
        const alerts = await lowStockAlerts(pg);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ alerts }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  registerParamRoute("/mabos/api/erp/inventory/items/:id/movements", async (req, res) => {
    try {
      const pg = await getErpPg();
      const { getStockMovements } = await import("../../mabos/erp/inventory/queries.js");
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const itemId = segments[segments.length - 2]; // .../items/:id/movements
      const movements = await getStockMovements(pg, itemId);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ movements }));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // --- Customers ---
  api.registerHttpRoute({
    path: "/mabos/api/erp/customers/contacts",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const params = erpQueryParams(req);
        // Search or list
        if (params.q) {
          const { searchContacts } = await import("../../mabos/erp/customers/queries.js");
          const contacts = await searchContacts(
            pg,
            params.q,
            params.limit ? parseInt(params.limit) : 50,
          );
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ contacts }));
          return;
        }
        const { listContacts } = await import("../../mabos/erp/customers/queries.js");
        const contacts = await listContacts(pg, {
          segment: params.segment || undefined,
          lifecycle_stage: params.lifecycle_stage || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ contacts }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  registerParamRoute("/mabos/api/erp/customers/contacts/:id", async (req, res) => {
    try {
      const pg = await getErpPg();
      const { getContact } = await import("../../mabos/erp/customers/queries.js");
      const url = new URL(req.url || "", "http://localhost");
      const id = url.pathname.split("/").pop()!;
      const contact = await getContact(pg, id);
      if (!contact) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Contact not found" }));
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(contact));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // --- Finance / Accounting ---
  api.registerHttpRoute({
    path: "/mabos/api/erp/finance/invoices",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listInvoices } = await import("../../mabos/erp/finance/queries.js");
        const params = erpQueryParams(req);
        const invoices = await listInvoices(pg, {
          status: params.status || undefined,
          customer_id: params.customer_id || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ invoices }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/finance/accounts",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listAccounts } = await import("../../mabos/erp/finance/queries.js");
        const params = erpQueryParams(req);
        const accounts = await listAccounts(pg, {
          type: params.type || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ accounts }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/finance/profit-loss",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { profitLoss } = await import("../../mabos/erp/finance/queries.js");
        const params = erpQueryParams(req);
        const from = params.from || new Date(Date.now() - 30 * 86400000).toISOString();
        const to = params.to || new Date().toISOString();
        const result = await profitLoss(pg, from, to);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/finance/balance-sheet",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { balanceSheet } = await import("../../mabos/erp/finance/queries.js");
        const result = await balanceSheet(pg);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/finance/cash-flow",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { cashFlowStatement } = await import("../../mabos/erp/finance/queries.js");
        const params = erpQueryParams(req);
        const from = params.from || new Date(Date.now() - 30 * 86400000).toISOString();
        const to = params.to || new Date().toISOString();
        const result = await cashFlowStatement(pg, from, to);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/finance/expense-report",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { expenseReport } = await import("../../mabos/erp/finance/queries.js");
        const params = erpQueryParams(req);
        const from = params.from || new Date(Date.now() - 30 * 86400000).toISOString();
        const to = params.to || new Date().toISOString();
        const result = await expenseReport(pg, from, to);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/finance/budget-vs-actual",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { budgetVsActual } = await import("../../mabos/erp/finance/queries.js");
        const params = erpQueryParams(req);
        const from = params.from || new Date(Date.now() - 30 * 86400000).toISOString();
        const to = params.to || new Date().toISOString();
        const result = await budgetVsActual(pg, from, to);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  registerParamRoute("/mabos/api/erp/finance/balance/:accountId", async (req, res) => {
    try {
      const pg = await getErpPg();
      const { getAccountBalance } = await import("../../mabos/erp/finance/queries.js");
      const url = new URL(req.url || "", "http://localhost");
      const id = url.pathname.split("/").pop()!;
      const account = await getAccountBalance(pg, id);
      if (!account) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Account not found" }));
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(account));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // --- E-Commerce ---
  api.registerHttpRoute({
    path: "/mabos/api/erp/ecommerce/products",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listProducts } = await import("../../mabos/erp/ecommerce/queries.js");
        const params = erpQueryParams(req);
        const products = await listProducts(pg, {
          category: params.category || undefined,
          status: params.status || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ products }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/ecommerce/orders",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listOrders } = await import("../../mabos/erp/ecommerce/queries.js");
        const params = erpQueryParams(req);
        const orders = await listOrders(pg, {
          status: params.status || undefined,
          customer_id: params.customer_id || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ orders }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  registerParamRoute("/mabos/api/erp/ecommerce/orders/:id", async (req, res) => {
    const url = new URL(req.url || "", "http://localhost");
    const id = url.pathname.split("/").pop()!;
    try {
      const pg = await getErpPg();
      if (req.method === "PUT") {
        const body = await readMabosJsonBody<{ status: string }>(req, res);
        if (!body) return;
        const { updateOrderStatus } = await import("../../mabos/erp/ecommerce/queries.js");
        const order = await updateOrderStatus(pg, id, body.status);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, order }));
        return;
      }
      const { getOrder } = await import("../../mabos/erp/ecommerce/queries.js");
      const order = await getOrder(pg, id);
      if (!order) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Order not found" }));
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(order));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // --- Suppliers ---
  api.registerHttpRoute({
    path: "/mabos/api/erp/suppliers/list",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listSuppliers } = await import("../../mabos/erp/suppliers/queries.js");
        const params = erpQueryParams(req);
        const suppliers = await listSuppliers(pg, {
          status: params.status || undefined,
          category: params.category || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ suppliers }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  registerParamRoute("/mabos/api/erp/suppliers/:id", async (req, res) => {
    try {
      const pg = await getErpPg();
      const { getSupplier } = await import("../../mabos/erp/suppliers/queries.js");
      const url = new URL(req.url || "", "http://localhost");
      const id = url.pathname.split("/").pop()!;
      const supplier = await getSupplier(pg, id);
      if (!supplier) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Supplier not found" }));
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(supplier));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/suppliers/purchase-orders",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listPurchaseOrders } = await import("../../mabos/erp/suppliers/queries.js");
        const params = erpQueryParams(req);
        const orders = await listPurchaseOrders(pg, {
          supplier_id: params.supplier_id || undefined,
          status: params.status || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ orders }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  registerParamRoute("/mabos/api/erp/suppliers/purchase-orders/:id", async (req, res) => {
    try {
      const pg = await getErpPg();
      const { getPurchaseOrder } = await import("../../mabos/erp/suppliers/queries.js");
      const url = new URL(req.url || "", "http://localhost");
      const id = url.pathname.split("/").pop()!;
      const order = await getPurchaseOrder(pg, id);
      if (!order) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Purchase order not found" }));
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(order));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // --- Marketing ---
  api.registerHttpRoute({
    path: "/mabos/api/erp/marketing/campaigns",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listCampaigns } = await import("../../mabos/erp/marketing/queries.js");
        const params = erpQueryParams(req);
        const campaigns = await listCampaigns(pg, {
          status: params.status || undefined,
          type: params.type || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ campaigns }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  registerParamRoute("/mabos/api/erp/marketing/campaigns/:id/metrics", async (req, res) => {
    try {
      const pg = await getErpPg();
      const { getCampaignMetrics } = await import("../../mabos/erp/marketing/queries.js");
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const id = segments[segments.length - 2]; // .../campaigns/:id/metrics
      const metrics = await getCampaignMetrics(pg, id);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ metrics }));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/marketing/kpis",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listKpis } = await import("../../mabos/erp/marketing/queries.js");
        const params = erpQueryParams(req);
        const kpis = await listKpis(pg, {
          status: params.status || undefined,
          period: params.period || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ kpis }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Supply Chain ---
  api.registerHttpRoute({
    path: "/mabos/api/erp/supply-chain/shipments",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const params = erpQueryParams(req);
        if (params.tracking) {
          const { trackShipment } = await import("../../mabos/erp/supply-chain/queries.js");
          const shipment = await trackShipment(pg, params.tracking);
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ shipment }));
          return;
        }
        const { listShipments } = await import("../../mabos/erp/supply-chain/queries.js");
        const shipments = await listShipments(pg, {
          status: params.status || undefined,
          supplier_id: params.supplier_id || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ shipments }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  registerParamRoute("/mabos/api/erp/supply-chain/shipments/:id", async (req, res) => {
    try {
      const pg = await getErpPg();
      const { getShipment } = await import("../../mabos/erp/supply-chain/queries.js");
      const url = new URL(req.url || "", "http://localhost");
      const id = url.pathname.split("/").pop()!;
      const shipment = await getShipment(pg, id);
      if (!shipment) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Shipment not found" }));
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(shipment));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/supply-chain/routes",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listRoutes } = await import("../../mabos/erp/supply-chain/queries.js");
        const params = erpQueryParams(req);
        const routes = await listRoutes(pg, {
          status: params.status || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ routes }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Compliance ---
  api.registerHttpRoute({
    path: "/mabos/api/erp/compliance/policies",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listPolicies } = await import("../../mabos/erp/compliance/queries.js");
        const params = erpQueryParams(req);
        const policies = await listPolicies(pg, {
          status: params.status || undefined,
          category: params.category || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ policies }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/compliance/violations",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listViolations } = await import("../../mabos/erp/compliance/queries.js");
        const params = erpQueryParams(req);
        const violations = await listViolations(pg, {
          status: params.status || undefined,
          severity: params.severity || undefined,
          policy_id: params.policy_id || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ violations }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  registerParamRoute("/mabos/api/erp/compliance/violations/:id", async (req, res) => {
    try {
      const pg = await getErpPg();
      const { getViolation } = await import("../../mabos/erp/compliance/queries.js");
      const url = new URL(req.url || "", "http://localhost");
      const id = url.pathname.split("/").pop()!;
      const violation = await getViolation(pg, id);
      if (!violation) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Violation not found" }));
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(violation));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  // --- Legal ---
  api.registerHttpRoute({
    path: "/mabos/api/erp/legal/contracts",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listContracts } = await import("../../mabos/erp/legal/queries.js");
        const params = erpQueryParams(req);
        const contracts = await listContracts(pg, {
          status: params.status || undefined,
          type: params.type || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ contracts }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/legal/cases",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listCases } = await import("../../mabos/erp/legal/queries.js");
        const params = erpQueryParams(req);
        const cases = await listCases(pg, {
          status: params.status || undefined,
          case_type: params.case_type || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ cases }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Legal (Redesign) ---
  api.registerHttpRoute({
    path: "/mabos/api/erp/legal/partnership-contracts",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listPartnershipContracts } = await import("../../mabos/erp/legal/queries.js");
        const params = erpQueryParams(req);
        const contracts = await listPartnershipContracts(pg, {
          status: params.status || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ contracts }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/legal/freelancer-contracts",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listFreelancerContracts } = await import("../../mabos/erp/legal/queries.js");
        const params = erpQueryParams(req);
        const contracts = await listFreelancerContracts(pg, {
          status: params.status || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ contracts }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/legal/corporate-documents",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listCorporateDocuments } = await import("../../mabos/erp/legal/queries.js");
        const params = erpQueryParams(req);
        const documents = await listCorporateDocuments(pg, {
          doc_type: params.doc_type || undefined,
          status: params.status || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ documents }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/legal/structure",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { getLegalStructure } = await import("../../mabos/erp/legal/queries.js");
        const structure = await getLegalStructure(pg);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ structure }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/legal/guardrails",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listComplianceGuardrails } = await import("../../mabos/erp/legal/queries.js");
        const params = erpQueryParams(req);
        const guardrails = await listComplianceGuardrails(pg, {
          active: params.active ? params.active === "true" : undefined,
          category: params.category || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ guardrails }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // --- Analytics ---
  api.registerHttpRoute({
    path: "/mabos/api/erp/analytics/reports",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listReports } = await import("../../mabos/erp/analytics/queries.js");
        const params = erpQueryParams(req);
        const reports = await listReports(pg, {
          type: params.type || undefined,
          status: params.status || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ reports }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  registerParamRoute("/mabos/api/erp/analytics/reports/:id", async (req, res) => {
    try {
      const pg = await getErpPg();
      const url = new URL(req.url || "", "http://localhost");
      const id = url.pathname.split("/").pop()!;
      if (req.method === "POST") {
        // Run report
        const { runReport } = await import("../../mabos/erp/analytics/queries.js");
        const result = await runReport(pg, id);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, result }));
        return;
      }
      const { getReport } = await import("../../mabos/erp/analytics/queries.js");
      const report = await getReport(pg, id);
      if (!report) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Report not found" }));
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(report));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  registerParamRoute("/mabos/api/erp/analytics/reports/:id/run", async (req, res) => {
    try {
      const pg = await getErpPg();
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const id = segments[segments.length - 2];
      const { runReport } = await import("../../mabos/erp/analytics/queries.js");
      const result = await runReport(pg, id);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: true, result }));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  registerParamRoute("/mabos/api/erp/analytics/reports/:id/snapshots", async (req, res) => {
    try {
      const pg = await getErpPg();
      const url = new URL(req.url || "", "http://localhost");
      const segments = url.pathname.split("/");
      const id = segments[segments.length - 2];
      const { getSnapshots } = await import("../../mabos/erp/analytics/queries.js");
      const snapshots = await getSnapshots(pg, id);
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ snapshots }));
    } catch (err) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(err) }));
    }
  });

  api.registerHttpRoute({
    path: "/mabos/api/erp/analytics/dashboards",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const pg = await getErpPg();
        const { listDashboards } = await import("../../mabos/erp/analytics/queries.js");
        const params = erpQueryParams(req);
        const dashboards = await listDashboards(pg, {
          owner_id: params.owner_id || undefined,
          limit: params.limit ? parseInt(params.limit) : 50,
        });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ dashboards }));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // ── Shopify Webhook (incremental sync) ──────────────────────
  api.registerHttpRoute({
    path: "/mabos/api/shopify/webhook",
    handler: async (req, res) => {
      // Shopify webhooks require < 5s response — read body, ack immediately, process async.
      try {
        const { readRequestBodyWithLimit } = await import("../../src/infra/http-body.js");
        const rawBody = await readRequestBodyWithLimit(req, {
          maxBytes: 2_097_152,
          timeoutMs: 5_000,
        });

        // HMAC verification (optional — requires SHOPIFY_WEBHOOK_SECRET env var)
        const webhookSecret = process.env.SHOPIFY_WEBHOOK_SECRET;
        if (webhookSecret) {
          const crypto = await import("node:crypto");
          const hmacHeader = req.headers["x-shopify-hmac-sha256"] as string | undefined;
          if (!hmacHeader) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Missing HMAC header" }));
            return;
          }
          const computed = crypto
            .createHmac("sha256", webhookSecret)
            .update(rawBody, "utf-8")
            .digest("base64");
          if (computed !== hmacHeader) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid HMAC" }));
            return;
          }
        }

        // Respond 200 immediately
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));

        // Process async
        const topic = (req.headers["x-shopify-topic"] as string) || "";
        const payload = JSON.parse(rawBody);
        const pg = await getErpPg();
        const { processShopifyWebhook } = await import("../../mabos/erp/shopify-sync/index.js");
        processShopifyWebhook(pg, topic, payload).catch((err) => {
          log.error(`[shopify-webhook] Error processing ${topic}:`, err);
        });
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      }
    },
  });

  // ── BPMN 2.0 Workflow API ────────────────────────────────────

  const BPMN_DB = "mabos";

  // GET /mabos/api/workflows — list all BPMN workflows
  api.registerHttpRoute({
    path: "/mabos/api/workflows",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;
      try {
        const { getTypeDBClient } = await import("./src/knowledge/typedb-client.js");
        const { BpmnStoreQueries } = await import("./src/knowledge/bpmn-queries.js");
        const client = getTypeDBClient();
        const url = new URL(req.url || "/", "http://localhost");
        const status = url.searchParams.get("status") || undefined;
        const requestedAgentId = sanitizeId(url.searchParams.get("agentId") || "");
        const agentId = requestedAgentId || (await resolveDefaultRoleAgentId("ceo"));

        if (req.method === "POST") {
          // Create workflow
          const body = await readMabosJsonBody<any>(req, res);
          if (!body) return;
          const id = body.id || generatePrefixedId("bpmn-wf");
          const ownerAgentId =
            (typeof body.agentId === "string" ? sanitizeId(body.agentId) : null) || agentId;
          const typeql = BpmnStoreQueries.createWorkflow(ownerAgentId, {
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
      const { getTypeDBClient } = await import("./src/knowledge/typedb-client.js");
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
      const { getTypeDBClient } = await import("./src/knowledge/typedb-client.js");
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
      const agentId =
        (typeof body.agentId === "string" ? sanitizeId(body.agentId) : null) ||
        (await resolveDefaultRoleAgentId("ceo"));
      const elementId = body.id || generatePrefixedId("bpmn-el");

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
      const { getTypeDBClient } = await import("./src/knowledge/typedb-client.js");
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
      const { getTypeDBClient } = await import("./src/knowledge/typedb-client.js");
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
      const agentId =
        (typeof body.agentId === "string" ? sanitizeId(body.agentId) : null) ||
        (await resolveDefaultRoleAgentId("ceo"));
      const flowId = body.id || generatePrefixedId("bpmn-fl");

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
      const { getTypeDBClient } = await import("./src/knowledge/typedb-client.js");
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
      const { getTypeDBClient } = await import("./src/knowledge/typedb-client.js");
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
      const agentId =
        (typeof body.agentId === "string" ? sanitizeId(body.agentId) : null) ||
        (await resolveDefaultRoleAgentId("ceo"));
      const poolId = body.id || generatePrefixedId("bpmn-pool");

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
      const { getTypeDBClient } = await import("./src/knowledge/typedb-client.js");
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
      const agentId =
        (typeof body.agentId === "string" ? sanitizeId(body.agentId) : null) ||
        (await resolveDefaultRoleAgentId("ceo"));
      const laneId = body.id || generatePrefixedId("bpmn-lane");

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
      const { getTypeDBClient } = await import("./src/knowledge/typedb-client.js");
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

  // ── Observation/compression state ──
  let observerToolCallCount = 0;
  const OBSERVER_TOOL_CALL_THRESHOLD = 10;

  // Inject BDI context + Persona.md + observation log into the system prompt
  // When cacheAwareLayoutEnabled: splits into stable (systemPrompt) + dynamic (prependContext)
  api.on("before_agent_start", async (event, ctx) => {
    if (ctx.workspaceDir) {
      const agentDir = ctx.workspaceDir;
      try {
        const { readFile } = await import("node:fs/promises");
        const { join } = await import("node:path");

        // Read plugin config for cache-aware layout toggle
        const pluginConfig = (api.pluginConfig ?? {}) as Record<string, unknown>;
        const cacheAwareEnabled = pluginConfig.cacheAwareLayoutEnabled === true;

        // Load Persona.md
        const persona = await readFile(join(agentDir, "Persona.md"), "utf-8").catch(() => null);

        const agentId = agentDir.split("/").pop() || "default";

        // Load observation log (Observer/Reflector pipeline)
        let observations: any[] = [];
        try {
          const { loadObservationLog } = await import("./src/tools/observation-store.js");
          const obsLog = await loadObservationLog(api, agentId);
          observations = obsLog.observations;
        } catch {
          // Observation log unavailable — not critical
        }

        // Load active goals summary
        const goals = await readFile(join(agentDir, "Goals.md"), "utf-8").catch(() => null);
        let activeGoals = "";
        if (goals) {
          activeGoals = goals
            .split("\n")
            .filter((l) => l.includes("status: active") || l.startsWith("## "))
            .slice(0, 20)
            .join("\n");
        }

        // Load current commitments
        const commitments = await readFile(join(agentDir, "Commitments.md"), "utf-8").catch(
          () => null,
        );
        const commitmentSummary = commitments?.trim() ? commitments.slice(0, 300) : "";

        // Load cognitive context (BDI state summaries)
        let cognitiveExtras = "";
        let longTermHighlights = "";
        const cognitiveEnabled = pluginConfig.cognitiveContextEnabled !== false;
        if (cognitiveEnabled) {
          try {
            const { assembleCognitiveContext } = await import("./src/tools/cognitive-context.js");
            const cognitive = await assembleCognitiveContext(agentDir);
            cognitiveExtras = cognitive.cognitiveExtras;
            longTermHighlights = cognitive.longTermHighlights;
          } catch {
            // Cognitive context unavailable — not critical
          }
        }

        // Auto-recall: search memory for context relevant to the user's prompt
        let autoRecallResults = "";
        if (pluginConfig.autoRecallEnabled !== false && event.prompt && event.prompt.length > 10) {
          try {
            const { semanticRecall } = await import("./src/tools/memory-tools.js");
            const recallPromise = semanticRecall(api, agentId, event.prompt, 5);
            const timeoutPromise = new Promise<null>((r) => setTimeout(() => r(null), 400));
            const results = await Promise.race([recallPromise, timeoutPromise]);
            if (results?.length) {
              autoRecallResults = results
                .map((r) => `- [${r.score.toFixed(2)}] ${r.content}`)
                .join("\n");
            }
          } catch {
            // Auto-recall unavailable — not critical
          }
        }

        // ── Directive routing suggestion (CEO only) ──
        let routingSuggestion = "";
        if (
          pluginConfig.directiveRoutingEnabled !== false &&
          agentId === "ceo" &&
          event.prompt &&
          event.prompt.length > 10
        ) {
          try {
            const classification = classifyDirective(event.prompt);
            if (classification.primaryAgent !== "ceo" || classification.isMultiDomain) {
              const decision = buildRoutingDecision(classification);
              routingSuggestion = `## Routing Suggestion\n${decision.routingSummary}\n`;
            }
          } catch {
            // Routing suggestion unavailable — not critical
          }
        }

        // ── Unread inbox context (all agents) ──
        let inboxContext = "";
        if (pluginConfig.inboxContextEnabled !== false) {
          try {
            const { readFile: readF } = await import("node:fs/promises");
            const inboxPath = join(agentDir, "inbox.json");
            const inboxRaw = await readF(inboxPath, "utf-8").catch(() => "[]");
            const inbox: any[] = JSON.parse(inboxRaw);
            const unread = inbox.filter((m: any) => !m.read);
            if (unread.length > 0) {
              const priorityOrder: Record<string, number> = {
                urgent: 0,
                high: 1,
                normal: 2,
                low: 3,
              };
              unread.sort(
                (a: any, b: any) =>
                  (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2),
              );
              const preview = unread
                .slice(0, 5)
                .map(
                  (m: any) =>
                    `- [${m.performative}] from ${m.from} (${m.priority}): ${(m.content || "").slice(0, 80)}`,
                );
              inboxContext = `## Unread Inbox (${unread.length} message${unread.length !== 1 ? "s" : ""})\n${preview.join("\n")}\n`;
            }
          } catch {
            // Inbox context unavailable — not critical
          }
        }

        if (cacheAwareEnabled) {
          // Cache-aware mode: split into stable + dynamic blocks
          const { assembleCacheAwareContext } = await import("./src/tools/cache-aware-layout.js");
          const { stableBlock, dynamicBlock: dynamicBase } = assembleCacheAwareContext({
            persona: persona || undefined,
            observations,
            longTermHighlights: longTermHighlights || undefined,
            activeGoals: activeGoals.trim() || undefined,
            commitments: commitmentSummary || undefined,
            autoRecallResults: autoRecallResults || undefined,
          });

          // Append cognitive extras to dynamic block
          let dynamicBlock = dynamicBase;
          if (cognitiveExtras) {
            dynamicBlock = dynamicBlock
              ? dynamicBlock + "\n## Cognitive State\n" + cognitiveExtras + "\n"
              : "[MABOS Dynamic Context]\n## Cognitive State\n" + cognitiveExtras + "\n";
          }

          if (routingSuggestion) {
            dynamicBlock = (dynamicBlock || "[MABOS Dynamic Context]\n") + routingSuggestion;
          }
          if (inboxContext) {
            dynamicBlock = (dynamicBlock || "[MABOS Dynamic Context]\n") + inboxContext;
          }

          const result: Record<string, string> = {};
          if (stableBlock) result.systemPrompt = stableBlock;
          if (dynamicBlock) result.prependContext = dynamicBlock;

          if (Object.keys(result).length > 0) return result;
        } else {
          // Legacy mode: everything in prependContext
          const parts: string[] = [];

          if (persona) {
            parts.push(`## Agent Persona\n${persona}`);
          }

          if (observations.length > 0) {
            const { formatObservationLog } = await import("./src/tools/observer.js");
            const formatted = formatObservationLog(observations);
            if (formatted.trim()) {
              parts.push(formatted);
            }
          }

          if (activeGoals.trim()) {
            parts.push(`## Active Goals\n${activeGoals}`);
          }

          if (commitmentSummary) {
            parts.push(`## Current Commitments\n${commitmentSummary}`);
          }

          if (autoRecallResults) {
            parts.push(`## Auto-Recall Results\n${autoRecallResults}`);
          }

          if (cognitiveExtras) {
            parts.push(`## Cognitive State\n${cognitiveExtras}`);
          }

          if (routingSuggestion) {
            parts.push(routingSuggestion.trim());
          }
          if (inboxContext) {
            parts.push(inboxContext.trim());
          }

          if (parts.length > 0) {
            return {
              prependContext: `[MABOS Agent Context]\n${parts.join("\n\n")}\n`,
            };
          }
        }
      } catch (err) {
        log.debug(`Agent context injection skipped: ${err}`);
      }
    }
    return undefined;
  });

  // BDI tool call audit trail + auto-observer trigger
  api.on("after_tool_call", async (event, ctx) => {
    const pluginConfig = (api.pluginConfig ?? {}) as Record<string, unknown>;
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

    // Auto-trigger observer after threshold tool calls (non-blocking)
    observerToolCallCount++;
    if (observerToolCallCount >= OBSERVER_TOOL_CALL_THRESHOLD && ctx.workspaceDir) {
      observerToolCallCount = 0;
      void (async () => {
        try {
          const { loadObservationLog, saveObservationLog } =
            await import("./src/tools/observation-store.js");
          const { compressMessagesToObservations } = await import("./src/tools/observer.js");
          const { reflectObservations } = await import("./src/tools/reflector.js");
          const agentId = ctx.workspaceDir!.split("/").pop() || "default";
          const obsLog = await loadObservationLog(api, agentId);

          // Create a summary observation of the tool activity burst
          const summary = `Completed ${OBSERVER_TOOL_CALL_THRESHOLD} tool calls including ${event.toolName}`;
          const { observations } = compressMessagesToObservations(
            [{ role: "assistant", content: summary, timestamp: new Date().toISOString() }],
            obsLog.observations,
          );
          obsLog.observations.push(...observations);
          obsLog.total_tool_calls_compressed += OBSERVER_TOOL_CALL_THRESHOLD;
          obsLog.last_observer_run_at = new Date().toISOString();

          // Reflect if needed
          if (obsLog.observations.length > 100) {
            obsLog.observations = reflectObservations(obsLog.observations);
            obsLog.last_reflector_run_at = new Date().toISOString();
          }

          await saveObservationLog(api, agentId, obsLog);
        } catch {
          // Non-critical — observer failure should never block tool execution
        }
      })();
    }

    // ── Inbox wake-up trigger (high/urgent messages) ──
    if (
      (event.toolName === "agent_message" || event.toolName === "directive_route") &&
      pluginConfig.inboxWakeUpEnabled !== false
    ) {
      const wakeParams = event.params as Record<string, unknown> | undefined;
      const priority = (wakeParams?.priority as string) || "normal";
      const recipient = (wakeParams?.to as string) || (wakeParams?.target_agent as string);

      if (recipient && (priority === "high" || priority === "urgent")) {
        void (async () => {
          try {
            const {
              readFile: readF,
              writeFile: writeF,
              mkdir: mkdirF,
            } = await import("node:fs/promises");
            const { join: joinP, dirname: dirnameP } = await import("node:path");
            const ws = resolveWorkspaceDir(api);
            const wakeLogPath = joinP(ws, "directive-wake-log.json");

            // Rate limit: check cooldown
            let wakeLog: Record<string, string> = {};
            try {
              wakeLog = JSON.parse(await readF(wakeLogPath, "utf-8"));
            } catch {
              // No wake log yet
            }

            const cooldownMs = ((pluginConfig.inboxWakeUpCooldownMinutes as number) || 5) * 60_000;
            const lastWake = wakeLog[recipient];
            if (lastWake && Date.now() - new Date(lastWake).getTime() < cooldownMs) {
              return; // Within cooldown period
            }

            // Update wake log
            wakeLog[recipient] = new Date().toISOString();
            await mkdirF(dirnameP(wakeLogPath), { recursive: true });
            await writeF(wakeLogPath, JSON.stringify(wakeLog, null, 2), "utf-8");

            // Schedule one-shot agent session via gateway RPC
            const gatewayUrl =
              ((pluginConfig as Record<string, unknown>).gatewayUrl as string) ||
              process.env.OPENCLAW_GATEWAY_URL;
            if (gatewayUrl) {
              const authToken =
                ((pluginConfig as Record<string, unknown>).gatewayToken as string) ||
                process.env.OPENCLAW_GATEWAY_TOKEN;
              await callGatewayRpc(
                gatewayUrl,
                "cron.add",
                {
                  name: `wake-${recipient}-${Date.now()}`,
                  schedule: "once",
                  agentId: recipient,
                  prompt: "Check your inbox for new high-priority messages and act on them.",
                },
                authToken || undefined,
              ).catch(() => {
                // Gateway unavailable — non-critical
              });
            }
          } catch {
            // Wake-up trigger failure — non-critical
          }
        })();
      }
    }
  });

  // ── Hook: agent_end — Error-to-Belief Recording ──
  api.on("agent_end", async (event, ctx) => {
    if (!ctx.workspaceDir) return;
    const pluginConfig = (api.pluginConfig ?? {}) as Record<string, unknown>;

    void (async () => {
      try {
        if (event.success === false) {
          const { readFile, writeFile, mkdir } = await import("node:fs/promises");
          const { join } = await import("node:path");
          const { generatePrefixedId } = await import("./src/tools/common.js");
          const agentDir = ctx.workspaceDir!;

          // Record error as a case belief (BC-xxx) in Beliefs.md
          const beliefId = generatePrefixedId("BC");
          const timestamp = new Date().toISOString();
          const errorMsg =
            typeof event.error === "string" ? event.error : "Agent session ended with failure";
          const beliefEntry = `\n| ${beliefId} | case | Session failure: ${errorMsg.slice(0, 100)} | 0.9 | agent_end | ${timestamp} |\n`;

          const beliefsPath = join(agentDir, "Beliefs.md");
          try {
            const existing = await readFile(beliefsPath, "utf-8");
            await writeFile(beliefsPath, existing + beliefEntry, "utf-8");
          } catch {
            await writeFile(
              beliefsPath,
              `# Beliefs\n\n| ID | Type | Content | Certainty | Source | Timestamp |\n|---|---|---|---|---|---|\n${beliefEntry}`,
              "utf-8",
            );
          }

          // Append failure entry to daily memory log
          const dateStr = new Date().toISOString().split("T")[0];
          const memoryDir = join(agentDir, "memory");
          await mkdir(memoryDir, { recursive: true });
          const dailyPath = join(memoryDir, `${dateStr}.md`);
          const logEntry = `\n- **${timestamp}** [ERROR] Agent session failed: ${errorMsg.slice(0, 200)}\n`;
          try {
            const existing = await readFile(dailyPath, "utf-8");
            await writeFile(dailyPath, existing + logEntry, "utf-8");
          } catch {
            await writeFile(dailyPath, `# ${dateStr}\n${logEntry}`, "utf-8");
          }
        }
      } catch {
        // Fire-and-forget — never throw from lifecycle hook
      }
    })();
  });

  // ── Hook: before_tool_call — Financial Threshold Guard ──
  api.on("before_tool_call", (event, _ctx) => {
    const pluginConfig = (api.pluginConfig ?? {}) as Record<string, unknown>;
    if (pluginConfig.financialToolGuardEnabled === false) return;

    const financialTools: Record<string, string[]> = {
      ad_campaign_create: ["daily_budget_usd", "total_budget_usd"],
      contract_net_initiate: ["budget", "estimated_cost"],
      contract_net_propose: ["budget", "estimated_cost"],
    };

    const budgetParams = financialTools[event.toolName];
    if (!budgetParams) return;

    const threshold = (pluginConfig.stakeholderApprovalThresholdUsd as number) ?? 5000;
    const args = (event.input ?? {}) as Record<string, unknown>;

    for (const param of budgetParams) {
      const value = args[param];
      if (typeof value === "number" && value > threshold) {
        return {
          blocked: true,
          reason: `[MABOS] Financial guard: ${event.toolName}.${param} = $${value} exceeds stakeholder approval threshold of $${threshold}. Use stakeholder_approval_request to get authorization.`,
        };
      }
    }
  });

  // ── Hook: before_compaction — Pre-Compaction Observer ──
  api.on("before_compaction", async (event, ctx) => {
    if (!ctx.workspaceDir) return;
    const pluginConfig = (api.pluginConfig ?? {}) as Record<string, unknown>;
    if (pluginConfig.preCompactionObserverEnabled === false) return;

    void (async () => {
      try {
        const { loadObservationLog, saveObservationLog } =
          await import("./src/tools/observation-store.js");
        const { compressMessagesToObservations } = await import("./src/tools/observer.js");
        const { reflectObservations } = await import("./src/tools/reflector.js");

        const agentId = ctx.workspaceDir!.split("/").pop() || "default";
        const obsLog = await loadObservationLog(api, agentId);

        // Safely map event.messages to ObservableMessage[]
        const observable = (event.messages as any[])
          .filter(
            (m) =>
              m && typeof m.content === "string" && ["user", "assistant", "tool"].includes(m.role),
          )
          .map((m: any) => ({
            role: m.role,
            content: m.content,
            tool_call_id: m.tool_call_id,
            name: m.name,
            timestamp: m.timestamp,
          }));

        if (observable.length === 0) return;

        const { observations, messagesCompressed, toolCallsCompressed } =
          compressMessagesToObservations(observable, obsLog.observations);

        obsLog.observations.push(...observations);
        obsLog.total_messages_compressed += messagesCompressed;
        obsLog.total_tool_calls_compressed += toolCallsCompressed;
        obsLog.last_observer_run_at = new Date().toISOString();

        // Reflect if observation count exceeds threshold
        if (obsLog.observations.length > 100) {
          obsLog.observations = reflectObservations(obsLog.observations);
          obsLog.last_reflector_run_at = new Date().toISOString();
        }

        // saveObservationLog now also materializes to markdown (Phase 1 bridge)
        await saveObservationLog(api, agentId, obsLog);
      } catch {
        // Fire-and-forget — compaction must not be blocked
      }
    })();
  });

  // ── Hook: session_start — Session Initialization ──
  api.on("session_start", async (_event, ctx) => {
    if (!ctx.workspaceDir) return;

    void (async () => {
      try {
        const { readFile, writeFile, mkdir } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const agentDir = ctx.workspaceDir!;

        // Log session start to daily memory log
        const timestamp = new Date().toISOString();
        const dateStr = timestamp.split("T")[0];
        const memoryDir = join(agentDir, "memory");
        await mkdir(memoryDir, { recursive: true });
        const dailyPath = join(memoryDir, `${dateStr}.md`);
        const logEntry = `\n- **${timestamp}** [SESSION] New session started\n`;
        try {
          const existing = await readFile(dailyPath, "utf-8");
          await writeFile(dailyPath, existing + logEntry, "utf-8");
        } catch {
          await writeFile(dailyPath, `# ${dateStr}\n${logEntry}`, "utf-8");
        }

        // Materialize all memory bridge files to ensure they are current
        const { materializeAll } = await import("./src/tools/memory-materializer.js");
        const agentId = agentDir.split("/").pop() || "default";
        await materializeAll(api, agentId);
      } catch {
        // Fire-and-forget — session init failure should not block agent start
      }
    })();
  });

  // ── Hook: llm_output — Cache and Usage Metrics ──
  api.on("llm_output", async (event, ctx) => {
    if (!ctx.workspaceDir) return;
    const pluginConfig = (api.pluginConfig ?? {}) as Record<string, unknown>;
    if (pluginConfig.llmMetricsEnabled === false) return;

    void (async () => {
      try {
        const { writeFile, mkdir } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const agentDir = ctx.workspaceDir!;

        const inputTokens = (event as any).inputTokens ?? 0;
        const outputTokens = (event as any).outputTokens ?? 0;
        const cacheReadTokens = (event as any).cacheReadTokens ?? 0;
        const cacheWriteTokens = (event as any).cacheWriteTokens ?? 0;
        const model = (event as any).model ?? "unknown";

        const cacheHitRate =
          inputTokens + cacheReadTokens > 0 ? cacheReadTokens / (inputTokens + cacheReadTokens) : 0;

        const entry = JSON.stringify({
          timestamp: new Date().toISOString(),
          model,
          inputTokens,
          outputTokens,
          cacheReadTokens,
          cacheWriteTokens,
          cacheHitRate: Math.round(cacheHitRate * 10000) / 10000,
        });

        const metricsDir = join(agentDir, "metrics");
        await mkdir(metricsDir, { recursive: true });
        const metricsPath = join(metricsDir, "llm-usage.jsonl");

        // Append JSONL entry
        const { appendFile } = await import("node:fs/promises");
        await appendFile(metricsPath, entry + "\n", "utf-8");
      } catch {
        // Fire-and-forget — metrics failure should never affect agent operation
      }
    })();
  });

  api.logger.info(
    "[mabos] MABOS extension registered (bundled, deep integration — 7 hooks active)",
  );
}
