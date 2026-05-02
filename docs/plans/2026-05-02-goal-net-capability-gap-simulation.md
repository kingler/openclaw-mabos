# Goal Net Topology, Capability Gap, and Simulation Gate Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring three missing goal-oriented mechanisms into MABOS's runtime: (1) a typed Goal Net topology so goals are a queryable graph rather than flat Markdown entries, (2) a first-class capability gap derived from goals so agents know what they lack, and (3) a stakeholder simulator gate so high-stakes intentions face mimicked feedback before commit.

**Architecture:** Extends the upper ontology with `mabos:GoalRelationship`, `mabos:CompositeGoal`, `cap:CapabilityGap`, and `mabos:Simulator`. A new `goal-net/` module loads goal graphs from existing `Goals.md` + `tropos-goal-model.json`, persists them as TypeDB hyperrelations, and exposes traversal queries. Capability-gap derivation runs as a forward-chain rule on the assimilation pipeline's commit stage. The simulator becomes a fourth check in `validate.ts`, gated by a `high-stakes` predicate over intentions.

**Tech Stack:** TypeScript ESM, Vitest, TypeBox, existing TypeDB driver, existing assimilation pipeline (lift → bind → validate → commit), existing `createDeonticTool` pattern reused for simulator wrapping.

**Prerequisite:** [docs/plans/2026-05-02-llm-output-assimilation-pipeline.md](2026-05-02-llm-output-assimilation-pipeline.md) must land first — this plan depends on the `validate.ts` extensibility, `commit.ts` forwardChain hook, the n-ary fact store from amended Task 5.5, and `quarantine.ts` already in place.

**Multi-tenant scope:** MABOS is a multi-tenant runtime. The business name and domain ontology are instantiation variables, not properties of MABOS. **VividWalls is one tenant** under `businesses/vividwalls/` — used here only as a fixture for tests and the integration walkthrough. The Goal Net loader, capability catalog, gap cache, mint-policy table, and simulator persona configuration are all per-tenant constructs assembled in `build-ctx.ts`. References to `vw-cfo`, `G-VW-TRUST-003`, `vividwalls.jsonld`, or "VividWalls collector segment lead" are **fixture, not architecture** — the same machinery serves a consulting, retail, SaaS, or marketplace tenant by swapping the ontology overlay and goal model. The G-VW-TRUST-003 round-trip in Task 17 demonstrates one tenant's instantiation; an analogous test for any other domain ontology must work without code changes to the goal-net, capability, or simulator modules.

---

## Amendment Log

**2026-05-02 — pre-execution wiring trace (G-VW-TRUST-003 round-trip).** Tracing capability-gap recomputation through the existing `forwardChain` at [src/tools/inference-tools.ts:68](../../extensions/mabos/extensions-mabos/src/tools/inference-tools.ts:68) revealed two design errors:

- **Finding C (high)**: Existing `forwardChain` is a _qualitative pattern matcher_ over binary triples — it derives new facts via variable binding, not aggregates or set-differences. Hooking `deriveGap()` into the forwardChain wrapper smuggles aggregate computation into a pattern-matching engine. Worse, the derived `cap:CapabilityGapFact` then re-enters `validate()`, where the SHACL shape (`cap:CapabilityGapShape` requiring `cap:gapAgent` etc.) doesn't match the bound role names (`agent`, `goal`, `missing`). Validation fails. Recursion blows up.
- **Finding D (medium)**: Even if Finding C were resolved, eagerly recomputing every active goal's gap on every commit is wasteful — most commits don't shift gaps, and the BDI cycle only reads gaps when building the deliberative prompt.

Both findings push the same fix: **capability gap is a derived view, not a stored fact.** Compute it lazily on prompt construction; cache by `(agentId, goalId)`; invalidate cache entries when `belief.committed` events touch a goal-relevant subject.

Affected sections of this plan:

- **Task 7** — drop `cap:CapabilityGap` class and `cap:CapabilityGapShape` from the ontology amendment. Keep `cap:RequiredCapability` and `cap:HeldCapability` (these are real properties of goals/agents).
- **Task 9** — replaced entirely. New approach: subscribe to the assimilation pipeline's `belief.committed` event bus and invalidate a `GapCache`. No more forwardChain wrapper.
- **Task 10** — drop `cap:CapabilityGapFact` from `vividwalls.jsonld`. The cache holds the view; nothing is committed to the n-ary store as a "gap fact."
- **Task 17** — integration test verifies cache invalidation, not committed gap facts.

---

## 0. Issue Capture

### Source material

Two papers ground this design:

- **Shen Zhiqi (2005), Goal-oriented Modeling for Intelligent Agents and their Applications.** Introduces Goal Net — a typed graph of states + transitions with seven relationship types (sequence, concurrency, choice, synchronization, all-of, one-of, sequential), composite goals, quantitative satisfaction measurement, and agent-from-goal derivation rules.
- **Wang et al. (2025), GenMentor: LLM-powered Multi-agent Framework for Goal-oriented Learning in ITS.** Formalizes goal-oriented operation as `f: (U_{t-1}, ΔS₀, I_t) → (U_t, ΔS_t)` where `ΔS₀ = S' - S₀` is a _skill gap_ (generalised here to _capability gap_). Introduces a _learner simulator_ that role-plays the stakeholder to provide mimicked feedback before path delivery.

### Problem statement

MABOS's goal layer today has three concrete deficits:

1. **No goal topology at runtime.** [extensions/mabos/extensions-mabos/src/tools/onboarding-tools.ts:355](../../extensions/mabos/extensions-mabos/src/tools/onboarding-tools.ts:355) generates a Tropos goal model as a one-shot JSON artifact during onboarding; the BDI runtime then treats goals as independent entries in `Goals.md`. The structure (sub-goals, choices, synchronization) is lost. The cognitive cycle at [cognitive-router.ts:550](../../extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts:550) reads "Active Goals" as a flat list — it cannot answer "which goals block G-VW-TRUST-003?" or "is this an _all-of_ or _one-of_ decomposition?"
2. **No capability gap.** Agents have a capabilities catalog and goals, but no derived `gap = required - current`. There is nothing in the codebase that computes "to satisfy this goal, agent X lacks capability Y." Delegation, helper-agent spawning, and tool acquisition are therefore undirected.
3. **No simulation before commit.** The deliberative cycle commits intentions based purely on internal deliberation. There is no analogue of GenMentor's learner simulator — no mimicked stakeholder feedback intercepts a high-stakes intention before it lands. The deontic gate from the assimilation plan blocks rule violations; it does not catch _plausible-but-bad_ intentions that a stakeholder would reject.

### Evidence

- `tropos-goal-model.json` field schema includes `actor`, `goal`, `decomposition`, `dependency` per the test [tests/vividwalls-onboarding-e2e.test.ts](../../extensions/mabos/extensions-mabos/tests/vividwalls-onboarding-e2e.test.ts) — but those fields never reach Beliefs/Goals/Intentions parsers.
- `mabos:Goal` is `subClassOf mabos:Desire` in [src/ontology/mabos-upper.jsonld](../../extensions/mabos/extensions-mabos/src/ontology/mabos-upper.jsonld) but has no `hasSubGoal`, no relationship type, and no satisfaction measure — only progress %.
- The `cap:Capability` class in the prior plan's TOGAF extension has `cap:realizedBy` and `cap:enables`, but no `cap:requiredFor` (goal → capability) or `cap:held` (agent → capability), so a gap cannot be computed.
- `validate.ts` (introduced in the assimilation plan) has three checks (SHACL, deontic, confidence) — extensible by design but currently has no simulator hook.

### In scope

- Goal Net ontology: typed `mabos:GoalRelationship` (7 enumerated types), `mabos:CompositeGoal`, `mabos:satisfactionMeasure`, traversal queries (`subgoalsOf`, `blockingGoals`, `satisfactionRollup`).
- Goal-graph loader from `tropos-goal-model.json` + `Goals.md` into TypeDB hyperrelations.
- Capability gap: `cap:RequiredCapability`, `cap:HeldCapability`, `cap:CapabilityGap` materialised by a forward-chain rule on every `belief.committed` event.
- Simulator interface + two reference implementations (Stakeholder, Customer); high-stakes predicate; fourth check in `validate.ts`.
- BDI cycle integration: capability-gap and top-blocking-subgoals injected into the deliberative prompt context.

