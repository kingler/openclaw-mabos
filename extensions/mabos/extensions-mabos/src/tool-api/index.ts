/**
 * Tool API module entry point.
 *
 * Exposes the full MABOS tool surface over REST (`/mabos/tools`) plus a unified
 * discovery index (`/mabos/api/index`). Registered from the extension entry
 * point with the already-assembled tool list so it stays in sync with whatever
 * tools were registered. See docs/tool-api.md for the reference.
 */

import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerToolApiRoutes } from "./routes.js";

export function registerToolApi(api: OpenClawPluginApi, params: { tools: AnyAgentTool[] }): void {
  registerToolApiRoutes(api, {
    tools: params.tools,
    logger: {
      info: (m) => api.logger.info(m),
      error: (m) => api.logger.error(m),
    },
  });
}

export { buildCatalog, indexTools, toDetail } from "./catalog.js";
