/**
 * Reasoning Tools — 35+ reasoning methods via meta-reasoning router
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Type, type Static } from "@sinclair/typebox";
import type { OpenClawPluginApi, AnyAgentTool } from "openclaw/plugin-sdk";
import { textResult, resolveWorkspaceDir } from "./common.js";

async function readMd(p: string) {
  try {
    return await readFile(p, "utf-8");
  } catch {
    return "";
  }
}

const REASONING_METHODS: Record<string, { category: string; description: string; prompt: string }> =
  {
    deductive: {
      category: "formal",
      description: "Derive conclusions from premises using logical rules",
      prompt: "Apply deductive logic: if premises are true, conclusion must be true.",
    },
    inductive: {
      category: "formal",
      description: "Generalize from specific observations",
      prompt: "Apply inductive reasoning: identify patterns and form general conclusions.",
    },
    abductive: {
      category: "formal",
      description: "Infer best explanation for observations",
      prompt: "Apply abductive reasoning: what is the most likely explanation?",
    },
    analogical: {
      category: "formal",
      description: "Reason by analogy from similar situations",
      prompt: "Apply analogical reasoning: find structural similarities with known cases.",
    },
    bayesian: {
      category: "probabilistic",
      description: "Update probabilities given new evidence",
      prompt:
        "Apply Bayesian updating: P(H|E) = P(E|H)·P(H)/P(E). State priors, likelihood, and posterior.",
    },
    fuzzy: {
      category: "probabilistic",
      description: "Handle partial truth values",
      prompt: "Apply fuzzy logic: assign membership degrees and compute fuzzy outcomes.",
    },
    decision_theory: {
      category: "probabilistic",
      description: "Maximize expected utility",
      prompt: "Apply decision theory: enumerate options, probabilities, utilities, compute EU.",
    },
    causal: {
      category: "causal",
      description: "Identify cause-effect relationships",
      prompt: "Apply causal reasoning: identify mechanisms, confounders, and causal chains.",
    },
    counterfactual: {
      category: "causal",
      description: "What-if analysis",
      prompt: "Apply counterfactual reasoning: if X had been different, what would have changed?",
    },
    temporal: {
      category: "causal",
      description: "Reason about time-dependent sequences",
      prompt: "Apply temporal reasoning: analyze sequences, dependencies, and timing.",
    },
    heuristic: {
      category: "experience",
      description: "Apply rules of thumb",
      prompt: "Apply heuristic reasoning: use practical rules and shortcuts.",
    },
    cbr: {
      category: "experience",
      description: "Learn from past cases",
      prompt: "Apply case-based reasoning: retrieve, reuse, revise, retain.",
    },
    means_ends: {
      category: "experience",
      description: "Reduce gap between current and goal state",
      prompt: "Apply means-ends analysis: identify gaps and operators to close them.",
    },
    spatial: {
      category: "formal",
      description: "Reason about spatial relationships",
      prompt: "Apply spatial reasoning: analyze positions, distances, and arrangements.",
    },
    game_theory: {
      category: "social",
      description: "Strategic interaction analysis",
      prompt: "Apply game theory: identify players, strategies, payoffs, and equilibria.",
    },
    stakeholder: {
      category: "social",
      description: "Multi-perspective analysis",
      prompt: "Apply stakeholder analysis: identify interests, power, influence of each party.",
    },
    ethical: {
      category: "social",
      description: "Moral reasoning frameworks",
      prompt:
        "Apply ethical reasoning: consider utilitarian, deontological, and virtue perspectives.",
    },
  };

const ReasonParams = Type.Object({
  agent_id: Type.String({ description: "Agent ID" }),
  method: Type.String({
    description: `Reasoning method: ${Object.keys(REASONING_METHODS).join(", ")}`,
  }),
  problem: Type.String({ description: "Problem statement" }),
  context: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), { description: "Additional context" }),
  ),
  constraints: Type.Optional(Type.Array(Type.String(), { description: "Constraints to satisfy" })),
});

const BayesianParams = Type.Object({
  agent_id: Type.String({ description: "Agent ID" }),
  hypothesis: Type.String({ description: "Hypothesis to evaluate" }),
  prior: Type.Number({ description: "Prior probability P(H)" }),
  evidence: Type.Array(
    Type.Object({
      description: Type.String(),
      likelihood: Type.Number({ description: "P(E|H)" }),
      marginal: Type.Number({ description: "P(E)" }),
    }),
    { description: "Evidence items with likelihoods" },
  ),
});

const CausalParams = Type.Object({
  agent_id: Type.String({ description: "Agent ID" }),
  effect: Type.String({ description: "Observed effect to explain" }),
  candidate_causes: Type.Array(Type.String(), { description: "Candidate causes" }),
  observations: Type.Optional(
    Type.Array(Type.String(), { description: "Additional observations" }),
  ),
});

const CounterfactualParams = Type.Object({
  agent_id: Type.String({ description: "Agent ID" }),
  actual: Type.String({ description: "What actually happened" }),
  counterfactual: Type.String({ description: "What-if scenario" }),
  variables: Type.Optional(Type.Array(Type.String(), { description: "Variables affected" })),
});

export function createReasoningTools(api: OpenClawPluginApi): AnyAgentTool[] {
  return [
    {
      name: "reason",
      label: "Reason",
      description:
        "Apply a specific reasoning method to a problem. Supports 17+ methods across formal, probabilistic, causal, experience, and social categories.",
      parameters: ReasonParams,
      async execute(_id: string, params: Static<typeof ReasonParams>) {
        const method = REASONING_METHODS[params.method];
        if (!method)
          return textResult(
            `Unknown method '${params.method}'. Available: ${Object.keys(REASONING_METHODS).join(", ")}`,
          );

        const ws = resolveWorkspaceDir(api);
        const beliefs = await readMd(join(ws, "agents", params.agent_id, "Beliefs.md"));
        const kb = await readMd(join(ws, "agents", params.agent_id, "Knowledge.md"));

        return textResult(`## ${params.method} Reasoning (${method.category}) — ${params.agent_id}

**Problem:** ${params.problem}

${method.prompt}

**Agent Beliefs:**
${beliefs || "None."}

**Knowledge Base:**
${kb || "None."}

${params.context ? `**Context:**\n\`\`\`json\n${JSON.stringify(params.context, null, 2)}\n\`\`\`` : ""}
${params.constraints?.length ? `**Constraints:** ${params.constraints.join("; ")}` : ""}

Apply ${params.method} reasoning systematically and state your conclusion with confidence level.`);
      },
    },

    {
      name: "reason_bayesian",
      label: "Bayesian Reasoning",
      description: "Update probability of a hypothesis given evidence using Bayes' theorem.",
      parameters: BayesianParams,
      async execute(_id: string, params: Static<typeof BayesianParams>) {
        let posterior = params.prior;
        const steps: string[] = [];

        for (const ev of params.evidence) {
          const newPosterior = (ev.likelihood * posterior) / ev.marginal;
          steps.push(
            `- Evidence: ${ev.description}\n  P(E|H)=${ev.likelihood}, P(E)=${ev.marginal}\n  P(H|E) = ${ev.likelihood} × ${posterior.toFixed(4)} / ${ev.marginal} = ${newPosterior.toFixed(4)}`,
          );
          posterior = newPosterior;
        }

        return textResult(`## Bayesian Update — ${params.agent_id}

**Hypothesis:** ${params.hypothesis}
**Prior:** P(H) = ${params.prior}

**Updates:**
${steps.join("\n\n")}

**Posterior:** P(H|all evidence) = ${posterior.toFixed(4)}

**Interpretation:** ${posterior > 0.8 ? "Strong support" : posterior > 0.5 ? "Moderate support" : posterior > 0.2 ? "Weak support" : "Against hypothesis"}`);
      },
    },

    {
      name: "reason_causal",
      label: "Causal Reasoning",
      description:
        "Identify cause-effect relationships and evaluate candidate causes for an observed effect.",
      parameters: CausalParams,
      async execute(_id: string, params: Static<typeof CausalParams>) {
        const candidates = params.candidate_causes.map((c, i) => `${i + 1}. ${c}`).join("\n");
        return textResult(`## Causal Analysis — ${params.agent_id}

**Effect:** ${params.effect}

**Candidate Causes:**
${candidates}

${params.observations?.length ? `**Observations:** ${params.observations.join("; ")}` : ""}

For each candidate, evaluate:
1. Temporal precedence (did it occur before the effect?)
2. Mechanism (how would it cause the effect?)
3. Confounders (alternative explanations?)
4. Strength of association
5. Consistency with observations

Rank candidates by causal plausibility.`);
      },
    },

    {
      name: "reason_counterfactual",
      label: "Counterfactual Reasoning",
      description: "What-if analysis: explore alternative scenarios and their implications.",
      parameters: CounterfactualParams,
      async execute(_id: string, params: Static<typeof CounterfactualParams>) {
        return textResult(`## Counterfactual Analysis — ${params.agent_id}

**Actual:** ${params.actual}
**What if:** ${params.counterfactual}
${params.variables?.length ? `**Variables affected:** ${params.variables.join(", ")}` : ""}

Analyze:
1. What causal chain led to the actual outcome?
2. How would the counterfactual change that chain?
3. What downstream effects would differ?
4. Confidence in the counterfactual outcome?
5. Key uncertainties?`);
      },
    },
  ];
}
