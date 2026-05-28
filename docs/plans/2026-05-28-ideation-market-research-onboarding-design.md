# Ideation and Market Research Onboarding Design

> **Status:** Design only. Implementation plan to follow via `superpowers:writing-plans`.
> **Date:** 2026-05-28
> **Source:** Highest-impact onboarding gap identified during the 2026-05 onboarding/ideation review. Upstream of the existing Goal Decomposition Chain ([2026-04-05-enhanced-onboarding-with-gdc.md](2026-04-05-enhanced-onboarding-with-gdc.md)).

## Goal

Add an **Ideation and Research Chain (IRC)** branch at the front of MABOS onboarding that takes a founder from a raw idea to a research-grounded, validated `CompanyDNA` + Business Model Canvas. IRC is strictly **upstream of GDC** and changes nothing in the GDC pipeline: its terminal output is exactly the `CompanyDNA` shape that `gdc_run` already consumes.

The existing conversational wizard becomes the "I already know my business" express lane; IRC becomes the "I have an idea / a direction, not a defined business yet" front door.

## Problem statement

Every onboarding path today assumes the founder already knows the business:

- The always-on `mabos-onboarding` skill ([skills/mabos-onboarding/SKILL.md](../../skills/mabos-onboarding/SKILL.md)) opens **Phase 1: Discovery** with "What does your business do? Who are your customers? How do you make money? What's your value proposition?" — questions that presuppose a settled business model.
- The GDC-enhanced conversational wizard ([2026-04-05-enhanced-onboarding-with-gdc.md](2026-04-05-enhanced-onboarding-with-gdc.md)) collects `CompanyDNA` + BMC in ~16 steps and then runs the 7-stage pipeline. Its Welcome step offers a "New Business / Existing Business" choice, but **both branches lead to the same form** that asks the founder to type in vision, mission, value props, and all nine BMC blocks from their own head.
- The backend `onboard_business` / `togaf_generate` / `bmc_generate` / `tropos_generate` tools ([extensions/mabos/extensions-mabos/src/tools/onboarding-tools.ts:185](../../extensions/mabos/extensions-mabos/src/tools/onboarding-tools.ts)) all take the already-formed business description as input.

The consequence: a founder who has an idea but no validated model produces a thin, guessed `CompanyDNA`. GDC then faithfully amplifies that guess into goals, plans, tasks, and a full agent roster — garbage in, garbage out. The most expensive failure mode in an autonomous business OS is confidently executing on an unvalidated premise.

### Evidence

- `CompanyDNA` ([extensions/mabos/extensions-mabos/src/gdc/types.ts:44](../../extensions/mabos/extensions-mabos/src/gdc/types.ts)) requires `business_description`, `mission`, `vision`, `industry`, `key_products`, `channels`, and a 9-block `bmc` — all of which IRC must *produce* for an idea-stage founder, not collect.
- `ai-suggestions.ts` ([extensions/mabos/extensions-mabos/src/onboarding/ai-suggestions.ts](../../extensions/mabos/extensions-mabos/src/onboarding/ai-suggestions.ts)) already generates vision/mission/values/BMC suggestions, but only from `company_name + industry + stage` context — it has no market or competitive grounding to draw on.
- MABOS already ships research primitives that today only serve post-launch agents: `research_brief` ([sales-research-tools.ts:281](../../extensions/mabos/extensions-mabos/src/tools/sales-research-tools.ts)), `competitor_report` ([competitor-monitor-tools.ts:288](../../extensions/mabos/extensions-mabos/src/tools/competitor-monitor-tools.ts)). Nothing wires them into onboarding.

## Design principles

