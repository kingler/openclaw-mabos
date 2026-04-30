import { describe, it, assert } from "vitest";
import { registerSandboxHooks } from "../src/execution-sandbox/hooks.js";

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

function mockManager(backend = "docker") {
  const created: string[] = [];
  return {
    resolveBackend: () => backend,
    getOrCreate: async (taskId: string, _backend: string) => {
      created.push(taskId);
      return {
        exec: async (cmd: string) => ({
          backend,
          exitCode: 0,
          stdout: `executed: ${cmd}`,
          stderr: "",
          durationMs: 100,
        }),
      };
    },
    _created: created,
  };
}

describe("Execution Sandbox Hooks", () => {
  it("registers before_tool_call hook", () => {
    const api = mockApi();
    registerSandboxHooks(api, mockManager() as any, { defaultBackend: "docker" });
    assert.ok(api._hooks["before_tool_call"]?.length > 0);
  });

  it("passes through for local backend", async () => {
    const api = mockApi();
    registerSandboxHooks(api, mockManager("local") as any, { defaultBackend: "local" });

    const ctx: any = { toolName: "terminal", args: { command: "ls" } };
    await api._hooks["before_tool_call"][0](ctx);

    // No override set — passes through to default
    assert.equal(ctx.override, undefined);
  });

  it("ignores non-terminal tools", async () => {
    const api = mockApi();
    registerSandboxHooks(api, mockManager() as any, { defaultBackend: "docker" });

    const ctx: any = { toolName: "shopify_list", args: {} };
    await api._hooks["before_tool_call"][0](ctx);
    assert.equal(ctx.override, undefined);
  });

  it("routes terminal tool through sandbox backend", async () => {
    const api = mockApi();
    const manager = mockManager("docker");
    registerSandboxHooks(api, manager as any, { defaultBackend: "docker" });

    const ctx: any = { toolName: "terminal", args: { command: "echo hello" }, sessionId: "s-1" };
    await api._hooks["before_tool_call"][0](ctx);

    assert.ok(typeof ctx.override === "function");
    const result = await ctx.override();
    assert.ok(result.text.includes("sandbox:docker"));
    assert.ok(result.text.includes("Exit code: 0"));
  });

  it("routes execute_command tool through sandbox backend", async () => {
    const api = mockApi();
    registerSandboxHooks(api, mockManager("docker") as any, { defaultBackend: "docker" });

    const ctx: any = { toolName: "execute_command", args: { cmd: "pwd" }, sessionId: "s-2" };
    await api._hooks["before_tool_call"][0](ctx);
    assert.ok(typeof ctx.override === "function");
  });
});
