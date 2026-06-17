import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CostEstimator } from "../src/model-router/cost-estimator.js";
import {
  CapacityError,
  ProviderRegistry,
  createEffortCallLlm,
  type LlmProvider,
} from "../src/model-router/provider.js";
import { ModelRegistry } from "../src/model-router/registry.js";
import { CapacityTracker, ModelSelector } from "../src/model-router/selector.js";

const KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY", "DEEPSEEK_API_KEY"];

describe("model-router: effort/capacity/cost selection", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  function selector(config = {}, capacity = new CapacityTracker()) {
    return new ModelSelector(new ModelRegistry(), config, capacity);
  }

  it("picks the cheapest available model in the effort pool (cost-optimized)", () => {
    process.env.ANTHROPIC_API_KEY = "x";
    process.env.OPENAI_API_KEY = "x";
    process.env.GOOGLE_API_KEY = "x";
    // low pool: haiku(.0048), gpt-4.1-mini(.002), gemini-2.5-flash(.00075), deepseek-v3(no key)
    const r = selector().select({ effort: "low" });
    expect(r.provider).toBe("google");
    expect(r.modelId).toBe("gemini-2.5-flash");
  });

  it("only considers providers with capacity (API key set)", () => {
    process.env.ANTHROPIC_API_KEY = "x"; // only anthropic available
    const r = selector().select({ effort: "low" });
    expect(r.provider).toBe("anthropic");
    expect(r.modelId).toBe("claude-haiku-4-5");
  });

  it("skips a provider that is cooling down after a failure", () => {
    process.env.OPENAI_API_KEY = "x";
    process.env.GOOGLE_API_KEY = "x";
    const cap = new CapacityTracker();
    const sel = selector({}, cap);
    expect(sel.select({ effort: "low" }).provider).toBe("google"); // cheapest
    cap.recordFailure("google");
    expect(sel.select({ effort: "low" }).provider).toBe("openai"); // failover
  });

  it("honors an explicit model override and requires its provider's key", () => {
    process.env.ANTHROPIC_API_KEY = "x";
    expect(selector().select({ model: "claude-opus-4-6" }).modelId).toBe("claude-opus-4-6");
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => selector().select({ model: "claude-opus-4-6" })).toThrow(/capacity/);
  });

  it("enforces the cost budget", () => {
    process.env.ANTHROPIC_API_KEY = "x";
    process.env.OPENAI_API_KEY = "x";
    process.env.GOOGLE_API_KEY = "x";
    // budget excludes everything but gemini-2.5-flash (.00075) in the low pool
    const r = selector({ costBudget: { maxUsdPer1kBlended: 0.001 } }).select({ effort: "low" });
    expect(r.modelId).toBe("gemini-2.5-flash");
  });

  it("throws when no provider has capacity", () => {
    expect(() => selector().select({ effort: "high" })).toThrow(/no provider has an API key/);
  });
});

describe("model-router: createEffortCallLlm", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  function fakeProvider(text: string, behavior?: () => void): LlmProvider {
    return {
      async call() {
        behavior?.();
        return { text, usage: { inputTokens: 1000, outputTokens: 1000 } };
      },
    };
  }

  it("routes to the effort-selected provider and reports cost via onUsage", async () => {
    process.env.GOOGLE_API_KEY = "x";
    const registry = new ModelRegistry();
    const capacity = new CapacityTracker();
    const selector = new ModelSelector(registry, {}, capacity);
    const providers = new ProviderRegistry();
    providers.register("google", fakeProvider("hi from gemini"));
    const usages: number[] = [];

    const call = createEffortCallLlm(
      { selector, providers, capacity, costEstimator: new CostEstimator(registry) },
      { effort: "low", onUsage: (u) => usages.push(u.costUsd) },
    );
    const out = await call({ model: "", system: "s", user: "u", maxTokens: 10, temperature: 0 });
    expect(out).toBe("hi from gemini");
    // gemini-2.5-flash: 1k in * .00015 + 1k out * .0006 = .00075
    expect(usages[0]).toBeCloseTo(0.00075, 6);
  });

  it("fails over to the next provider on a capacity error", async () => {
    process.env.GOOGLE_API_KEY = "x";
    process.env.OPENAI_API_KEY = "x";
    const registry = new ModelRegistry();
    const capacity = new CapacityTracker();
    const selector = new ModelSelector(registry, {}, capacity);
    const providers = new ProviderRegistry();
    providers.register("google", {
      async call() {
        throw new CapacityError("google", 429, "rate limited");
      },
    });
    providers.register("openai", fakeProvider("hi from openai"));

    const call = createEffortCallLlm({ selector, providers, capacity }, { effort: "low" });
    const out = await call({ model: "", system: "s", user: "u", maxTokens: 10, temperature: 0 });
    expect(out).toBe("hi from openai");
    expect(capacity.available("google")).toBe(false);
  });
});