### Out of scope

- Full Goal Net reasoning module (§3.3 of the thesis) with formal goal selection algorithms — start with topology + traversal; reasoning lands in a follow-up.
- Agent-from-goal derivation rules (§3.4.1) — keep the C-suite template fixed for now; file as `2026-05-XX-agent-from-goal-derivation.md`.
- Fine-tuned LLM as a "skill identifier" (GenMentor §4.1) — the gap derivation here is rule-based; LLM-assisted gap inference is a follow-up.
- Multi-step learner-path scheduling (GenMentor §4.3) — out of scope; goal traversal is enough for this plan.

### Success criteria

- A VividWalls integration test demonstrates loading `tropos-goal-model.json` into a typed graph and answering: "what _all-of_ sub-goals block G-VW-TRUST-003?"
- After a `belief.committed` event for an edition fact, a forward-chain rule recomputes `cap:CapabilityGap` for `G-VW-TRUST-003` and the gap is queryable from TypeDB.
- A high-stakes intention (e.g. price change > $1000) is rejected by `validate.ts` when the simulator returns negative mimicked feedback; quarantined with reason `simulator-veto`.
- The deliberative prompt at [cognitive-router.ts:608](../../extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts:608) is augmented with a `## Capability Gap` and `## Blocking Sub-goals` section, both derived from TypeDB queries.

### Non-goals (explicit)

- No retroactive migration of existing `Goals.md` content; legacy goals load with `mabos:goalRelType = "sequential"` as the default.
- No change to the assimilation pipeline's lift→bind→validate→commit shape — only an additive `validate.ts` check and a new forward-chain rule.
- No new LLM models or fine-tunes.

---

## File map

```
extensions/mabos/extensions-mabos/src/ontology/
  mabos-upper.jsonld                           MODIFY  (add goal topology + capability gap)
  shapes-sbvr.jsonld                           MODIFY  (add CompositeGoalShape, CapabilityGapShape)
  vividwalls.jsonld                            MODIFY  (add G-VW-TRUST-003 + sub-goals as test fixture)

extensions/mabos/extensions-mabos/src/goal-net/
  types.ts                                     CREATE
  graph-loader.ts                              CREATE  (Goals.md + tropos JSON → typed graph)
  graph-store.ts                               CREATE  (TypeDB hyperrelation persistence)
  traversal.ts                                 CREATE  (subgoalsOf, blockingGoals, satisfactionRollup)
  index.ts                                     CREATE  (module exports)

extensions/mabos/extensions-mabos/src/capability/
  types.ts                                     CREATE
  gap-derivation.ts                            CREATE  (pure S' - S₀ function)
  gap-cache.ts                                 CREATE  (added 2026-05-02 amendment — replaces forward-chain hook)
  gap-query.ts                                 CREATE  (cache-backed query helpers)
  index.ts                                     CREATE

extensions/mabos/extensions-mabos/src/cognitive/assimilation/
  validate.ts                                  MODIFY  (add 4th check: simulatorGate)
  simulator-gate.ts                            CREATE  (predicate + simulator dispatch)

extensions/mabos/extensions-mabos/src/simulators/
  types.ts                                     CREATE
  stakeholder-simulator.ts                     CREATE
  customer-simulator.ts                        CREATE
  index.ts                                     CREATE

extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts
                                               MODIFY  (inject gap + blocking sub-goals into prompt)

extensions/mabos/extensions-mabos/tests/
  goal-net-graph-loader.test.ts                CREATE
  goal-net-traversal.test.ts                   CREATE
  capability-gap-derivation.test.ts            CREATE
  capability-gap-cache.test.ts                 CREATE  (added 2026-05-02 amendment)
  simulator-gate.test.ts                       CREATE
  vividwalls-goal-net-roundtrip.test.ts        CREATE  (integration; amended to verify cache invalidation)
```

Test command: `pnpm --filter @openclaw/mabos test -- <test-file-name>`.

---

## Section A — Goal Net Topology (Tasks 1–6)

### Task 1: Extend upper ontology with goal-graph primitives

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/ontology/mabos-upper.jsonld`

**Step 1: Read the current Goal definition**

Run: `grep -n "mabos:Goal\b" extensions/mabos/extensions-mabos/src/ontology/mabos-upper.jsonld`

Locate the `mabos:Goal` block to anchor inserts.

**Step 2: Append new classes and properties to the `@graph` array**

```jsonld
/* Insert after mabos:Goal definition */
{
  "@id": "mabos:CompositeGoal",
  "@type": "owl:Class",
  "rdfs:subClassOf": "mabos:Goal",
  "rdfs:label": "Composite Goal",
  "rdfs:comment": "A goal whose body decomposes into sub-goals related via mabos:GoalRelationship",
  "sbvr:conceptType": "NounConcept",
  "sbvr:designation": "composite goal",
  "sbvr:definition": "Composite Goal is a goal that decomposes into sub-goals connected by typed relationships",
  "sbvr:vocabulary": "mabos-upper"
},
{
  "@id": "mabos:GoalRelationship",
  "@type": "owl:Class",
  "rdfs:label": "Goal Relationship",
  "rdfs:comment": "Typed link between goals; relType ∈ {sequence|concurrency|choice|synchronization|all-of|one-of|sequential}",
  "sbvr:conceptType": "FactType",
  "sbvr:designation": "goal-related-to-goal",
  "sbvr:vocabulary": "mabos-upper"
},
{
  "@id": "mabos:goalRelType", "@type": "owl:DatatypeProperty",
  "rdfs:domain": "mabos:GoalRelationship", "rdfs:range": "xsd:string",
  "rdfs:comment": "One of the seven Goal Net relationship types"
},
{
  "@id": "mabos:fromGoal", "@type": "owl:ObjectProperty",
  "rdfs:domain": "mabos:GoalRelationship", "rdfs:range": "mabos:Goal"
},
{
  "@id": "mabos:toGoal", "@type": "owl:ObjectProperty",
  "rdfs:domain": "mabos:GoalRelationship", "rdfs:range": "mabos:Goal"
},
{
  "@id": "mabos:hasSubGoal", "@type": "owl:ObjectProperty",
  "rdfs:domain": "mabos:CompositeGoal", "rdfs:range": "mabos:Goal",
  "rdfs:comment": "Membership of a sub-goal within a composite parent"
},
{
  "@id": "mabos:satisfactionMeasure", "@type": "owl:DatatypeProperty",
  "rdfs:domain": "mabos:Goal", "rdfs:range": "xsd:float",
  "rdfs:comment": "Goal Net §3.2.4 — quantitative satisfaction in [0.0, 1.0], distinct from progress%"
}
```

**Step 3: Verify parse**

```bash
node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('extensions/mabos/extensions-mabos/src/ontology/mabos-upper.jsonld','utf-8'))))"
```

Expected: prints top-level keys without throwing.

**Step 4: Commit**

```bash
scripts/committer "MABOS: extend ontology with Goal Net topology primitives" \
  extensions/mabos/extensions-mabos/src/ontology/mabos-upper.jsonld
```

---

### Task 2: Add SHACL shapes for goal topology

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/ontology/shapes-sbvr.jsonld`

**Step 1: Append shapes**

```jsonld
{
  "@id": "mabos:CompositeGoalShape",
  "@type": "sh:NodeShape",
  "sh:targetClass": "mabos:CompositeGoal",
  "rdfs:comment": "Composite goals must declare at least one sub-goal",
  "sh:property": [
    { "sh:path": "mabos:hasSubGoal", "sh:minCount": 1, "sh:message": "Composite goal must have at least one sub-goal" }
  ]
},
{
  "@id": "mabos:GoalRelationshipShape",
  "@type": "sh:NodeShape",
  "sh:targetClass": "mabos:GoalRelationship",
  "sh:property": [
    { "sh:path": "mabos:goalRelType", "sh:minCount": 1, "sh:maxCount": 1, "sh:datatype": "xsd:string",
      "sh:in": ["sequence","concurrency","choice","synchronization","all-of","one-of","sequential"] },
    { "sh:path": "mabos:fromGoal", "sh:minCount": 1, "sh:maxCount": 1 },
    { "sh:path": "mabos:toGoal",   "sh:minCount": 1, "sh:maxCount": 1 }
  ]
},
{
  "@id": "mabos:GoalShape",
  "@type": "sh:NodeShape",
  "sh:targetClass": "mabos:Goal",
  "sh:property": [
    { "sh:path": "mabos:satisfactionMeasure", "sh:maxCount": 1, "sh:datatype": "xsd:float",
      "sh:minInclusive": 0.0, "sh:maxInclusive": 1.0 }
  ]
}
```

