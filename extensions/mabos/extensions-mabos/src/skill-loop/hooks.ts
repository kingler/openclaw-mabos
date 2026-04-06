/**
 * Skill loop hooks — nudge skill creation on session end,
 * inject relevant skills into agent prompts.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import type { SkillInjector } from "./injector.js";
import type { SkillNudge } from "./nudge.js";
import type { SkillLoopConfig } from "./types.js";

export function registerSkillLoopHooks(
  api: OpenClawPluginApi,
  deps: {
    nudge: SkillNudge;
    injector: SkillInjector;
    config: SkillLoopConfig;
  },
): void {
  const { nudge, injector, config } = deps;
  const log = api.logger;

  // Nudge skill creation after sessions
  api.on("session_end", async (ctx: Record<string, unknown>) => {
    try {
      const proposal = await nudge.onSessionEnd({
        taskDescription: ctx.taskDescription as string | undefined,
        toolsUsed: ctx.toolsUsed as string[] | undefined,
        outcome: ctx.outcome as string | undefined,
        agentId: ctx.agentId as string | undefined,
        sessionId: ctx.sessionId as string | undefined,
      });
      if (proposal) {
        log.info(
          `[skill-loop] Skill proposal: "${proposal.name}" (confidence: ${proposal.confidence.toFixed(2)})`,
        );
      }
    } catch (err) {
      log.warn(`[skill-loop] Nudge failed: ${err}`);
    }
  });

  // Inject relevant skills into agent prompt
  if (config.maxSkillsInPrompt && config.maxSkillsInPrompt > 0) {
    api.on("before_prompt_build", async (ctx: any) => {
      try {
        const injected = await injector.getRelevantSkills({
          taskHint: ctx.taskHint ?? ctx.taskDescription,
          agentRole: ctx.agentRole,
          recentToolNames: ctx.recentToolNames ?? [],
        });
        if (injected.length > 0 && ctx.appendUserMessage) {
          for (const skill of injected) {
            ctx.appendUserMessage({
              role: "user",
              content: `[SKILL: ${skill.name}]\n${skill.content}`,
              meta: { skillInjection: true },
            });
          }
        }
      } catch (err) {
        log.debug?.(`[skill-loop] Skill injection failed: ${err}`);
      }
    });
  }
}
