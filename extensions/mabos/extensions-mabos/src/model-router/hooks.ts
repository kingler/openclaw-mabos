/**
 * Model router hooks — intercepts model resolution and applies routing logic.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { CostEstimator } from "./cost-estimator.js";
import type { PromptCache } from "./prompt-cache.js";
import type { ModelResolver } from "./resolver.js";
import type { ModelRouterConfig } from "./types.js";

export function registerModelRouterHooks(
  api: OpenClawPluginApi,
  deps: {
    resolver: ModelResolver;
    costEstimator: CostEstimator;
    promptCache: PromptCache;
    config: ModelRouterConfig;
  },
): void {
  const { resolver, costEstimator, promptCache, config } = deps;
  const log = api.logger;

  // Intercept model resolution to apply fallback chains and routing
  api.on("before_model_resolve", async (ctx: any) => {
    if (!ctx.requestedModel) return;

    try {
      const resolved = resolver.resolve(ctx.requestedModel);
      ctx.model = resolved.modelId;
      ctx.provider = resolved.provider;

      // Apply prompt caching if supported
      if (config.promptCaching?.enabled !== false && promptCache.supportsModel(resolved.modelId)) {
        ctx.systemPromptCacheControl = true;
      }
    } catch (err) {
      log.debug?.(
        `[model-router] Resolution failed for "${ctx.requestedModel}", using default: ${err}`,
      );
    }
  });

  // Track LLM costs after output
  api.on("llm_output", async (ctx: any) => {
    if (!ctx.model || !ctx.inputTokens) return;

    try {
      const estimate = costEstimator.estimate(
        ctx.model,
        ctx.inputTokens ?? 0,
        ctx.outputTokens ?? 0,
      );
      ctx.meta = ctx.meta ?? {};
      ctx.meta.estimatedCostUsd = estimate.totalCostUsd;
    } catch {
      // Non-critical: skip cost tracking on errors
    }
  });
}
