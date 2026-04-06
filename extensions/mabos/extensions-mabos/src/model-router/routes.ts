/**
 * Model router HTTP routes — model listing, health check, and cost estimation.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { CostEstimator } from "./cost-estimator.js";
import type { PromptCache } from "./prompt-cache.js";
import type { ModelRegistry } from "./registry.js";

export function registerModelRouterRoutes(
  api: OpenClawPluginApi,
  registry: ModelRegistry,
  costEstimator: CostEstimator,
  promptCache: PromptCache,
): void {
  // GET /mabos/models/list
  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/models/list",
    handler: async (_req, res) => {
      try {
        const models = registry.listModels().map((m) => ({
          id: m.id,
          provider: m.provider,
          contextWindow: m.contextWindow,
          maxOutput: m.maxOutput,
          inputPricePer1kTokens: m.inputPricePer1kTokens,
          outputPricePer1kTokens: m.outputPricePer1kTokens,
          supportsPromptCaching: m.supportsPromptCaching ?? false,
          supportsExtendedThinking: m.supportsExtendedThinking ?? false,
          supportsVision: m.supportsVision ?? false,
        }));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ models, count: models.length }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // GET /mabos/models/health
  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/models/health",
    handler: async (_req, res) => {
      try {
        const providers = new Set(registry.listModels().map((m) => m.provider));
        const health: Record<string, { available: boolean; modelCount: number }> = {};

        for (const provider of providers) {
          const models = registry.listByProvider(provider);
          health[provider] = {
            available: models.length > 0,
            modelCount: models.length,
          };
        }

        const cacheStats = promptCache.getStats();

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ providers: health, promptCache: cacheStats }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });
}
