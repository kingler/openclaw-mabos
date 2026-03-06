/**
 * MABOS-OpenClaw Integration Patch
 * Applies Fix 1 (SSE event bus), Fix 3 (auth middleware), Fix 4 (memory write-through)
 */
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = join(process.env.HOME, "openclaw-mabos");
const INDEX_PATH = join(BASE, "extensions/mabos/index.ts");
const MEMORY_PATH = join(BASE, "extensions/mabos/src/tools/memory-tools.ts");

async function patchFile(path, patches) {
  let content = await readFile(path, "utf-8");
  // Backup
  await copyFile(path, path + ".bak");

  for (const { find, replace, description } of patches) {
    if (!content.includes(find)) {
      console.error(`PATCH FAILED — could not find marker for: ${description}`);
      console.error(`  Looking for: ${JSON.stringify(find.slice(0, 120))}...`);
      process.exit(1);
    }
    content = content.replace(find, replace);
    console.log(`  ✓ ${description}`);
  }

  await writeFile(path, content, "utf-8");
  console.log(`  Wrote ${path}`);
}

// ─── Fix 3: Auth Middleware ─────────────────────────────────────

const AUTH_IMPORT = `import { createWorkforceTools } from "./src/tools/workforce-tools.js";`;

const AUTH_IMPORT_REPLACEMENT = `import { createWorkforceTools } from "./src/tools/workforce-tools.js";
import { resolveGatewayAuth, type ResolvedGatewayAuth } from "../../src/gateway/auth.js";
import { authorizeGatewayBearerRequestOrReply } from "../../src/gateway/http-auth-helpers.js";`;

const WORKSPACE_DIR_LINE = `  const workspaceDir = resolveWorkspaceDir(api);`;

const WORKSPACE_DIR_WITH_AUTH = `  const workspaceDir = resolveWorkspaceDir(api);

  // Resolve gateway auth for MABOS HTTP routes
  const gatewayAuthConfig = (api as any).config?.gateway?.auth ?? {};
  const resolvedAuth: ResolvedGatewayAuth = resolveGatewayAuth({
    authConfig: gatewayAuthConfig,
  });

  async function requireAuth(
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse,
  ): Promise<boolean> {
    // Skip auth if gateway is in "none" mode
    if (resolvedAuth.mode === "none") return true;
    return authorizeGatewayBearerRequestOrReply({ req, res, auth: resolvedAuth });
  }`;

// Patch registerParamRoute to include auth check
const REGISTER_PARAM_ROUTE_BODY = `    api.registerHttpHandler(async (req, res) => {
      const url = new URL(req.url || "/", "http://localhost");
      if (regex.test(url.pathname)) {
        await handler(req, res);
        return true;
      }
      return false;
    });`;

const REGISTER_PARAM_ROUTE_BODY_WITH_AUTH = `    api.registerHttpHandler(async (req, res) => {
      const url = new URL(req.url || "/", "http://localhost");
      if (regex.test(url.pathname)) {
        if (!(await requireAuth(req, res))) return true;
        await handler(req, res);
        return true;
      }
      return false;
    });`;

// Auth for /mabos/api/status (line 376) — handler uses _req
const STATUS_HANDLER = `    path: "/mabos/api/status",
    handler: async (_req, res) => {`;
const STATUS_HANDLER_AUTH = `    path: "/mabos/api/status",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;`;

// Auth for /mabos/api/decisions (line 427) — handler uses _req
const DECISIONS_HANDLER = `    path: "/mabos/api/decisions",
    handler: async (_req, res) => {`;
const DECISIONS_HANDLER_AUTH = `    path: "/mabos/api/decisions",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;`;

// Auth for /mabos/api/businesses (line 680) — handler uses _req
const BUSINESSES_HANDLER = `    path: "/mabos/api/businesses",
    handler: async (_req, res) => {`;
