/**
 * Eval-driven optimization harness.
 *
 * Scores agent/tool outcomes against datasets, optimizes prompt/policy variants
 * offline, and turns recorded skill outcomes into Beta-Bernoulli policy updates
 * — closing the feedback loop that the skill-loop module left open.
 */

export { createEvalTools } from "./tools.js";
export { gradeCase, inferGrader, PASS_THRESHOLD } from "./graders.js";
export { scoreGrades } from "./scorer.js";
export { runEval, recordedTarget, type TargetFn, type RunOptions } from "./runner.js";
export { optimizeVariants, optimizeSkillPolicy, type SkillPolicyOptions } from "./optimizer.js";
export { EvalStore } from "./store.js";
export { judgeFromLlmCall, createDefaultJudge, parseVerdict } from "./llm.js";
export * from "./types.js";
