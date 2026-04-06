/**
 * Session intelligence hooks — index sessions on end, inject user profile into prompts.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { SessionIndex } from "./session-index.js";
import type { SessionIntelConfig } from "./types.js";
import type { UserModel } from "./user-model.js";

export function registerSessionIntelHooks(
  api: OpenClawPluginApi,
  deps: {
    index: SessionIndex;
    userModel: UserModel | null;
    config: SessionIntelConfig;
  },
): void {
  const { index, userModel, config } = deps;
  const log = api.logger;

  // Index sessions on end
  if (config.fts?.enabled !== false) {
    api.on("session_end", async (ctx: Record<string, unknown>) => {
      try {
        const sessionId = (ctx.sessionId as string) ?? `session-${Date.now()}`;
        index.indexSession({
          id: sessionId,
          agentId: (ctx.agentId as string) ?? "unknown",
          companyId: (ctx.companyId as string) ?? "default",
          source: (ctx.source as string) ?? null,
          startedAt: (ctx.startedAt as number) ?? Date.now(),
          endedAt: Date.now(),
          messageCount: Array.isArray(ctx.messages) ? ctx.messages.length : 0,
          title: (ctx.title as string) ?? null,
          summary: null,
        });

        const messages = Array.isArray(ctx.messages) ? ctx.messages : [];
        for (const msg of messages) {
          const m = msg as Record<string, unknown>;
          if (!m.content) continue;
          index.indexMessage({
            sessionId,
            role: (m.role as string) ?? "unknown",
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
            toolName: (m.toolName as string) ?? null,
            timestamp: (m.timestamp as number) ?? Date.now(),
          });
        }
      } catch (err) {
        log.warn(`[session-intel] Failed to index session: ${err}`);
      }
    });
  }

  // Track sessions for user model updates
  if (userModel) {
    api.on("session_end", async (ctx: Record<string, unknown>) => {
      try {
        const shouldUpdate = await userModel.onSessionEnd({
          title: (ctx.title as string) ?? null,
          summary: null,
          agentId: (ctx.agentId as string) ?? "unknown",
          startedAt: (ctx.startedAt as number) ?? Date.now(),
          messageCount: Array.isArray(ctx.messages) ? ctx.messages.length : 0,
        });
        if (shouldUpdate) {
          log.info("[session-intel] User profile update is due (will update on next prompt build)");
        }
      } catch (err) {
        log.debug?.(`[session-intel] User model update check failed: ${err}`);
      }
    });

    // Inject user profile into agent prompts
    api.on("before_prompt_build", async (ctx: any) => {
      try {
        const profileSection = await userModel.getProfileSection();
        if (profileSection && ctx.appendSystemSection) {
          ctx.appendSystemSection("user-profile", profileSection);
        }
      } catch (err) {
        log.debug?.(`[session-intel] Profile injection failed: ${err}`);
      }
    });
  }
}