const BUSINESSES_HANDLER_AUTH = `    path: "/mabos/api/businesses",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;`;

// Auth for /mabos/api/contractors (line 741) — handler uses _req
const CONTRACTORS_HANDLER = `    path: "/mabos/api/contractors",
    handler: async (_req, res) => {`;
const CONTRACTORS_HANDLER_AUTH = `    path: "/mabos/api/contractors",
    handler: async (_req, res) => {
      if (!(await requireAuth(_req, res))) return;`;

// Auth for /mabos/api/onboard (line 760) — handler uses req
const ONBOARD_HANDLER = `    path: "/mabos/api/onboard",
    handler: async (req, res) => {`;
const ONBOARD_HANDLER_AUTH = `    path: "/mabos/api/onboard",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;`;

// Auth for /mabos/api/chat (line 1193) — handler uses req
const CHAT_HANDLER = `    path: "/mabos/api/chat",
    handler: async (req, res) => {`;
const CHAT_HANDLER_AUTH = `    path: "/mabos/api/chat",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;`;

// Auth for /mabos/api/chat/events (line 1282) — handler uses req
const SSE_HANDLER = `    path: "/mabos/api/chat/events",
    handler: async (req, res) => {`;
const SSE_HANDLER_AUTH = `    path: "/mabos/api/chat/events",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;`;

// Auth for /mabos/api/bdi/cycle (line 1909) — handler uses req
const BDI_HANDLER = `    path: "/mabos/api/bdi/cycle",
    handler: async (req, res) => {`;
const BDI_HANDLER_AUTH = `    path: "/mabos/api/bdi/cycle",
    handler: async (req, res) => {
      if (!(await requireAuth(req, res))) return;`;

// ─── Fix 1: SSE Event Bus Wiring ───────────────────────────────

// Add onAgentEvent import (alongside auth imports, already placed)
const AUTH_IMPORT_WITH_EVENTS = `import { createWorkforceTools } from "./src/tools/workforce-tools.js";
import { resolveGatewayAuth, type ResolvedGatewayAuth } from "../../src/gateway/auth.js";
import { authorizeGatewayBearerRequestOrReply } from "../../src/gateway/http-auth-helpers.js";
import { onAgentEvent, type AgentEventPayload } from "../../src/infra/agent-events.js";`;

// Replace the SSE handler body — find the outbox polling + heartbeat pattern
const SSE_OLD_BODY = `      // Register this client
      const clientKey = \`\${businessId}:\${agentId}\`;
      if (!sseClients.has(clientKey)) {
        sseClients.set(clientKey, new Set());
      }
      sseClients.get(clientKey)!.add(res);

      // Poll outbox for agent responses
      const outboxPath = join(
        workspaceDir,
        "businesses",
        businessId,
        "agents",
        agentId,
        "outbox.json",
      );
      const pollInterval = setInterval(async () => {
        try {
          const raw = await readFile(outboxPath, "utf-8");
          const outbox: any[] = JSON.parse(raw);
          if (outbox.length > 0) {
            for (const entry of outbox) {
              const event = {
                type: "agent_response",
                id: entry.id || String(Date.now()),
                agentId,
                agentName: entry.agentName || agentId,
                content: entry.content || "",
                actions: entry.actions || [],
              };
              res.write(\`data: \${JSON.stringify(event)}\\n\\n\`);
            }
            // Clear the outbox after sending
            await writeFile(outboxPath, "[]", "utf-8");
          }
        } catch {
          // outbox.json may not exist yet - that is fine
        }
      }, 2000);

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        res.write(\`: heartbeat\\n\\n\`);
      }, 30000);

      req.on("close", () => {
        clearInterval(heartbeat);
        clearInterval(pollInterval);
        sseClients.get(clientKey)?.delete(res);
        if (sseClients.get(clientKey)?.size === 0) {
          sseClients.delete(clientKey);
        }
      });`;

