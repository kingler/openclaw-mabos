# Ideation and Research Chain (IRC) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

> **Status:** Implementation plan. Design: [2026-05-28-ideation-market-research-onboarding-design.md](2026-05-28-ideation-market-research-onboarding-design.md).
> **Date:** 2026-05-28

**Goal:** Build the Ideation and Research Chain — a pipeline that turns a raw founder idea into a research-grounded, validated `CompanyDNA`, then hands off to the existing GDC pipeline (`gdc_run`) unchanged. IRC is the front-door analogue of GDC: same staged/validated/checkpointed shape, one stage upstream.

**Tech stack:** TypeScript ESM, Vitest, TypeBox, the existing `LlmCallFn` injection pattern, `httpRequest`/`resolveWorkspaceDir`/`textResult` from `src/tools/common.ts`, and the GDC module as the structural template to copy.

---

## Context for implementers

### What to copy

IRC is deliberately a sibling of GDC. Read these first and mirror them:

- [src/gdc/orchestrator.ts](../../extensions/mabos/extensions-mabos/src/gdc/orchestrator.ts) — `executeStage` retry-with-validation-feedback loop, `parseJsonResponse`, file checkpointing. **Copy this structure wholesale**; only the stage list and variable assembly change.
- [src/gdc/index.ts](../../extensions/mabos/extensions-mabos/src/gdc/index.ts) — `callLlm` Anthropic/OpenAI router, tool + HTTP-route registration, `loadCompanyDNA` path convention.
- [src/gdc/types.ts](../../extensions/mabos/extensions-mabos/src/gdc/types.ts) — `LlmCallFn`, `CompanyDNA`, `BusinessModelCanvas`, `BmcItem`. **Reuse `CompanyDNA`/`BusinessModelCanvas` directly** — do not redefine them.
- [src/gdc/prompt-builder.ts](../../extensions/mabos/extensions-mabos/src/gdc/prompt-builder.ts) and [src/gdc/validator.ts](../../extensions/mabos/extensions-mabos/src/gdc/validator.ts) — prompt templating + per-stage validation with `ValidationError`.
- [src/onboarding/ai-suggestions.ts](../../extensions/mabos/extensions-mabos/src/onboarding/ai-suggestions.ts) — the suggestion-generation + JSON-extraction pattern that Stage 5 extends.
- Research tools to wrap: `research_brief` ([sales-research-tools.ts:281](../../extensions/mabos/extensions-mabos/src/tools/sales-research-tools.ts)), `competitor_report` ([competitor-monitor-tools.ts:288](../../extensions/mabos/extensions-mabos/src/tools/competitor-monitor-tools.ts)).

### New module location

All new code lives under `extensions/mabos/extensions-mabos/src/ideation/`, tests under `extensions/mabos/extensions-mabos/tests/`.

### Conventions (non-negotiable)

- Inject `LlmCallFn` into every class/function that calls an LLM (testability + model-router reuse). Never call the LLM API directly inside pipeline logic.
- Each stage: validate output, retry up to 3x appending `validation_feedback`, then degrade gracefully (push to `errors`, return `undefined`) — never throw out of the orchestrator.
- Persist every stage artifact as JSON under `businesses/<id>/ideation/`. Files are the source of truth.
- Commit each task with `scripts/committer "<msg>" <files...>` — do not use manual `git add`/`commit`.
- TDD: write the test first, run it red, implement, run it green, commit.

---

## Phase 1: Backend pipeline

### Task 1: IRC types

**Files:** Create `src/ideation/types.ts`.

Define `IdeaFrame`, `ResearchSource`, `ResearchFinding`, `MarketSizing`, `MarketResearch`, `CompetitorRecord`, `CompetitiveLandscape`, `SimulatorObjection`, `OpportunityThesis`, `IrcResult` exactly as in the design doc's "Data contracts" section. Add an `IrcPipelineConfig` mirroring `GdcPipelineConfig` (enabled, maxStage `1|2|3|4|5|6`, researchDepth, maxResearchQueries, validationGateEnabled, models, checkpointDir, enableCaching).

`import type { CompanyDNA, BusinessModelCanvas, BmcItem, LlmCallFn } from "../gdc/types.js"` — reuse, do not redefine. `IrcResult.companyDna?: CompanyDNA` is the handoff field.

