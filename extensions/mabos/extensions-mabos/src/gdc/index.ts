/**
 * GDC module registration — tools and HTTP routes for the
 * Goal Decomposition Chain pipeline.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { httpRequest, resolveWorkspaceDir, textResult } from "../tools/common.js";
import { writeCognitiveState } from "./cognitive-writer.js";
import { generateDomainAgents } from "./domain-agent-generator.js";
import { GdcOrchestrator } from "./orchestrator.js";
import type {
  CompanyDNA,
  GdcPipelineConfig,
  GdcResult,
  LlmCallFn,
  ToolInventoryItem,
} from "./types.js";

// ---------------------------------------------------------------------------
// LLM call implementation via Anthropic Messages API
// ---------------------------------------------------------------------------

const callLlm: LlmCallFn = async ({ model, system, user, maxTokens, temperature }) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const resp = await httpRequest(
    "https://api.anthropic.com/v1/messages",
    "POST",
    {
      "x-api-key": apiKey,
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
    const errMsg = typeof resp.data === "object" ? JSON.stringify(resp.data) : String(resp.data);
    throw new Error(`Anthropic API error (${resp.status}): ${errMsg}`);
  }

  const parsed = resp.data as { content?: { text?: string }[] };
  return parsed.content?.[0]?.text ?? "";
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default pipeline config when none is provided. */
function defaultConfig(overrides?: Partial<GdcPipelineConfig>): GdcPipelineConfig {
  return {
    enabled: true,
    maxStage: 7,
    pattern: "sequential",
    maxParallelBranches: 1,
    models: {},
    checkpointDir: "",
    enableCaching: false,
    ...overrides,
  };
}

/** Load company_dna.json from a business directory. */
async function loadCompanyDNA(workspaceDir: string, businessId: string): Promise<CompanyDNA> {
  const dnaPath = join(workspaceDir, "businesses", businessId, "company_dna.json");
  const raw = await readFile(dnaPath, "utf-8");
  return JSON.parse(raw) as CompanyDNA;
}

/** Load tool_inventory.json if it exists, otherwise return empty array. */
async function loadToolInventory(
  workspaceDir: string,
  businessId: string,
): Promise<ToolInventoryItem[]> {
  try {
    const invPath = join(workspaceDir, "businesses", businessId, "tool_inventory.json");
    const raw = await readFile(invPath, "utf-8");
    return JSON.parse(raw) as ToolInventoryItem[];
  } catch {
    return [];
  }
}