const SSE_NEW_BODY = `      // Register this client
      const clientKey = \`\${businessId}:\${agentId}\`;
      if (!sseClients.has(clientKey)) {
        sseClients.set(clientKey, new Set());
      }
      sseClients.get(clientKey)!.add(res);

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        res.write(\`: heartbeat\\n\\n\`);
      }, 30000);

      let closed = false;

      // Subscribe to agent event bus — forward matching events to SSE
      const unsubscribe = onAgentEvent((evt: AgentEventPayload) => {
        if (closed) return;

        // Match events by sessionKey containing the agentId
        // SessionKey format: "{channel}:{accountId}:{chatId}"
        // Also match by checking if the event's data references this agent
        const matchesAgent =
          evt.sessionKey?.includes(agentId) ||
          (evt.data as any)?.agentId === agentId;

        if (!matchesAgent) return;

        try {
          if (evt.stream === "assistant") {
            const text =
              typeof evt.data?.text === "string" ? evt.data.text :
              typeof evt.data?.delta === "string" ? evt.data.delta : null;
            if (text) {
              res.write(\`data: \${JSON.stringify({
                type: "stream_token",
                token: text,
                agentId,
                agentName: agentId,
                id: evt.runId,
              })}\\n\\n\`);
            }
          } else if (evt.stream === "lifecycle") {
            const phase = evt.data?.phase;
            if (phase === "end") {
              res.write(\`data: \${JSON.stringify({ type: "stream_end", agentId })}\\n\\n\`);
            } else if (phase === "error") {
              res.write(\`data: \${JSON.stringify({
                type: "agent_response",
                agentId,
                agentName: agentId,
                content: \`Error: \${evt.data?.error || "Unknown error"}\`,
                id: evt.runId,
              })}\\n\\n\`);
            }
          } else if (evt.stream === "tool") {
            // Forward MABOS tool events for transparency
            const toolName = evt.data?.name || evt.data?.toolName;
            if (toolName && String(toolName).startsWith("mabos_")) {
              res.write(\`data: \${JSON.stringify({
                type: "agent_response",
                agentId,
                agentName: agentId,
                content: \`[Using tool: \${toolName}]\`,
                id: evt.runId,
              })}\\n\\n\`);
            }
          }
        } catch {
          // Write failed — connection probably closing
        }
      });

      // Also keep outbox polling as fallback for non-event-bus messages
      const outboxPath = join(
        workspaceDir,
        "businesses",
        businessId,
        "agents",
        agentId,
        "outbox.json",
      );
      const pollInterval = setInterval(async () => {
        if (closed) return;
        try {
          const raw = await readFile(outboxPath, "utf-8");
          const outbox: any[] = JSON.parse(raw);
          if (outbox.length > 0) {
            for (const entry of outbox) {
              const event = {
                type: "agent_response",
                id: entry.id || String(Date.now()),
                agentId,
                agentName: entry.agentName || agentId,
                content: entry.content || "",
                actions: entry.actions || [],
              };
              res.write(\`data: \${JSON.stringify(event)}\\n\\n\`);
            }
            await writeFile(outboxPath, "[]", "utf-8");
          }
        } catch {
          // outbox.json may not exist yet - that is fine
        }
      }, 2000);

      req.on("close", () => {
        closed = true;
        clearInterval(heartbeat);
        clearInterval(pollInterval);
        unsubscribe();
        sseClients.get(clientKey)?.delete(res);
        if (sseClients.get(clientKey)?.size === 0) {
          sseClients.delete(clientKey);
        }
      });`;

// ─── Apply all patches to index.ts ─────────────────────────────