**Commit:** `scripts/committer "feat(ideation): add IRC type definitions" extensions/mabos/extensions-mabos/src/ideation/types.ts`

---

### Task 2: Stage prompt templates

**Files:** Create `src/ideation/prompts/stage{1-5}-*.md` and `src/ideation/prompts/idea-validation.md`.

- `stage1-idea-framing.md` — raw idea → `IdeaFrame` (problem statement, JTBD, target-user hypothesis, riskiest assumptions). `{{raw_idea}}`, `{{industry_hint}}`.
- `stage2-market-research.md` — synthesize findings into `MarketResearch` from supplied research-tool output; require `sources[]` per finding or `unverified: true`; TAM/SAM/SOM with stated assumptions. `{{idea_frame}}`, `{{research_results}}`, `{{mode}}`.
- `stage3-competitive-landscape.md` — `CompetitiveLandscape` (competitors, positioning gaps, moat hypotheses). `{{idea_frame}}`, `{{market_research}}`, `{{competitor_results}}`.
- `stage4-opportunity-synthesis.md` — `OpportunityThesis` minus simulator fields (those come from Task 7). `{{idea_frame}}`, `{{market_research}}`, `{{competitive_landscape}}`.
- `stage5-business-model.md` — `BusinessModelCanvas` (9 blocks) + mission/vision/values, each block annotated with the justifying finding. `{{opportunity_thesis}}`, `{{market_research}}`.
- `idea-validation.md` — used by the simulator (Task 7): role-play customer + stakeholder personas, emit `SimulatorObjection[]` + desirability/viability/feasibility scores. `{{thesis}}`, `{{persona}}`, `{{research_context}}`.

Each template has `<system>` and `<user>` blocks and a trailing `{{validation_feedback}}` slot (mirror GDC prompts).

**Commit:** `scripts/committer "feat(ideation): add IRC stage prompt templates" extensions/mabos/extensions-mabos/src/ideation/prompts/`

---

### Task 3: Prompt builder

**Files:** Create `src/ideation/prompt-builder.ts`.

Reuse GDC's `buildPrompt`/`computeInputHash`/`summarizeForContext` approach. Simplest path: import `computeInputHash` from `../gdc/prompt-builder.js` and add an IRC-local `buildIrcPrompt(stageNumber, variables)` that loads from `src/ideation/prompts/` via `import.meta.url`. Keep the `{{variable}}` substitution + `<system>`/`<user>` split identical to GDC.

> **Guardrail (per AGENTS.md):** do not mix `await import("x")` and static `import` of the same module. Use a static import of the GDC prompt-builder helper.

**Test first:** `tests/ideation-prompt-builder.test.ts` — substitution fills `{{raw_idea}}`, leaves no `{{...}}`, deterministic hash.

**Commit:** `scripts/committer "feat(ideation): add IRC prompt builder" extensions/mabos/extensions-mabos/src/ideation/prompt-builder.ts extensions/mabos/extensions-mabos/tests/ideation-prompt-builder.test.ts`

---

### Task 4: Validator

**Files:** Create `src/ideation/validator.ts`.

`validate(stageNumber, output)` throwing `ValidationError` (reuse the `ValidationError` shape from `../gdc/validator.js` — re-export or import). Per-stage checks:

- Stage 1: non-empty `problem_statement`, `riskiest_assumptions.length >= 1`.
- Stage 2: every `findings[]` entry has either `sources.length >= 1` or `unverified === true`; `mode` is one of the enum.
- Stage 3: `competitors` is an array; each has `name`.
- Stage 4: `scores` present with three numeric fields; `recommendation` in `{go, refine, pivot}`; `confidence` in [0,1].
- Stage 5: all nine BMC blocks present and each is an array of `{title, description}`; mission/vision/values non-empty.

**Test first:** `tests/ideation-validator.test.ts` — accept a valid Stage-2 output; reject a finding with no sources and `unverified:false`; reject Stage-4 with out-of-range confidence.

**Commit:** `scripts/committer "feat(ideation): add IRC validator" extensions/mabos/extensions-mabos/src/ideation/validator.ts extensions/mabos/extensions-mabos/tests/ideation-validator.test.ts`

---

### Task 5: Research wrapper

**Files:** Create `src/ideation/research.ts`.

