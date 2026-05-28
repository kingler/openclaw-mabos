# Self-Improvement Loop — Scope

> **Status:** Scope only. Not a design or implementation plan — this defines the boundary, the seams, and the non-goals so a full design can be written next.
> **Date:** 2026-05-28
> **Related:** [2026-05-28-ideation-market-research-onboarding-design.md](2026-05-28-ideation-market-research-onboarding-design.md), [2026-05-02-goal-net-capability-gap-simulation.md](2026-05-02-goal-net-capability-gap-simulation.md), [2026-05-02-llm-output-assimilation-pipeline.md](2026-05-02-llm-output-assimilation-pipeline.md).

## The gap in one sentence

MABOS has all the ingredients of learning but no closed loop: it can create skills, compute capability gaps, commit beliefs, and run a BDI cycle — but **nothing measures the outcome of what agents do and feeds that measurement back into beliefs, skills, capabilities, and goal priorities.** Today the system acts; it does not yet learn from whether acting worked.

## Framing: outcome-feedback, not deep RL

"Self-improving" invites a heavy reading — policy-gradient / deep reinforcement learning over agent behavior. **That is explicitly not what this scopes.** True RL would need a reward model, a policy network, exploration, and a training loop — none of which fit a multi-tenant business OS where wrong "exploration" spends real money and emails real customers.

The pragmatic, shippable version is a **deterministic outcome-feedback loop**: log decisions → score their outcomes → adjust a small set of explicit, inspectable, operator-gated parameters. The adaptation surface for v1 is intentionally narrow and concrete (two existing tunable levers, below); everything else (goal re-prioritization, new-agent proposals) is advisory output for a human, not an automatic weight update. This keeps the loop legible, reversible, and within the [VISION.md](../../VISION.md) guardrails — no opaque learned policy steering an autonomous business.

## What already exists (the ingredients)

| Capability | Where | What it does | What it lacks |
| --- | --- | --- | --- |
| Skill creation from experience | [src/skill-loop/](../../extensions/mabos/extensions-mabos/src/skill-loop/) (`creator.ts`, `nudge.ts`) | Nudges skill creation every N turns; stores skills in a registry | No outcome signal — nudges on interval, not on success/failure |
| Capability gap (planned) | [2026-05-02-goal-net-capability-gap-simulation.md](2026-05-02-goal-net-capability-gap-simulation.md) | `gap = required − held`, computed lazily on prompt construction | Static derivation; nothing closes the gap from results |
| Belief assimilation | [2026-05-02-llm-output-assimilation-pipeline.md](2026-05-02-llm-output-assimilation-pipeline.md) | lift → bind → validate → commit gate for new beliefs | Inbound only; outcomes don't flow back as committed beliefs |
| KPI targets | GDC Stage 1 (`kpi_metric`, `kpi_target` in [gdc/types.ts:84](../../extensions/mabos/extensions-mabos/src/gdc/types.ts)) | Every goal carries a measurable target | Nothing measures actuals against the target |
| Session intelligence | [src/session-intel/](../../extensions/mabos/extensions-mabos/src/session-intel/) | Records sessions, recall, user model | Records, doesn't evaluate or attribute |
| BDI cycle | 5-min heartbeat (per [MABOS-DESCRIPTION.md](../../MABOS-DESCRIPTION.md)) | perceive → believe → reconsider → select → execute | The cycle re-deliberates but doesn't grade its own prior intentions |

The pieces sit adjacent to each other but are not wired into a loop.

## Scope: a closed Sense → Evaluate → Attribute → Learn → Adapt loop

```
                ┌───────────── intentions executed by BDI cycle ─────────────┐
                ▼                                                             │
  Sense ──▶ Evaluate ──▶ Attribute ──▶ Learn ──▶ Adapt ──▶ (next BDI cycle) ──┘
 outcomes  KPI/goal Δ   cause: plan/   skill +  re-prioritize
 captured             skill/belief?  capability  goals/plans,
                                     + belief    nudge skills,
                                     revision    propose research
```

### 1. Sense — outcome capture

Capture the result of each executed intention/plan: did the action succeed, what did the KPI metric read after, what changed in the world (orders, leads, spend, deadlines met/missed). Reuse `session-intel` records and agent experience logs as the raw feed; add an explicit **outcome record** keyed to the intention/plan id.

### 2. Evaluate — KPI and goal-satisfaction delta

Compare actuals to the GDC-assigned `kpi_target`. Where the goal-net `satisfactionRollup` ([2026-05-02-goal-net-capability-gap-simulation.md](2026-05-02-goal-net-capability-gap-simulation.md)) exists, roll the delta up the goal tree so a leaf result moves its parent's satisfaction measure. Output: a per-goal `satisfaction Δ` with direction and magnitude.

### 3. Attribute — what caused the delta

