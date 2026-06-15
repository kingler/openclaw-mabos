/**
 * Effort/capacity/cost-aware model selection.
 *
 * Given a level of effort, the selector picks the cheapest model that:
 *   1. is in the effort's candidate pool (config.effortPolicy ?? defaults),
 *   2. meets the capability needs (vision / extended-thinking / context),
 *   3. comes from a provider with capacity (API key present + not cooling down
 *      after a recent rate-limit/5xx failure),
 *   4. is within the optional cost budget.
 *
 * It generalizes CostEstimator.suggestCheapest by adding provider availability
 * (capacity) and effort tiers. An explicit `model` always wins (manual swap).
 */

import type { ModelRegistry } from "./registry.js";
import {
  DEFAULT_EFFORT_POLICY,
  DEFAULT_PROVIDER_KEY_ENV,
  type EffortLevel,
  type ModelRouterConfig,
  type ModelSpec,
  type ResolvedModel,
} from "./types.js";

export interface ModelNeeds {
  vision?: boolean;
  thinking?: boolean;
  minContextWindow?: number;
}

export interface SelectParams {
  effort?: EffortLevel;
  /** Explicit model id (e.g. "claude-sonnet-4-6" or "openai/gpt-4.1") — overrides effort. */
  model?: string;
  /** Restrict to a single provider (capacity permitting). */
  provider?: string;
  needs?: ModelNeeds;
}

/** Tracks per-provider cooldowns after capacity failures (429/5xx). */
export class CapacityTracker {
  private cooldownUntil = new Map<string, number>();
  constructor(private cooldownMs = 60_000) {}

  available(provider: string): boolean {
    const until = this.cooldownUntil.get(provider);
    return until === undefined || Date.now() >= until;
  }

  recordFailure(provider: string): void {
    this.cooldownUntil.set(provider, Date.now() + this.cooldownMs);
  }

  recordSuccess(provider: string): void {
    this.cooldownUntil.delete(provider);
  }
}

function blendedPrice(spec: ModelSpec): number {
  return spec.inputPricePer1kTokens + spec.outputPricePer1kTokens;
}

export class ModelSelector {
  private readonly policy: Record<EffortLevel, string[]>;
  private readonly maxBlended?: number;

  constructor(
    private readonly registry: ModelRegistry,
    private readonly config: ModelRouterConfig = {},
    private readonly capacity: CapacityTracker = new CapacityTracker(config.capacityCooldownMs),
  ) {
    this.policy = {
      low: config.effortPolicy?.low ?? DEFAULT_EFFORT_POLICY.low,
      medium: config.effortPolicy?.medium ?? DEFAULT_EFFORT_POLICY.medium,
      high: config.effortPolicy?.high ?? DEFAULT_EFFORT_POLICY.high,
    };
    this.maxBlended = config.costBudget?.maxUsdPer1kBlended;
  }

  /** True when `model` (bare id or "provider/id") is a known registry model. */
  knows(model: string): boolean {
    const id = model.includes("/") ? model.split("/").slice(1).join("/") : model;
    return Boolean(this.registry.getSpec(id));
  }

  /** Resolve the env var that holds a provider's API key. */
  apiKeyEnvFor(provider: string): string | undefined {
    return this.config.providers?.[provider]?.apiKeyEnv ?? DEFAULT_PROVIDER_KEY_ENV[provider];
  }

  /** A provider has capacity when its key is set and it is not cooling down. */
  private hasCapacity(provider: string): boolean {
    const env = this.apiKeyEnvFor(provider);
    if (!env || !process.env[env]) return false;
    return this.capacity.available(provider);
  }

  private meetsNeeds(spec: ModelSpec, needs?: ModelNeeds): boolean {
    if (!needs) return true;
    if (needs.vision && !spec.supportsVision) return false;
    if (needs.thinking && !spec.supportsExtendedThinking) return false;
    if (needs.minContextWindow && spec.contextWindow < needs.minContextWindow) return false;
    return true;
  }

  private eligible(spec: ModelSpec, params: SelectParams): boolean {
    if (params.provider && spec.provider !== params.provider) return false;
    if (this.maxBlended !== undefined && blendedPrice(spec) > this.maxBlended) return false;
    if (!this.meetsNeeds(spec, params.needs)) return false;
    return this.hasCapacity(spec.provider);
  }

  private toResolved(spec: ModelSpec): ResolvedModel {
    return {
      modelId: spec.id,
      provider: spec.provider,
      spec,
      apiKeyEnv: this.apiKeyEnvFor(spec.provider),
    };
  }

  /** Cheapest eligible spec from a candidate list, or null. */
  private cheapest(specs: ModelSpec[], params: SelectParams): ModelSpec | null {
    const eligible = specs
      .filter((s) => this.eligible(s, params))
      .sort((a, b) => blendedPrice(a) - blendedPrice(b));
    return eligible[0] ?? null;
  }

  /**
   * Select a model. Order of preference:
   *  1. explicit `model` override (if its provider has capacity),
   *  2. cheapest eligible from the effort pool,
   *  3. cheapest eligible across the whole registry (effort pool exhausted),
   *  4. configured fallbackChain (capacity permitting).
   * Throws when nothing is available.
   */
  select(params: SelectParams = {}): ResolvedModel {
    // 1. Explicit override.
    if (params.model) {
      const id = params.model.includes("/")
        ? params.model.split("/").slice(1).join("/")
        : params.model;
      const spec = this.registry.getSpec(id);
      if (!spec) throw new Error(`Unknown model "${params.model}"`);
      if (!this.hasCapacity(spec.provider)) {
        throw new Error(
          `Provider "${spec.provider}" for model "${id}" has no capacity (missing key or cooling down)`,
        );
      }
      return this.toResolved(spec);
    }

    const effort = params.effort ?? "medium";

    // 2. Effort pool, cheapest eligible.
    const poolSpecs = this.policy[effort]
      .map((id) => this.registry.getSpec(id))
      .filter((s): s is ModelSpec => Boolean(s));
    const fromPool = this.cheapest(poolSpecs, params);
    if (fromPool) return this.toResolved(fromPool);

    // 3. Whole registry, cheapest eligible (pool exhausted / all cooling down).
    const fromAll = this.cheapest(this.registry.listModels(), params);
    if (fromAll) return this.toResolved(fromAll);

    // 4. Fallback chain.
    for (const id of this.config.fallbackChain ?? []) {
      const spec = this.registry.getSpec(id);
      if (spec && this.hasCapacity(spec.provider)) return this.toResolved(spec);
    }

    throw new Error(
      `No model available for effort "${effort}": no provider has an API key set` +
        (this.maxBlended !== undefined ? ` within budget $${this.maxBlended}/1k` : ""),
    );
  }
}
