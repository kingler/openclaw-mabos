/**
 * Tool API — exposes the full MABOS operating surface over REST so a meta
 * harness can drive a running instance directly (not only via the LLM agent):
 *
 *   GET  /mabos/tools            catalog (filter by ?category= / ?q=)
 *   GET  /mabos/tools/:name      single tool + param schema
 *   POST /mabos/tools/:name      invoke the tool (body = params)
 *   GET  /mabos/api/index        unified index of the MABOS API surface
 *
 * Because every MAS capability — Agents/BDI, Reasoning, Knowledge, Memory,
 * Learning (CBR), Coordination, … — is a registered tool, the catalog + invoker
 * cover them all. Routes use `auth: "gateway"`: the gateway enforces its bearer
 * token before the handler runs.
 */

import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Value } from "@sinclair/typebox/value";
import type { AnyAgentTool, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { buildCatalog, toDetail } from "./catalog.js";

const TOOLS_PREFIX = "/mabos/tools";

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

export interface ToolApiDeps {
  tools: AnyAgentTool[];
  logger: { info: (m: string) => void; error: (m: string) => void };
}

export function registerToolApiRoutes(api: OpenClawPluginApi, deps: ToolApiDeps): void {
  // Look up against the live array so tools appended after registration
  // (e.g. printed CLIs) are reachable.
  const findTool = (name: string) => deps.tools.find((t) => t.name === name);

  // ── /mabos/tools (catalog + per-tool detail + invocation) ────────────────
  api.registerHttpRoute({
    path: TOOLS_PREFIX,
    match: "prefix",
    auth: "gateway",
    handler: async (req, res) => {
      const url = new URL(req.url || "/", "http://localhost");
      const method = (req.method || "GET").toUpperCase();
      const rest = url.pathname.slice(TOOLS_PREFIX.length).replace(/\/$/, ""); // "" or "/:name"

      try {
        // GET /mabos/tools — catalog
        if (method === "GET" && rest === "") {
          const catalog = buildCatalog(deps.tools, {
            category: url.searchParams.get("category") ?? undefined,
            q: url.searchParams.get("q") ?? undefined,
          });
          return sendJson(res, 200, { count: catalog.length, tools: catalog });
        }

        const nameMatch = rest.match(/^\/([^/]+)$/);
        if (nameMatch) {
          const name = decodeURIComponent(nameMatch[1]);
          const tool = findTool(name);
          if (!tool) return sendJson(res, 404, { error: `Unknown tool '${name}'` });

          // GET /mabos/tools/:name — schema
          if (method === "GET") {
            return sendJson(res, 200, toDetail(tool));
          }

          // POST /mabos/tools/:name — invoke
          if (method === "POST") {
            return await invokeTool(req, res, tool, deps);
          }
        }

        return sendJson(res, 404, { error: "Not found" });
      } catch (err) {
        deps.logger.error(`[mabos] tool-api route error: ${String(err)}`);
        return sendJson(res, 500, { error: String(err) });
      }
    },
  });

  // ── /mabos/api/index (unified discovery index) ───────────────────────────
  api.registerHttpRoute({
    path: "/mabos/api/index",
    match: "exact",
    auth: "gateway",
    handler: async (_req, res) => {
      return sendJson(res, 200, buildApiIndex(deps.tools.length));
    },
  });

  deps.logger.info(`[mabos] tool API registered (${deps.tools.length} tools at /mabos/tools)`);
}

async function invokeTool(
  req: IncomingMessage,
  res: ServerResponse,
  tool: AnyAgentTool,
  deps: ToolApiDeps,
): Promise<void> {
  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON body" });
  }

  // Body is the params object. Accept `{ params: {...} }` as a convenience too.
  const params =
    body && typeof body === "object" && "params" in (body as Record<string, unknown>)
      ? (body as Record<string, unknown>).params
      : body;

  // Validate against the tool's TypeBox schema when present.
  const schema = tool.parameters as unknown;
  if (schema && !Value.Check(schema as never, params)) {
    const errors = [...Value.Errors(schema as never, params)]
      .slice(0, 10)
      .map((e) => `${e.path}: ${e.message}`);
    return sendJson(res, 400, { error: "Validation failed", details: errors });
  }

  try {
    const result = await tool.execute(`api-${randomUUID().slice(0, 12)}`, params as never);
    return sendJson(res, 200, {
      ok: true,
      tool: tool.name,
      content: result?.content ?? [],
      details: result?.details,
    });
  } catch (err) {
    deps.logger.error(`[mabos] tool '${tool.name}' invocation failed: ${String(err)}`);
    return sendJson(res, 500, { ok: false, tool: tool.name, error: String(err) });
  }
}

/** Hand-maintained map of the MABOS API families (route prefixes are stable). */
function buildApiIndex(toolCount: number) {
  return {
    api_version: "1",
    generated_at: new Date().toISOString(),
    tool_api: {
      catalog: "GET /mabos/tools",
      detail: "GET /mabos/tools/:name",
      invoke: "POST /mabos/tools/:name",
      tool_count: toolCount,
      note: "Every MAS capability (agents/BDI, reasoning, knowledge, memory, learning, coordination) is invocable here.",
    },
    provisioning: {
      base: "/mabos/provision",
      endpoints: [
        "POST /mabos/provision/instances",
        "GET /mabos/provision/instances",
        "GET /mabos/provision/instances/:id",
        "DELETE /mabos/provision/instances/:id",
        "POST /mabos/provision/instances/:id/deploy",
        "GET /mabos/provision/jobs/:id",
        "GET /mabos/provision/manifest",
      ],
    },
    capabilities: "GET /mabos/api/capabilities",
    operational: {
      agents: [
        "GET /mabos/api/agents/:id",
        "GET /mabos/api/agents/:id/knowledge",
        "GET /mabos/api/bdi/agents",
      ],
      bdi: ["POST /mabos/api/bdi/cycle", "GET /mabos/api/bdi/events"],
      coordination: [
        "GET /mabos/api/coordination/auctions",
        "POST /mabos/api/coordination/delegate",
        "GET /mabos/api/coordination/messages",
      ],
      decisions: ["GET /mabos/api/decisions", "POST /mabos/api/decisions/:id/resolve"],
      knowledge: ["GET /mabos/api/agents/:id/knowledge"],
      gdc: ["POST /mabos/gdc/run", "GET /mabos/gdc/status"],
      workflows: ["GET /mabos/api/workflows", "GET /mabos/api/workflows/:id"],
      governance: ["GET /mabos/governance/budget/summary", "GET /mabos/governance/audit"],
      sessions: ["GET /mabos/sessions/search", "POST /mabos/sessions/recall"],
      models: ["GET /mabos/models/list", "GET /mabos/models/health"],
      businesses: ["GET /mabos/api/businesses", "GET /mabos/api/businesses/:id/goals"],
    },
  };
}
