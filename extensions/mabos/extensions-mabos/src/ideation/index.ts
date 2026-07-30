/**
 * IRC module registration — tools and HTTP routes for the Ideation and
 * Research Chain. Mirrors the GDC module. Stage 6 (CompanyDNA assembly +
 * persistence + handoff) lives here so the orchestrator stays pure.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveWorkspaceDir, textResult } from "../tools/common.js";
import { writeDossier } from "./dossier.js";
import { callLlm } from "./llm.js";
import { IrcOrchestrator } from "./orchestrator.js";
import type { ResearchBackend } from "./research.js";
import { validateIdea } from "./simulator.js";
import type { CompanyDNA, IrcPipelineConfig, IrcResult, OpportunityThesis } from "./types.js";

interface IrcModuleConfig {
  ideationEnabled?: boolean;
  ideation?: Partial<IrcPipelineConfig>;
}

function defaultConfig(overrides?: Partial<IrcPipelineConfig>): IrcPipelineConfig {
  return {
    enabled: true,
    maxStage: 5,
    researchDepth: "standard",
    maxResearchQueries: 6,
    validationGateEnabled: true,
    validationThreshold: 18,
    models: {},
    checkpointDir: "",
    enableCaching: false,
    ...overrides,
  };
}

/**
 * Assemble the canonical CompanyDNA from IRC stage outputs — the GDC
 * handoff contract. Falls back to idea-frame content where later stages
 * are missing, so a partial run still yields a usable DNA.
 */
export function assembleCompanyDNA(result: IrcResult): CompanyDNA {
  const frame = result.ideaFrame;
  const model = result.businessModel;
  const thesis = result.opportunityThesis;

  const bmc = model?.bmc;
  const keyProducts = bmc?.value_propositions?.map((v) => v.title) ?? [];
  const channels = bmc?.channels?.map((c) => c.title) ?? [];

  const description =
    thesis?.value_proposition ||
    [frame?.problem_statement, frame?.assumed_value].filter(Boolean).join(" — ") ||
    frame?.raw_idea ||
    "New business (ideation stage)";

  return {
    business_description: description,
    mission: model?.mission ?? "",
    vision: model?.vision ?? "",
    industry: frame?.industry_hint ?? "",
    stage: "idea",
    revenue: "pre-revenue",
    team_size: 1,
    key_products: keyProducts,
    channels,
    constraints: [],
    bmc,
  };
}

function summarize(result: IrcResult): string {
  const lines = ["IRC pipeline completed."];
  if (result.ideaFrame) lines.push(`Stage 1: idea framed`);
  if (result.marketResearch)
    lines.push(
      `Stage 2: ${result.marketResearch.findings.length} findings (${result.marketResearch.mode})`,
    );
  if (result.competitiveLandscape)
    lines.push(`Stage 3: ${result.competitiveLandscape.competitors.length} competitors mapped`);
  if (result.opportunityThesis)
    lines.push(
      `Stage 4: thesis — ${result.opportunityThesis.recommendation} (confidence ${(result.opportunityThesis.confidence * 100).toFixed(0)}%)`,
    );
  if (result.businessModel) lines.push(`Stage 5: business model drafted`);
  if (result.errors.length > 0) lines.push(`Errors: ${result.errors.join("; ")}`);
  return lines.join("\n");
}

/** Persist all IRC artifacts and the CompanyDNA handoff file. */
async function persistRun(
  workspaceDir: string,
  businessId: string,
  result: IrcResult,
): Promise<string[]> {
  const bizDir = join(workspaceDir, "businesses", businessId);
  const ideationDir = join(bizDir, "ideation");
  await mkdir(ideationDir, { recursive: true });

  const written: string[] = [];
  const artifacts: Array<[string, unknown]> = [
    ["idea-frame.json", result.ideaFrame],
    ["market-research.json", result.marketResearch],
    ["competitive-landscape.json", result.competitiveLandscape],
    ["opportunity-thesis.json", result.opportunityThesis],
  ];
  for (const [name, data] of artifacts) {
    if (data) {
      const p = join(ideationDir, name);
      await writeFile(p, JSON.stringify(data, null, 2));
      written.push(p);
    }
  }

  // Dossier + seed cognitive files for the research-consuming agents.
  const dossier = await writeDossier({
    ideationDir,
    result,
    seedAgentDirs: [join(bizDir, "agents", "strategy"), join(bizDir, "agents", "sales-research")],
  });
  written.push(...dossier.filesWritten);

  // The GDC handoff contract.
  const dnaPath = join(bizDir, "company_dna.json");
  await writeFile(dnaPath, JSON.stringify(result.companyDna, null, 2));
  written.push(dnaPath);

  return written;
}

