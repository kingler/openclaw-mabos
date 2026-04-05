/**
 * GDC Orchestrator — 7-stage pipeline execution engine that transforms
 * CompanyDNA into executable agent goals, plans, tasks, and actions
 * via sequential LLM calls with validation retry and checkpointing.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildPrompt, computeInputHash, summarizeForContext } from "./prompt-builder.js";
import type {
  CompanyDNA,
  GdcPipelineConfig,
  GdcResult,
  LlmCallFn,
  ToolInventoryItem,
} from "./types.js";
import { validate, ValidationError } from "./validator.js";

// ---------------------------------------------------------------------------
// Default model/token/temperature assignments per stage
// ---------------------------------------------------------------------------

const DEFAULT_MODELS: Record<number, string> = {
  1: "claude-sonnet-4-6", // Structured output
  2: "claude-opus-4-6", // Complex reasoning
  3: "claude-sonnet-4-6", // Structured output
  4: "claude-opus-4-6", // Creative planning
  5: "claude-sonnet-4-6", // Structured output
  6: "claude-sonnet-4-6", // Structured output
  7: "claude-opus-4-6", // Synthesis
};

const DEFAULT_MAX_TOKENS: Record<number, number> = {
  1: 4096,
  2: 8192,
  3: 6144,
  4: 8192,
  5: 6144,
  6: 8192,
  7: 8192,
};

const DEFAULT_TEMPERATURE: Record<number, number> = {
  1: 0.3,
  2: 0.4,
  3: 0.2,
  4: 0.5,
  5: 0.2,
  6: 0.2,
  7: 0.3,
};

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export class GdcOrchestrator {
  private config: GdcPipelineConfig;
  private callLlm: LlmCallFn;
  private errors: string[] = [];

  constructor(config: GdcPipelineConfig, callLlm: LlmCallFn) {
    this.config = config;
    this.callLlm = callLlm;
  }

  /**
   * Run the GDC pipeline up to `config.maxStage`, returning partial
   * results when stages fail (graceful degradation).
   */
  async run(companyDNA: CompanyDNA, toolInventory?: ToolInventoryItem[]): Promise<GdcResult> {
    this.errors = [];
    const maxStage = this.config.maxStage ?? 7;

    // Sequential execution (fan_out and priority_gated reserved for future)
    return this.runSequential(companyDNA, toolInventory, maxStage);
  }

  // -------------------------------------------------------------------------
  // Sequential pipeline
  // -------------------------------------------------------------------------

  private async runSequential(
    companyDNA: CompanyDNA,
    toolInventory: ToolInventoryItem[] | undefined,
    maxStage: number,
  ): Promise<GdcResult> {
    const result: GdcResult = { domain_agents: [], errors: [] };

    // Stage 1: Goal Generation
    if (maxStage >= 1) {
      result.stage1 = await this.executeStage(1, this.buildStage1Variables(companyDNA));
    }

    // Stage 2: Goal Refinement
    if (maxStage >= 2 && result.stage1) {
      result.stage2 = await this.executeStage(2, {
        stage1_output: JSON.stringify(result.stage1, null, 2),
      });
    }

    // Stage 3: Project Scoping
    if (maxStage >= 3 && result.stage1 && result.stage2) {
      const companySummary = `${companyDNA.business_description}\nMission: ${companyDNA.mission}\nVision: ${companyDNA.vision}`;
      result.stage3 = await this.executeStage(3, {
        stage1_summary: summarizeForContext(1, result.stage1 as unknown as Record<string, unknown>),
        stage2_summary: summarizeForContext(2, result.stage2 as unknown as Record<string, unknown>),
        company_summary: companySummary,
      });
    }

    // Stage 4: Plan Generation
    if (maxStage >= 4 && result.stage3) {
      result.stage4 = await this.executeStage(4, {
        stage2_summary: summarizeForContext(2, (result.stage2 ?? {}) as Record<string, unknown>),
        stage3_summary: summarizeForContext(3, result.stage3 as unknown as Record<string, unknown>),
      });
    }

    // Stage 5: Task Decomposition
    if (maxStage >= 5 && result.stage4) {
      result.stage5 = await this.executeStage(5, {
        stage4_summary: summarizeForContext(4, result.stage4 as unknown as Record<string, unknown>),
      });
    }

    // Stage 6: Action Mapping
    if (maxStage >= 6 && result.stage5) {
      result.stage6 = await this.executeStage(6, {
        stage5_summary: summarizeForContext(5, result.stage5 as unknown as Record<string, unknown>),
        tool_inventory: JSON.stringify(toolInventory ?? [], null, 2),
      });
    }

    // Stage 7: Execution Assembly
    if (maxStage >= 7 && result.stage6) {
      result.stage7 = await this.executeStage(7, {
        stage1_summary: summarizeForContext(1, (result.stage1 ?? {}) as Record<string, unknown>),
        stage3_summary: summarizeForContext(3, (result.stage3 ?? {}) as Record<string, unknown>),
        stage5_summary: summarizeForContext(5, (result.stage5 ?? {}) as Record<string, unknown>),
        stage6_output: summarizeForContext(6, result.stage6 as unknown as Record<string, unknown>),
      });
    }

    result.errors = [...this.errors];
    return result;
  }

  // -------------------------------------------------------------------------
  // Stage 1 variable assembly
  // -------------------------------------------------------------------------

  private buildStage1Variables(dna: CompanyDNA): Record<string, string> {
    // Assemble BMC summary if available
    let bmcContext = "";
    if (dna.bmc) {
      const blocks = Object.entries(dna.bmc)
        .map(([key, items]) => `${key}: ${items.map((i) => i.title).join(", ")}`)
        .join("\n");
      bmcContext = `\n\nBusiness Model Canvas:\n${blocks}`;
    }

    return {
      company_description: dna.business_description + bmcContext,
      mission_statement: dna.mission,
      vision_statement: dna.vision,
      industry: dna.industry,
      company_stage: dna.stage,
      current_revenue: dna.revenue,
      team_size: String(dna.team_size),
      key_products: dna.key_products.join(", "),
      primary_channels: dna.channels.join(", "),
      constraints: dna.constraints.join(", ") || "None specified",
    };
  }

  // -------------------------------------------------------------------------
  // Core stage execution with retry
  // -------------------------------------------------------------------------

  private async executeStage<T>(
    stageNumber: number,
    variables: Record<string, string>,
  ): Promise<T | undefined> {
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Build prompt from template
        const { system, user } = buildPrompt(stageNumber, variables);

        // Check checkpoint cache
        const cacheKey = computeInputHash({ stage: stageNumber, variables });
        const cached = this.loadCheckpoint(cacheKey);
        if (cached) return cached as T;

        // Resolve model (per-stage override or default)
        const model =
          this.config.models[stageNumber as 1 | 2 | 3 | 4 | 5 | 6 | 7] ??
          DEFAULT_MODELS[stageNumber];

        // Call LLM
        const response = await this.callLlm({
          model: model!,
          system,
          user,
          maxTokens: DEFAULT_MAX_TOKENS[stageNumber]!,
          temperature: DEFAULT_TEMPERATURE[stageNumber]!,
        });

        // Parse JSON from LLM response
        const parsed = this.parseJsonResponse(response);

        // Validate structural integrity
        validate(stageNumber, parsed);

        // Persist checkpoint and return
        this.saveCheckpoint(cacheKey, parsed);
        return parsed as T;
      } catch (err) {
        // On validation failure, retry with feedback appended to the prompt
        if (attempt < maxRetries && err instanceof ValidationError) {
          variables = {
            ...variables,
            validation_feedback: `Previous attempt had validation errors:\n${err.errors.join("\n")}\n\nPlease fix these issues.`,
          };
          continue;
        }

        // Final attempt failed -- log and degrade gracefully
        const msg = err instanceof Error ? err.message : String(err);
        this.errors.push(`Stage ${stageNumber} failed: ${msg}`);
        return undefined;
      }
    }
    return undefined;
  }

  // -------------------------------------------------------------------------
  // JSON extraction from LLM text
  // -------------------------------------------------------------------------

  private parseJsonResponse(text: string): unknown {
    // Direct JSON parse
    try {
      return JSON.parse(text);
    } catch {
      // fall through
    }

    // Extract from markdown code block
    const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      return JSON.parse(codeBlockMatch[1]!);
    }

    // Find first JSON object or array in text
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]!);
    }

    throw new Error("No valid JSON found in LLM response");
  }

  // -------------------------------------------------------------------------
  // File-based checkpointing
  // -------------------------------------------------------------------------

  private loadCheckpoint(key: string): unknown | null {
    if (!this.config.enableCaching || !this.config.checkpointDir) return null;
    try {
      const filePath = join(this.config.checkpointDir, `${key}.json`);
      return JSON.parse(readFileSync(filePath, "utf-8"));
    } catch {
      return null;
    }
  }

  private saveCheckpoint(key: string, data: unknown): void {
    if (!this.config.enableCaching || !this.config.checkpointDir) return;
    try {
      mkdirSync(this.config.checkpointDir, { recursive: true });
      writeFileSync(join(this.config.checkpointDir, `${key}.json`), JSON.stringify(data, null, 2));
    } catch {
      // Checkpoint failure is non-fatal
    }
  }
}
