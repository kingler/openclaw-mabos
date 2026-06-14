/**
 * Provisioning control-plane module entry point.
 *
 * Registers the `/mabos/provision/*` REST API that lets a meta harness create
 * and deploy MABOS instances end to end: scaffold → GDC bootstrap → cron seed →
 * deploy (in-gateway | container | cloud). See routes.ts for the contract and
 * docs/provisioning-api.md for the full reference.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { LlmCallFn } from "../gdc/types.js";
import { resolveWorkspaceDir } from "../tools/common.js";
import { defaultCallLlm } from "./llm.js";
import { registerProvisioningRoutes } from "./routes.js";

export interface ProvisioningModuleDeps {
  /** Override the LLM router used by the GDC bootstrap step. */
  callLlm?: LlmCallFn;
}

/** Register the provisioning control plane on the plugin API. */
export function registerProvisioning(
  api: OpenClawPluginApi,
  deps: ProvisioningModuleDeps = {},
): void {
  const workspaceDir = resolveWorkspaceDir(api);
  registerProvisioningRoutes(api, {
    workspaceDir,
    callLlm: deps.callLlm ?? defaultCallLlm,
    logger: {
      info: (m) => api.logger.info(m),
      error: (m) => api.logger.error(m),
    },
  });
}

export { ProvisioningStore } from "./store.js";
export * from "./types.js";