**Step 2: Run existing assimilation SHACL tests to ensure backward compatibility**

```bash
pnpm --filter @openclaw/mabos test -- assimilation-shacl-mini
```

Expected: PASS (the shapes-sbvr.jsonld additions are new shapes, not modifications).

**Step 3: Commit**

```bash
scripts/committer "MABOS: SHACL shapes for goal topology" \
  extensions/mabos/extensions-mabos/src/ontology/shapes-sbvr.jsonld
```

---

### Task 3: Goal-net types module

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/goal-net/types.ts`

**Step 1: Write the type definitions**

```ts
// src/goal-net/types.ts
export type GoalRelType =
  | "sequence"
  | "concurrency"
  | "choice"
  | "synchronization"
  | "all-of"
  | "one-of"
  | "sequential";

export interface GoalNode {
  id: string; // G-VW-TRUST-003
  label: string;
  composite: boolean;
  satisfaction?: number; // 0.0–1.0
  progress?: number; // 0–100 (legacy)
  status: "active" | "achieved" | "dropped" | "blocked";
  agentId: string;
}

export interface GoalEdge {
  id: string; // generated UUID
  from: string; // GoalNode.id
  to: string;
  relType: GoalRelType;
}

export interface GoalGraph {
  nodes: Map<string, GoalNode>;
  edges: GoalEdge[];
  byParent: Map<string, string[]>; // parent id → child ids (for hasSubGoal)
}
```

**Step 2: Verify build**

Run: `pnpm --filter @openclaw/mabos check` → PASS

**Step 3: Commit**

```bash
scripts/committer "MABOS: goal-net type definitions" \
  extensions/mabos/extensions-mabos/src/goal-net/types.ts
```

---

### Task 4: Graph loader from Goals.md + tropos-goal-model.json

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/goal-net/graph-loader.ts`
- Test: `extensions/mabos/extensions-mabos/tests/goal-net-graph-loader.test.ts`

**Step 1: Write the failing test**

```ts
// tests/goal-net-graph-loader.test.ts
import { describe, it, expect } from "vitest";
import { loadGoalGraph } from "../src/goal-net/graph-loader";

describe("loadGoalGraph", () => {
  it("loads flat Goals.md as a sequential graph (legacy compatibility)", async () => {
    const goalsMd = `# Goals\n\n### G-CFO-001: Increase revenue\n- **Status:** active\n- **Progress:** 20%\n\n### G-CFO-002: Reduce churn\n- **Status:** active\n- **Progress:** 0%\n`;
    const g = await loadGoalGraph({ goalsMd, troposJson: null, agentId: "vw-cfo" });
    expect(g.nodes.size).toBe(2);
    expect(g.nodes.get("G-CFO-001")?.label).toBe("Increase revenue");
    expect(g.nodes.get("G-CFO-001")?.progress).toBe(20);
    // No tropos JSON → no relationship edges, no composites
    expect(g.edges).toHaveLength(0);
  });

  it("merges tropos-goal-model.json composite/sub-goal structure into the graph", async () => {
    const goalsMd = `### G-VW-TRUST-003: Provenance integrity\n- **Status:** active\n\n### G-VW-COA-001: Issue COA\n- **Status:** active\n\n### G-VW-REG-001: Register edition\n- **Status:** active\n`;
    const tropos = {
      actors: [{ id: "cfo", goals: ["G-VW-TRUST-003"] }],
      decompositions: [
        { parent: "G-VW-TRUST-003", relType: "all-of", children: ["G-VW-COA-001", "G-VW-REG-001"] },
      ],
    };
    const g = await loadGoalGraph({ goalsMd, troposJson: tropos, agentId: "vw-cfo" });
    expect(g.nodes.get("G-VW-TRUST-003")?.composite).toBe(true);
    expect(g.byParent.get("G-VW-TRUST-003")).toEqual(["G-VW-COA-001", "G-VW-REG-001"]);
    const edges = g.edges.filter((e) => e.from === "G-VW-TRUST-003");
    expect(edges).toHaveLength(2);
    expect(edges.every((e) => e.relType === "all-of")).toBe(true);
  });
});
```

**Step 2: Run test → FAIL**

```bash
pnpm --filter @openclaw/mabos test -- goal-net-graph-loader
```

**Step 3: Implement**

```ts
// src/goal-net/graph-loader.ts
import type { GoalGraph, GoalNode, GoalEdge, GoalRelType } from "./types";

export interface LoadInput {
  goalsMd: string;
  troposJson: {
    actors?: unknown[];
    decompositions?: Array<{ parent: string; relType: GoalRelType; children: string[] }>;
  } | null;
  agentId: string;
}

const HEADER = /^###\s+(G-[\w-]+):\s+(.+)$/gm;
const STATUS = /\*\*Status:\*\*\s*(\w+)/i;
const PROGRESS = /\*\*Progress:\*\*\s*(\d+)\s*%/i;