/** Build a human-readable summary of a GDC result. */
function summarizeResult(result: GdcResult): string {
  const lines: string[] = ["GDC Pipeline completed."];
  if (result.stage1) lines.push(`Stage 1: ${result.stage1.goals.length} goals generated`);
  if (result.stage2) lines.push(`Stage 2: ${result.stage2.refined_goals.length} refined goals`);
  if (result.stage3) lines.push(`Stage 3: ${result.stage3.projects.length} projects scoped`);
  if (result.stage4) lines.push(`Stage 4: ${result.stage4.plans.length} plans generated`);
  if (result.stage5) lines.push(`Stage 5: ${result.stage5.tasks.length} tasks decomposed`);
  if (result.stage6) lines.push(`Stage 6: ${result.stage6.actions.length} actions mapped`);
  if (result.stage7) lines.push(`Stage 7: Execution plan assembled`);
  if (result.domain_agents.length > 0) {
    lines.push(`Domain agents: ${result.domain_agents.map((a) => a.id).join(", ")}`);
  }
  if (result.errors.length > 0) {
    lines.push(`Errors: ${result.errors.join("; ")}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

interface GdcModuleConfig {
  gdcEnabled?: boolean;
  gdc?: GdcPipelineConfig;
}

/**
 * Register the GDC module: tools and HTTP routes.
 */
export function registerGdc(api: OpenClawPluginApi, config: GdcModuleConfig): void {
  const log = api.logger;
  const workspaceDir = resolveWorkspaceDir(api);
  const pipelineConfig = defaultConfig(config.gdc);

  // -------------------------------------------------------------------------
  // Tool: gdc_run
  // -------------------------------------------------------------------------

  const gdcRunTool: AnyAgentTool = {
    name: "gdc_run",
    label: "GDC Pipeline Run",
    description:
      "Run the Goal Decomposition Chain pipeline for a business. " +
      "Generates goals, plans, tasks, actions, domain agents, and writes cognitive files.",
    parameters: Type.Object({
      business_id: Type.String({ description: "Business directory ID" }),
      max_stage: Type.Optional(
        Type.Number({ minimum: 1, maximum: 7, description: "Maximum pipeline stage to run (1-7)" }),
      ),
      pattern: Type.Optional(
        Type.String({ description: "Execution pattern: sequential, fan_out, or priority_gated" }),
      ),
    }),
    execute: async (params) => {
      const { business_id, max_stage, pattern } = params as {
        business_id: string;
        max_stage?: number;
        pattern?: string;
      };

      try {
        // Load inputs
        const companyDNA = await loadCompanyDNA(workspaceDir, business_id);
        const toolInventory = await loadToolInventory(workspaceDir, business_id);

        // Build config with overrides
        const runConfig = defaultConfig({
          ...pipelineConfig,
          ...(max_stage ? { maxStage: max_stage as 1 | 2 | 3 | 4 | 5 | 6 | 7 } : {}),
          ...(pattern ? { pattern: pattern as "sequential" | "fan_out" | "priority_gated" } : {}),
        });

        // Run orchestrator
        const orchestrator = new GdcOrchestrator(runConfig, callLlm);
        const result = await orchestrator.run(companyDNA, toolInventory);

        // Generate domain agents if stage 1 completed
        if (result.stage1) {
          const agents = await generateDomainAgents({
            companyDNA,
            stage1Goals: result.stage1,
            stage3Projects: result.stage3,
            toolInventory: toolInventory.map((t) => t.name),
            callLlm,
          });
          result.domain_agents = agents;
        }

        // Write cognitive files for each agent
        const allAgentRoles = [
          "ceo",
          "cfo",
          "coo",
          "cmo",
          "cto",
          "hr",
          "legal",
          "strategy",
          "knowledge",
          ...result.domain_agents.map((a) => a.id),
        ];

        const businessName = companyDNA.business_description.split(".")[0] ?? business_id;
        const writtenFiles: string[] = [];

        for (const role of allAgentRoles) {
          const agentDir = join(workspaceDir, "businesses", business_id, "agents", role);
          const { filesWritten } = await writeCognitiveState({
            agentDir,
            agentRole: role,
            gdcResult: result,
            companyDNA,
            businessName,
          });
          writtenFiles.push(...filesWritten.map((f) => `${role}/${f}`));
        }

        const summary = [
          summarizeResult(result),
          `Cognitive files written: ${writtenFiles.length} files across ${allAgentRoles.length} agents`,
        ].join("\n");

        return textResult(summary);
      } catch (err) {
        return textResult(
          `GDC pipeline failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  };

  // -------------------------------------------------------------------------
  // Tool: gdc_status
  // -------------------------------------------------------------------------

  const gdcStatusTool: AnyAgentTool = {
    name: "gdc_status",
    label: "GDC Status",
    description: "Check GDC pipeline configuration and status.",
    parameters: Type.Object({}),
    execute: async () => {
      const status = {
        enabled: config.gdcEnabled ?? false,
        maxStage: pipelineConfig.maxStage,
        pattern: pipelineConfig.pattern,
        caching: pipelineConfig.enableCaching,
        checkpointDir: pipelineConfig.checkpointDir || "(not set)",
        models: pipelineConfig.models,
        anthropicKeySet: !!process.env.ANTHROPIC_API_KEY,
      };
      return textResult(JSON.stringify(status, null, 2));
    },
  };

  // Register tools
  api.registerTool(gdcRunTool);
  api.registerTool(gdcStatusTool);

  // -------------------------------------------------------------------------
  // HTTP Route: POST /mabos/gdc/run
  // -------------------------------------------------------------------------

  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/gdc/run",
    handler: async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }

      try {
        // Read JSON body
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as {
          business_id: string;
          company_dna?: CompanyDNA;
          tool_inventory?: ToolInventoryItem[];
          max_stage?: number;
        };

        if (!body.business_id) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "business_id is required" }));
          return;
        }

        // Load or use provided company DNA
        const companyDNA =
          body.company_dna ?? (await loadCompanyDNA(workspaceDir, body.business_id));
        const toolInventory =
          body.tool_inventory ?? (await loadToolInventory(workspaceDir, body.business_id));

        const runConfig = defaultConfig({
          ...pipelineConfig,
          ...(body.max_stage ? { maxStage: body.max_stage as 1 | 2 | 3 | 4 | 5 | 6 | 7 } : {}),
        });

        const orchestrator = new GdcOrchestrator(runConfig, callLlm);
        const result = await orchestrator.run(companyDNA, toolInventory);

        // Generate domain agents
        if (result.stage1) {
          const agents = await generateDomainAgents({
            companyDNA,
            stage1Goals: result.stage1,
            stage3Projects: result.stage3,
            toolInventory: toolInventory.map((t) => t.name),
            callLlm,
          });
          result.domain_agents = agents;
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // -------------------------------------------------------------------------
  // HTTP Route: GET /mabos/gdc/status
  // -------------------------------------------------------------------------

  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/gdc/status",
    handler: async (_req, res) => {
      const status = {
        enabled: config.gdcEnabled ?? false,
        maxStage: pipelineConfig.maxStage,
        pattern: pipelineConfig.pattern,
        caching: pipelineConfig.enableCaching,
        models: pipelineConfig.models,
        anthropicKeySet: !!process.env.ANTHROPIC_API_KEY,
      };

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status));
    },
  });

  log.info("[mabos] GDC pipeline module registered (2 tools, 2 routes)");
}
