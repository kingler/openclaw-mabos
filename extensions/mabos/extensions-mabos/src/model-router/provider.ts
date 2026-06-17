/**
 * Swappable LLM provider layer.
 *
 * A `LlmProvider` knows how to call one provider's API given a model + prompt.
 * Providers are looked up by name in a registry, so they can be swapped or
 * extended (register a custom provider, point at a self-hosted base URL, etc.).
 *
 * `createEffortCallLlm` ties the ModelSelector (effort/capacity/cost) to the
 * provider layer and returns an `LlmCallFn` with the GDC signature. The model
 * is chosen per call from the level of effort, the providers that currently
 * have capacity, and token cost — not hardcoded. On a capacity failure
 * (429/5xx) it marks the provider as cooling down and re-selects, so load
 * shifts to the next-cheapest available provider automatically.
 */

import type { LlmCallFn } from "../gdc/types.js";
import { httpRequest } from "../tools/common.js";
import type { CostEstimator } from "./cost-estimator.js";
import type { CapacityTracker, ModelNeeds, ModelSelector } from "./selector.js";
import type { EffortLevel } from "./types.js";

export interface LlmCallParams {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature: number;
  apiKeyEnv?: string;
  baseUrl?: string;
}

export interface LlmCallResult {
  text: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LlmProvider {
  call(params: LlmCallParams): Promise<LlmCallResult>;
}

/** Thrown for retryable provider failures (rate limit / 5xx) so the caller can re-select. */
export class CapacityError extends Error {
  constructor(
    public provider: string,
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "CapacityError";
  }
}

function resolveKey(apiKeyEnv: string | undefined, provider: string): string {
  const key = apiKeyEnv ? process.env[apiKeyEnv] : undefined;
  if (!key) throw new Error(`${provider}: API key env ${apiKeyEnv ?? "(unset)"} not set`);
  return key;
}

function throwIfCapacity(provider: string, status: number, data: unknown): void {
  if (status === 429 || status >= 500) {
    const msg = typeof data === "object" ? JSON.stringify(data) : String(data);
    throw new CapacityError(provider, status, `${provider} capacity error (${status}): ${msg}`);
  }
}

const anthropicProvider: LlmProvider = {
  async call({ model, system, user, maxTokens, temperature, apiKeyEnv, baseUrl }) {
    const resp = await httpRequest(
      baseUrl ?? "https://api.anthropic.com/v1/messages",
      "POST",
      {
        "x-api-key": resolveKey(apiKeyEnv ?? "ANTHROPIC_API_KEY", "anthropic"),
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
      0,
    );
    throwIfCapacity("anthropic", resp.status, resp.data);
    if (resp.status !== 200)
      throw new Error(`anthropic error ${resp.status}: ${JSON.stringify(resp.data)}`);
    const d = resp.data as {
      content?: { text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      text: d.content?.[0]?.text ?? "",
      usage: { inputTokens: d.usage?.input_tokens ?? 0, outputTokens: d.usage?.output_tokens ?? 0 },
    };
  },
};

/** OpenAI Chat Completions shape — shared by OpenAI and OpenAI-compatible providers (DeepSeek). */
function openAiCompatible(
  provider: string,
  defaultBaseUrl: string,
  defaultKeyEnv: string,
): LlmProvider {
  return {
    async call({ model, system, user, maxTokens, temperature, apiKeyEnv, baseUrl }) {
      const resp = await httpRequest(
        baseUrl ?? defaultBaseUrl,
        "POST",
        {
          Authorization: `Bearer ${resolveKey(apiKeyEnv ?? defaultKeyEnv, provider)}`,
          "content-type": "application/json",
        },
        {
          model,
          max_tokens: maxTokens,
          temperature,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        },
        120_000,
        0,
      );
      throwIfCapacity(provider, resp.status, resp.data);
      if (resp.status !== 200)
        throw new Error(`${provider} error ${resp.status}: ${JSON.stringify(resp.data)}`);
      const d = resp.data as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: d.choices?.[0]?.message?.content ?? "",
        usage: {
          inputTokens: d.usage?.prompt_tokens ?? 0,
          outputTokens: d.usage?.completion_tokens ?? 0,
        },
      };
    },
  };
}

const googleProvider: LlmProvider = {
  async call({ model, system, user, maxTokens, temperature, apiKeyEnv, baseUrl }) {
    const key = resolveKey(apiKeyEnv ?? "GOOGLE_API_KEY", "google");
    const base = baseUrl ?? "https://generativelanguage.googleapis.com/v1beta/models";
    const resp = await httpRequest(
      `${base}/${model}:generateContent?key=${key}`,
      "POST",
      { "content-type": "application/json" },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature },
      },
      120_000,
      0,
    );
    throwIfCapacity("google", resp.status, resp.data);
    if (resp.status !== 200)
      throw new Error(`google error ${resp.status}: ${JSON.stringify(resp.data)}`);
    const d = resp.data as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    return {
      text: d.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
      usage: {
        inputTokens: d.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: d.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  },
};

/** Registry of provider callers — register your own to swap in a custom provider. */
export class ProviderRegistry {
  private providers = new Map<string, LlmProvider>([
    ["anthropic", anthropicProvider],
    [
      "openai",
      openAiCompatible("openai", "https://api.openai.com/v1/chat/completions", "OPENAI_API_KEY"),
    ],
    [
      "deepseek",
      openAiCompatible(
        "deepseek",
        "https://api.deepseek.com/v1/chat/completions",
        "DEEPSEEK_API_KEY",
      ),
    ],
    ["google", googleProvider],
  ]);

  register(name: string, provider: LlmProvider): void {
    this.providers.set(name, provider);
  }

  get(name: string): LlmProvider | undefined {
    return this.providers.get(name);
  }
}

export interface EffortCallDeps {
  selector: ModelSelector;
  providers: ProviderRegistry;
  capacity: CapacityTracker;
  costEstimator?: CostEstimator;
  /** Optional baseUrl override per provider. */
  baseUrls?: Record<string, string>;
}

export interface EffortCallOptions {
  effort?: EffortLevel;
  /** Explicit model id that pins selection (overrides effort). */
  model?: string;
  needs?: ModelNeeds;
  /** Notified with cost/usage after each successful call. */
  onUsage?: (info: {
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }) => void;
  /** Max provider re-selections after capacity failures. Default 3. */
  maxAttempts?: number;
}

/**
 * Build an `LlmCallFn` (GDC signature) that selects the model per call from the
 * effort level, available capacity, and token cost. Selection is driven by
 * `opts.effort`; the per-call `model` the caller (e.g. GDC) passes is a hint and
 * is ignored. Set `opts.model` to pin an explicit model and bypass effort.
 */
export function createEffortCallLlm(deps: EffortCallDeps, opts: EffortCallOptions = {}): LlmCallFn {
  const { selector, providers, capacity, costEstimator, baseUrls } = deps;
  const maxAttempts = opts.maxAttempts ?? 3;
  // Pin only a request-level model that the registry knows; ignore GDC's per-stage hint.
  const override = opts.model && selector.knows(opts.model) ? opts.model : undefined;

  return async ({ system, user, maxTokens, temperature }) => {
    let lastErr: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const resolved = selector.select({ effort: opts.effort, model: override, needs: opts.needs });
      const provider = providers.get(resolved.provider);
      if (!provider) throw new Error(`No provider implementation for "${resolved.provider}"`);

      try {
        const result = await provider.call({
          model: resolved.modelId,
          system,
          user,
          maxTokens,
          temperature,
          apiKeyEnv: resolved.apiKeyEnv,
          baseUrl: baseUrls?.[resolved.provider],
        });
        capacity.recordSuccess(resolved.provider);
        if (opts.onUsage && result.usage) {
          const costUsd =
            costEstimator?.estimate(
              resolved.modelId,
              result.usage.inputTokens,
              result.usage.outputTokens,
            ).totalCostUsd ?? 0;
          opts.onUsage({
            model: resolved.modelId,
            provider: resolved.provider,
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            costUsd,
          });
        }
        return result.text;
      } catch (err) {
        lastErr = err;
        if (err instanceof CapacityError) {
          capacity.recordFailure(err.provider);
          // An explicit override pins one provider; if it has no capacity, stop.
          if (override) break;
          continue; // re-select onto the next-cheapest available provider
        }
        throw err; // non-capacity error: surface immediately
      }
    }
    throw lastErr ?? new Error("LLM call failed after retries");
  };
}