One interface over all research execution, with the analyst-only fallback:

```ts
export interface ResearchBackend {
  webSearch?(query: string): Promise<ResearchSource[]>;
  marketBrief?(topic: string): Promise<string>;     // wraps research_brief
  competitorScan?(topic: string): Promise<string>;  // wraps competitor_report
}
export async function gatherResearch(params: {
  questions: string[];
  backend: ResearchBackend;
  maxQueries: number;
}): Promise<{ raw: string; mode: "researched" | "analyst-only"; errors: string[] }>;
```

If no backend method is available, return `mode: "analyst-only"` with empty `raw` (the Stage-2 prompt then runs in analyst mode and the validator requires `unverified:true`). Per-query errors are caught and collected, never thrown.

**Test first:** `tests/ideation-research.test.ts` — with a mock backend returning sources, `mode === "researched"`; with an empty backend, `mode === "analyst-only"`; a throwing query is collected into `errors` and skipped.

**Commit:** `scripts/committer "feat(ideation): add research wrapper with analyst-only fallback" extensions/mabos/extensions-mabos/src/ideation/research.ts extensions/mabos/extensions-mabos/tests/ideation-research.test.ts`

---

### Task 6: Simulator (validation gate)

**Files:** Create `src/ideation/simulator.ts`.

```ts
export async function validateIdea(params: {
  thesis: Omit<OpportunityThesis, "simulator_objections" | "scores" | "confidence" | "recommendation">;
  researchContext: string;
  callLlm: LlmCallFn;
  personas?: ("customer" | "stakeholder")[]; // default both
  model?: string;
}): Promise<Pick<OpportunityThesis, "simulator_objections" | "scores" | "confidence" | "recommendation">>;
```

Run the `idea-validation.md` prompt once per persona, parse `SimulatorObjection[]` + scores, then derive `recommendation` deterministically: `high`-severity objection count ≥ 2 → `pivot`; any `high` or ≥ 3 `medium` → `refine`; else `go`. Confidence = normalized inverse of weighted objection severity. **Advisory only** — never throws, never blocks.

**Test first:** `tests/ideation-simulator.test.ts` — mock LLM returning two high-severity objections ⇒ `pivot`; zero objections ⇒ `go`; deterministic given fixed mock output.

**Commit:** `scripts/committer "feat(ideation): add idea validation simulator gate" extensions/mabos/extensions-mabos/src/ideation/simulator.ts extensions/mabos/extensions-mabos/tests/ideation-simulator.test.ts`

---

### Task 7: Orchestrator

**Files:** Create `src/ideation/orchestrator.ts`.

Copy `GdcOrchestrator` structure. `IrcOrchestrator` constructor takes `(config: IrcPipelineConfig, callLlm: LlmCallFn, backend: ResearchBackend)`. `run(input: { rawIdea: string; industryHint?: string }): Promise<IrcResult>` runs sequentially up to `config.maxStage`:

1. Stage 1 → `IdeaFrame`.
2. Stage 2: derive research questions from the frame (LLM), call `gatherResearch`, then Stage-2 prompt → `MarketResearch` (carry `mode` through).
3. Stage 3 → `CompetitiveLandscape`.
4. Stage 4: synthesis prompt → partial thesis; if `config.validationGateEnabled`, call `validateIdea` and merge results → `OpportunityThesis`.
5. Stage 5 → `BusinessModelCanvas` + identity.

Reuse GDC's `executeStage` retry/checkpoint/`parseJsonResponse` verbatim (extract to a shared helper or copy). Stage 6 (CompanyDNA assembly) is **not** in the orchestrator — it lives in the module (Task 9) so the orchestrator stays pure/handoff-free for testing.

**Test first:** `tests/ideation-orchestrator.test.ts` — mock `callLlm` returns valid JSON per stage and a mock backend; assert all five stage outputs populate and `errors` is empty; assert a Stage-3 LLM failure degrades (stage3 undefined, error logged, pipeline continues to whatever depends on it or stops cleanly).

**Commit:** `scripts/committer "feat(ideation): add IRC orchestrator" extensions/mabos/extensions-mabos/src/ideation/orchestrator.ts extensions/mabos/extensions-mabos/tests/ideation-orchestrator.test.ts`

---

### Task 8: Dossier writer

**Files:** Create `src/ideation/dossier.ts`.

