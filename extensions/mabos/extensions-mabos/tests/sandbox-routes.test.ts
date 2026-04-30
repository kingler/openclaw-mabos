import { describe, it, assert } from "vitest";
import { registerSandboxRoutes } from "../src/execution-sandbox/routes.js";

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

function mockManager() {
  return {
    getActiveSandboxes: () => [
      { taskId: "t-1", backend: "docker" },
      { taskId: "t-2", backend: "ssh" },
    ],
    destroyAll: async () => {},
  };
}

describe("Execution Sandbox Routes", () => {
  it("registers status and destroy-all routes", () => {
    const api = mockApi();
    registerSandboxRoutes(api, mockManager() as any);
    assert.ok(api._routes["/mabos/sandbox/status"]);
    assert.ok(api._routes["/mabos/sandbox/destroy-all"]);
  });

  it("GET /mabos/sandbox/status returns active sandboxes", async () => {
    const api = mockApi();
    registerSandboxRoutes(api, mockManager() as any);

    const res = mockRes();
    await api._routes["/mabos/sandbox/status"]({}, res);

    assert.equal(res._data.status, 200);
    const body = JSON.parse(res._data.body!);
    assert.ok(Array.isArray(body.sandboxes));
    assert.equal(body.sandboxes.length, 2);
    assert.equal(body.sandboxes[0].backend, "docker");
  });

  it("POST /mabos/sandbox/destroy-all clears sandboxes", async () => {
    const api = mockApi();
    registerSandboxRoutes(api, mockManager() as any);

    const res = mockRes();
    await api._routes["/mabos/sandbox/destroy-all"]({ method: "POST" }, res);

    assert.equal(res._data.status, 200);
    const body = JSON.parse(res._data.body!);
    assert.ok(body.ok);
    assert.ok(body.message.includes("destroyed"));
  });
});