1. **Upstream-only.** IRC produces `CompanyDNA`; GDC is untouched. The handoff seam is one JSON contract.
2. **Reuse, do not reinvent.** IRC mirrors GDC's proven shape: injected `LlmCallFn`, per-stage validation, checkpoint/resume, graceful degradation. It reuses the existing research tools and suggestion generators.
3. **Files as source of truth.** Every stage persists a JSON artifact plus a human-readable dossier under `businesses/<id>/ideation/`. The research is not thrown away after onboarding — it seeds agent cognitive state.
4. **Evidence-grounded, never silently fabricated.** Every market/competitive claim carries a source or an explicit `unverified` flag. The system distinguishes "researched" from "LLM-guessed."
5. **Validate before commit.** A simulation gate stress-tests the idea against a skeptical customer/stakeholder persona before a `CompanyDNA` is assembled — the same lift→bind→validate→commit discipline used elsewhere in MABOS.
6. **Never block onboarding.** If research backends are unavailable or the idea scores poorly, IRC degrades to analyst-only mode and/or surfaces risks with a refine/pivot recommendation. The founder always reaches a runnable business.

## Where it slots in

```
Welcome (ChoiceCards)
  ├── "I already know my business"  ──▶  existing 16-step wizard ──▶ CompanyDNA ──▶ gdc_run
  └── "I have an idea / a direction" ──▶  IRC branch (this design) ──▶ CompanyDNA ──▶ gdc_run
                                                                          ▲
                                          IRC terminal output is the same contract
```

The Welcome step's existing `businessType: "new" | "existing"` switch ([2026-04-05-enhanced-onboarding-with-gdc.md](2026-04-05-enhanced-onboarding-with-gdc.md), `WorkspaceData`) is extended to `"idea" | "new" | "existing"`. `"idea"` routes into IRC; the other two keep current behavior. IRC converges back onto the same `WorkspaceData`/`CompanyDNA` the express lane produces, so everything downstream (GDC, cognitive writer, dashboard) is unchanged.

## The Ideation and Research Chain (IRC)

A 6-stage pipeline modeled on `GdcOrchestrator` ([extensions/mabos/extensions-mabos/src/gdc/orchestrator.ts](../../extensions/mabos/extensions-mabos/src/gdc/orchestrator.ts)): sequential by default, each stage validated, checkpointed, and individually retriable.

### Stage 1 — Idea Capture and Framing

Capture the raw idea and reframe it into a structured problem/solution hypothesis. Conversational; no external calls.

- **In:** free-text idea, optional target-user hunch, optional domain/industry hint.
- **Work:** LLM reframes into problem statement, jobs-to-be-done, target-user hypothesis, assumed value, riskiest assumptions.
- **Out:** `IdeaFrame`.
- **Gate:** founder confirms the reframing (catches "that's not what I meant" before any research spend).

### Stage 2 — Market Research

Real, cited research. This is the stage that grounds everything downstream.

- **In:** `IdeaFrame`.
- **Work:** derive 4–8 research questions; execute via the existing `research_brief` tool and OpenClaw core `WebSearch`/`WebFetch` through the gateway; estimate TAM/SAM/SOM with stated assumptions; capture trends, demand signals, and regulatory/compliance landscape.
- **Out:** `MarketResearch` — findings, each with `sources[]` (URL + retrieved-at) or `unverified: true`, plus a sizing block with explicit assumptions.
- **Degradation:** with no search backend, fall back to LLM analyst mode; mark every finding `unverified` and record `mode: "analyst-only"`.

### Stage 3 — Competitive Landscape

- **In:** `IdeaFrame` + `MarketResearch`.
- **Work:** identify incumbents, substitutes, and adjacent players (reuse `competitor_report` patterns from [competitor-monitor-tools.ts:288](../../extensions/mabos/extensions-mabos/src/tools/competitor-monitor-tools.ts)); map positioning, pricing posture, and white-space; assess defensibility/moat candidates.
- **Out:** `CompetitiveLandscape` — competitor records, a positioning gap analysis, and moat hypotheses.

### Stage 4 — Opportunity Synthesis and Validation Gate

The decision stage. Synthesize a thesis, then stress-test it before committing.

