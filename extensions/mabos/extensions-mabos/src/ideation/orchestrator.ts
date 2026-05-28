/**
 * IRC Orchestrator — staged pipeline that turns a raw founder idea into a
 * validated opportunity thesis and business model draft. Mirrors the GDC
 * orchestrator's executeStage retry/checkpoint/parse loop. Stage 6
 * (CompanyDNA assembly + persistence) lives in the module layer so this
 * class stays pure and handoff-free for testing.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildIrcPrompt, computeInputHash } from "./prompt-builder.js";
import { gatherCompetitorResearch, gatherResearch, type ResearchBackend } from "./research.js";
import { validateIdea } from "./simulator.js";
import type {
  BusinessModelDraft,
  CompetitiveLandscape,
  IdeaFrame,
  IrcPipelineConfig,
  IrcResult,
  LlmCallFn,
  MarketResearch,
  OpportunityThesis,
} from "./types.js";
import { validate, ValidationError } from "./validator.js";

const DEFAULT_MODELS: Record<number, string> = {
  1: "claude-opus-4-6",
  2: "gpt-5.4",
  3: "gpt-5.4",
  4: "claude-opus-4-6",
  5: "claude-opus-4-6",
};

const DEFAULT_MAX_TOKENS: Record<number, number> = {
  1: 2048,
  2: 6144,
  3: 4096,
  4: 4096,
  5: 6144,
};

const DEFAULT_TEMPERATURE: Record<number, number> = {
  1: 0.4,
  2: 0.3,
  3: 0.3,
  4: 0.4,
  5: 0.5,
};

/** Research question count by depth. */
const DEPTH_QUERIES: Record<string, number> = { light: 3, standard: 6, deep: 10 };

export interface IrcRunInput {
  rawIdea: string;
  industryHint?: string;
}

export class IrcOrchestrator {
  private config: IrcPipelineConfig;
  private callLlm: LlmCallFn;
  private backend?: ResearchBackend;
  private errors: string[] = [];

  constructor(config: IrcPipelineConfig, callLlm: LlmCallFn, backend?: ResearchBackend) {
    this.config = config;
    this.callLlm = callLlm;
    this.backend = backend;
  }

  async run(input: IrcRunInput): Promise<IrcResult> {
    this.errors = [];
    const result: IrcResult = { errors: [] };
    const maxStage = this.config.maxStage ?? 5;

    // Stage 1 — idea framing
    if (maxStage >= 1) {
      result.ideaFrame = await this.executeStage<IdeaFrame>(1, {
        raw_idea: input.rawIdea,
        industry_hint: input.industryHint ?? "",
      });
      if (result.ideaFrame && !result.ideaFrame.raw_idea) {
        result.ideaFrame.raw_idea = input.rawIdea;
      }
    }

    // Stage 2 — market research (derive questions, gather, synthesize)
    if (maxStage >= 2 && result.ideaFrame) {
      const questions = await this.deriveQuestions(result.ideaFrame);
      const maxQueries =
        this.config.maxResearchQueries || DEPTH_QUERIES[this.config.researchDepth] || 6;
      const gathered = await gatherResearch({ questions, backend: this.backend, maxQueries });
      this.errors.push(...gathered.errors);

      result.marketResearch = await this.executeStage<MarketResearch>(2, {
        mode: gathered.mode,
        idea_frame: result.ideaFrame,
        questions: questions.join("\n"),
        research_results: gathered.raw || "(none — analyst-only mode)",
      });
      // Trust the gathered mode over the model's self-report.
      if (result.marketResearch) result.marketResearch.mode = gathered.mode;
    }

    // Stage 3 — competitive landscape
    if (maxStage >= 3 && result.ideaFrame && result.marketResearch) {
      const competitor = await gatherCompetitorResearch({
        topic: result.ideaFrame.industry_hint ?? result.ideaFrame.problem_statement,
        backend: this.backend,
      });
      this.errors.push(...competitor.errors);
      result.competitiveLandscape = await this.executeStage<CompetitiveLandscape>(3, {
        idea_frame: result.ideaFrame,
        market_research: result.marketResearch,
        competitor_results: competitor.raw || "(none)",
      });
    }

    // Stage 4 — opportunity synthesis + validation gate
    if (maxStage >= 4 && result.competitiveLandscape) {
      const thesis = await this.executeStage<OpportunityThesis>(4, {
        idea_frame: result.ideaFrame,
        market_research: result.marketResearch,
        competitive_landscape: result.competitiveLandscape,
      });
      if (thesis) {
        if (this.config.validationGateEnabled) {
          try {
            const gate = await validateIdea({
              thesis,
              researchContext: JSON.stringify(
                { market: result.marketResearch, landscape: result.competitiveLandscape },
                null,
                2,
              ),
              callLlm: this.callLlm,
              model: this.config.models[4],
            });
            Object.assign(thesis, gate);
          } catch (err) {
            this.errors.push(`Validation gate failed: ${err instanceof Error ? err.message : err}`);
          }
        }
        result.opportunityThesis = thesis;
      }
    }

    // Stage 5 — business model draft
    if (maxStage >= 5 && result.opportunityThesis) {
      result.businessModel = await this.executeStage<BusinessModelDraft>(5, {
        opportunity_thesis: result.opportunityThesis,
        market_research: result.marketResearch,
      });
    }

    result.errors = [...this.errors];
    return result;
  }