export async function loadGoalGraph(input: LoadInput): Promise<GoalGraph> {
  const nodes = new Map<string, GoalNode>();
  const edges: GoalEdge[] = [];
  const byParent = new Map<string, string[]>();

  // Parse Goals.md blocks
  const blocks = input.goalsMd.split(/(?=^### G-)/m);
  for (const block of blocks) {
    const headerMatch = block.match(/^###\s+(G-[\w-]+):\s+(.+?)$/m);
    if (!headerMatch) continue;
    const id = headerMatch[1];
    const label = headerMatch[2].trim();
    const status = (block.match(STATUS)?.[1] ?? "active") as GoalNode["status"];
    const progress = block.match(PROGRESS) ? parseInt(block.match(PROGRESS)![1], 10) : undefined;
    nodes.set(id, { id, label, composite: false, status, progress, agentId: input.agentId });
  }

  // Layer Tropos decompositions on top
  for (const dec of input.troposJson?.decompositions ?? []) {
    const parent = nodes.get(dec.parent);
    if (parent) parent.composite = true;
    byParent.set(dec.parent, dec.children);
    for (const child of dec.children) {
      edges.push({
        id: `${dec.parent}->${child}:${dec.relType}`,
        from: dec.parent,
        to: child,
        relType: dec.relType,
      });
    }
  }

  return { nodes, edges, byParent };
}
```

**Step 4: Run test → PASS**

**Step 5: Commit**

```bash
scripts/committer "MABOS: goal-net graph loader (Goals.md + Tropos JSON)" \
  extensions/mabos/extensions-mabos/src/goal-net/graph-loader.ts \
  extensions/mabos/extensions-mabos/tests/goal-net-graph-loader.test.ts
```

---

### Task 5: Traversal queries (subgoalsOf, blockingGoals, satisfactionRollup)

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/goal-net/traversal.ts`
- Test: `extensions/mabos/extensions-mabos/tests/goal-net-traversal.test.ts`

**Step 1: Write failing tests**

```ts
// tests/goal-net-traversal.test.ts
import { describe, it, expect } from "vitest";
import { subgoalsOf, blockingSubgoals, satisfactionRollup } from "../src/goal-net/traversal";
import type { GoalGraph } from "../src/goal-net/types";

function fixture(): GoalGraph {
  return {
    nodes: new Map([
      [
        "G-VW-TRUST-003",
        {
          id: "G-VW-TRUST-003",
          label: "Provenance integrity",
          composite: true,
          status: "active",
          agentId: "vw-cfo",
          satisfaction: 0.5,
        },
      ],
      [
        "G-VW-COA-001",
        {
          id: "G-VW-COA-001",
          label: "Issue COA",
          composite: false,
          status: "active",
          agentId: "vw-cfo",
          satisfaction: 1.0,
        },
      ],
      [
        "G-VW-REG-001",
        {
          id: "G-VW-REG-001",
          label: "Register edition",
          composite: false,
          status: "active",
          agentId: "vw-cfo",
          satisfaction: 0.0,
        },
      ],
    ]),
    edges: [
      { id: "e1", from: "G-VW-TRUST-003", to: "G-VW-COA-001", relType: "all-of" },
      { id: "e2", from: "G-VW-TRUST-003", to: "G-VW-REG-001", relType: "all-of" },
    ],
    byParent: new Map([["G-VW-TRUST-003", ["G-VW-COA-001", "G-VW-REG-001"]]]),
  };
}

describe("subgoalsOf", () => {
  it("returns the direct sub-goals of a composite", () => {
    expect(subgoalsOf(fixture(), "G-VW-TRUST-003").map((n) => n.id)).toEqual([
      "G-VW-COA-001",
      "G-VW-REG-001",
    ]);
  });
});

describe("blockingSubgoals", () => {
  it("for an all-of parent, returns sub-goals with satisfaction < 1.0", () => {
    expect(blockingSubgoals(fixture(), "G-VW-TRUST-003").map((n) => n.id)).toEqual([
      "G-VW-REG-001",
    ]);
  });

  it("for a one-of parent, returns [] if any child is satisfied", () => {
    const g = fixture();
    g.edges.forEach((e) => (e.relType = "one-of"));
    expect(blockingSubgoals(g, "G-VW-TRUST-003")).toEqual([]);
  });
});

describe("satisfactionRollup", () => {
  it("for all-of, satisfaction is the min of children", () => {
    expect(satisfactionRollup(fixture(), "G-VW-TRUST-003")).toBe(0.0);
  });
});
```

**Step 2: Run → FAIL**

**Step 3: Implement**

```ts
// src/goal-net/traversal.ts
import type { GoalGraph, GoalNode, GoalRelType } from "./types";

export function subgoalsOf(g: GoalGraph, parentId: string): GoalNode[] {
  const ids = g.byParent.get(parentId) ?? [];
  return ids.map((id) => g.nodes.get(id)).filter((n): n is GoalNode => !!n);
}

function relTypeOf(g: GoalGraph, parentId: string): GoalRelType | null {
  const e = g.edges.find((e) => e.from === parentId);
  return e?.relType ?? null;
}

export function blockingSubgoals(g: GoalGraph, parentId: string): GoalNode[] {
  const subs = subgoalsOf(g, parentId);
  if (subs.length === 0) return [];
  const rel = relTypeOf(g, parentId);
  switch (rel) {
    case "all-of":
    case "synchronization":
    case "concurrency":
    case "sequential":
    case "sequence":
      return subs.filter((s) => (s.satisfaction ?? 0) < 1.0);
    case "one-of":
    case "choice":
      // Blocked only if no child reaches satisfaction
      return subs.some((s) => (s.satisfaction ?? 0) >= 1.0) ? [] : subs;
    default:
      return subs.filter((s) => (s.satisfaction ?? 0) < 1.0);
  }
}

export function satisfactionRollup(g: GoalGraph, parentId: string): number {
  const subs = subgoalsOf(g, parentId);
  if (subs.length === 0) {
    return g.nodes.get(parentId)?.satisfaction ?? 0;
  }
  const rel = relTypeOf(g, parentId);
  const sats = subs.map((s) => satisfactionRollup(g, s.id));
  switch (rel) {
    case "all-of":
    case "synchronization":
    case "sequential":
    case "sequence":
    case "concurrency":
      return Math.min(...sats);
    case "one-of":
    case "choice":
      return Math.max(...sats);
    default:
      return sats.reduce((a, b) => a + b, 0) / sats.length;
  }
}
```

**Step 4: Run test → PASS**

**Step 5: Commit**

```bash
scripts/committer "MABOS: goal-net traversal (subgoalsOf, blockingSubgoals, rollup)" \
  extensions/mabos/extensions-mabos/src/goal-net/traversal.ts \
  extensions/mabos/extensions-mabos/tests/goal-net-traversal.test.ts
```

---

### Task 6: Graph store (TypeDB hyperrelation persistence)

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/goal-net/graph-store.ts`
- Create: `extensions/mabos/extensions-mabos/src/goal-net/index.ts`

**Step 1: Implement (no failing test — pure I/O wrapper, matches existing TypeDB write-through pattern in `fact-store.ts`)**

```ts
// src/goal-net/graph-store.ts
import type { GoalGraph, GoalNode, GoalEdge } from "./types";

export interface TypeDBAdapter {
  upsertGoalNode(n: GoalNode): Promise<void>;
  upsertGoalEdge(e: GoalEdge): Promise<void>;
  queryGoalGraph(agentId: string): Promise<GoalGraph>;
}

export class GoalGraphStore {
  constructor(private typedb: TypeDBAdapter) {}

  async commit(g: GoalGraph): Promise<void> {
    for (const node of g.nodes.values()) await this.typedb.upsertGoalNode(node);
    for (const edge of g.edges) await this.typedb.upsertGoalEdge(edge);
  }

  async load(agentId: string): Promise<GoalGraph> {
    return this.typedb.queryGoalGraph(agentId);
  }
}
```

```ts
// src/goal-net/index.ts
export * from "./types";
export * from "./graph-loader";
export * from "./traversal";
export * from "./graph-store";
```

**Step 2: Verify build**

Run: `pnpm --filter @openclaw/mabos check` → PASS

**Step 3: Commit**

```bash
scripts/committer "MABOS: goal-graph TypeDB store + module exports" \
  extensions/mabos/extensions-mabos/src/goal-net/graph-store.ts \
  extensions/mabos/extensions-mabos/src/goal-net/index.ts
```

---

## Section B — Capability Gap (Tasks 7–10)

### Task 7: Extend ontology with required/held capability links

> **Amended 2026-05-02**: dropped `cap:CapabilityGap` class, shape, and metadata properties. Capability gap is a _derived view_ computed lazily, not a fact persisted to the store. Only the two real relations — `cap:RequiredCapability` (goal → capability) and `cap:HeldCapability` (agent → capability) — are added here.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/ontology/mabos-upper.jsonld`

**Step 1: Append to mabos-upper.jsonld**

```jsonld
{
  "@id": "cap:RequiredCapability", "@type": "owl:ObjectProperty",
  "rdfs:domain": "mabos:Goal", "rdfs:range": "cap:Capability",
  "rdfs:comment": "S' — capabilities required to satisfy this goal (GenMentor §4.1). Stored as facts of type cap:RequiresFact."
},
{
  "@id": "cap:HeldCapability", "@type": "owl:ObjectProperty",
  "rdfs:domain": "mabos:Agent", "rdfs:range": "cap:Capability",
  "rdfs:comment": "S₀ — capabilities the agent currently holds. Stored as facts of type cap:HoldsFact."
},
{
  "@id": "cap:RequiresFact", "@type": "sbvr:FactType",
  "sbvr:arity": 2,
  "sbvr:reading": "goal requires capability",
  "sbvr:roles": [
    { "sbvr:roleName": "goal",       "sbvr:rolePlayer": "mabos:Goal" },
    { "sbvr:roleName": "capability", "sbvr:rolePlayer": "cap:Capability" }
  ],
  "sbvr:vocabulary": "mabos-upper"
},
{
  "@id": "cap:HoldsFact", "@type": "sbvr:FactType",
  "sbvr:arity": 2,
  "sbvr:reading": "agent holds capability",
  "sbvr:roles": [
    { "sbvr:roleName": "agent",      "sbvr:rolePlayer": "mabos:Agent" },
    { "sbvr:roleName": "capability", "sbvr:rolePlayer": "cap:Capability" }
  ],
  "sbvr:vocabulary": "mabos-upper"
}
```

**Step 2: Verify SHACL tests pass**

```bash
pnpm --filter @openclaw/mabos test -- assimilation-shacl-mini
```

The existing `sbvr:FactTypeShape` already validates the n-ary structure; no new SHACL shape needed.

**Step 3: Commit**

```bash
scripts/committer "MABOS: cap:RequiresFact + cap:HoldsFact (gap is derived view, not stored)" \
  extensions/mabos/extensions-mabos/src/ontology/mabos-upper.jsonld
```

---

### Task 8: Capability types + gap derivation

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/capability/types.ts`
- Create: `extensions/mabos/extensions-mabos/src/capability/gap-derivation.ts`
- Test: `extensions/mabos/extensions-mabos/tests/capability-gap-derivation.test.ts`

**Step 1: Write types**

```ts
// src/capability/types.ts
export interface CapabilityRef {
  id: string;
  label: string;
}

export interface CapabilityGap {
  agentId: string;
  goalId: string;
  missing: CapabilityRef[];
  ts: string;
}

export interface CapabilityCatalog {
  requiredFor(goalId: string): Promise<CapabilityRef[]>; // S'
  heldBy(agentId: string): Promise<CapabilityRef[]>; // S₀
}
```

**Step 2: Write failing test**

```ts
// tests/capability-gap-derivation.test.ts
import { describe, it, expect } from "vitest";
import { deriveGap } from "../src/capability/gap-derivation";

const catalog = {
  requiredFor: async (goalId: string) =>
    goalId === "G-VW-TRUST-003"
      ? [
          { id: "cap:CertificateIssuance", label: "COA issuance" },
          { id: "cap:EditionRegistry", label: "Edition registry" },
          { id: "cap:GalleryNotification", label: "Gallery notification" },
        ]
      : [],
  heldBy: async (agentId: string) =>
    agentId === "vw-cfo"
      ? [
          { id: "cap:CertificateIssuance", label: "COA issuance" },
          { id: "cap:EditionRegistry", label: "Edition registry" },
        ]
      : [],
};

describe("deriveGap", () => {
  it("returns capabilities required by goal but not held by agent", async () => {
    const g = await deriveGap("vw-cfo", "G-VW-TRUST-003", catalog);
    expect(g.missing.map((c) => c.id)).toEqual(["cap:GalleryNotification"]);
    expect(g.agentId).toBe("vw-cfo");
    expect(g.goalId).toBe("G-VW-TRUST-003");
  });

  it("returns empty missing when agent holds all required capabilities", async () => {
    const fullCatalog = {
      ...catalog,
      heldBy: async () => [
        { id: "cap:CertificateIssuance", label: "" },
        { id: "cap:EditionRegistry", label: "" },
        { id: "cap:GalleryNotification", label: "" },
      ],
    };
    const g = await deriveGap("vw-cfo", "G-VW-TRUST-003", fullCatalog);
    expect(g.missing).toEqual([]);
  });
});
```

**Step 3: Run → FAIL**

**Step 4: Implement**

```ts
// src/capability/gap-derivation.ts
import type { CapabilityCatalog, CapabilityGap } from "./types";

export async function deriveGap(
  agentId: string,
  goalId: string,
  catalog: CapabilityCatalog,
): Promise<CapabilityGap> {
  const required = await catalog.requiredFor(goalId);
  const held = await catalog.heldBy(agentId);
  const heldIds = new Set(held.map((c) => c.id));
  const missing = required.filter((c) => !heldIds.has(c.id));
  return { agentId, goalId, missing, ts: new Date().toISOString() };
}
```

**Step 5: Run test → PASS**

**Step 6: Commit**

```bash
scripts/committer "MABOS: capability gap derivation (S' - S₀)" \
  extensions/mabos/extensions-mabos/src/capability/types.ts \
  extensions/mabos/extensions-mabos/src/capability/gap-derivation.ts \
  extensions/mabos/extensions-mabos/tests/capability-gap-derivation.test.ts
```

---

### Task 9: Capability-gap cache with event-driven invalidation

> **Amended 2026-05-02**: replaced the forward-chain hook approach. `forwardChain` is a qualitative pattern matcher and cannot do set-difference; piping a "gap fact" back through `validate()` also fails because the SHACL shape doesn't match the bound role names. Cleaner design: gap is a derived view, computed lazily, cached, invalidated on `belief.committed`.

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/capability/gap-cache.ts`
- Test: `extensions/mabos/extensions-mabos/tests/capability-gap-cache.test.ts`

**Step 1: Write failing test**

```ts
// tests/capability-gap-cache.test.ts
import { describe, it, expect, vi } from "vitest";
import { GapCache } from "../src/capability/gap-cache";

describe("GapCache", () => {
  it("caches deriveGap results and serves second call from cache", async () => {
    const derive = vi.fn().mockResolvedValue({ agentId: "a", goalId: "g1", missing: [], ts: "t" });
    const cache = new GapCache(derive);
    await cache.get("a", "g1");
    await cache.get("a", "g1");
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it("invalidates only the entries whose goal is touched", async () => {
    const derive = vi.fn().mockResolvedValue({ agentId: "a", goalId: "g1", missing: [], ts: "t" });
    const cache = new GapCache(derive);
    await cache.get("a", "g1");
    await cache.get("a", "g2");
    cache.onBeliefCommitted({ touchedGoals: ["g1"] });
    await cache.get("a", "g1"); // recomputed
    await cache.get("a", "g2"); // still cached
    expect(derive).toHaveBeenCalledTimes(3); // g1, g2, g1-after-invalidate
  });

  it("invalidates entries when affectedAgents is set", async () => {
    const derive = vi.fn().mockResolvedValue({ agentId: "a", goalId: "g1", missing: [], ts: "t" });
    const cache = new GapCache(derive);
    await cache.get("a", "g1");
    await cache.get("b", "g1");
    cache.onBeliefCommitted({ touchedAgents: ["a"] });
    await cache.get("a", "g1");
    await cache.get("b", "g1");
    expect(derive).toHaveBeenCalledTimes(3); // initial a, initial b, a-after-invalidate
  });
});
```

**Step 2: Run test → FAIL**

**Step 3: Implement**

```ts
// src/capability/gap-cache.ts
import type { CapabilityGap, CapabilityCatalog } from "./types";
import { deriveGap } from "./gap-derivation";

export interface BeliefCommittedEvent {
  touchedAgents?: string[];
  touchedGoals?: string[];
  touchedCapabilities?: string[];
}

type DeriveFn = (agentId: string, goalId: string) => Promise<CapabilityGap>;

export class GapCache {
  private cache = new Map<string, CapabilityGap>(); // key: `${agentId}::${goalId}`

  constructor(private derive: DeriveFn) {}

  static fromCatalog(catalog: CapabilityCatalog): GapCache {
    return new GapCache((agentId, goalId) => deriveGap(agentId, goalId, catalog));
  }

  async get(agentId: string, goalId: string): Promise<CapabilityGap> {
    const key = `${agentId}::${goalId}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const gap = await this.derive(agentId, goalId);
    this.cache.set(key, gap);
    return gap;
  }

  onBeliefCommitted(ev: BeliefCommittedEvent): void {
    const touchedAgents = new Set(ev.touchedAgents ?? []);
    const touchedGoals = new Set(ev.touchedGoals ?? []);
    if (touchedAgents.size === 0 && touchedGoals.size === 0 && !ev.touchedCapabilities) return;
    for (const key of [...this.cache.keys()]) {
      const [agentId, goalId] = key.split("::");
      if (touchedAgents.has(agentId) || touchedGoals.has(goalId) || ev.touchedCapabilities) {
        this.cache.delete(key);
      }
    }
  }

  async byAgent(agentId: string, goals: string[]): Promise<CapabilityGap[]> {
    return Promise.all(goals.map((g) => this.get(agentId, g)));
  }
}
```

**Step 4: Run test → PASS**

**Step 5: Wire cache into the assimilation event bus**

The assimilation pipeline's commit stage (Task 9 of the assimilation plan) publishes `belief.committed` events. The gap cache subscribes and self-invalidates. Both are constructed in `build-ctx.ts`:

```ts
// build-ctx.ts (in buildAssimilationCtx)
import { GapCache } from "../../capability/gap-cache";

const gapCache = GapCache.fromCatalog(capabilityCatalog);

// Subscribe to the bus
ctx.bus.on?.("belief.committed", (ev) => {
  // Translate the committed fact into a touched-goals event
  const touchedGoals = extractGoalIdsFrom(ev.fact);          // e.g., goal-mention rules
  const touchedAgents = ev.fact.factTypeId === "cap:HoldsFact" ? [ev.fact.roles.agent] : [];
  const touchedCapabilities = (ev.fact.factTypeId === "cap:RequiresFact" || ev.fact.factTypeId === "cap:HoldsFact")
    ? [ev.fact.roles.capability] : undefined;
  gapCache.onBeliefCommitted({ touchedGoals, touchedAgents, touchedCapabilities });
});

// Expose cache to downstream consumers (BDI prompt builder, Task 15)
return { ..., gapCache };
```

**Step 6: Note for Task 10 (`topMissingForAgent`)**: it now reads from `gapCache.byAgent`, not from a `GapStore`. The `GapStore` interface in Task 10 is dropped — see amended Task 10.

**Step 7: Commit**

```bash
scripts/committer "MABOS: capability gap cache with event-driven invalidation" \
  extensions/mabos/extensions-mabos/src/capability/gap-cache.ts \
  extensions/mabos/extensions-mabos/tests/capability-gap-cache.test.ts \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/build-ctx.ts
```

---

### Task 10: Gap query module (cache-backed, no fact type)

> **Amended 2026-05-02**: dropped `GapStore` interface and `cap:CapabilityGapFact`. Queries go through `GapCache` (Task 9) which derives lazily and invalidates on event. There is no "gap fact" persisted anywhere.

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/capability/gap-query.ts`
- Create: `extensions/mabos/extensions-mabos/src/capability/index.ts`
- Modify: `extensions/mabos/extensions-mabos/src/ontology/vividwalls.jsonld` (only to add sample `cap:RequiresFact` and `cap:HoldsFact` entries for the integration test fixture — no new fact-type definitions)

**Step 1: Implement query module against the cache**

```ts
// src/capability/gap-query.ts
import type { GapCache } from "./gap-cache";

export async function topMissingForAgent(
  cache: GapCache,
  agentId: string,
  activeGoalIds: string[],
  limit = 5,
): Promise<string[]> {
  const gaps = await cache.byAgent(agentId, activeGoalIds);
  const counts = new Map<string, number>();
  for (const g of gaps) for (const c of g.missing) counts.set(c.id, (counts.get(c.id) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

export async function gapForGoal(
  cache: GapCache,
  agentId: string,
  goalId: string,
): Promise<string[]> {
  const g = await cache.get(agentId, goalId);
  return g.missing.map((c) => c.id);
}
```

```ts
// src/capability/index.ts
export * from "./types";
export * from "./gap-derivation";
export * from "./gap-cache";
export * from "./gap-query";
```

**Step 2: Add sample fixture data to vividwalls.jsonld**

Use the _existing_ fact types `cap:RequiresFact` and `cap:HoldsFact` (introduced in amended Task 7). Add seed instances under a `sampleFacts` key — no new fact-type schema needed:

```jsonld
{
  "@id": "vw:requiresFactSample-1", "@type": "cap:RequiresFact",
  "cap:goal": "mabos:Goal/G-VW-TRUST-003",
  "cap:capability": "cap:Capability/CertificateIssuance"
},
{
  "@id": "vw:requiresFactSample-2", "@type": "cap:RequiresFact",
  "cap:goal": "mabos:Goal/G-VW-TRUST-003",
  "cap:capability": "cap:Capability/EditionRegistry"
},
{
  "@id": "vw:requiresFactSample-3", "@type": "cap:RequiresFact",
  "cap:goal": "mabos:Goal/G-VW-TRUST-003",
  "cap:capability": "cap:Capability/GalleryNotification"
}
```

(Held-capability entries are agent-scoped — they live in `<workspace>/agents/vw-cfo/capabilities.json`, not in the ontology.)

**Step 3: Verify build + tests**

```bash
pnpm --filter @openclaw/mabos check
pnpm --filter @openclaw/mabos test -- capability
```

**Step 4: Commit**

```bash
scripts/committer "MABOS: cache-backed capability gap query" \
  extensions/mabos/extensions-mabos/src/capability/gap-query.ts \
  extensions/mabos/extensions-mabos/src/capability/index.ts \
  extensions/mabos/extensions-mabos/src/ontology/vividwalls.jsonld
```

---

## Section C — Simulation Gate (Tasks 11–14)

### Task 11: Simulator types + Stakeholder reference impl

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/simulators/types.ts`
- Create: `extensions/mabos/extensions-mabos/src/simulators/stakeholder-simulator.ts`
- Create: `extensions/mabos/extensions-mabos/src/simulators/index.ts`

**Step 1: Write types**

```ts
// src/simulators/types.ts
export interface IntentionContext {
  agentId: string;
  intentionId: string;
  description: string;
  affectedSubjects: string[]; // arch:Subject IRIs
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
  appliesTo(ctx: IntentionContext): boolean;
  evaluate(ctx: IntentionContext): Promise<SimulatorVerdict>;
}
```

**Step 2: Write a minimal Stakeholder simulator (LLM-backed; the real prompt construction stays simple in v1)**

```ts
// src/simulators/stakeholder-simulator.ts
import type { Simulator, IntentionContext, SimulatorVerdict } from "./types";

export interface StakeholderConfig {
  llm: { complete(prompt: string): Promise<string> };
  persona: string; // "VividWalls collector segment lead"
}

const SYSTEM = (
  persona: string,
) => `You role-play ${persona}. Given a proposed agent intention, return:
APPROVED: yes|no
CONFIDENCE: 0.0-1.0
REACTION: one sentence describing your likely response
REASONING: one sentence`;

export function makeStakeholderSimulator(cfg: StakeholderConfig): Simulator {
  return {
    id: `stakeholder:${cfg.persona}`,
    appliesTo: (ctx) => Boolean(ctx.affectsPublicFacing) || (ctx.estimatedImpactUsd ?? 0) >= 1000,
    evaluate: async (ctx): Promise<SimulatorVerdict> => {
      const prompt = `${SYSTEM(cfg.persona)}\n\nProposed intention:\n${ctx.description}\nAffected: ${ctx.affectedSubjects.join(", ")}\nImpact: $${ctx.estimatedImpactUsd ?? 0}`;
      const out = await cfg.llm.complete(prompt);
      const approved = /APPROVED:\s*yes/i.test(out);
      const confMatch = out.match(/CONFIDENCE:\s*([\d.]+)/i);
      const reactMatch = out.match(/REACTION:\s*(.+)/i);
      const reasonMatch = out.match(/REASONING:\s*(.+)/i);
      return {
        approved,
        confidence: confMatch ? parseFloat(confMatch[1]) : 0.5,
        predictedReaction: reactMatch?.[1]?.trim() ?? "no reaction returned",
        reasoning: reasonMatch?.[1]?.trim() ?? "",
        simulatorId: `stakeholder:${cfg.persona}`,
      };
    },
  };
}
```

```ts
// src/simulators/index.ts
export * from "./types";
export * from "./stakeholder-simulator";
```

**Step 3: Verify build**

Run: `pnpm --filter @openclaw/mabos check` → PASS

**Step 4: Commit**

```bash
scripts/committer "MABOS: simulator interface + stakeholder reference impl" \
  extensions/mabos/extensions-mabos/src/simulators/types.ts \
  extensions/mabos/extensions-mabos/src/simulators/stakeholder-simulator.ts \
  extensions/mabos/extensions-mabos/src/simulators/index.ts
```

---

### Task 12: Simulator gate (high-stakes predicate + dispatch)

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/simulator-gate.ts`
- Test: `extensions/mabos/extensions-mabos/tests/simulator-gate.test.ts`

**Step 1: Failing test**

```ts
// tests/simulator-gate.test.ts
import { describe, it, expect, vi } from "vitest";
import { runSimulatorGate } from "../src/cognitive/assimilation/simulator-gate";

describe("runSimulatorGate", () => {
  it("approves when no simulator applies (low-stakes)", async () => {
    const sim = { id: "s1", appliesTo: () => false, evaluate: vi.fn() };
    const r = await runSimulatorGate(
      { agentId: "a", intentionId: "i", description: "low stakes", affectedSubjects: [] },
      [sim],
    );
    expect(r.approved).toBe(true);
    expect(sim.evaluate).not.toHaveBeenCalled();
  });

  it("rejects when an applicable simulator vetoes", async () => {
    const sim = {
      id: "s1",
      appliesTo: () => true,
      evaluate: async () => ({
        approved: false,
        confidence: 0.8,
        reasoning: "bad",
        predictedReaction: "outrage",
        simulatorId: "s1",
      }),
    };
    const r = await runSimulatorGate(
      {
        agentId: "a",
        intentionId: "i",
        description: "raise prices",
        affectedSubjects: [],
        estimatedImpactUsd: 5000,
        affectsPublicFacing: true,
      },
      [sim],
    );
    expect(r.approved).toBe(false);
    expect(r.verdicts).toHaveLength(1);
  });

  it("approves only when ALL applicable simulators approve", async () => {
    const sim1 = {
      id: "s1",
      appliesTo: () => true,
      evaluate: async () => ({
        approved: true,
        confidence: 0.9,
        reasoning: "",
        predictedReaction: "",
        simulatorId: "s1",
      }),
    };
    const sim2 = {
      id: "s2",
      appliesTo: () => true,
      evaluate: async () => ({
        approved: false,
        confidence: 0.6,
        reasoning: "",
        predictedReaction: "",
        simulatorId: "s2",
      }),
    };
    const r = await runSimulatorGate(
      {
        agentId: "a",
        intentionId: "i",
        description: "x",
        affectedSubjects: [],
        affectsPublicFacing: true,
      },
      [sim1, sim2],
    );
    expect(r.approved).toBe(false);
  });
});
```

**Step 2: Run → FAIL**

**Step 3: Implement**

```ts
// src/cognitive/assimilation/simulator-gate.ts
import type { Simulator, IntentionContext, SimulatorVerdict } from "../../simulators";

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
```

**Step 4: Run test → PASS**

**Step 5: Commit**

```bash
scripts/committer "MABOS: simulator gate dispatch (unanimous-approval semantics)" \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/simulator-gate.ts \
  extensions/mabos/extensions-mabos/tests/simulator-gate.test.ts
```

---

### Task 13: Add 4th check to validate.ts

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/validate.ts`
- Modify: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/types.ts`

**Step 1: Extend `ValidationResult` with simulator-veto reason**

```ts
// add to types.ts ValidationResult union:
| { ok: false; reason: "simulator-veto"; verdicts: SimulatorVerdict[] }
```

**Step 2: Extend ValidateCtx with simulators + intention extractor**

```ts
// validate.ts
import { runSimulatorGate } from "./simulator-gate";
import type { Simulator, IntentionContext } from "../../simulators";

export interface ValidateCtx {
  shape: ShapeNode;
  rules: Array<{
    id: string;
    ruleModality: string;
    modal?: string;
    condition: string;
    constrainsFact: string;
  }>;
  store: DeonticStore;
  simulators?: Simulator[]; // optional — only fires for intention facts
  intentionFromBound?: (b: Bound) => IntentionContext | null; // returns null for non-intention facts
}
```

**Step 3: Insert the 4th check (after deontic, before return)**

```ts
// existing checks 1-3 ...

// 4. Simulator gate — only for intention-shaped facts
if (ctx.simulators && ctx.intentionFromBound) {
  const ictx = ctx.intentionFromBound(b);
  if (ictx) {
    const gate = await runSimulatorGate(ictx, ctx.simulators);
    if (!gate.approved) {
      return { ok: false, reason: "simulator-veto", verdicts: gate.verdicts };
    }
  }
}

return { ok: true, validated: b };
```

**Step 4: Update assimilation orchestrator to route `simulator-veto` to quarantine, not reject**

In `src/cognitive/assimilation/index.ts`, in the validate-result switch:

```ts
const isHardFail = v.reason === "shacl";
const entry = qEntry(ctx, action, "validate", v.reason, v);
(isHardFail ? rejected : quarantined).push(entry);
```

`simulator-veto` is a soft fail (human review) — it's already routed to quarantine because only `shacl` is hard. No change needed.

**Step 5: Update existing validate tests to ensure they still pass**

```bash
pnpm --filter @openclaw/mabos test -- assimilation-validate
```

Expected: PASS (`simulators` is optional).

**Step 6: Commit**

```bash
scripts/committer "MABOS: simulator gate as 4th validate.ts check" \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/validate.ts \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/types.ts \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/index.ts
```

---

### Task 14: Wire simulators into build-ctx + add CFO stakeholder simulator config

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/build-ctx.ts`

**Step 1: Construct simulators in the assimilation context builder**

```ts
import { makeStakeholderSimulator } from "../../simulators";
import type { IntentionContext } from "../../simulators";

const stakeholderSim = makeStakeholderSimulator({
  llm: { complete: (p) => callLlm(api, "", p, { maxTokens: 256, temperature: 0.4 }) },
  persona: "VividWalls collector segment lead"
});

// in returned ctx:
simulators: [stakeholderSim],
intentionFromBound: (b) => {
  if (b.factTypeId !== "mabos:CommitsToFact") return null;
  return {
    agentId: input.agentId,
    intentionId: String(b.roles.intention),
    description: String(b.roles.description ?? ""),
    affectedSubjects: String(b.roles.affects ?? "").split(",").filter(Boolean),
    estimatedImpactUsd: Number(b.roles.impactUsd) || 0,
    affectsPublicFacing: String(b.roles.publicFacing ?? "").toLowerCase() === "true"
  } as IntentionContext;
}
```

**Step 2: Verify build**

Run: `pnpm --filter @openclaw/mabos check` → PASS.

**Step 3: Commit**

```bash
scripts/committer "MABOS: wire stakeholder simulator into assimilation context" \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/build-ctx.ts
```

---

## Section D — Cognitive Cycle Integration (Tasks 15–16)

### Task 15: Inject capability gap + blocking sub-goals into deliberative prompt

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts:608` (system + user prompt build)

**Step 1: Read current user-prompt construction**

Run: `sed -n '595,650p' extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts`

**Step 2: Add two prompt sections — populated from goal-net traversal + capability gap**

```ts
// near line ~640, before invoking callLlm:
import { loadGoalGraph, blockingSubgoals } from "../goal-net";
import { topMissingForAgent } from "../capability";

const goalsMd = await readMd(join(agentDir, "Goals.md"));
const troposJson = await readJson(join(workspaceDir, "tropos-goal-model.json")).catch(() => null);
const graph = await loadGoalGraph({ goalsMd, troposJson, agentId });

const blockers: string[] = [];
for (const node of graph.nodes.values()) {
  if (node.composite && node.status === "active") {
    const blocked = blockingSubgoals(graph, node.id);
    if (blocked.length)
      blockers.push(`${node.id} blocked by: ${blocked.map((s) => s.id).join(", ")}`);
  }
}

const activeGoalIds = [...graph.nodes.values()]
  .filter((n) => n.status === "active")
  .map((n) => n.id);
const missing = await topMissingForAgent(gapCache, agentId, activeGoalIds); // gapCache from build-ctx (amended Task 9)

const userPrompt = `## Triggering Signals (${signals.length})
${signalSummary}
... existing sections ...

## Blocking Sub-goals
${blockers.join("\n") || "none"}

## Capability Gap (top missing)
${missing.join("\n") || "none"}

## Methods
...`;
```

**Step 3: Run the existing cognitive-fixes test to ensure prompt-format changes don't break parsing**

```bash
pnpm --filter @openclaw/mabos test -- cognitive-fixes
```

Expected: PASS — sections are additive; the LLM section parser ([cognitive-router.ts:1018](../../extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts:1018)) reads BELIEF_UPDATES/GOAL_UPDATES/etc. from output, not input.

**Step 4: Commit**

```bash
scripts/committer "MABOS: inject blocking sub-goals + capability gap into deliberative prompt" \
  extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts
```

---

### Task 16: Add `goal-net-traversal` as a reasoning method

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/reasoning/methods.ts`

**Step 1: Locate the existing method registry**

Run: `grep -n "deontic\|deductive\|methods\b" extensions/mabos/extensions-mabos/src/reasoning/methods.ts | head -20`

**Step 2: Register a new method**

```ts
// Add an entry to the methods catalog:
{
  id: "goal-net-traversal",
  description: "Traverse the agent's goal graph; identify blocking sub-goals and unsatisfied composites",
  algorithmic: true,
  appliesWhen: (ctx) => ctx.signals.some(s => s.kind === "goal_progress" || s.kind === "goal_blocked"),
  invoke: async (ctx) => {
    const blockers = /* call blockingSubgoals on the loaded graph */;
    return { method: "goal-net-traversal", findings: blockers };
  }
}
```

**Step 3: Ensure `selectBestMethods()` will surface it under appropriate signals**

Run a quick sanity test:

```bash
pnpm --filter @openclaw/mabos test -- cognitive-fixes
```

Expected: PASS — new method is additive to the registry.

**Step 4: Commit**

```bash
scripts/committer "MABOS: register goal-net-traversal as a formal reasoning method" \
  extensions/mabos/extensions-mabos/src/reasoning/methods.ts
```

---

## Section E — Integration Test + Docs (Tasks 17–18)

### Task 17: VividWalls round-trip integration test

**Files:**

- Create: `extensions/mabos/extensions-mabos/tests/vividwalls-goal-net-roundtrip.test.ts`

**Step 1: Write the integration test exercising all three sections**

```ts
// tests/vividwalls-goal-net-roundtrip.test.ts
import { describe, it, expect, vi } from "vitest";
import { loadGoalGraph, blockingSubgoals, satisfactionRollup } from "../src/goal-net";
import { deriveGap } from "../src/capability";
import { makeStakeholderSimulator } from "../src/simulators";
import { runSimulatorGate } from "../src/cognitive/assimilation/simulator-gate";

describe("VividWalls G-VW-TRUST-003 round-trip", () => {
  const goalsMd = `### G-VW-TRUST-003: Provenance integrity
- **Status:** active
### G-VW-COA-001: Issue COA
- **Status:** active
- **Progress:** 100%
### G-VW-REG-001: Register edition
- **Status:** active
- **Progress:** 30%
### G-VW-NOTIFY-001: Notify gallery
- **Status:** active
- **Progress:** 0%
`;

  const tropos = {
    decompositions: [
      {
        parent: "G-VW-TRUST-003",
        relType: "all-of" as const,
        children: ["G-VW-COA-001", "G-VW-REG-001", "G-VW-NOTIFY-001"],
      },
    ],
  };

  it("identifies REG and NOTIFY as blockers and computes a capability gap including GalleryNotification", async () => {
    const g = await loadGoalGraph({ goalsMd, troposJson: tropos, agentId: "vw-cfo" });

    // satisfaction not set in fixtures — patch from progress for the test
    for (const n of g.nodes.values()) n.satisfaction = (n.progress ?? 0) / 100;

    const blockers = blockingSubgoals(g, "G-VW-TRUST-003").map((n) => n.id);
    expect(blockers).toEqual(expect.arrayContaining(["G-VW-REG-001", "G-VW-NOTIFY-001"]));
    expect(blockers).not.toContain("G-VW-COA-001");
    expect(satisfactionRollup(g, "G-VW-TRUST-003")).toBe(0.0); // min of 1.0, 0.3, 0.0

    const gap = await deriveGap("vw-cfo", "G-VW-TRUST-003", {
      requiredFor: async () => [
        { id: "cap:CertificateIssuance", label: "" },
        { id: "cap:EditionRegistry", label: "" },
        { id: "cap:GalleryNotification", label: "" },
      ],
      heldBy: async () => [
        { id: "cap:CertificateIssuance", label: "" },
        { id: "cap:EditionRegistry", label: "" },
      ],
    });
    expect(gap.missing.map((c) => c.id)).toEqual(["cap:GalleryNotification"]);
  });

  it("caches gaps and invalidates on belief.committed touching the goal", async () => {
    const { GapCache } = await import("../src/capability/gap-cache");
    const heldByMock = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "cap:CertificateIssuance", label: "" },
        { id: "cap:EditionRegistry", label: "" },
      ])
      .mockResolvedValueOnce([
        { id: "cap:CertificateIssuance", label: "" },
        { id: "cap:EditionRegistry", label: "" },
        { id: "cap:GalleryNotification", label: "" },
      ]);
    const catalog = {
      requiredFor: async () => [
        { id: "cap:CertificateIssuance", label: "" },
        { id: "cap:EditionRegistry", label: "" },
        { id: "cap:GalleryNotification", label: "" },
      ],
      heldBy: heldByMock,
    };
    const cache = GapCache.fromCatalog(catalog);

    const before = await cache.get("vw-cfo", "G-VW-TRUST-003");
    expect(before.missing.map((c) => c.id)).toEqual(["cap:GalleryNotification"]);

    // A second call hits cache — heldBy not called again
    await cache.get("vw-cfo", "G-VW-TRUST-003");
    expect(heldByMock).toHaveBeenCalledTimes(1);

    // Simulate a belief.committed event that adds the missing capability to vw-cfo
    cache.onBeliefCommitted({ touchedAgents: ["vw-cfo"] });

    const after = await cache.get("vw-cfo", "G-VW-TRUST-003");
    expect(after.missing).toEqual([]);
    expect(heldByMock).toHaveBeenCalledTimes(2);
  });

  it("blocks a high-impact intention when stakeholder simulator vetoes", async () => {
    const fakeLlm = {
      complete: vi
        .fn()
        .mockResolvedValue(
          "APPROVED: no\nCONFIDENCE: 0.85\nREACTION: collectors will demand refunds\nREASONING: trust impact too high",
        ),
    };
    const sim = makeStakeholderSimulator({ llm: fakeLlm, persona: "VividWalls collector lead" });
    const r = await runSimulatorGate(
      {
        agentId: "vw-cfo",
        intentionId: "I-001",
        description: "Delay COA issuance by 14 days for cost savings",
        affectedSubjects: ["vw:Edition/spring-bloom-3"],
        estimatedImpactUsd: 12000,
        affectsPublicFacing: true,
      },
      [sim],
    );
    expect(r.approved).toBe(false);
    expect(r.verdicts[0].predictedReaction).toContain("refunds");
  });
});
```

**Step 2: Run → PASS**

```bash
pnpm --filter @openclaw/mabos test -- vividwalls-goal-net-roundtrip
```

**Step 3: Commit**

```bash
scripts/committer "MABOS: VividWalls goal-net + capability-gap + simulator round-trip test" \
  extensions/mabos/extensions-mabos/tests/vividwalls-goal-net-roundtrip.test.ts
