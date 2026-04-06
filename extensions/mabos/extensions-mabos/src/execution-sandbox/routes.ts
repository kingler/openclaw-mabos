/**
 * Execution sandbox HTTP routes — sandbox status and management.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { SandboxManager } from "./manager.js";

export function registerSandboxRoutes(api: OpenClawPluginApi, manager: SandboxManager): void {
  // GET /mabos/sandbox/status
  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/sandbox/status",
    handler: async (_req, res) => {
      try {
        const active = manager.getActiveSandboxes();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sandboxes: active, count: active.length }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // POST /mabos/sandbox/destroy-all
  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/sandbox/destroy-all",
    handler: async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }
      try {
        await manager.destroyAll();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, message: "All sandboxes destroyed" }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });
}