console.log("Patching extensions/mabos/index.ts...");
await patchFile(INDEX_PATH, [
  // Fix 3: Auth imports
  { find: AUTH_IMPORT, replace: AUTH_IMPORT_REPLACEMENT, description: "Add auth imports" },
  // Fix 3: Auth resolver + requireAuth helper
  {
    find: WORKSPACE_DIR_LINE,
    replace: WORKSPACE_DIR_WITH_AUTH,
    description: "Add auth resolver + requireAuth helper",
  },
  // Fix 3: Auth in registerParamRoute (covers all 14 parameterized routes)
  {
    find: REGISTER_PARAM_ROUTE_BODY,
    replace: REGISTER_PARAM_ROUTE_BODY_WITH_AUTH,
    description: "Add auth to registerParamRoute",
  },
  // Fix 3: Auth on individual registerHttpRoute handlers
  {
    find: STATUS_HANDLER,
    replace: STATUS_HANDLER_AUTH,
    description: "Add auth to /mabos/api/status",
  },
  {
    find: DECISIONS_HANDLER,
    replace: DECISIONS_HANDLER_AUTH,
    description: "Add auth to /mabos/api/decisions",
  },
  {
    find: BUSINESSES_HANDLER,
    replace: BUSINESSES_HANDLER_AUTH,
    description: "Add auth to /mabos/api/businesses",
  },
  {
    find: CONTRACTORS_HANDLER,
    replace: CONTRACTORS_HANDLER_AUTH,
    description: "Add auth to /mabos/api/contractors",
  },
  {
    find: ONBOARD_HANDLER,
    replace: ONBOARD_HANDLER_AUTH,
    description: "Add auth to /mabos/api/onboard",
  },
  { find: CHAT_HANDLER, replace: CHAT_HANDLER_AUTH, description: "Add auth to /mabos/api/chat" },
  {
    find: SSE_HANDLER,
    replace: SSE_HANDLER_AUTH,
    description: "Add auth to /mabos/api/chat/events",
  },
  { find: BDI_HANDLER, replace: BDI_HANDLER_AUTH, description: "Add auth to /mabos/api/bdi/cycle" },
  // Fix 1: Add onAgentEvent import alongside auth imports
  {
    find: AUTH_IMPORT_REPLACEMENT,
    replace: AUTH_IMPORT_WITH_EVENTS,
    description: "Add onAgentEvent import",
  },
  // Fix 1: Wire SSE to event bus
  { find: SSE_OLD_BODY, replace: SSE_NEW_BODY, description: "Wire SSE handler to agent event bus" },
]);

// ─── Fix 4: Memory Write-Through ───────────────────────────────

const MEMORY_AFTER_DAILY_LOG = `        // Bridge to native OpenClaw daily log format
        await writeNativeDailyLog(api, params.agent_id, {
          type: params.type,
          content: params.content,
          source: params.source,
          tags: params.tags,
        });`;

const MEMORY_AFTER_DAILY_LOG_WITH_SYNC = `        // Bridge to native OpenClaw daily log format
        await writeNativeDailyLog(api, params.agent_id, {
          type: params.type,
          content: params.content,
          source: params.source,
          tags: params.tags,
        });

        // Trigger native memory index sync so new entries are immediately searchable
        try {
          const { getMemorySearchManager } = await import("../../../../src/memory/search-manager.js");
          const { manager } = await getMemorySearchManager({
            cfg: (api as any).config,
            agentId: params.agent_id,
          });
          if (manager?.sync) {
            // Fire-and-forget — don't block the tool response
            void (manager.sync as (opts: { reason: string }) => Promise<void>)({ reason: "mabos-memory-store" }).catch(() => {});
          }
        } catch {
          // Native memory sync unavailable — files are still written,
          // native system will pick them up on next scheduled sync
        }`;

console.log("\nPatching extensions/mabos/src/tools/memory-tools.ts...");
await patchFile(MEMORY_PATH, [
  {
    find: MEMORY_AFTER_DAILY_LOG,
    replace: MEMORY_AFTER_DAILY_LOG_WITH_SYNC,
    description: "Add native memory index sync after daily log write",
  },
]);

console.log("\nAll patches applied successfully!");