- **In:** `IdeaFrame` + `MarketResearch` + `CompetitiveLandscape`.
- **Work:**
  1. Synthesize a value-proposition hypothesis, differentiation, target segment, and a risk register.
  2. **Validation gate** — run an `idea_validate` simulation that role-plays a skeptical target customer and a stakeholder/investor persona against the thesis (the simulator pattern specified in [2026-05-02-goal-net-capability-gap-simulation.md](2026-05-02-goal-net-capability-gap-simulation.md), reused here as a pre-commit gate analogous to GenMentor's learner simulator). The gate scores desirability, viability, and feasibility and emits objections.
- **Out:** `OpportunityThesis` — thesis, risks, simulator objections, a confidence score, and a `recommendation: "go" | "refine" | "pivot"`.
- **Gate behavior:** `refine`/`pivot` does **not** hard-stop. It surfaces the objections and offers to loop back to Stage 1 (pivot) or Stage 2 (deepen research), or to proceed with eyes open. Operator agency over an autonomous block, every time.

### Stage 5 — Business Model Drafting

- **In:** validated `OpportunityThesis` + research/landscape context.
- **Work:** extend `ai-suggestions.ts` so vision/mission/values/BMC generation consumes the full research dossier as context (not just name+industry). Draft all nine BMC blocks and mission/vision/values, each block annotated with the research finding that justifies it.
- **Out:** `BusinessModelCanvas` (the exact 9-block shape in [gdc/types.ts:31](../../extensions/mabos/extensions-mabos/src/gdc/types.ts)) + identity (mission/vision/values).
- **Gate:** founder reviews and edits the drafted BMC (reuse the wizard's `BmcBlockEditor`/`ReviewCard`).

### Stage 6 — CompanyDNA Assembly and Handoff

- **In:** all prior stage outputs.
- **Work:** assemble the canonical `CompanyDNA`; persist it to `businesses/<id>/company_dna.json` (the exact path `loadCompanyDNA` reads in [gdc/index.ts:128](../../extensions/mabos/extensions-mabos/src/gdc/index.ts)); write the research dossier as seed beliefs/observations for the Strategy and Sales-Research agents; then invoke `gdc_run`.
- **Out:** `CompanyDNA` on disk + a triggered GDC run. From here, the existing pipeline owns the flow.

## Data contracts

New types live in a new module `extensions/mabos/extensions-mabos/src/ideation/types.ts`. Only `CompanyDNA` and `BusinessModelCanvas` cross the boundary into GDC — both are reused unchanged from `gdc/types.ts`.

```ts
export interface IdeaFrame {
  raw_idea: string;
  problem_statement: string;
  jobs_to_be_done: string[];
  target_user_hypothesis: string;
  assumed_value: string;
  riskiest_assumptions: string[];     // tested by the validation gate in Stage 4
  industry_hint?: string;
}

export interface ResearchSource {
  url: string;
  title: string;
  retrieved_at: string;               // ISO8601
}

export interface ResearchFinding {
  claim: string;
  evidence: string;
  sources: ResearchSource[];          // empty + unverified=true when analyst-only
  unverified: boolean;
}

export interface MarketSizing {
  tam: string; sam: string; som: string;
  assumptions: string[];
}

export interface MarketResearch {
  questions: string[];
  findings: ResearchFinding[];
  sizing: MarketSizing;
  trends: ResearchFinding[];
  regulatory: ResearchFinding[];
  mode: "researched" | "analyst-only";
}

export interface CompetitorRecord {
  name: string;
  positioning: string;
  pricing_posture: string;
  strengths: string[];
  weaknesses: string[];
  sources: ResearchSource[];
}

export interface CompetitiveLandscape {
  competitors: CompetitorRecord[];
  positioning_gaps: string[];
  moat_hypotheses: string[];
}

export interface SimulatorObjection {
  persona: "customer" | "stakeholder";
  objection: string;
  severity: "low" | "medium" | "high";
}

export interface OpportunityThesis {
  value_proposition: string;
  differentiation: string;
  target_segment: string;
  risk_register: { risk: string; likelihood: string; mitigation: string }[];
  simulator_objections: SimulatorObjection[];
  scores: { desirability: number; viability: number; feasibility: number };
  confidence: number;                 // 0..1
  recommendation: "go" | "refine" | "pivot";
}

export interface IrcResult {
  ideaFrame?: IdeaFrame;
  marketResearch?: MarketResearch;
  competitiveLandscape?: CompetitiveLandscape;
  opportunityThesis?: OpportunityThesis;
  companyDna?: CompanyDNA;            // reused from gdc/types.ts — the handoff contract
  errors: string[];
}
```

## Persistence layout (files as source of truth)

```
businesses/<id>/
  ideation/
    idea-frame.json
    market-research.json
    competitive-landscape.json
    opportunity-thesis.json
    ideation-dossier.md          # human-readable rollup of all four
    checkpoints/                 # per-stage resume points (mirrors GDC checkpointDir)
  company_dna.json               # the GDC handoff contract — written by Stage 6
```

The dossier is also seeded into agent cognitive state: `MarketResearch` and `CompetitiveLandscape` become initial `Observations.md` / `Beliefs.md` entries for the `strategy` and `sales-research` agent templates ([extensions/mabos/extensions-mabos/templates/base/agents/](../../extensions/mabos/extensions-mabos/templates/base/agents/)), so day-one agents inherit the founder's research instead of starting blind.

## Module, tools, routes, config

Mirror the GDC registration style ([gdc/index.ts:179](../../extensions/mabos/extensions-mabos/src/gdc/index.ts)).

New module `extensions/mabos/extensions-mabos/src/ideation/`:

- `types.ts` — contracts above.
- `orchestrator.ts` — `IrcOrchestrator` taking an injected `LlmCallFn` (reuse the type and `callLlm` router from `gdc/`).
- `research.ts` — wraps `research_brief` / `competitor_report` / core `WebSearch` behind one research interface, with the analyst-only fallback.
- `validator.ts` — per-stage output validation (reuse the `gdc/validator.ts` approach).
- `simulator.ts` — the Stage-4 validation gate (customer + stakeholder personas).
- `dossier.ts` — renders `ideation-dossier.md` and writes seed cognitive files.
- `index.ts` — `registerIdeation(api, config)`.

Tools and routes:

| Surface | Name | Purpose |
| --- | --- | --- |
| Tool | `irc_run` | Run the full IRC pipeline for a business id (mirrors `gdc_run`). |
| Tool | `irc_status` | Pipeline config/run status (mirrors `gdc_status`). |
| Tool | `idea_validate` | Standalone Stage-4 simulation gate against a supplied thesis. |
| Route | `POST /mabos/irc/run` | Trigger from the wizard. |
| Route | `GET /mabos/irc/status/:runId` | Poll progress for the UI. |

Config — extend the `onboarding` block in `MabosPluginConfig` ([src/tools/common.ts]):

```ts
ideation?: {
  enabled?: boolean;             // default: true
  researchDepth?: "light" | "standard" | "deep"; // controls query count + token budget
  maxResearchQueries?: number;   // default: 8
  validationGateEnabled?: boolean; // default: true
  models?: Partial<Record<1|2|3|4|5|6, string>>; // per-stage model override
};
```

## UI flow

Extend the conversational wizard from the GDC onboarding plan rather than building a new surface:

- **Welcome ChoiceCards** gain a third card: "I have an idea." Selecting it sets `businessType: "idea"`.
- New Neo steps for Stages 1–4, each with the existing `NeoMessage` + an embedded component: idea capture (textarea), a `ResearchProgress` component (polls `GET /mabos/irc/status/:runId`, mirrors `PipelineProgress`), `SourceCitationCards` for findings, a `CompetitorTable`, and a `ThesisReviewCard` showing scores + objections + the go/refine/pivot recommendation with explicit "proceed / refine / pivot" buttons.
- Stage 5 reuses the existing `BmcBlockEditor` and `ReviewCard` so the convergence onto the express-lane review is literal.
- Stage 6 reuses the existing Launch progress UI (GDC pipeline progress) unchanged.

## Validation gate detail (Stage 4)

The gate is the single most valuable addition — it is the difference between "the system researched the idea" and "the system pressure-tested it." Implementation reuses the simulator contract from [2026-05-02-goal-net-capability-gap-simulation.md](2026-05-02-goal-net-capability-gap-simulation.md):

- Two reference personas (`customer`, `stakeholder`) each receive the thesis + research context and return objections with severity.
- Scores (desirability/viability/feasibility, 0–10) and a confidence (0–1) are computed from objection counts/severity.
- A `high-stakes` analogue: if the founder is about to commit real budget (governance budget ledger present), require the gate to pass a configurable threshold or an explicit operator override.
- The gate **advises**, it does not veto. This respects operator agency while making the risk legible.

## Testing strategy

- Unit: each stage with a mock `LlmCallFn` (the GDC tests' pattern) — deterministic JSON in, validated output out.
- `research.ts`: mock the research tools; assert analyst-only fallback flips `mode` and sets `unverified: true` on every finding.
- `simulator.ts`: assert objection severity maps to recommendation (`go`/`refine`/`pivot`) deterministically.
- Handoff: golden test that a completed IRC run writes a `company_dna.json` that passes GDC's `loadCompanyDNA` + Stage-1 input validation unchanged.
- Degradation: with no research backend and a low-scoring idea, IRC still produces a runnable `CompanyDNA` and never throws.

## Graceful degradation summary

| Failure | Behavior |
| --- | --- |
| No search/research backend | Analyst-only mode; every finding flagged `unverified`; `mode: "analyst-only"` recorded. |
| A research call errors | Skip that finding, log it to `IrcResult.errors`, continue. |
| Validation gate scores low | Surface objections + refine/pivot recommendation; founder may still proceed. |
| Any stage throws | Checkpoint preserved; stage retriable; pipeline never deletes prior artifacts. |
| IRC fully fails | Fall back to the express-lane wizard so the founder still reaches `CompanyDNA`. |

## Phasing (design-only; implementation plan to follow)

1. **Backend pipeline** — types, orchestrator, research wrapper, validator, simulator, dossier, module registration (Stages 1–6 callable via `irc_run`).
2. **Handoff + persistence** — `company_dna.json` write, seed-belief writing, golden handoff test.
3. **UI branch** — Welcome third card, IRC Neo steps, research/citation/thesis components, convergence onto express-lane review.
4. **Validation gate hardening** — persona tuning, threshold config, budget-ledger high-stakes integration.

## Risks and open questions

- **Research cost/latency.** Deep research is the most expensive stage. Mitigation: `researchDepth` config, per-stage token budgets, checkpoint/resume, and the model-router cost controls already in MABOS.
- **Source quality.** Web findings can be wrong. Mitigation: every claim carries sources or `unverified`; the dossier is editable; downstream agents treat seeds as beliefs (revisable), not facts.
- **Scope creep into a full "venture studio."** Keep IRC's job narrow: produce a validated `CompanyDNA`. Anything past that is GDC's or the running agents' job.
- **Open:** should the validation gate ever hard-block at extreme low confidence, or always advise-only? Current design: advise-only; revisit if operators report runaway low-quality launches.
- **Open:** reuse the planned `goal-net` simulator module directly vs. a thin IRC-local simulator until that module lands. Current design: thin local simulator with the same interface, swap when goal-net ships.

## Handoff contract (the one seam that matters)

IRC's only output that GDC sees is `businesses/<id>/company_dna.json` conforming to `CompanyDNA` ([gdc/types.ts:44](../../extensions/mabos/extensions-mabos/src/gdc/types.ts)). Everything else IRC produces is founder-facing or agent-seed material. This keeps IRC and GDC independently testable and lets the express lane and the idea lane share one downstream.
