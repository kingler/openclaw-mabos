/**
 * Provisioning control-plane module entry point.
 *
 * Registers the `/mabos/provision/*` REST API that lets a meta harness create
 * and deploy MABOS instances end to end: scaffold → GDC bootstrap → cron seed →
 * deploy (in-gateway | container | cloud). See routes.ts for the contract and
 * docs/provisioning-api.md for the full reference.
 *
 * The GDC bootstrap's LLM calls go through the swappable, effort/capacity/cost
 * aware model router (src/model-router): the request's `effort` selects a model
 * pool and the cheapest provider with capacity is used.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createEffortModelRouter } from "../model-router/factory.js";
import type { EffortCallOptions } from "../model-router/provider.js";
import { getPluginConfig, resolveWorkspaceDir } from "../tools/common.js";
import { registerProvisioningRoutes } from "./routes.js";
import type { LlmCallFactory } from "./types.js";

export interface ProvisioningModuleDeps {
  /** Override the LLM call factory (mainly for tests). */
  makeCallLlm?: LlmCallFactory;
}

/** Register the provisioning control plane on the plugin API. */
export function registerProvisioning(
  api: OpenClawPluginApi,
  deps: ProvisioningModuleDeps = {},
): void {
  const workspaceDir = resolveWorkspaceDir(api);
  const config = getPluginConfig(api);
  const router = createEffortModelRouter(config.modelRouter ?? {});

  const makeCallLlm: LlmCallFactory =
    deps.makeCallLlm ?? ((opts: EffortCallOptions) => router.makeCallLlm(opts));

  registerProvisioningRoutes(api, {
    workspaceDir,
    makeCallLlm,
    logger: {
      info: (m) => api.logger.info(m),
      error: (m) => api.logger.error(m),
    },
  });
}

export { ProvisioningStore } from "./store.js";
export * from "./types.js";
