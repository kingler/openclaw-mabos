/**
 * Enrichment module entry point — registers the /mabos/enrichment/* REST
 * control plane. The agent tools (createEnrichmentTools) are registered
 * separately via the extension's tool factory loop. See ../../docs/enrichment-api.md.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { createEffortModelRouter } from "../model-router/factory.js";
import type { LlmCallFactory } from "../provisioning/types.js";
import { getPluginConfig, resolveWorkspaceDir } from "../tools/common.js";
import { registerEnrichmentRoutes } from "./routes.js";

export interface EnrichmentModuleDeps {
  /** Override the LLM call factory (mainly for tests). */
  makeCallLlm?: LlmCallFactory;
}

export function registerEnrichment(api: OpenClawPluginApi, deps: EnrichmentModuleDeps = {}): void {
  const workspaceDir = resolveWorkspaceDir(api);
  const router = createEffortModelRouter(getPluginConfig(api).modelRouter ?? {});
  const makeCallLlm: LlmCallFactory = deps.makeCallLlm ?? ((opts) => router.makeCallLlm(opts));

  registerEnrichmentRoutes(api, {
    workspaceDir,
    makeCallLlm,
    logger: { info: (m) => api.logger.info(m), error: (m) => api.logger.error(m) },
  });
}

export { AssumptionStore } from "./store.js";
export { enrichBusiness } from "./service.js";
export * from "./types.js";