```

---

### Task 18: Docs + final verification

**Files:**

- Modify: `extensions/mabos/extensions-mabos/README.md`

**Step 1: Run full test suite**

```bash
pnpm --filter @openclaw/mabos test
```

Expected: all pass.

**Step 2: Run typecheck**

```bash
pnpm --filter @openclaw/mabos check
pnpm tsgo
```

Expected: PASS.

**Step 3: Add README sections**

Document:

- "Goal Net Topology" — what it is, how `tropos-goal-model.json` flows in, query API.
- "Capability Gap" — derivation timing (forward-chain on commit), how to query.
- "Simulator Gate" — when it fires (high-stakes predicate), how to add new simulators.

**Step 4: Commit**

```bash
scripts/committer "MABOS: document goal-net, capability gap, simulator gate" \
  extensions/mabos/extensions-mabos/README.md
```

**Step 5: Open PR**

Title: `MABOS: goal-net topology, capability-gap derivation, and stakeholder simulator gate`

PR body must include:

- Source-paper credits (Goal Net 2005, GenMentor 2025)
- Issue capture from §0 of this plan
- The VividWalls G-VW-TRUST-003 walkthrough
- Test summary
- Follow-ups: agent-from-goal-derivation, fine-tuned skill identifier, full Goal Net §3.3 reasoning

---

## Follow-up plans (do not start until this lands)

1. `2026-05-XX-agent-from-goal-derivation.md` — Goal Net §3.4.1 rules: derive multi-agent organization from the goal graph rather than hardcoding the C-suite template.
2. `2026-05-XX-skill-identifier-finetune.md` — GenMentor §4.1: a fine-tuned LLM `skill_identifier` that maps `Goal G → required_capabilities S'` via CoT-trained dataset, replacing the hand-curated `cap:RequiredCapability` links.
3. `2026-05-XX-goal-net-reasoning.md` — Goal Net §3.3: formal goal selection algorithms and action-selection-between-goals under observed conditions.
4. `2026-05-XX-customer-simulator.md` — second simulator persona for high-volume retail intentions.
5. `2026-05-XX-path-scheduler.md` — GenMentor §4.3: iterative refinement of `Plans.md` with simulator feedback loops, replacing the current single-shot plan generation.

Each follow-up references this plan's substrate — none should bypass the SHACL/deontic/simulator gate established here and in the assimilation pipeline.

---

## Sequencing note

If you want to land this incrementally inside this plan, the section order I'd take:

1. **Section A** (Goal Net topology) — pure data structures, no risk.
2. **Section C** (simulator gate) — additive 4th check; existing tests unaffected.
3. **Section B** (capability gap) — depends on goal-net for active-goal enumeration.
4. **Section D** (cognitive cycle integration) — wires all three into the deliberative prompt; feature-flag if landing in stages.
5. **Section E** (integration test + docs) — final.

Each section is independently shippable behind a no-op fallback (empty graph → no blockers; no simulators → unanimous approval; no gap store → empty gap). Land them as four PRs if review burden is high.
