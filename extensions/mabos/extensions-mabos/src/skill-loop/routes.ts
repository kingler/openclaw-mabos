/**
 * Skill loop HTTP routes — skill listing, search, and marketplace.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { SkillMarketplace } from "./marketplace.js";
import type { SkillRegistry } from "./registry.js";

export function registerSkillLoopRoutes(
  api: OpenClawPluginApi,
  registry: SkillRegistry,
  marketplace: SkillMarketplace,
): void {
  // GET /mabos/skills
  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/skills",
    handler: async (_req, res) => {
      try {
        await registry.scan();
        const skills = registry.list().map((s) => ({
          name: s.name,
          path: s.path,
          version: s.manifest.version,
          description: s.manifest.description,
          author: s.manifest.author,
          tags: s.manifest.tags,
          createdAt: s.manifest.createdAt,
        }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ skills, count: skills.length }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // GET /mabos/skills/search?q=<query>
  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/skills/search",
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
        const query = url.searchParams.get("q") ?? "";
        if (!query) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing query parameter 'q'" }));
          return;
        }

        // Search local + marketplace
        const local = registry.search(query).map((s) => ({
          name: s.name,
          description: s.manifest.description,
          source: "local" as const,
          tags: s.manifest.tags,
        }));

        const remote = await marketplace.search(query).catch(() => []);
        const marketplaceResults = remote.map((s) => ({
          name: s.name,
          description: s.description,
          source: s.source,
          tags: s.tags,
        }));

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ local, marketplace: marketplaceResults }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });

  // POST /mabos/skills/install
  api.registerHttpRoute({
    auth: "gateway",
    path: "/mabos/skills/install",
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
        const { name, source, installUrl } = JSON.parse(body) as {
          name: string;
          source: string;
          installUrl: string;
        };

        const result = await marketplace.install(
          {
            name,
            version: "latest",
            description: "",
            author: "",
            tags: [],
            source,
            installUrl,
          },
          registry["paths"][0],
        );

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, path: result.path, manifest: result.manifest }));
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: String(err) }));
      }
    },
  });
}
