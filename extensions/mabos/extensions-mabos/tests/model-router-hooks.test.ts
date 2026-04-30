import { describe, it, assert } from "vitest";
import { registerModelRouterHooks } from "../src/model-router/hooks.js";

function mockApi() {
  const hooks: Record<string, Function[]> = {};
  return {
    logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
    on(event: string, handler: Function) {
      hooks[event] = hooks[event] ?? [];
      hooks[event].push(handler);
    },
    _hooks: hooks,
  } as any;
}

function mockResolver(modelId = "claude-opus-4-6", provider = "anthropic") {
  return {
    resolve: (requested: string) => ({ modelId, provider, requested }),
  };
}

function mockCostEstimator(totalCostUsd = 0.05) {
  return {
    estimate: (_model: string, _input: number, _output: number) => ({ totalCostUsd }),
  };
}

function mockPromptCache(supports = true) {
  return {
    supportsModel: (_id: string) => supports,
    getStats: () => ({ hits: 0, misses: 0 }),
  };
}

describe("Model Router Hooks", () => {
  it("registers before_model_resolve and llm_output hooks", () => {
    const api = mockApi();
    registerModelRouterHooks(api, {
      resolver: mockResolver() as any,
      costEstimator: mockCostEstimator() as any,
      promptCache: mockPromptCache() as any,
      config: {},
    });
    assert.ok(api._hooks["before_model_resolve"]?.length > 0);
    assert.ok(api._hooks["llm_output"]?.length > 0);
  });

  it("before_model_resolve sets model and provider on context", async () => {
    const api = mockApi();
    registerModelRouterHooks(api, {
      resolver: mockResolver("gpt-5.4", "openai") as any,
      costEstimator: mockCostEstimator() as any,
      promptCache: mockPromptCache(false) as any,
      config: {},
    });

    const ctx: any = { requestedModel: "openai/gpt-5.4" };
    await api._hooks["before_model_resolve"][0](ctx);

    assert.equal(ctx.model, "gpt-5.4");
    assert.equal(ctx.provider, "openai");
  });

  it("before_model_resolve sets cache flag for supported models", async () => {
    const api = mockApi();
    registerModelRouterHooks(api, {
      resolver: mockResolver() as any,
      costEstimator: mockCostEstimator() as any,
      promptCache: mockPromptCache(true) as any,
      config: { promptCaching: { enabled: true } },
    });

    const ctx: any = { requestedModel: "anthropic/claude-opus" };
    await api._hooks["before_model_resolve"][0](ctx);

    assert.equal(ctx.systemPromptCacheControl, true);
  });

  it("before_model_resolve skips when no requestedModel", async () => {
    const api = mockApi();
    registerModelRouterHooks(api, {
      resolver: mockResolver() as any,
      costEstimator: mockCostEstimator() as any,
      promptCache: mockPromptCache() as any,
      config: {},
    });

    const ctx: any = {};
    await api._hooks["before_model_resolve"][0](ctx);
    assert.equal(ctx.model, undefined);
  });

  it("llm_output tracks cost in ctx.meta", async () => {
    const api = mockApi();
    registerModelRouterHooks(api, {
      resolver: mockResolver() as any,
      costEstimator: mockCostEstimator(0.12) as any,
      promptCache: mockPromptCache() as any,
      config: {},
    });

    const ctx: any = { model: "claude-opus-4-6", inputTokens: 1000, outputTokens: 500 };
    await api._hooks["llm_output"][0](ctx);

    assert.equal(ctx.meta.estimatedCostUsd, 0.12);
  });

  it("llm_output skips when model or inputTokens missing", async () => {
    const api = mockApi();
    registerModelRouterHooks(api, {
      resolver: mockResolver() as any,
      costEstimator: mockCostEstimator() as any,
      promptCache: mockPromptCache() as any,
      config: {},
    });

    const ctx: any = {};
    await api._hooks["llm_output"][0](ctx);
    assert.equal(ctx.meta, undefined);
  });
});