export function registerIdeation(api: OpenClawPluginApi, config: IrcModuleConfig): void {
  const log = api.logger;
  const workspaceDir = resolveWorkspaceDir(api);
  const pipelineConfig = defaultConfig(config.ideation);

  // A research backend would be wired from registered research tools here;
  // absent any, the pipeline runs in analyst-only mode (graceful default).
  const backend: ResearchBackend | undefined = undefined;

  const ircRunTool: AnyAgentTool = {
    name: "irc_run",
    label: "IRC Pipeline Run",
    description:
      "Run the Ideation and Research Chain for a raw business idea. Frames the idea, " +
      "researches the market and competitors, validates the opportunity, drafts a business " +
      "model, and writes company_dna.json for the GDC pipeline.",
    parameters: Type.Object({
      business_id: Type.String({ description: "Business directory ID" }),
      raw_idea: Type.String({ description: "The raw founder idea, in their own words" }),
      industry_hint: Type.Optional(Type.String({ description: "Optional industry/category hint" })),
      max_stage: Type.Optional(
        Type.Number({ minimum: 1, maximum: 5, description: "Maximum pipeline stage to run (1-5)" }),
      ),
    }),
    execute: async (_id, params) => {
      const { business_id, raw_idea, industry_hint, max_stage } = params as {
        business_id: string;
        raw_idea: string;
        industry_hint?: string;
        max_stage?: number;
      };
      try {
        const runConfig = defaultConfig({
          ...pipelineConfig,
          ...(max_stage ? { maxStage: max_stage as 1 | 2 | 3 | 4 | 5 } : {}),
        });
        const orchestrator = new IrcOrchestrator(runConfig, callLlm, backend);
        const result = await orchestrator.run({ rawIdea: raw_idea, industryHint: industry_hint });
        result.companyDna = assembleCompanyDNA(result);
        const written = await persistRun(workspaceDir, business_id, result);
        return textResult(
          [
            summarize(result),
            `Artifacts written: ${written.length} files`,
            `Handoff: company_dna.json ready for gdc_run`,
          ].join("\n"),
        );
      } catch (err) {
        return textResult(
          `IRC pipeline failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  };

  const ircStatusTool: AnyAgentTool = {
    name: "irc_status",
    label: "IRC Status",
    description: "Check IRC pipeline configuration and status.",
    parameters: Type.Object({}),
    execute: async () =>
      textResult(
        JSON.stringify(
          {
            enabled: config.ideationEnabled ?? false,
            maxStage: pipelineConfig.maxStage,
            researchDepth: pipelineConfig.researchDepth,
            validationGateEnabled: pipelineConfig.validationGateEnabled,
            anthropicKeySet: !!process.env.ANTHROPIC_API_KEY,
            openaiKeySet: !!process.env.OPENAI_API_KEY,
          },
          null,
          2,
        ),
      ),
  };

  const ideaValidateTool: AnyAgentTool = {
    name: "idea_validate",
    label: "Validate Idea",
    description:
      "Run the standalone validation gate against an opportunity thesis: role-plays " +
      "skeptical customer and stakeholder personas and returns objections, scores, and a " +
      "go/refine/pivot recommendation.",
    parameters: Type.Object({
      value_proposition: Type.String(),
      differentiation: Type.String(),
      target_segment: Type.String(),
      research_context: Type.Optional(Type.String()),
    }),
    execute: async (_id, params) => {
      const p = params as {
        value_proposition: string;
        differentiation: string;
        target_segment: string;
        research_context?: string;
      };
      const gate = await validateIdea({
        thesis: {
          value_proposition: p.value_proposition,
          differentiation: p.differentiation,
          target_segment: p.target_segment,
          risk_register: [],
        } as Omit<
          OpportunityThesis,
          "simulator_objections" | "scores" | "confidence" | "recommendation"
        >,
        researchContext: p.research_context ?? "(none)",
        callLlm,
      });
      return textResult(JSON.stringify(gate, null, 2));
    },
  };

  api.registerTool(ircRunTool);
  api.registerTool(ircStatusTool);
  api.registerTool(ideaValidateTool);

  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/irc/run",
    handler: async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req)
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        const body = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as {
          business_id: string;
          raw_idea: string;
          industry_hint?: string;
          max_stage?: number;
        };
        if (!body.business_id || !body.raw_idea) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "business_id and raw_idea are required" }));
          return;
        }
        const runConfig = defaultConfig({
          ...pipelineConfig,
          ...(body.max_stage ? { maxStage: body.max_stage as 1 | 2 | 3 | 4 | 5 } : {}),
        });
        const orchestrator = new IrcOrchestrator(runConfig, callLlm, backend);
        const result = await orchestrator.run({
          rawIdea: body.raw_idea,
          industryHint: body.industry_hint,
        });
        result.companyDna = assembleCompanyDNA(result);
        await persistRun(workspaceDir, body.business_id, result);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/irc/status",
    handler: async (_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          enabled: config.ideationEnabled ?? false,
          maxStage: pipelineConfig.maxStage,
          researchDepth: pipelineConfig.researchDepth,
          validationGateEnabled: pipelineConfig.validationGateEnabled,
        }),
      );
    },
  });

  log.info("[mabos] IRC ideation module registered (3 tools, 2 routes)");
}
