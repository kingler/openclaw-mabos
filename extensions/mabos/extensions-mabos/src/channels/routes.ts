/**
 * Channel integration HTTP routes — back the MABOS web UI so a user can
 * connect a messenger channel without terminal commands.
 *
 *   GET  /mabos/api/channels/catalog   descriptors for the dynamic form
 *   GET  /mabos/api/channels           configured channels (masked)
 *   POST /mabos/api/channels/test      live credential test (never persists)
 *   POST /mabos/api/channels           validate -> test -> write gateway config
 *
 * Routes use `auth: "gateway"`: the gateway enforces its bearer token before
 * the handler runs.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { CHANNEL_CATALOG } from "./channel-catalog.js";
import {
  listConfiguredChannels,
  provisionChannel,
  testChannelConnection,
  type ProvisionChannelInput,
} from "./channel-provisioning.js";

const PREFIX = "/mabos/api/channels";
const MAX_BODY_BYTES = 256 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
    total += buf.length;
    if (total > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

export interface ChannelRoutesDeps {
  logger: { info: (m: string) => void; error: (m: string) => void };
}

export function registerChannelRoutes(api: OpenClawPluginApi, deps: ChannelRoutesDeps): void {
  api.registerHttpRoute({
    path: PREFIX,
    match: "prefix",
    auth: "gateway",
    handler: async (req, res) => {
      const url = new URL(req.url || "/", "http://localhost");
      const method = (req.method || "GET").toUpperCase();
      const rest = url.pathname.slice(PREFIX.length).replace(/\/$/, ""); // "", "/catalog", "/test"

      try {
        // GET /mabos/api/channels/catalog
        if (method === "GET" && rest === "/catalog") {
          return sendJson(res, 200, { channels: CHANNEL_CATALOG });
        }

        // GET /mabos/api/channels
        if (method === "GET" && rest === "") {
          const channels = await listConfiguredChannels(api);
          return sendJson(res, 200, { count: channels.length, channels });
        }

        // POST /mabos/api/channels/test
        if (method === "POST" && rest === "/test") {
          const body = (await readBody(req)) as {
            channel_type?: string;
            credentials?: Record<string, unknown>;
          };
          if (!body.channel_type || !body.credentials) {
            return sendJson(res, 400, { error: "channel_type and credentials are required" });
          }
          const result = await testChannelConnection(body.channel_type, body.credentials);
          return sendJson(res, 200, result);
        }

        // POST /mabos/api/channels
        if (method === "POST" && rest === "") {
          const body = (await readBody(req)) as Partial<ProvisionChannelInput>;
          if (!body.channelType || !body.credentials) {
            return sendJson(res, 400, { error: "channelType and credentials are required" });
          }
          const result = await provisionChannel(api, {
            channelType: body.channelType,
            credentials: body.credentials,
            agentId: body.agentId,
            businessId: body.businessId,
            name: body.name,
            test: body.test,
          });
          return sendJson(res, result.ok ? 200 : 400, result);
        }

        return sendJson(res, 404, { error: "Not found" });
      } catch (err) {
        deps.logger.error(`[mabos] channel-api route error: ${String(err)}`);
        return sendJson(res, 500, { error: String(err) });
      }
    },
  });

  deps.logger.info(`[mabos] channel API registered at ${PREFIX}`);
}
