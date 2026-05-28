/**
 * Simulator gate — dispatch an intention to all applicable simulators and
 * apply unanimous-approval semantics. Any single veto blocks the intention.
 *
 * This is the dispatch primitive; validate.ts (Task 13) calls it as a fourth
 * check after confidence/SHACL/deontic, gated by whether the bound fact is an
 * intention.
 */

import type { Simulator, IntentionContext, SimulatorVerdict } from "../../simulators/types.js";

export interface SimulatorGateResult {
  approved: boolean;
  verdicts: SimulatorVerdict[];
}

export async function runSimulatorGate(
  ctx: IntentionContext,
  simulators: Simulator[],
): Promise<SimulatorGateResult> {
  const applicable = simulators.filter((s) => s.appliesTo(ctx));
  if (applicable.length === 0) return { approved: true, verdicts: [] };

  const verdicts = await Promise.all(applicable.map((s) => s.evaluate(ctx)));
  const approved = verdicts.every((v) => v.approved);
  return { approved, verdicts };
}