- `renderDossier(result: IrcResult): string` — markdown rollup of all stages with source citations.
- `writeSeedCognitiveFiles(params: { agentDir: string; result: IrcResult })` — write `MarketResearch`/`CompetitiveLandscape` summaries as `Observations.md`/`Beliefs.md` seed entries for the `strategy` and `sales-research` agents (mirror the GDC `cognitive-writer.ts` file-writing style).

**Test first:** `tests/ideation-dossier.test.ts` — rendered dossier contains a known finding + its source URL; seed files written to a temp agentDir.

**Commit:** `scripts/committer "feat(ideation): add dossier writer and seed cognitive files" extensions/mabos/extensions-mabos/src/ideation/dossier.ts extensions/mabos/extensions-mabos/tests/ideation-dossier.test.ts`

---

### Task 9: Module index + registration + CompanyDNA assembly

**Files:** Create `src/ideation/index.ts`. Modify `src/tools/common.ts` (config) and `index.ts` (wiring).

`registerIdeation(api, config)` mirrors `registerGdc`:

- Reuse the `callLlm` Anthropic/OpenAI router (extract GDC's into a shared `src/ideation/llm.ts` or import from `../gdc/index.js` if exported; if not exported, copy it — keep one source of truth where feasible).
- Build a `ResearchBackend` from the registered MABOS research tools (look up `research_brief`/`competitor_report` and any core `web_search` via the api tool registry; absent → analyst-only).
- **Tool `irc_run`** (params: `business_id`, `raw_idea`, `industry_hint?`, `max_stage?`): run `IrcOrchestrator`, then **assemble `CompanyDNA`** from Stage-1/4/5 outputs, write `businesses/<id>/ideation/*.json` + `ideation-dossier.md`, write `businesses/<id>/company_dna.json` (the exact path `loadCompanyDNA` reads), write seed cognitive files, and return a summary. Stage 6 = this assembly + persistence step.
- **Tool `irc_status`** (mirror `gdc_status`).
- **Tool `idea_validate`** (standalone Task-6 gate against a supplied thesis).
- **Routes:** `POST /mabos/irc/run`, `GET /mabos/irc/status` (mirror GDC routes; auth `gateway`).

Config in `MabosPluginConfig` ([common.ts:13](../../extensions/mabos/extensions-mabos/src/tools/common.ts)):

```ts
ideationEnabled?: boolean;
ideation?: import("../ideation/types.js").IrcPipelineConfig;
```

Wiring in `index.ts` after the GDC block (~line 7670), same try/catch + `if (pluginConfig.ideationEnabled)` gate:

```ts
// Module 6b: IRC Pipeline (ideation and research chain — upstream of GDC)
if (pluginConfig.ideationEnabled) {
  try {
    registerIdeation(api, pluginConfig);
  } catch (err) {
    log.warn(`[mabos] IRC module failed to initialize: ${err}`);
  }
}
```

**Test first:** `tests/ideation-handoff.test.ts` (golden) — run `irc_run` with mock LLM/backend against a temp workspace; assert `company_dna.json` exists and **passes GDC's `validate(1, ...)` input expectations** (the seam). Assert `ideation-dossier.md` written.

**Commit:** `scripts/committer "feat(ideation): register IRC module, tools, routes, and CompanyDNA handoff" extensions/mabos/extensions-mabos/src/ideation/index.ts extensions/mabos/extensions-mabos/src/tools/common.ts extensions/mabos/extensions-mabos/index.ts extensions/mabos/extensions-mabos/tests/ideation-handoff.test.ts`

---

## Phase 2: UI branch

### Task 10: Welcome third card + `businessType: "idea"`

**Files:** Modify the onboarding wizard (`ui/src/pages/OnboardingPage.tsx` + the Welcome `ChoiceCards`, per [2026-04-05-enhanced-onboarding-with-gdc.md](2026-04-05-enhanced-onboarding-with-gdc.md)).

Extend `WorkspaceData.businessType` to `"idea" | "new" | "existing"`. Add a third Welcome card "I have an idea." Selecting it routes into the IRC step sequence; the other two keep current behavior.

**Commit:** `scripts/committer "feat(ideation): add idea branch to onboarding welcome" <files>`

---

### Task 11: IRC chat steps + components

**Files:** Create `ui/src/components/onboarding/{ResearchProgress,SourceCitationCards,CompetitorTable,ThesisReviewCard}.tsx`; extend `OnboardingPage.tsx`.

- Idea-capture step (textarea + industry hint).
- `ResearchProgress` polls `GET /mabos/irc/status` (mirror `PipelineProgress`).
- `SourceCitationCards` renders findings with source links / `unverified` badge.
- `CompetitorTable` renders the landscape.
- `ThesisReviewCard` shows scores + objections + the `go/refine/pivot` recommendation with explicit **proceed / refine / pivot** buttons (refine→Stage 2, pivot→Stage 1).
- Stage 5 reuses the existing `BmcBlockEditor` + `ReviewCard` (convergence onto the express lane).
- Launch reuses the existing GDC progress UI.

**Commit:** `scripts/committer "feat(ideation): add IRC onboarding chat steps and components" <files>`

---

### Task 12: Wire UI to `irc_run`

**Files:** Modify `OnboardingPage.tsx`.

On idea-branch launch, `POST /mabos/irc/run` with `{ business_id, raw_idea, industry_hint }`; show `ResearchProgress`; on completion (CompanyDNA written) trigger the existing `POST /mabos/gdc/run` exactly as the express lane does.

**Commit:** `scripts/committer "feat(ideation): wire idea branch to irc_run and gdc handoff" <files>`

---

## Phase 3: Hardening

### Task 13: Validation-gate config + budget high-stakes hook

**Files:** Modify `src/ideation/simulator.ts`, `src/ideation/index.ts`.

Add a configurable score threshold; when the governance budget ledger indicates real spend is about to be committed, require the gate to clear the threshold or an explicit operator override (advisory escalation, not a hard block). Persona tuning lives in `idea-validation.md`.

**Test:** threshold boundary cases; override path.

**Commit:** `scripts/committer "feat(ideation): configurable validation threshold + budget high-stakes hook" <files>`

---

### Task 14: Docs

**Files:** Create/update `docs/` onboarding page describing the idea branch (alphabetical service ordering, root-relative links, no em dashes in headings per repo docs rules).

**Commit:** `scripts/committer "docs: document IRC ideation onboarding branch" <files>`

---

## Implementation order

```
Phase 1 (backend):
  Task 1: Types               → 20 min
  Task 2: Prompt templates     → 40 min
  Task 3: Prompt builder       → 20 min
  Task 4: Validator            → 40 min
  Task 5: Research wrapper      → 40 min
  Task 6: Simulator            → 40 min
  Task 7: Orchestrator         → 60 min
  Task 8: Dossier writer       → 30 min
  Task 9: Module + handoff      → 60 min
Phase 2 (UI):
  Task 10: Welcome card        → 20 min
  Task 11: Chat steps + comps   → 90 min
  Task 12: Wire to irc_run      → 30 min
Phase 3 (hardening):
  Task 13: Gate config/budget   → 40 min
  Task 14: Docs                 → 30 min
```

Phase 1 alone is independently valuable and shippable behind `ideationEnabled` (callable via `irc_run`). Ship it first; UI follows.

## Key design decisions (carried from the design doc)

1. **`CompanyDNA` is the only seam.** IRC reuses GDC's `CompanyDNA`/`BusinessModelCanvas` types and writes `company_dna.json`; GDC is untouched. The golden handoff test (Task 9) is the contract guard.
2. **`LlmCallFn` injection everywhere** — testability + model-router reuse, identical to GDC.
3. **Graceful degradation at every level** — no backend ⇒ analyst-only; stage failure ⇒ logged + skipped; low gate score ⇒ advisory, never blocking. IRC fully failing ⇒ fall back to the express-lane wizard.
4. **Files as source of truth** — every stage artifact persisted; the dossier seeds agent cognitive state so research isn't discarded.
5. **Simulator advises, never vetoes** — operator agency over any autonomous block.

## Verification before submitting

- `pnpm exec vitest run extensions/mabos/extensions-mabos/tests/ideation-*.test.ts --config vitest.extensions.config.ts`
- `pnpm tsgo` (no new type errors) and `pnpm check` (oxfmt/oxlint clean).
- `pnpm build` and confirm no `[INEFFECTIVE_DYNAMIC_IMPORT]` warning (Task 3 guardrail).
