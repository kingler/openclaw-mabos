import { describe, it, assert, vi } from "vitest";
import { InjectionScanner } from "../src/security/injection-scanner.js";
import { registerSecurityRoutes } from "../src/security/routes.js";
import { ToolGuard } from "../src/security/tool-guard.js";

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

describe("Security Routes", () => {
  it("registers all 4 routes", () => {
    const api = mockApi();
    registerSecurityRoutes(api, new InjectionScanner(), new ToolGuard({ dangerousTools: [] }), []);
    assert.ok(api._routes["/mabos/security/status"]);
    assert.ok(api._routes["/mabos/security/scan-log"]);
    assert.ok(api._routes["/mabos/security/approvals"]);
    assert.ok(api._routes["/mabos/security/approvals/resolve"]);
  });

  it("GET /mabos/security/status returns correct shape", async () => {
    const api = mockApi();
    const scanLog = [
      {
        timestamp: "2026-04-12",
        source: "tool",
        threat: "critical",
        patterns: ["curl_exfil"],
        blocked: true,
      },
      { timestamp: "2026-04-12", source: "tool", threat: "none", patterns: [], blocked: false },
    ];
    registerSecurityRoutes(
      api,
      new InjectionScanner(),
      new ToolGuard({ dangerousTools: [] }),
      scanLog,
    );

    const res = mockRes();
    await api._routes["/mabos/security/status"]({}, res);

    assert.equal(res._data.status, 200);
    const body = JSON.parse(res._data.body!);
    assert.equal(body.status, "threats_detected");
    assert.equal(body.threatsDetected, 1);
    assert.equal(body.blocked, 1);
    assert.equal(body.recentScans, 2);
  });

  it("GET /mabos/security/scan-log respects limit param", async () => {
    const api = mockApi();
    const scanLog = Array.from({ length: 10 }, (_, i) => ({
      timestamp: `2026-04-${i}`,
      source: "tool",
      threat: "none",
      patterns: [],
      blocked: false,
    }));
    registerSecurityRoutes(
      api,
      new InjectionScanner(),
      new ToolGuard({ dangerousTools: [] }),
      scanLog,
    );

    const res = mockRes();
    await api._routes["/mabos/security/scan-log"](
      { url: "/mabos/security/scan-log?limit=3", headers: { host: "localhost" } },
      res,
    );

    assert.equal(res._data.status, 200);
    const body = JSON.parse(res._data.body!);
    assert.equal(body.count, 3);
    assert.equal(body.entries.length, 3);
  });

  it("GET /mabos/security/approvals returns pending list", async () => {
    const api = mockApi();
    const guard = new ToolGuard({ dangerousTools: ["execute_command"] });
    registerSecurityRoutes(api, new InjectionScanner(), guard, []);

    const res = mockRes();
    await api._routes["/mabos/security/approvals"]({}, res);

    assert.equal(res._data.status, 200);
    const body = JSON.parse(res._data.body!);
    assert.ok(Array.isArray(body.approvals));
    assert.equal(typeof body.count, "number");
  });
});
