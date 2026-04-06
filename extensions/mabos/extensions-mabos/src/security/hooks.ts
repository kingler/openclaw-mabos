/**
 * Security hooks — injection scanning, tool approval gates, and external content sanitization.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { InjectionScanner } from "./injection-scanner.js";
import type { Sanitizer } from "./sanitizer.js";
import type { ToolGuard } from "./tool-guard.js";
import type { SecurityConfig } from "./types.js";

export function registerSecurityHooks(
  api: OpenClawPluginApi,
  deps: {
    scanner: InjectionScanner;
    guard: ToolGuard;
    sanitizer: Sanitizer;
    config: SecurityConfig;
  },
): void {
  const { scanner, guard, sanitizer, config } = deps;
  const log = api.logger;

  // Scan all tool inputs for injection attempts
  if (config.injectionScanning?.enabled !== false) {
    api.on("before_tool_call", async (event: any, _ctx: any) => {
      if (
        !config.injectionScanning?.scanToolInputs &&
        config.injectionScanning?.scanToolInputs !== undefined
      )
        return;

      const argsText = JSON.stringify(event.params ?? {});
      const result = scanner.scan(argsText);
      if (!result.clean) {
        log.warn(
          `[security] Injection detected in ${event.toolName}: ${result.findings.map((f) => f.pattern).join(", ")}`,
        );
        if (config.injectionScanning?.blockOnDetection !== false) {
          return {
            block: true,
            blockReason: `Security: potential injection detected (${result.highestThreat} threat) in tool "${event.toolName}". Patterns: ${result.findings.map((f) => f.pattern).join(", ")}`,
          };
        }
      }
    });
  }

  // Tool approval gate for dangerous operations
  if (config.toolGuard?.enabled !== false) {
    api.on("before_tool_call", async (event: any, _ctx: any) => {
      const role = _ctx.agentRole ?? "agent";
      const approval = guard.checkApproval(event.toolName, event.params ?? {}, role);
      if (approval) {
        log.info(`[security] Tool guard: ${event.toolName} requires approval for role "${role}"`);
      }
    });
  }

  // Scan external content before it's written to session transcript
  if (config.injectionScanning?.scanExternalContent !== false) {
    api.on("before_message_write", (event: any, _ctx: any) => {
      const content = typeof event.message?.content === "string" ? event.message.content : "";
      if (!content) return;

      const result = scanner.scan(content);
      if (!result.clean) {
        log.warn(
          `[security] Injection detected in message content: ${result.findings.map((f) => f.pattern).join(", ")}`,
        );
        const sanitized = sanitizer.neutralize(content, result.findings);
        return {
          message: { ...event.message, content: sanitized },
        };
      }
    });
  }
}
