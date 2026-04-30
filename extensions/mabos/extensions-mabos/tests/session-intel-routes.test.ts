import { describe, it, assert } from "vitest";
import { registerSessionIntelRoutes } from "../src/session-intel/routes.js";

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

function mockSessionIndex() {
  return {
    search: (query: string, opts?: any) => [
      {
        content: "Create marketing campaign",
        role: "user",
        sessionId: "s-1",
        relevance: 0.9,
        timestamp: Date.now(),
      },
    ],
  };
}

function mockRecall() {
  return {
    recall: async (query: string, opts?: any) => [
      { sessionId: "s-1", messages: [{ role: "user", content: "Create campaign" }] },
    ],
  };
}

function mockUserModel(profile = "Prefers concise responses") {
  return {
    getProfileSection: async () => profile,
  };
}

describe("Session Intel Routes", () => {
  it("registers search, recall, and profile routes", () => {
    const api = mockApi();
    registerSessionIntelRoutes(
      api,
      mockSessionIndex() as any,
      mockRecall() as any,
      mockUserModel() as any,
    );
    assert.ok(api._routes["/mabos/sessions/search"]);
    assert.ok(api._routes["/mabos/sessions/recall"]);
    assert.ok(api._routes["/mabos/sessions/profile"]);
  });

  it("GET /mabos/sessions/search returns results", async () => {
    const api = mockApi();
    registerSessionIntelRoutes(api, mockSessionIndex() as any, mockRecall() as any, null);

    const res = mockRes();
    await api._routes["/mabos/sessions/search"](
      { url: "/mabos/sessions/search?q=campaign", headers: { host: "localhost" } },
      res,
    );

    assert.equal(res._data.status, 200);
    const body = JSON.parse(res._data.body!);
    assert.ok(Array.isArray(body.results));
  });

  it("registers profile route only when userModel provided", () => {
    const api = mockApi();
    registerSessionIntelRoutes(api, mockSessionIndex() as any, mockRecall() as any, null);
    assert.equal(api._routes["/mabos/sessions/profile"], undefined);
  });
});
