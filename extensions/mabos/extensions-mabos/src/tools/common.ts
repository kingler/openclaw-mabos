/**
 * Shared helpers for all MABOS tool modules.
 */

import { randomUUID } from "node:crypto";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

/**
 * Plugin config shape used by MABOS tools.
 */
export interface MabosPluginConfig {
  agents?: { defaults?: { workspace?: string } };
  workspaceDir?: string;
  ontologyDir?: string;
  cbrMaxCases?: number;
  stakeholderApprovalThresholdUsd?: number;
  bdiCycleIntervalMinutes?: number;
  cacheAwareLayoutEnabled?: boolean;
  cognitiveContextEnabled?: boolean;
  financialToolGuardEnabled?: boolean;
  llmMetricsEnabled?: boolean;
  preCompactionObserverEnabled?: boolean;
  autoRecallEnabled?: boolean;
  directiveRoutingEnabled?: boolean;
  inboxContextEnabled?: boolean;
  inboxWakeUpEnabled?: boolean;
  inboxWakeUpCooldownMinutes?: number;
  cognitiveRouterEnabled?: boolean;
}

/**
 * Generate a prefixed unique ID using crypto.randomUUID().
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

/** Status codes that are retryable. */
const RETRYABLE_STATUSES = new Set([0, 429, 502, 503, 504]);

/**
 * Make an HTTP request using built-in fetch with AbortController timeout.
 * Returns `{ status: 0, data: { error } }` on network or timeout errors.
 * Retries on network errors and 429/5xx with exponential backoff.
 */
export async function httpRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body?: unknown,
  timeoutMs = 5000,
  retries = 2,
): Promise<{ status: number; data: unknown }> {
  let lastResult: { status: number; data: unknown } = { status: 0, data: { error: "No attempts" } };

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 500ms, 1500ms
      const delay = attempt === 1 ? 500 : 1500;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...headers },
        body: body != null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const data = await resp.json().catch(() => resp.text());
      lastResult = { status: resp.status, data };

      if (!RETRYABLE_STATUSES.has(resp.status)) {
        return lastResult;
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error && err.name === "AbortError" ? "Request timed out" : String(err);
      lastResult = {
        status: 0,
        data: { error: msg, url, method },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return lastResult;
}

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
  const config = api.config as MabosPluginConfig;
  return config?.agents?.defaults?.workspace || config?.workspaceDir || process.cwd();
}

/**
 * Get typed plugin config from the API.
 */
export function getPluginConfig(api: OpenClawPluginApi): MabosPluginConfig {
  return (api.pluginConfig ?? api.config ?? {}) as MabosPluginConfig;
}

/**
 * Check whether agent-to-agent messaging is allowed between two agents.
 * Reads `tools.agentToAgent.enabled` and `tools.agentToAgent.allow` from config.
 * Returns null if allowed, or an error string if blocked.
 */
export function checkAgentToAgentPolicy(
  api: OpenClawPluginApi,
  fromAgentId: string,
  toAgentId: string,
): string | null {
  const a2a = (api.config as any)?.tools?.agentToAgent;

  // Same agent always allowed
  if (fromAgentId === toAgentId) return null;

  // Feature flag check
  if (!a2a?.enabled) {
    return `Agent-to-agent messaging is disabled. Set tools.agentToAgent.enabled=true to allow cross-agent messages.`;
  }

  // Allow patterns check
  const allowPatterns: string[] = Array.isArray(a2a.allow) ? a2a.allow : [];
  if (allowPatterns.length === 0) return null; // No allowlist = all allowed

  const matchesAllow = (agentId: string): boolean =>
    allowPatterns.some((pattern: string) => {
      const raw = String(pattern ?? "").trim();
      if (!raw) return false;
      if (raw === "*") return true;
      if (!raw.includes("*")) return raw === agentId;
      const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`^${escaped.split("\\*").join(".*")}$`, "i");
      return re.test(agentId);
    });

  if (!matchesAllow(fromAgentId) || !matchesAllow(toAgentId)) {
    return `Agent-to-agent messaging denied by tools.agentToAgent.allow: ${fromAgentId} → ${toAgentId} not permitted.`;
  }

  return null;
}
