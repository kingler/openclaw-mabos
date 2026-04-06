/**
 * Session intelligence HTTP routes — session search, recall, and user profile.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { SessionRecall } from "./recall.js";
import type { SessionIndex } from "./session-index.js";
import type { UserModel } from "./user-model.js";

export function registerSessionIntelRoutes(
  api: OpenClawPluginApi,
  index: SessionIndex,
  recall: SessionRecall,
  userModel: UserModel | null,
): void {
  // GET /mabos/sessions/search?q=<query>&agent_id=<id>&limit=<n>
  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/sessions/search",
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        const query = url.searchParams.get("q") ?? "";
        if (!query) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing query parameter 'q'" }));
          return;
        }

        const agentId = url.searchParams.get("agent_id") ?? undefined;
        const limit = parseInt(url.searchParams.get("limit") ?? "20", 10) || 20;

        const results = index.search(query, { agentId, limit });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ results, count: results.length }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // POST /mabos/sessions/recall
  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/sessions/recall",
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
        const { query, agent_id, limit } = JSON.parse(body) as {
          query: string;
          agent_id?: string;
          limit?: number;
        };

        const results = await recall.recall({ query, agentId: agent_id, limit });

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ results, count: results.length }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // GET /mabos/sessions/profile
  if (userModel) {
    api.registerHttpRoute({
      auth: "gateway",
      path: "/mabos/sessions/profile",
      handler: async (_req, res) => {
        try {
          const profile = await userModel.readProfile();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ profile: profile ?? null }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      },
    });
  }
}
