/**
 * Cost estimator — calculates and tracks token costs across providers.
 */

import type { ModelRegistry } from "./registry.js";

export interface CostEstimate {
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export class CostEstimator {
  private registry: ModelRegistry;
  private pricingOverrides: Record<string, { inputPer1k: number; outputPer1k: number }>;

  constructor(
    registry: ModelRegistry,
    overrides?: Record<string, { inputPer1k: number; outputPer1k: number }>,
  ) {
    this.registry = registry;
    this.pricingOverrides = overrides ?? {};
  }

  /**
   * Estimate cost for a model call.
   */
  estimate(model: string, inputTokens: number, outputTokens: number): CostEstimate {
    const override = this.pricingOverrides[model];
    if (override) {
      const inputCostUsd = (inputTokens / 1000) * override.inputPer1k;
      const outputCostUsd = (outputTokens / 1000) * override.outputPer1k;
      return {
        inputCostUsd,
        outputCostUsd,
        totalCostUsd: inputCostUsd + outputCostUsd,
        model,
        inputTokens,
        outputTokens,
      };
    }

    const spec = this.registry.getSpec(model);
    if (!spec) {
      return {
        inputCostUsd: 0,
        outputCostUsd: 0,
        totalCostUsd: 0,
        model,
        inputTokens,
        outputTokens,
      };
    }

    const inputCostUsd = (inputTokens / 1000) * spec.inputPricePer1kTokens;
    const outputCostUsd = (outputTokens / 1000) * spec.outputPricePer1kTokens;
    return {
      inputCostUsd,
      outputCostUsd,
      totalCostUsd: inputCostUsd + outputCostUsd,
      model,
      inputTokens,
      outputTokens,
    };
  }

  /**
   * Suggest the cheapest model that meets minimum requirements.
   */
  suggestCheapest(params: {
    minContextWindow?: number;
    needsVision?: boolean;
    needsThinking?: boolean;
  }): string | null {
    const models = this.registry.listModels().filter((m) => {
      if (params.minContextWindow && m.contextWindow < params.minContextWindow) return false;
      if (params.needsVision && !m.supportsVision) return false;
      if (params.needsThinking && !m.supportsExtendedThinking) return false;
      return true;
    });

    if (models.length === 0) return null;

    models.sort(
      (a, b) =>
        a.inputPricePer1kTokens +
        a.outputPricePer1kTokens -
        (b.inputPricePer1kTokens + b.outputPricePer1kTokens),
    );

    return models[0].id;
  }
}
