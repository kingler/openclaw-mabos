/**
 * MABOS — Multi-Agent Business Operating System
 * Bundled Extension Entry Point (Deep Integration)
 *
 * Registers:
 *  - 99 tools across 21 modules
 *  - BDI background heartbeat service
 *  - CLI subcommands (onboard, agents, bdi, business, dashboard)
 *  - Unified memory bridge to native memory system
 *  - Agent lifecycle hooks (Persona injection, BDI audit trail)
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createBdiTools } from "./src/tools/bdi-tools.js";
import { createBusinessTools } from "./src/tools/business-tools.js";
import { createCbrTools } from "./src/tools/cbr-tools.js";
import { resolveWorkspaceDir } from "./src/tools/common.js";
import { createCommunicationTools } from "./src/tools/communication-tools.js";
import { createDesireTools } from "./src/tools/desire-tools.js";
import { createFactStoreTools } from "./src/tools/fact-store.js";
import { createInferenceTools } from "./src/tools/inference-tools.js";
import { createIntegrationTools } from "./src/tools/integration-tools.js";
import { createKnowledgeTools } from "./src/tools/knowledge-tools.js";
import { createMarketingTools } from "./src/tools/marketing-tools.js";
import { createMemoryTools } from "./src/tools/memory-tools.js";
import { createMetricsTools } from "./src/tools/metrics-tools.js";
import { createOnboardingTools } from "./src/tools/onboarding-tools.js";
import { createOntologyManagementTools } from "./src/tools/ontology-management-tools.js";
import { createPlanningTools } from "./src/tools/planning-tools.js";
import { createReasoningTools } from "./src/tools/reasoning-tools.js";
import { createReportingTools } from "./src/tools/reporting-tools.js";
import { createRuleEngineTools } from "./src/tools/rule-engine.js";
import { createSetupWizardTools } from "./src/tools/setup-wizard-tools.js";
import { createStakeholderTools } from "./src/tools/stakeholder-tools.js";
import { createWorkforceTools } from "./src/tools/workforce-tools.js";

// Use a variable for the bdi-runtime path so TypeScript doesn't try to
// statically resolve it (it lives outside this extension's rootDir).
const BDI_RUNTIME_PATH = "../../mabos/bdi-runtime/index.js";

export default function register(api: OpenClawPluginApi) {
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
    createOnboardingTools,
    createStakeholderTools,
    createWorkforceTools,
    createIntegrationTools,
    createReportingTools,
    createMarketingTools,
    createOntologyManagementTools,
    createSetupWizardTools,
  ];

  for (const factory of factories) {
    const tools = factory(api);
    for (const tool of tools) {
      api.registerTool(tool);
    }
  }

  // ── 2. BDI Background Service ─────────────────────────────────
  const workspaceDir = resolveWorkspaceDir(api);
  const bdiIntervalMinutes = (api.pluginConfig as any)?.bdiCycleIntervalMinutes ?? 30;

  // Dynamic import to avoid bundling issues — the bdi-runtime
  // lives in mabos/ which is outside the extension directory.
  // For now, inline a minimal service; the full runtime in
  // mabos/bdi-runtime/ is used by the CLI commands.
  let bdiInterval: ReturnType<typeof setInterval> | null = null;

  api.registerService({
    id: "mabos-bdi-heartbeat",
    start: async () => {
      api.logger.info(`[mabos-bdi] Heartbeat started (interval: ${bdiIntervalMinutes}min)`);

      const runCycle = async () => {
        try {
          const { discoverAgents, readAgentCognitiveState, runMaintenanceCycle } = (await import(
            /* webpackIgnore: true */ BDI_RUNTIME_PATH
          )) as any;
          const agents = await discoverAgents(workspaceDir);
          for (const agentId of agents) {
            const { join } = await import("node:path");
            const agentDir = join(workspaceDir, "agents", agentId);
            const state = await readAgentCognitiveState(agentDir, agentId);
            await runMaintenanceCycle(state);
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
          runCycle().catch(() => {});
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
      api.logger.info("[mabos-bdi] Heartbeat stopped");
    },
  });

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
            console.log(`Starting onboarding for: ${businessName}`);
            console.log("Use the MABOS agent tools for full interactive onboarding.");
            return;
          }

          if (businessName && orchestrateTool) {
            console.log(`Onboarding "${businessName}" (${opts.industry ?? "general"})...`);
            try {
              const result = await (orchestrateTool as any).execute("cli", {
                business_name: businessName,
                industry: opts.industry ?? "general",
              });
              console.log(JSON.stringify(result, null, 2));
            } catch (err) {
              console.error(
                `Onboarding error: ${err instanceof Error ? err.message : String(err)}`,
              );
            }
          } else {
            console.log("Usage: mabos onboard <business-name> [--industry <type>]");
            console.log("Industries: ecommerce, saas, consulting, marketplace, retail");
          }
        });

      // --- mabos agents ---
      mabos
        .command("agents")
        .description("List BDI agents with cognitive state summary")
        .action(async () => {
          try {
            const { getAgentsSummary } = (await import(
              /* webpackIgnore: true */ BDI_RUNTIME_PATH
            )) as any;
            const summaries = await getAgentsSummary(workspaceDir);

            if (summaries.length === 0) {
              console.log("No MABOS agents found. Run 'mabos onboard' to create a business.");
              return;
            }

            console.log("\nMABOS Agents\n" + "=".repeat(70));
            console.log(
              "Agent".padEnd(15) +
                "Beliefs".padEnd(10) +
                "Goals".padEnd(10) +
                "Intentions".padEnd(12) +
                "Desires".padEnd(10),
            );
            console.log("-".repeat(70));

            for (const s of summaries) {
              console.log(
                s.agentId.padEnd(15) +
                  String(s.beliefCount).padEnd(10) +
                  String(s.goalCount).padEnd(10) +
                  String(s.intentionCount).padEnd(12) +
                  String(s.desireCount).padEnd(10),
              );
            }
            console.log(`\nTotal: ${summaries.length} agents`);
          } catch (err) {
            console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
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
            const { readAgentCognitiveState, runMaintenanceCycle } = (await import(
              /* webpackIgnore: true */ BDI_RUNTIME_PATH
            )) as any;
            const agentDir = join(workspaceDir, "agents", agentId);
            const state = await readAgentCognitiveState(agentDir, agentId);
            const result = await runMaintenanceCycle(state);
            console.log(`BDI cycle for ${agentId}:`);
            console.log(`  Intentions pruned: ${result.staleIntentionsPruned}`);
            console.log(`  Desires re-sorted: ${result.desiresPrioritized}`);
            console.log(`  Timestamp: ${result.timestamp}`);
          } catch (err) {
            console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
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
              console.log("No businesses found. Run 'mabos onboard' to create one.");
              return;
            }

            console.log("\nManaged Businesses\n" + "=".repeat(50));
            for (const entry of entries) {
              const s = await fsStat(join(businessDir, entry)).catch(() => null);
              if (s?.isDirectory()) {
                const manifest = join(businessDir, entry, "manifest.json");
                try {
                  const { readFile } = await import("node:fs/promises");
                  const data = JSON.parse(await readFile(manifest, "utf-8"));
                  console.log(`  ${data.name ?? entry} (${data.industry ?? "general"})`);
                } catch {
                  console.log(`  ${entry}`);
                }
              }
            }
          } catch (err) {
            console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
          }
        });

      // --- mabos migrate ---
      mabos
        .command("migrate")
        .description("Migrate data from ~/.openclaw to ~/.mabos")
        .option("--dry-run", "Preview changes without modifying files")
        .action(async (opts: { dryRun?: boolean }) => {
          try {
            const migratePath = "../../mabos/scripts/migrate.js";
            const { migrate } = (await import(/* webpackIgnore: true */ migratePath)) as any;
            await migrate({ dryRun: opts.dryRun ?? false });
          } catch (err) {
            console.error(`Migration error: ${err instanceof Error ? err.message : String(err)}`);
          }
        });

      // --- mabos dashboard ---
      mabos
        .command("dashboard")
        .description("Open the MABOS web dashboard")
        .action(async () => {
          const port = api.config?.gateway?.port ?? 18789;
          const url = `http://localhost:${port}/mabos/dashboard`;
          console.log(`Opening dashboard: ${url}`);
          try {
            const { exec } = await import("node:child_process");
            const { platform } = await import("node:os");
            const cmd =
              platform() === "darwin" ? "open" : platform() === "win32" ? "start" : "xdg-open";
            exec(`${cmd} ${url}`);
          } catch {
            console.log(`Open manually: ${url}`);
          }
        });
    },
    { commands: ["mabos"] },
  );

  // ── 4. Dashboard HTTP Routes ────────────────────────────────────

  // API endpoint for live data
  api.registerHttpRoute({
    path: "/mabos/api/status",
    handler: async (_req, res) => {
      try {
        const { discoverAgents, getAgentsSummary } = (await import(
          /* webpackIgnore: true */ BDI_RUNTIME_PATH
        )) as any;
        const agents = await getAgentsSummary(workspaceDir);

        const { readdir } = await import("node:fs/promises");
        const { join } = await import("node:path");
        const businessDir = join(workspaceDir, "businesses");
        const businesses = await readdir(businessDir).catch(() => []);

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
          }),
        );
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = 500;
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // Dashboard HTML page
  api.registerHttpRoute({
    path: "/mabos/dashboard",
    handler: async (_req, res) => {
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>MABOS Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 960px; margin: 0 auto; padding: 24px; background: #0d1117; color: #c9d1d9; }
    h1 { color: #58a6ff; font-size: 1.8em; margin-bottom: 4px; }
    h2 { color: #58a6ff; font-size: 1.2em; margin-bottom: 12px; }
    .subtitle { color: #8b949e; margin-bottom: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; }
    .stat { font-size: 2em; font-weight: bold; color: #58a6ff; }
    .stat-label { color: #8b949e; font-size: 0.85em; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { text-align: left; padding: 8px 12px; color: #8b949e; font-size: 0.85em; border-bottom: 1px solid #30363d; }
    td { padding: 8px 12px; border-bottom: 1px solid #21262d; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 0.75em; font-weight: bold; }
    .badge-active { background: #238636; color: #fff; }
    .badge-bundled { background: #1f6feb; color: #fff; }
    .loading { color: #8b949e; font-style: italic; }
    code { background: #21262d; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>MABOS Dashboard</h1>
  <p class="subtitle">Multi-Agent Business Operating System</p>

  <div class="grid">
    <div class="card">
      <div class="stat" id="agent-count">-</div>
      <div class="stat-label">BDI Agents</div>
    </div>
    <div class="card">
      <div class="stat" id="business-count">-</div>
      <div class="stat-label">Managed Businesses</div>
    </div>
    <div class="card">
      <div class="stat"><span class="badge badge-active">Active</span></div>
      <div class="stat-label">BDI Heartbeat (${bdiIntervalMinutes}min)</div>
    </div>
    <div class="card">
      <div class="stat"><span class="badge badge-bundled">Bundled</span></div>
      <div class="stat-label">Extension Mode</div>
    </div>
  </div>

  <div class="card" style="margin-bottom: 16px;">
    <h2>Agents</h2>
    <div id="agents-table" class="loading">Loading...</div>
  </div>

  <div class="card">
    <h2>CLI Commands</h2>
    <table>
      <tr><td><code>mabos onboard &lt;name&gt;</code></td><td>Create a new business</td></tr>
      <tr><td><code>mabos agents</code></td><td>List agents with cognitive state</td></tr>
      <tr><td><code>mabos bdi cycle &lt;agent&gt;</code></td><td>Run BDI maintenance cycle</td></tr>
      <tr><td><code>mabos business list</code></td><td>List managed businesses</td></tr>
      <tr><td><code>mabos migrate</code></td><td>Migrate from OpenClaw</td></tr>
    </table>
  </div>

  <script>
    fetch('/mabos/api/status')
      .then(r => r.json())
      .then(data => {
        document.getElementById('agent-count').textContent = data.agents?.length ?? 0;
        document.getElementById('business-count').textContent = data.businessCount ?? 0;
        if (data.agents?.length > 0) {
          let html = '<table><tr><th>Agent</th><th>Beliefs</th><th>Goals</th><th>Intentions</th><th>Desires</th></tr>';
          for (const a of data.agents) {
            html += '<tr><td>' + a.agentId + '</td><td>' + a.beliefCount + '</td><td>' + a.goalCount + '</td><td>' + a.intentionCount + '</td><td>' + a.desireCount + '</td></tr>';
          }
          html += '</table>';
          document.getElementById('agents-table').innerHTML = html;
        } else {
          document.getElementById('agents-table').innerHTML = '<p>No agents found. Run <code>mabos onboard</code> to get started.</p>';
        }
      })
      .catch(() => {
        document.getElementById('agents-table').innerHTML = '<p>Could not load agent data.</p>';
      });
  </script>
</body>
</html>`;
      res.setHeader("Content-Type", "text/html");
      res.end(html);
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

  // ── 6. Agent Lifecycle Hooks ──────────────────────────────────

  // Inject BDI context + Persona.md into the system prompt
  api.on("before_agent_start", async (_event, ctx) => {
    if (ctx.workspaceDir) {
      const agentDir = ctx.workspaceDir;
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
          // Extract only active goals (first 500 chars for prompt budget)
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

        if (parts.length > 0) {
          return {
            prependContext: `[MABOS Agent Context]\n${parts.join("\n\n")}\n`,
          };
        }
      } catch {
        // Not a MABOS agent — skip
      }
    }
    return undefined;
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

  api.logger.info("[mabos] MABOS extension registered (bundled, deep integration)");
}