  /** Derive 3-10 research questions from the idea frame. */
  private async deriveQuestions(frame: IdeaFrame): Promise<string[]> {
    const count = DEPTH_QUERIES[this.config.researchDepth] ?? 6;
    try {
      const resp = await this.callLlm({
        model: this.config.models[2] ?? DEFAULT_MODELS[2]!,
        system:
          "You generate sharp market-research questions. Output ONLY a JSON array of question strings.",
        user: `Idea: ${frame.problem_statement}\nTarget user: ${frame.target_user_hypothesis}\nRiskiest assumptions: ${frame.riskiest_assumptions.join("; ")}\n\nGenerate ${count} research questions that would validate or invalidate this idea. JSON array of strings only.`,
        maxTokens: 1024,
        temperature: 0.4,
      });
      const match = resp.match(/\[[\s\S]*\]/);
      if (match) {
        const arr = JSON.parse(match[0]);
        if (Array.isArray(arr)) return arr.map((q) => String(q)).slice(0, count);
      }
    } catch (err) {
      this.errors.push(`Question derivation failed: ${err instanceof Error ? err.message : err}`);
    }
    // Fallback questions grounded in the frame.
    return [
      `How large is the market for: ${frame.problem_statement}?`,
      `Who currently solves: ${frame.target_user_hypothesis}?`,
      `What are the main trends affecting ${frame.industry_hint ?? "this market"}?`,
    ].slice(0, count);
  }

  /** Core stage execution with validation-retry and checkpointing. */
  private async executeStage<T>(
    stageNumber: number,
    variables: Record<string, unknown>,
  ): Promise<T | undefined> {
    const maxRetries = 3;
    let vars = variables;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const { system, user } = buildIrcPrompt(stageNumber, vars);

        const cacheKey = computeInputHash({ stage: stageNumber, vars });
        const cached = this.loadCheckpoint(cacheKey);
        if (cached) return cached as T;

        const model =
          this.config.models[stageNumber as 1 | 2 | 3 | 4 | 5] ?? DEFAULT_MODELS[stageNumber]!;
        const response = await this.callLlm({
          model,
          system,
          user,
          maxTokens: DEFAULT_MAX_TOKENS[stageNumber]!,
          temperature: DEFAULT_TEMPERATURE[stageNumber]!,
        });

        const parsed = this.parseJsonResponse(response);
        validate(stageNumber, parsed);
        this.saveCheckpoint(cacheKey, parsed);
        return parsed as T;
      } catch (err) {
        if (attempt < maxRetries && err instanceof ValidationError) {
          vars = {
            ...vars,
            validation_feedback: `Previous attempt had validation errors:\n${err.errors.join("\n")}\n\nPlease fix these issues and return valid JSON.`,
          };
          continue;
        }
        const msg = err instanceof Error ? err.message : String(err);
        this.errors.push(`Stage ${stageNumber} failed: ${msg}`);
        return undefined;
      }
    }
    return undefined;
  }

  private parseJsonResponse(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      /* fall through */
    }
    const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlock) return JSON.parse(codeBlock[1]!);
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) return JSON.parse(jsonMatch[1]!);
    throw new Error("No valid JSON found in LLM response");
  }

  private loadCheckpoint(key: string): unknown | null {
    if (!this.config.enableCaching || !this.config.checkpointDir) return null;
    try {
      return JSON.parse(readFileSync(join(this.config.checkpointDir, `${key}.json`), "utf-8"));
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
      /* non-fatal */
    }
  }
}
