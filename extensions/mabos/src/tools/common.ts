/**
 * Shared helpers for all MABOS tool modules.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

/**
 * Create an AgentToolResult with text content.
 * Includes the required `details` field for pi-agent-core compatibility.
 */
export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }], details: undefined };
}

/**
 * Resolve the workspace directory from the OpenClaw plugin API.
 * Falls back to process.cwd() if not available.
 */
export function resolveWorkspaceDir(api: OpenClawPluginApi): string {
  // The config object has agents.defaults.workspace at runtime
  const config = api.config as any;
  return config?.agents?.defaults?.workspace || config?.workspaceDir || process.cwd();
}
