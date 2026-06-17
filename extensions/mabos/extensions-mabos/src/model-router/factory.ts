/**
 * Convenience assembly of the effort/capacity/cost-aware model router from a
 * ModelRouterConfig. Returns the shared singletons plus a `makeCallLlm` factory
 * that builds a per-call `LlmCallFn` for a given effort/model/onUsage.
 */

import type { LlmCallFn } from "../gdc/types.js";
import { CostEstimator } from "./cost-estimator.js";
import { type EffortCallOptions, ProviderRegistry, createEffortCallLlm } from "./provider.js";
import { ModelRegistry } from "./registry.js";
import { CapacityTracker, ModelSelector } from "./selector.js";
import type { ModelRouterConfig } from "./types.js";

export interface EffortModelRouter {
  registry: ModelRegistry;
  selector: ModelSelector;
  providers: ProviderRegistry;
  capacity: CapacityTracker;
  costEstimator: CostEstimator;
  /** Build a per-call LlmCallFn for the given effort/model/usage callback. */
  makeCallLlm: (opts?: EffortCallOptions) => LlmCallFn;
}

export function createEffortModelRouter(config: ModelRouterConfig = {}): EffortModelRouter {
  const registry = new ModelRegistry();
  const capacity = new CapacityTracker(config.capacityCooldownMs);
  const selector = new ModelSelector(registry, config, capacity);
  const providers = new ProviderRegistry();
  const costEstimator = new CostEstimator(registry);

  const baseUrls: Record<string, string> = {};
  for (const [name, p] of Object.entries(config.providers ?? {})) {
    if (p.baseUrl) baseUrls[name] = p.baseUrl;
  }

  return {
    registry,
    selector,
    providers,
    capacity,
    costEstimator,
    makeCallLlm: (opts) =>
      createEffortCallLlm({ selector, providers, capacity, costEstimator, baseUrls }, opts),
  };
}
