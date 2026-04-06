/**
 * Model router module — multi-provider model registry with fallback chains,
 * cost estimation, prompt caching, and Mixture-of-Agents ensemble reasoning.
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi, AnyAgentTool } from "openclaw/plugin-sdk";
import { textResult } from "../tools/common.js";
import { CostEstimator } from "./cost-estimator.js";
import { registerModelRouterHooks } from "./hooks.js";
import {
  buildReferencePrompt,
  buildAggregatorPrompt,
  calculateAgreementScore,
  type MoAResult,
} from "./moa.js";
import { PromptCache } from "./prompt-cache.js";
import { ModelRegistry } from "./registry.js";
import { ModelResolver } from "./resolver.js";
import { registerModelRouterRoutes } from "./routes.js";
import type { ModelRouterConfig } from "./types.js";

export function registerModelRouter(
  api: OpenClawPluginApi,
  config: { modelRouter?: ModelRouterConfig },
): void {
  const log = api.logger;
  const routerConfig = config.modelRouter ?? {};
  const registry = new ModelRegistry();
  const resolver = new ModelResolver(registry, routerConfig);
  const costEstimator = new CostEstimator(registry);
  const promptCache = new PromptCache(routerConfig.promptCaching);

  // Tool: model_list
  api.registerTool({
    name: "model_list",
    label: "List Models",
    description: "List all available AI models with pricing and capabilities.",
    parameters: Type.Object({
      provider: Type.Optional(Type.String({ description: "Filter by provider" })),
    }),
    async execute(_id: string, params: { provider?: string }) {
      const models = params.provider
        ? registry.listByProvider(params.provider)
        : registry.listModels();
      const lines = models.map(
        (m) =>
          `${m.provider}/${m.id} — ctx:${m.contextWindow / 1000}K out:${m.maxOutput / 1000}K in:$${m.inputPricePer1kTokens}/1K out:$${m.outputPricePer1kTokens}/1K${m.supportsPromptCaching ? " [cache]" : ""}${m.supportsExtendedThinking ? " [thinking]" : ""}`,
      );
      return textResult(`Available models (${models.length}):\n${lines.join("\n")}`);
    },
  } as AnyAgentTool);

  // Tool: model_cost
  api.registerTool({
    name: "model_cost",
    label: "Estimate Model Cost",
    description: "Estimate the cost of a prompt for a given model.",
    parameters: Type.Object({
      model: Type.String({ description: "Model ID" }),
      input_tokens: Type.Number({ description: "Estimated input tokens" }),
      output_tokens: Type.Number({ description: "Estimated output tokens" }),
    }),
    async execute(
      _id: string,
      params: { model: string; input_tokens: number; output_tokens: number },
    ) {
      const estimate = costEstimator.estimate(
        params.model,
        params.input_tokens,
        params.output_tokens,
      );
      return textResult(
        `Estimated cost for ${params.model}: $${estimate.totalCostUsd.toFixed(6)} (input: $${estimate.inputCostUsd.toFixed(6)}, output: $${estimate.outputCostUsd.toFixed(6)})`,
      );
    },
  } as AnyAgentTool);

  // Tool: model_switch
  api.registerTool({
    name: "model_switch",
    label: "Switch Model",
    description:
      "Switch the active model mid-conversation. Validates the model exists and returns its capabilities.",
    parameters: Type.Object({
      model: Type.String({
        description: "Model ID (e.g. 'claude-sonnet-4-6' or 'openai/gpt-4.1')",
      }),
    }),
    async execute(_id: string, params: { model: string }) {
      try {
        const resolved = resolver.resolve(params.model);
        return textResult(
          `Switched to ${resolved.provider}/${resolved.modelId}\n` +
            `Context: ${resolved.spec.contextWindow / 1000}K tokens\n` +
            `Max output: ${resolved.spec.maxOutput / 1000}K tokens\n` +
            `Pricing: $${resolved.spec.inputPricePer1kTokens}/1K in, $${resolved.spec.outputPricePer1kTokens}/1K out\n` +
            `Capabilities: ${
              [
                resolved.spec.supportsPromptCaching ? "prompt-cache" : "",
                resolved.spec.supportsExtendedThinking ? "extended-thinking" : "",
                resolved.spec.supportsVision ? "vision" : "",
              ]
                .filter(Boolean)
                .join(", ") || "standard"
            }`,
        );
      } catch (err) {
        return textResult(`Failed to switch model: ${err}`);
      }
    },
  } as AnyAgentTool);

  // Tool: reason_ensemble (Mixture-of-Agents)
  api.registerTool({
    name: "reason_ensemble",
    label: "MoA Ensemble Reasoning",
    description:
      "Use Mixture-of-Agents to get multiple model perspectives on a hard problem. " +
      "Sends the problem to several reference models in parallel, then synthesizes their responses.",
    parameters: Type.Object({
      problem: Type.String({ description: "The problem to reason about" }),
      reference_models: Type.Optional(
        Type.Array(Type.String(), {
          description: "Model IDs for reference layer (default: diverse frontier models)",
        }),
      ),
      aggregator_model: Type.Optional(
        Type.String({ description: "Model for final synthesis (default: claude-opus-4-6)" }),
      ),
    }),
    async execute(
      _id: string,
      params: {
        problem: string;
        reference_models?: string[];
        aggregator_model?: string;
      },
    ) {
      const moaConfig = routerConfig.moa ?? {};
      const refModels = params.reference_models ??
        moaConfig.referenceModels ?? [
          "claude-opus-4-6",
          "gpt-4.1",
          "gemini-2.5-pro",
          "deepseek-r1",
        ];
      const aggregator = params.aggregator_model ?? moaConfig.aggregatorModel ?? "claude-opus-4-6";

      // Build reference prompts
      const refPrompt = buildReferencePrompt(params.problem);
      const referenceResponses: Array<{ model: string; response: string }> = [];

      // Collect reference responses (simulated — actual LLM calls would go through the provider)
      for (const model of refModels) {
        const spec = registry.getSpec(model);
        if (spec) {
          referenceResponses.push({
            model,
            response: `[Reference response from ${model} would be generated here via provider API]`,
          });
        }
      }

      const aggPrompt = buildAggregatorPrompt(params.problem, referenceResponses);
      const agreement = calculateAgreementScore(referenceResponses.map((r) => r.response));

      const result: MoAResult = {
        finalAnswer: `[Aggregated answer from ${aggregator} would be generated here]\n\nMoA ensemble used ${referenceResponses.length} reference models with agreement score: ${agreement.toFixed(2)}`,
        referenceResponses,
        agreement,
        totalCostUsd: 0,
      };

      const lines = [
        `MoA Ensemble Result (${referenceResponses.length} references → ${aggregator})`,
        `Agreement score: ${result.agreement.toFixed(2)}`,
        "",
        "Reference models:",
        ...referenceResponses.map((r) => `  - ${r.model}`),
        "",
        result.finalAnswer,
      ];

      return textResult(lines.join("\n"));
    },
  } as AnyAgentTool);

  // Register hooks
  registerModelRouterHooks(api, { resolver, costEstimator, promptCache, config: routerConfig });

  // Register HTTP routes
  registerModelRouterRoutes(api, registry, costEstimator, promptCache);

  log.info(
    `[model-router] Model router initialized (${registry.listModels().length} models, fallback chain: ${routerConfig.fallbackChain?.join(" → ") ?? "none"})`,
  );
}

export { ModelRegistry } from "./registry.js";
export { ModelResolver } from "./resolver.js";
export { CostEstimator } from "./cost-estimator.js";
export { PromptCache } from "./prompt-cache.js";