Use the existing reasoning engine (`causal`, `abductive` modules per [MABOS-DESCRIPTION.md](../../MABOS-DESCRIPTION.md)) to attribute the delta to a plan, a skill, or a belief that turned out to be wrong. This is where the **ideation research dossier closes its own loop**: when reality contradicts a Stage-2/3 market assumption (e.g., a competitor assumption the IRC dossier recorded), Attribute flags that seed belief as stale and routes it to belief revision.

### 4. Learn — update the durable stores

- **Skills:** when a plan succeeds repeatedly, `skill_create` the winning pattern (replace the interval nudge in `nudge.ts` with an outcome-triggered nudge). When a skill underperforms, demote/retire it.
- **Capabilities:** feed confirmed gaps into the capability-gap view so delegation/tool-acquisition becomes directed by evidence, not guesswork.
- **Beliefs:** push corrected beliefs back through the existing assimilation gate (lift → bind → validate → commit) so revisions are validated, not blindly overwritten.

### 5. Adapt — change future behavior

Two tiers of adaptation, deliberately separated by risk:

**Automatic (narrow, reversible, the v1 surface) — two existing tunable levers:**

1. **Cognitive-router thresholds.** `selectDepth(score, thresholds)` at [cognitive-router.ts:257](../../extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts) already gates depth on a per-role `RoleThresholds { reflexiveCeiling, deliberativeFloor, maxConsecutiveReflexive }`. The loop nudges these from outcomes: if reflexive (0-LLM) handling of a signal class kept producing good results, lower the cost by raising `reflexiveCeiling`; if a class of misses traces to under-deliberation, lower `deliberativeFloor`. This is a bounded scalar tweak per role, fully inspectable, with a config floor/ceiling so it can never disable deliberation entirely.
2. **Skill ranking.** `injector.ts:31` already scores candidate skills by keyword/tag/capability overlap. The loop attaches a learned **outcome multiplier** per skill (success rate when injected) to that existing score, so skills that demonstrably helped rank higher and chronic underperformers fall off the top-N — without deleting anything.

**Advisory (everything higher-stakes) — surfaced, never auto-applied:**

Re-prioritize goals/plans by realized impact, propose new domain agents or new research when a persistent gap can't be closed with current capabilities. **Every adaptation that changes scope, spend, or roster is operator-gated** through the deontic/governance approval path.

Both tiers write their state as inspectable artifacts (threshold values, skill multipliers) — never opaque weights.

## Non-goals (hard boundaries)

- **No unsupervised self-modification of code or core orchestration.** The loop adapts beliefs/skills/priorities — data, not the runtime. Consistent with [VISION.md](../../VISION.md): heavy nested-planner orchestration and manager-of-managers hierarchies are not a default; the loop stays a bounded, optional extension feature.
- **No autonomous spending beyond the governance budget ledger.** Adaptations that cost money route through the existing reservation/settlement path.
- **No new storage engine.** Reuse TypeDB + workspace JSON + session-intel; outcome records are files/triples, not a new database.
- **No silent goal rewrites.** Re-prioritization is proposed and gated, not applied behind the operator's back.
- **Not a replacement for the BDI cycle.** The loop is a meta-layer that grades and tunes the cycle; the cycle still owns execution.

## Dependencies and ordering

1. **Goal Net + satisfaction rollup** ([2026-05-02-goal-net-capability-gap-simulation.md](2026-05-02-goal-net-capability-gap-simulation.md)) — needed for Evaluate. Land first.
2. **Assimilation pipeline** ([2026-05-02-llm-output-assimilation-pipeline.md](2026-05-02-llm-output-assimilation-pipeline.md)) — needed for the Learn→belief-revision path. Already the prerequisite for goal-net.
3. **IRC dossier seeds** ([2026-05-28 design](2026-05-28-ideation-market-research-onboarding-design.md)) — gives Attribute a set of explicit, dated assumptions to invalidate against reality. Not a hard blocker, but the loop is far more useful with it.

## Smallest shippable slice (for the eventual design)

Prove the loop end-to-end on one **automatic** lever before touching anything advisory: pick one agent and the skill-ranking multiplier. Capture whether each injected skill's intention succeeded (Sense), compute its success rate (Evaluate), attribute the result to that skill (Attribute), update its outcome multiplier in a per-skill stats file (Learn), and let `injector.ts` read the multiplier so ranking shifts on the next turn (Adapt). This exercises every loop stage, changes only a bounded scalar, deletes nothing, and is trivially observable — the right tracer before generalizing to router thresholds, then to the advisory tier (goal re-prioritization, KPI/belief revision via the assimilation gate).

## Open questions for the design phase

- Outcome capture cadence: event-driven (on plan completion) vs. tied to the 5-min BDI heartbeat vs. a separate slower meta-cycle (hourly/daily)?
- Attribution confidence threshold before a belief is flagged stale — too low and the system thrashes; too high and it never learns.
- How aggressively to auto-retire underperforming skills vs. always asking the operator.
- Where the loop's own meta-state lives so it is observable in the dashboard (a "Learning" page) without becoming yet another silo.
