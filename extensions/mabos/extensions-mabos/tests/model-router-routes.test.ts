import { describe, it, assert } from "vitest";
import { registerModelRouterRoutes } from "../src/model-router/routes.js";

function mockApi() {
  const routes: Record<string, Function> = {};
  return {
    registerHttpRoute({ path, handler }: { auth: string; path: string; handler: Function }) {
      routes[path] = handler;
    },
    _routes: routes,
  } as any;
}

function mockRes() {
  const data: { status?: number; body?: string } = {};
  return {
    writeHead(status: number) {
      data.status = status;
    },
    end(body: string) {
      data.body = body;
    },
    _data: data,
  };
}

function mockRegistry() {
  const models = [
    {
      id: "claude-opus-4-6",
      provider: "anthropic",
      contextWindow: 200000,
      maxOutput: 32000,
      inputPricePer1kTokens: 0.015,
      outputPricePer1kTokens: 0.075,
      supportsPromptCaching: true,
      supportsExtendedThinking: true,
      supportsVision: true,
    },
    {
      id: "gpt-5.4",
      provider: "openai",
      contextWindow: 128000,
      maxOutput: 16000,
      inputPricePer1kTokens: 0.01,
      outputPricePer1kTokens: 0.03,
      supportsPromptCaching: false,
      supportsExtendedThinking: false,
      supportsVision: true,
    },
  ];
  return {
    listModels: () => models,
    listByProvider: (p: string) => models.filter((m) => m.provider === p),
  };
}

function mockCostEstimator() {
  return { estimate: () => ({ totalCostUsd: 0.05 }) };
}

function mockPromptCache() {
  return { supportsModel: () => true, getStats: () => ({ hits: 5, misses: 3 }) };
}

describe("Model Router Routes", () => {
  it("registers both routes", () => {
    const api = mockApi();
    registerModelRouterRoutes(
      api,
      mockRegistry() as any,
      mockCostEstimator() as any,
      mockPromptCache() as any,
    );
    assert.ok(api._routes["/mabos/models/list"]);
    assert.ok(api._routes["/mabos/models/health"]);
  });

  it("GET /mabos/models/list returns model list", async () => {
    const api = mockApi();
    registerModelRouterRoutes(
      api,
      mockRegistry() as any,
      mockCostEstimator() as any,
      mockPromptCache() as any,
    );

    const res = mockRes();
    await api._routes["/mabos/models/list"]({}, res);

    assert.equal(res._data.status, 200);
    const body = JSON.parse(res._data.body!);
    assert.equal(body.count, 2);
    assert.equal(body.models[0].id, "claude-opus-4-6");
    assert.equal(body.models[1].provider, "openai");
  });

  it("GET /mabos/models/health returns provider health and cache stats", async () => {
    const api = mockApi();
    registerModelRouterRoutes(
      api,
      mockRegistry() as any,
      mockCostEstimator() as any,
      mockPromptCache() as any,
    );

    const res = mockRes();
    await api._routes["/mabos/models/health"]({}, res);

    assert.equal(res._data.status, 200);
    const body = JSON.parse(res._data.body!);
    assert.ok(body.providers.anthropic);
    assert.equal(body.providers.anthropic.modelCount, 1);
    assert.ok(body.providers.openai);
    assert.equal(body.promptCache.hits, 5);
  });
});
