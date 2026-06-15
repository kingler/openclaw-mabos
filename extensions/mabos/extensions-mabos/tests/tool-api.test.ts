import { Readable } from "node:stream";
import { Type } from "@sinclair/typebox";
import { describe, expect, it } from "vitest";
import { buildCatalog, toDetail } from "../src/tool-api/catalog.js";
import { registerToolApiRoutes } from "../src/tool-api/routes.js";

// Minimal AnyAgentTool-shaped fixtures.
function makeTool(name: string, execute?: (id: string, params: unknown) => Promise<unknown>) {
  return {
    name,
    label: name.toUpperCase(),
    description: `desc for ${name}`,
    parameters: Type.Object({ business_id: Type.String() }),
    execute:
      execute ??
      (async (_id: string, params: unknown) => ({
        content: [{ type: "text", text: `ran ${name}` }],
        details: { echoed: params },
      })),
  } as never;
}

const tools = [
  makeTool("bdi_get_beliefs"),
  makeTool("reasoning_deductive"),
  makeTool("memory_recall"),
];

describe("tool-api: catalog", () => {
  it("lists all tools sorted by name with a category", () => {
    const cat = buildCatalog(tools);
    expect(cat).toHaveLength(3);
    expect(cat[0].name).toBe("bdi_get_beliefs");
    expect(cat[0]).toHaveProperty("category");
  });

  it("filters by query substring", () => {
    expect(buildCatalog(tools, { q: "reason" }).map((t) => t.name)).toEqual([
      "reasoning_deductive",
    ]);
  });

  it("detail includes the param schema", () => {
    expect(toDetail(tools[0])).toHaveProperty("parameters");
  });
});

// ── Route handler harness ──────────────────────────────────────────────────

type Captured = { path: string; match?: string; handler: Function };

function fakeApi(captured: Captured[]) {
  return {
    logger: { info: () => {}, error: () => {}, warn: () => {} },
    registerHttpRoute: (r: Captured) => captured.push(r),
  } as never;
}

function makeReq(method: string, url: string, body?: unknown) {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  return Object.assign(stream, { method, url });
}

function makeRes() {
  const res: {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
    setHeader: (k: string, v: string) => void;
    end: (b?: string) => void;
  } = {
    statusCode: 200,
    headers: {},
    body: "",
    setHeader(k, v) {
      this.headers[k] = v;
    },
    end(b) {
      this.body = b ?? "";
    },
  };
  return res;
}

async function dispatch(captured: Captured[], prefix: string, req: unknown, res: unknown) {
  const route = captured.find((r) => r.path === prefix);
  if (!route) throw new Error(`no route for ${prefix}`);
  await route.handler(req, res);
}

describe("tool-api: routes", () => {
  function setup(extra: ReturnType<typeof makeTool>[] = []) {
    const captured: Captured[] = [];
    registerToolApiRoutes(fakeApi(captured), {
      tools: [...tools, ...extra],
      logger: { info: () => {}, error: () => {} },
    });
    return captured;
  }

  it("GET /mabos/tools returns the catalog", async () => {
    const captured = setup();
    const res = makeRes();
    await dispatch(captured, "/mabos/tools", makeReq("GET", "/mabos/tools"), res);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).count).toBe(3);
  });

  it("GET /mabos/tools/:name returns schema; 404 for unknown", async () => {
    const captured = setup();
    const ok = makeRes();
    await dispatch(captured, "/mabos/tools", makeReq("GET", "/mabos/tools/memory_recall"), ok);
    expect(ok.statusCode).toBe(200);
    expect(JSON.parse(ok.body).name).toBe("memory_recall");

    const missing = makeRes();
    await dispatch(captured, "/mabos/tools", makeReq("GET", "/mabos/tools/nope"), missing);
    expect(missing.statusCode).toBe(404);
  });

  it("POST /mabos/tools/:name invokes the tool", async () => {
    const captured = setup();
    const res = makeRes();
    await dispatch(
      captured,
      "/mabos/tools",
      makeReq("POST", "/mabos/tools/bdi_get_beliefs", { business_id: "acme" }),
      res,
    );
    expect(res.statusCode).toBe(200);
    const out = JSON.parse(res.body);
    expect(out.ok).toBe(true);
    expect(out.tool).toBe("bdi_get_beliefs");
    expect(out.details.echoed).toEqual({ business_id: "acme" });
  });

  it("POST does not unwrap a top-level field named 'params'", async () => {
    // Regression: integration_call has a top-level `params` field; the body
    // must pass through verbatim, not be replaced by body.params.
    const integ = {
      name: "integration_call",
      label: "Integration Call",
      description: "calls an integration",
      parameters: Type.Object({ business_id: Type.String(), params: Type.Object({}) }),
      execute: async (_id: string, p: unknown) => ({ content: [], details: { got: p } }),
    } as never;
    const captured = setup([integ]);
    const res = makeRes();
    const body = { business_id: "acme", params: { foo: 1 } };
    await dispatch(
      captured,
      "/mabos/tools",
      makeReq("POST", "/mabos/tools/integration_call", body),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).details.got).toEqual(body);
  });

  it("POST validates params against the tool schema", async () => {
    const captured = setup();
    const res = makeRes();
    await dispatch(
      captured,
      "/mabos/tools",
      makeReq("POST", "/mabos/tools/bdi_get_beliefs", { wrong: 1 }),
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("Validation failed");
  });

  it("POST surfaces tool errors as 500 ok:false", async () => {
    const failing = makeTool("explode", async () => {
      throw new Error("boom");
    });
    const captured = setup([failing]);
    const res = makeRes();
    await dispatch(
      captured,
      "/mabos/tools",
      makeReq("POST", "/mabos/tools/explode", { business_id: "x" }),
      res,
    );
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).ok).toBe(false);
  });

  it("GET /mabos/api/index lists tool count and families", async () => {
    const captured = setup();
    const res = makeRes();
    await dispatch(captured, "/mabos/api/index", makeReq("GET", "/mabos/api/index"), res);
    expect(res.statusCode).toBe(200);
    const idx = JSON.parse(res.body);
    expect(idx.tool_api.tool_count).toBe(3);
    expect(idx.provisioning.base).toBe("/mabos/provision");
  });
});
