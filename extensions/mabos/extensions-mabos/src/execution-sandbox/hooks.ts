/**
 * Execution sandbox hooks — intercepts terminal tool calls to route through sandbox backends.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { SandboxManager } from "./manager.js";
import type { ExecutionSandboxConfig } from "./types.js";

export function registerSandboxHooks(
  api: OpenClawPluginApi,
  manager: SandboxManager,
  config: ExecutionSandboxConfig,
): void {
  const log = api.logger;

  // Intercept terminal/execute_command tool calls when sandbox is enabled
  api.on("before_tool_call", async (ctx: any) => {
    if (ctx.toolName !== "terminal" && ctx.toolName !== "execute_command") return;

    const backend = config.defaultBackend ?? "local";
    if (backend === "local") return; // Pass through to default handler

    // Check per-agent override
    const agentBackend = manager.resolveBackend(ctx.agentId ?? "default");
    if (agentBackend === "local") return;

    try {
      const taskId = ctx.taskId ?? ctx.sessionId ?? `sandbox-${Date.now()}`;
      const sandbox = await manager.getOrCreate(taskId, agentBackend);

      ctx.override = async () => {
        const result = await sandbox.exec(ctx.args?.command ?? ctx.args?.cmd ?? "", {
          cwd: ctx.args?.cwd,
          timeoutMs: ctx.args?.timeout_ms ?? ctx.args?.timeout,
        });

        return {
          type: "text" as const,
          text: [
            `[sandbox:${result.backend}] Exit code: ${result.exitCode} (${result.durationMs}ms)`,
            result.stdout ? `stdout:\n${result.stdout.slice(0, 4000)}` : "",
            result.stderr ? `stderr:\n${result.stderr.slice(0, 2000)}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        };
      };
    } catch (err) {
      log.warn(`[sandbox] Failed to intercept tool call: ${err}`);
      // Fall through to default handler on error
    }
  });
}
