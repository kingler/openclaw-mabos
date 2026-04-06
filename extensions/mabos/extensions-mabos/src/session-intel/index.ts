/**
 * Session intelligence module — FTS5 full-text search across sessions,
 * cross-session knowledge recall, and dialectic user profile building.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi, AnyAgentTool } from "openclaw/plugin-sdk";
import { textResult, resolveWorkspaceDir } from "../tools/common.js";
import { registerSessionIntelHooks } from "./hooks.js";
import { SessionRecall } from "./recall.js";
import { registerSessionIntelRoutes } from "./routes.js";
import { SessionIndex } from "./session-index.js";
import type { SessionIntelConfig } from "./types.js";
import { UserModel } from "./user-model.js";

export function registerSessionIntel(
  api: OpenClawPluginApi,
  config: { sessionIntel?: SessionIntelConfig },
): void {
  const log = api.logger;
  const siConfig = config.sessionIntel ?? {};
  const workspaceDir = resolveWorkspaceDir(api);
  const dbDir = join(workspaceDir, "session-intel");

  try {
    mkdirSync(dbDir, { recursive: true });
  } catch {
    // Directory may already exist
  }

  const dbPath = siConfig.fts?.dbPath ?? join(dbDir, "sessions.db");
  const index = new SessionIndex(dbPath);
  const recall = new SessionRecall(index);

  // Initialize user model if enabled
  let userModel: UserModel | null = null;
  if (siConfig.userModel?.enabled) {
    const profilePath = siConfig.userModel.profilePath ?? join(dbDir, "USER.md");
    userModel = new UserModel({
      profilePath,
      updateInterval: siConfig.userModel.updateInterval ?? 5,
    });
  }

  // Tool: session_search
  api.registerTool({
    name: "session_search",
    label: "Search Past Sessions",
    description:
      "Full-text search across all past conversation sessions. Returns matching messages with context.",
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      agent_id: Type.Optional(Type.String({ description: "Filter by agent" })),
      limit: Type.Optional(Type.Number({ description: "Max results (default: 20)" })),
    }),
    async execute(_id: string, params: { query: string; agent_id?: string; limit?: number }) {
      const results = index.search(params.query, { agentId: params.agent_id, limit: params.limit });
      if (results.length === 0) return textResult(`No results found for "${params.query}".`);
      const lines = results.map(
        (r) =>
          `[${r.agentId}/${r.sessionId}] ${r.role}: ${r.content.slice(0, 200)}${r.content.length > 200 ? "..." : ""}`,
      );
      return textResult(
        `Search results for "${params.query}" (${results.length}):\n${lines.join("\n")}`,
      );
    },
  } as AnyAgentTool);

  // Tool: session_recall
  api.registerTool({
    name: "session_recall",
    label: "Recall Past Context",
    description:
      "Retrieve and summarize relevant context from past sessions, grouped by conversation.",
    parameters: Type.Object({
      query: Type.String({ description: "What to recall" }),
      agent_id: Type.Optional(Type.String({ description: "Filter by agent" })),
      limit: Type.Optional(Type.Number({ description: "Max sessions (default: 5)" })),
    }),
    async execute(_id: string, params: { query: string; agent_id?: string; limit?: number }) {
      const results = await recall.recall({
        query: params.query,
        agentId: params.agent_id,
        limit: params.limit,
      });
      if (results.length === 0) return textResult(`No past context found for "${params.query}".`);
      const sections = results.map((r) => {
        const msgs = r.messages.map((m) => `  ${m.role}: ${m.content.slice(0, 150)}`).join("\n");
        return `Session: ${r.sessionTitle ?? r.sessionId} (agent: ${r.agentId})\n${msgs}`;
      });
      return textResult(`Recalled ${results.length} sessions:\n\n${sections.join("\n\n")}`);
    },
  } as AnyAgentTool);

  // Tool: user_profile
  if (userModel) {
    api.registerTool({
      name: "user_profile",
      label: "User Profile",
      description:
        "View or update the user profile built from session history. " +
        "The profile captures communication style, domain expertise, and workflow preferences.",
      parameters: Type.Object({
        action: Type.Optional(
          Type.String({ description: "'view' (default) or 'reset' to clear the profile" }),
        ),
      }),
      async execute(_id: string, params: { action?: string }) {
        if (params.action === "reset") {
          await userModel!.writeProfile("");
          return textResult("User profile has been reset.");
        }

        const profile = await userModel!.readProfile();
        if (!profile) {
          return textResult(
            "No user profile yet. The profile is built automatically after several sessions.",
          );
        }
        return textResult(`User Profile:\n\n${profile}`);
      },
    } as AnyAgentTool);
  }

  // Register hooks (session indexing + user model tracking + profile injection)
  registerSessionIntelHooks(api, { index, userModel, config: siConfig });

  // Register HTTP routes
  registerSessionIntelRoutes(api, index, recall, userModel);

  log.info(
    `[session-intel] Session intelligence initialized (FTS5 index + recall${userModel ? " + user model" : ""})`,
  );
}

export { SessionIndex } from "./session-index.js";
export { SessionRecall } from "./recall.js";
export { UserModel } from "./user-model.js";
