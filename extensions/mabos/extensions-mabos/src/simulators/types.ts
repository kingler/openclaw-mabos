/**
 * Simulator types (GenMentor §4.3 learner-simulator, generalised to a
 * stakeholder simulator). A simulator role-plays an affected party and
 * returns mimicked feedback on a proposed intention *before* it commits —
 * the missing mechanism between intention and action.
 */

export interface IntentionContext {
  agentId: string;
  intentionId: string;
  description: string;
  affectedSubjects: string[]; // arch:Subject / domain IRIs
  estimatedImpactUsd?: number;
  affectsLegal?: boolean;
  affectsPublicFacing?: boolean;
}

export interface SimulatorVerdict {
  approved: boolean;
  confidence: number; // 0.0–1.0
  reasoning: string;
  predictedReaction: string;
  simulatorId: string;
}

export interface Simulator {
  id: string;
  /** Whether this simulator applies to the given intention (the high-stakes gate). */
  appliesTo(ctx: IntentionContext): boolean;
  /** Produce a verdict by role-playing the stakeholder. */
  evaluate(ctx: IntentionContext): Promise<SimulatorVerdict>;
}
