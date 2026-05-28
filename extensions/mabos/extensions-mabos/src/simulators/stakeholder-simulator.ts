/**
 * Stakeholder simulator — LLM-backed role-play of an affected party.
 *
 * Applies to high-stakes intentions (public-facing or above a $ threshold).
 * Parses a structured verdict from the LLM's text response. The LLM client is
 * injected so this stays testable without a live model.
 */

import type { Simulator, IntentionContext, SimulatorVerdict } from "./types.js";

export interface StakeholderConfig {
  llm: { complete(prompt: string): Promise<string> };
  /** Persona the LLM role-plays, e.g. "VividWalls collector segment lead". */
  persona: string;
  /** Intentions at or above this USD impact are evaluated. Default 1000. */
  impactThresholdUsd?: number;
}

const SYSTEM = (persona: string) =>
  `You role-play ${persona}. Given a proposed agent intention, respond with exactly these lines:
APPROVED: yes|no
CONFIDENCE: 0.0-1.0
REACTION: one sentence describing your likely response
REASONING: one sentence`;

export function makeStakeholderSimulator(cfg: StakeholderConfig): Simulator {
  const threshold = cfg.impactThresholdUsd ?? 1000;
  return {
    id: `stakeholder:${cfg.persona}`,
    appliesTo: (ctx) =>
      Boolean(ctx.affectsPublicFacing) || (ctx.estimatedImpactUsd ?? 0) >= threshold,
    evaluate: async (ctx): Promise<SimulatorVerdict> => {
      const prompt = `${SYSTEM(cfg.persona)}

Proposed intention:
${ctx.description}
Affected: ${ctx.affectedSubjects.join(", ") || "n/a"}
Estimated impact: $${ctx.estimatedImpactUsd ?? 0}`;
      const out = await cfg.llm.complete(prompt);
      const approved = /APPROVED:\s*yes/i.test(out);
      const confMatch = out.match(/CONFIDENCE:\s*([\d.]+)/i);
      const reactMatch = out.match(/REACTION:\s*(.+)/i);
      const reasonMatch = out.match(/REASONING:\s*(.+)/i);
      return {
        approved,
        confidence: confMatch ? Math.min(1, Math.max(0, parseFloat(confMatch[1]))) : 0.5,
        predictedReaction: reactMatch?.[1]?.trim() ?? "no reaction returned",
        reasoning: reasonMatch?.[1]?.trim() ?? "",
        simulatorId: `stakeholder:${cfg.persona}`,
      };
    },
  };
}
