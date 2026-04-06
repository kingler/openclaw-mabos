/**
 * Security HTTP routes — threat overview, scan log, and approval management.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { InjectionScanner } from "./injection-scanner.js";
import type { ToolGuard } from "./tool-guard.js";

interface ScanLogEntry {
  timestamp: string;
  source: string;
  threat: string;
  patterns: string[];
  blocked: boolean;
}

export function registerSecurityRoutes(
  api: OpenClawPluginApi,
  scanner: InjectionScanner,
  guard: ToolGuard,
  scanLog: ScanLogEntry[],
): void {
  // GET /mabos/security/status
  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/security/status",
    handler: async (_req, res) => {
      try {
        const recentScans = scanLog.slice(-100);
        const threatsDetected = recentScans.filter((s) => s.threat !== "none").length;
        const blocked = recentScans.filter((s) => s.blocked).length;

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            status: threatsDetected > 0 ? "threats_detected" : "clean",
            recentScans: recentScans.length,
            threatsDetected,
            blocked,
          }),
        );
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // GET /mabos/security/scan-log?limit=<n>
  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/security/scan-log",
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        const limit = parseInt(url.searchParams.get("limit") ?? "50", 10) || 50;

        const entries = scanLog.slice(-limit);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ entries, count: entries.length }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // GET /mabos/security/approvals
  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/security/approvals",
    handler: async (_req, res) => {
      try {
        const pending = guard.getPendingApprovals();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ approvals: pending, count: pending.length }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // POST /mabos/security/approvals/:id
  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/security/approvals/resolve",
    handler: async (req, res) => {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }

      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
        }
        const { id, decision } = JSON.parse(body) as {
          id: string;
          decision: "approve" | "deny";
        };

        guard.resolveApproval(id, decision);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, id, decision }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });
}
