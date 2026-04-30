import { describe, it, assert } from "vitest";
import { registerSkillLoopRoutes } from "../src/skill-loop/routes.js";

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
  return {
    scan: async () => {},
    list: () => [
      {
        name: "campaign-builder",
        path: "/skills/campaign-builder",
        manifest: {
          version: "1.0.0",
          description: "Build campaigns",
          author: "system",
          tags: ["marketing"],
          createdAt: "2026-04-12",
        },
      },
    ],
    search: (query: string) => [
      {
        name: "campaign-builder",
        manifest: { description: "Build campaigns", tags: ["marketing"] },
      },
    ],
  };
}

function mockMarketplace() {
  return {
    search: async (query: string) => [
      {
        name: "seo-optimizer",
        description: "SEO optimization skill",
        source: "clawhub",
        tags: ["seo"],
      },
    ],
    install: async (name: string) => ({
      path: `/skills/${name}`,
      manifest: { name, version: "1.0.0" },
    }),
  };
}

describe("Skill Loop Routes", () => {
  it("registers skills list, search, and install routes", () => {
    const api = mockApi();
    registerSkillLoopRoutes(api, mockRegistry() as any, mockMarketplace() as any);
    assert.ok(api._routes["/mabos/skills"]);
    assert.ok(api._routes["/mabos/skills/search"]);
    assert.ok(api._routes["/mabos/skills/install"]);
  });

  it("GET /mabos/skills returns installed skills", async () => {
    const api = mockApi();
    registerSkillLoopRoutes(api, mockRegistry() as any, mockMarketplace() as any);

    const res = mockRes();
    await api._routes["/mabos/skills"]({}, res);

    assert.equal(res._data.status, 200);
    const body = JSON.parse(res._data.body!);
    assert.ok(Array.isArray(body.skills));
    assert.equal(body.skills[0].name, "campaign-builder");
  });

  it("GET /mabos/skills/search searches local and marketplace", async () => {
    const api = mockApi();
    registerSkillLoopRoutes(api, mockRegistry() as any, mockMarketplace() as any);

    const res = mockRes();
    await api._routes["/mabos/skills/search"](
      { url: "/mabos/skills/search?q=campaign", headers: { host: "localhost" } },
      res,
    );

    assert.equal(res._data.status, 200);
    const body = JSON.parse(res._data.body!);
    assert.ok(Array.isArray(body.local));
    assert.ok(Array.isArray(body.marketplace));
  });
});
