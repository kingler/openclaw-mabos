# LLM-Output Assimilation Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire SBVR/SHACL/deontic validation into the path between LLM output and the formal knowledge layer, replacing unconditional Markdown writes with a five-stage gate (lift → bind → validate → commit) so hallucinated facts and unbound entities cannot poison agent beliefs.

**Architecture:** A new `cognitive/assimilation/` module sits between `parseLlmActions` and persistence in `cognitive-router.ts`. Each `LlmAction` flows through pattern-based lift → entity binding → SHACL + deontic validation → versioned commit with provenance. Failed actions go to a structured quarantine, not the agent's beliefs. TypeDB becomes the source of truth; Beliefs.md becomes a human-readable projection.

**Tech Stack:** TypeScript ESM, Vitest, TypeBox (schema), existing TypeDB driver (`typedb-driver-http`), existing `loadSBVRShapes()` / `mergeOntologies()` / `createDeonticTool()` from MABOS extension.

**Multi-tenant scope:** MABOS is a multi-tenant runtime. The business name and domain ontology are instantiation variables, not properties of MABOS. **VividWalls is one tenant** living under `businesses/vividwalls/` — used here only as a fixture for tests and walkthroughs. Other tenants share the same machinery via different domain ontologies (`ecommerce.jsonld`, `consulting.jsonld`, `retail.jsonld`, `saas.jsonld`, `marketplace.jsonld`, `cross-domain.jsonld`). All code in this plan must be tenant-agnostic; references to `vw-cfo`, `vividwalls.jsonld`, or `Spring Bloom #3` are **fixture, not architecture**. The `vocabulary-index`, `EntityResolver` mint policy, `NaryFactStore` path, deontic rule set, and quarantine path are all parameterised by `tenantId` / `tenantOntology` constructed in `build-ctx.ts` (Task 11).

---

## Amendment Log

**2026-05-02 — pre-execution wiring trace (G-VW-TRUST-003 round-trip).** Trace against the actual `inference-tools.ts` and `fact-store.ts` exposed two structural mismatches that this amendment addresses:

- **Finding A (medium)**: `EntityResolver.resolve` returns null for unknown labels, which would quarantine _every_ newly-introduced entity (e.g., a freshly-issued COA-048). Renamed to `resolveOrMint` with a per-concept mint policy in **Task 4**. New quarantine reasons: `unknown-mint-denied`, `mint-failed`.
- **Finding B (high)**: The existing `fact-store.ts` stores binary `(subject, predicate, object)` triples; SBVR n-ary fact types (e.g., 3-ary `vw:coaIssuanceFact`) have no storage adapter. Deontic checks that count fact occurrences (`prin:NoOverissuance`) cannot run without one. Inserted **Task 5.5: N-ary fact-store adapter** between SHACL (Task 5) and deontic (Task 6).

The trace also surfaced two findings that affect the goal-net plan instead — see `2026-05-02-goal-net-capability-gap-simulation.md` amendment log.

---

## 0. Issue Capture

### Problem statement

LLM output flows directly into `Beliefs.md` / `Goals.md` / `Intentions.md` without any validation against the SBVR ontology, SHACL shapes, or deontic rules that already exist in the codebase. The current path:

- [extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts:1055](../../extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts:1055) — `parseLlmActions` regex-extracts free-form bullets from `BELIEF_UPDATES:` / `GOAL_UPDATES:` / `NEW_INTENTIONS:` sections.
- [cognitive-router.ts:1122](../../extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts:1122) — `executeLlmActions` writes those bullets verbatim to Markdown files.
- [cognitive-router.ts:1472–1477](../../extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts:1472) — invocation point in the deliberative cycle.

### Evidence of risk

- The belief payload is `{ content: string }` only — no subject, no predicate, no fact-type binding, no provenance.
- `loadSBVRShapes()` exists at [src/ontology/index.ts:166](../../extensions/mabos/extensions-mabos/src/ontology/index.ts:166) but is never called from the cognitive router.
- `vw:editionMaxQuantityFact` and `prin:NoOverissuance` (once introduced) cannot enforce limits today because LLM-asserted facts skip the rule engine entirely.
- Goal progress regressions (`40% → 15%`) are silently accepted; hallucinated goal IDs would be written if the regex matched.
- Forward-chaining ([inference-tools.ts:68](../../extensions/mabos/extensions-mabos/src/tools/inference-tools.ts:68)) operates on unvalidated facts, propagating any LLM error.

### In scope (this plan)

The five-stage assimilation pipeline for `belief_update` actions, with `goal_progress` and `new_intention` following the same shape via parameterised fact types. Pattern-based lifter only (LLM-based lifter is a documented follow-up). Hand-rolled minimal SHACL subset validator for the constraints used in `shapes-sbvr.jsonld` (no new dependency).

### Out of scope (separate plans)

- TOGAF upper-ontology + ADM phase state machine — separate plan.
- Memory tier separation (episodic / semantic / procedural) — separate plan.
- Reflector loop implementation — depends on this plan landing first.
- Wiring `model-router` into `cognitive-router` — separate plan.
- Continuous belief revision via observation streams — separate plan, depends on this.

### Success criteria

- All `belief_update` actions either produce a structured fact in TypeDB with provenance OR land in `quarantine.jsonl` with a typed reason.
- A SHACL violation, an unbound role, or a deontic violation cannot reach `Beliefs.md`.
- Forward-chained derivations re-enter the gate (recursive validation).
- A VividWalls integration test demonstrates: one accepted fact, one quarantined fact (unliftable), one rejected fact (unbound entity).
- `Beliefs.md` continues to be readable for humans (projection only — no schema or path changes for human consumers).

### Non-goals (explicit)

- No change to the LLM provider wiring, model selection, or cost accounting.
- No change to the BDI cycle's prompt structure in v1 (Task 14 adds a non-breaking VOCABULARY hint).
- No retroactive validation of existing `Beliefs.md` content.

---

## Architecture diagram

```
LlmAction (current)                    LlmAction (after)
{ type, data: { content } }            { type, data: { content } }
       │                                       │
       ▼                                       ▼
executeLlmActions:1122          ┌─── assimilate (new orchestrator)
       │                        │            │
       ▼                        │   ┌────────┼────────┐
   Beliefs.md                   │  lift   bind   validate   commit
                                │   │        │        │         │
                                │   │        │        │         ├─ TypeDB (versioned)
                                │   │        │        │         ├─ Beliefs.md (projection)
                                │   │        │        │         └─ event bus
                                │   │        │        │
                                │   │        │        └── quarantine.jsonl  (typed reasons)
                                │   │        └─────────── quarantine.jsonl  (unbound role)
                                │   └──────────────────── quarantine.jsonl  (unliftable)
```

---

## File map (everything created or modified)

```
extensions/mabos/extensions-mabos/src/cognitive/assimilation/
  types.ts                         CREATE
  vocabulary-index.ts              CREATE
  lift-pattern.ts                  CREATE
  bind.ts                          CREATE
  shacl-mini.ts                    CREATE
  nary-store.ts                    CREATE  (added 2026-05-02 amendment — Task 5.5)
  deontic-check.ts                 CREATE
  validate.ts                      CREATE
  quarantine.ts                    CREATE
  commit.ts                        CREATE
  index.ts                         CREATE  (exports assimilate())

extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts
                                   MODIFY  (replace executeLlmActions call site only)

extensions/mabos/extensions-mabos/src/reasoning/formal/deontic.ts
                                   MODIFY  (extract pure evaluateDeonticRule from tool)

extensions/mabos/extensions-mabos/tests/
  assimilation-lift-pattern.test.ts          CREATE
  assimilation-bind.test.ts                  CREATE
  assimilation-shacl-mini.test.ts            CREATE
  assimilation-nary-store.test.ts            CREATE  (added 2026-05-02 amendment)
  assimilation-deontic-check.test.ts         CREATE
  assimilation-validate.test.ts              CREATE
  assimilation-commit.test.ts                CREATE
  assimilation-vividwalls-roundtrip.test.ts  CREATE  (integration)
```

Test command throughout: `pnpm --filter @openclaw/mabos test -- <test-file-name>` (or root-level `pnpm test`).

---

## Task 0: Scaffold the module

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/index.ts`

**Step 1: Create directory and placeholder index**

```ts
// src/cognitive/assimilation/index.ts
export {}; // populated by Task 11
```

**Step 2: Verify build still passes**

Run: `pnpm --filter @openclaw/mabos check`
Expected: PASS (no new files referenced yet).

**Step 3: Commit**

```bash
git add extensions/mabos/extensions-mabos/src/cognitive/assimilation/index.ts
scripts/committer "MABOS: scaffold assimilation module" extensions/mabos/extensions-mabos/src/cognitive/assimilation/index.ts
```

---

## Task 1: Type definitions

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/types.ts`

**Step 1: Write types**

```ts
// src/cognitive/assimilation/types.ts
import type { LlmAction } from "../../tools/cognitive-router";

export interface Candidate {
  factTypeId: string;
  roles: Record<string, unknown>;
  source: "pattern" | "llm";
  confidence: number;
}

export interface Bound {
  ok: true;
  factTypeId: string;
  roles: Record<string, string>; // values resolved to IRIs
  confidence: number;
  source: "pattern" | "llm";
}

export type BindFailure =
  | { ok: false; reason: "unknown-mint-denied"; role: string; value: unknown; concept: string }
  | {
      ok: false;
      reason: "mint-failed";
      role: string;
      value: unknown;
      concept: string;
      cause: string;
    };

export interface ValidatedBelief extends Bound {}

export type ValidationResult =
  | { ok: true; validated: ValidatedBelief }
  | { ok: false; reason: "shacl"; report: unknown }
  | { ok: false; reason: "deontic"; ruleId: string; witness: unknown }
  | { ok: false; reason: "low-confidence"; threshold: number };

export interface Provenance {
  run_id: string;
  model: string;
  prompt_hash: string;
  signal_ids: string[];
  ts: string;
  lift_source: "pattern" | "llm" | "derived";
  confidence: number;
}

export interface QuarantineEntry {
  ts: string;
  agent_id: string;
  action: LlmAction;
  stage: "lift" | "bind" | "validate";
  reason: string;
  detail?: unknown;
  run_id: string;
}

export interface AssimilationResult {
  accepted: ValidatedBelief[];
  quarantined: QuarantineEntry[];
  rejected: QuarantineEntry[]; // structurally invalid (e.g. SHACL hard fail)
}
```

**Step 2: Verify compiles**

Run: `pnpm --filter @openclaw/mabos check`
Expected: PASS.

**Step 3: Commit**

```bash
scripts/committer "MABOS: assimilation type definitions" extensions/mabos/extensions-mabos/src/cognitive/assimilation/types.ts
```

---

## Task 2: Vocabulary index — template compilation

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/vocabulary-index.ts`
- Test: `extensions/mabos/extensions-mabos/tests/assimilation-vocabulary-index.test.ts`

**Step 1: Write failing test**

```ts
// tests/assimilation-vocabulary-index.test.ts
import { describe, it, expect } from "vitest";
import { compileFactTemplates } from "../src/cognitive/assimilation/vocabulary-index";

describe("compileFactTemplates", () => {
  it("compiles a binary fact-type reading into a regex with named groups", () => {
    const factType = {
      id: "vw:editionMaxQuantityFact",
      reading: "edition has maximum quantity",
      arity: 2,
      roles: [
        { roleName: "edition", rolePlayer: "vw:Edition" },
        { roleName: "qty", rolePlayer: "xsd:integer" },
      ],
    };
    const [t] = compileFactTemplates([factType as any]);
    expect(t.factTypeId).toBe("vw:editionMaxQuantityFact");
    expect(t.roles).toEqual(["edition", "qty"]);
    const m = "Spring Bloom #3 has maximum quantity 50".match(t.pattern);
    expect(m?.groups?.edition).toBe("Spring Bloom #3");
    expect(m?.groups?.qty).toBe("50");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm --filter @openclaw/mabos test -- assimilation-vocabulary-index`
Expected: FAIL with "Cannot find module".

**Step 3: Implement compiler**

```ts
// src/cognitive/assimilation/vocabulary-index.ts
import type { SBVRFactTypeAnnotation } from "../../ontology";

export interface FactTemplate {
  factTypeId: string;
  roles: string[];
  pattern: RegExp;
  caster: Record<string, (s: string) => unknown>;
}

const INTEGER_PLAYERS = new Set(["xsd:integer", "xsd:int"]);
const FLOAT_PLAYERS = new Set(["xsd:float", "xsd:decimal", "xsd:double"]);

export function compileFactTemplates(
  factTypes: Array<SBVRFactTypeAnnotation & { id: string; reading: string }>,
): FactTemplate[] {
  return factTypes.map((ft) => {
    // "edition has maximum quantity" + roles=[edition, qty]
    // → /^(?<edition>.+?)\s+has\s+maximum\s+quantity\s+(?<qty>\S+)/i
    const tokens = ft.reading.split(/\s+/);
    const roleSet = new Set(ft.roles.map((r) => r.roleName));
    const parts: string[] = [];
    const seen = new Set<string>();
    for (const tok of tokens) {
      if (roleSet.has(tok) && !seen.has(tok)) {
        seen.add(tok);
        parts.push(`(?<${tok}>.+?)`);
      } else {
        parts.push(tok.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      }
    }
    // Roles not in the reading text get appended as trailing capture (common for n-ary)
    for (const r of ft.roles) {
      if (!seen.has(r.roleName)) parts.push(`(?<${r.roleName}>\\S+)`);
    }
    const pattern = new RegExp(`^${parts.join("\\s+")}\\s*$`, "i");

    const caster: Record<string, (s: string) => unknown> = {};
    for (const r of ft.roles) {
      if (INTEGER_PLAYERS.has(r.rolePlayer)) caster[r.roleName] = (s) => parseInt(s, 10);
      else if (FLOAT_PLAYERS.has(r.rolePlayer)) caster[r.roleName] = (s) => parseFloat(s);
      else caster[r.roleName] = (s) => s.trim();
    }

    return { factTypeId: ft.id, roles: ft.roles.map((r) => r.roleName), pattern, caster };
  });
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm --filter @openclaw/mabos test -- assimilation-vocabulary-index`
Expected: PASS.

**Step 5: Add edge-case test (n-ary, plural verb stem)**

Append to test file:

```ts
it("handles a 3-ary fact type with role appended after reading", () => {
  const ft = {
    id: "vw:coaIssuanceFact",
    reading: "certificate certifies print of edition",
    arity: 3,
    roles: [
      { roleName: "certificate", rolePlayer: "vw:CertificateOfAuthenticity" },
      { roleName: "print", rolePlayer: "vw:ArtPrint" },
      { roleName: "edition", rolePlayer: "vw:Edition" },
    ],
  };
  const [t] = compileFactTemplates([ft as any]);
  const m = "COA-001 certifies print of Spring Bloom #3".match(t.pattern);
  expect(m?.groups?.certificate).toBe("COA-001");
  expect(m?.groups?.edition).toBe("Spring Bloom #3");
});
```

Run test → PASS.

**Step 6: Commit**

```bash
scripts/committer "MABOS: compile SBVR fact-type readings into regex templates" \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/vocabulary-index.ts \
  extensions/mabos/extensions-mabos/tests/assimilation-vocabulary-index.test.ts
```

---

## Task 3: Pattern-based lifter

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/lift-pattern.ts`
- Test: `extensions/mabos/extensions-mabos/tests/assimilation-lift-pattern.test.ts`

**Step 1: Write failing test**

```ts
// tests/assimilation-lift-pattern.test.ts
import { describe, it, expect } from "vitest";
import { liftByPattern } from "../src/cognitive/assimilation/lift-pattern";
import { compileFactTemplates } from "../src/cognitive/assimilation/vocabulary-index";

const factTypes = [
  {
    id: "vw:editionMaxQuantityFact",
    reading: "edition has maximum quantity",
    arity: 2,
    roles: [
      { roleName: "edition", rolePlayer: "vw:Edition" },
      { roleName: "qty", rolePlayer: "xsd:integer" },
    ],
  },
];

describe("liftByPattern", () => {
  it("lifts a matching bullet into a candidate with cast roles", () => {
    const templates = compileFactTemplates(factTypes as any);
    const c = liftByPattern("Spring Bloom #3 has maximum quantity 50", templates);
    expect(c).not.toBeNull();
    expect(c!.factTypeId).toBe("vw:editionMaxQuantityFact");
    expect(c!.roles).toEqual({ edition: "Spring Bloom #3", qty: 50 });
    expect(c!.source).toBe("pattern");
    expect(c!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("returns null for non-matching bullets", () => {
    const templates = compileFactTemplates(factTypes as any);
    expect(liftByPattern("Vibe is off this week", templates)).toBeNull();
  });
});
```

**Step 2: Run test → FAIL (module not found)**

Run: `pnpm --filter @openclaw/mabos test -- assimilation-lift-pattern`

**Step 3: Implement**

```ts
// src/cognitive/assimilation/lift-pattern.ts
import type { Candidate } from "./types";
import type { FactTemplate } from "./vocabulary-index";

const PATTERN_CONFIDENCE = 0.9;

export function liftByPattern(bullet: string, templates: FactTemplate[]): Candidate | null {
  const text = bullet.trim();
  for (const t of templates) {
    const m = text.match(t.pattern);
    if (!m?.groups) continue;
    const roles: Record<string, unknown> = {};
    for (const r of t.roles) {
      const raw = m.groups[r];
      if (raw === undefined) return null;
      roles[r] = t.caster[r]?.(raw) ?? raw;
    }
    return { factTypeId: t.factTypeId, roles, source: "pattern", confidence: PATTERN_CONFIDENCE };
  }
  return null;
}
```

**Step 4: Run test → PASS**

**Step 5: Commit**

```bash
scripts/committer "MABOS: pattern-based fact lifter" \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/lift-pattern.ts \
  extensions/mabos/extensions-mabos/tests/assimilation-lift-pattern.test.ts
```

---

## Task 4: Bind stage (entity resolution with mint policy)

> **Amended 2026-05-02**: `resolve` → `resolveOrMint` with per-concept mint policy. Newly-introduced entities (e.g., `vw:CertificateOfAuthenticity`) are minted on first sight; entities that must pre-exist (e.g., `vw:Edition`) deny mint and quarantine. Without this, every new fact about a never-before-seen entity gets quarantined as `unbound-role`.

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/bind.ts`
- Modify: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/types.ts` (add `mint-failed` and `unknown-mint-denied` to `BindFailure`)
- Test: `extensions/mabos/extensions-mabos/tests/assimilation-bind.test.ts`

**Step 1: Extend `BindFailure` in types.ts**

```ts
export type BindFailure =
  | { ok: false; reason: "unknown-mint-denied"; role: string; value: unknown; concept: string }
  | {
      ok: false;
      reason: "mint-failed";
      role: string;
      value: unknown;
      concept: string;
      cause: string;
    };
```

(The original `unbound-role` reason is removed — every "unknown" outcome is now either denied-by-policy or mint-failed.)

**Step 2: Write failing test exercising both policies**

```ts
// tests/assimilation-bind.test.ts
import { describe, it, expect } from "vitest";
import { bind, type EntityResolver } from "../src/cognitive/assimilation/bind";

const known: Record<string, string> = {
  "Spring Bloom #3": "vw:Edition/spring-bloom-3",
};

const resolver: EntityResolver = {
  resolveOrMint: async (label, concept) => {
    if (known[label]) return { ok: true, iri: known[label] };
    // Mint policy: COAs and ArtPrints can be minted; Editions cannot
    if (concept === "vw:CertificateOfAuthenticity" || concept === "vw:ArtPrint") {
      return {
        ok: true,
        iri: `${concept}/${label.replace(/\s+/g, "-").toLowerCase()}`,
        minted: true,
      };
    }
    if (concept === "vw:Edition") return { ok: false, reason: "mint-denied" as const };
    return { ok: false, reason: "mint-denied" as const };
  },
};

const factTypeIndex = {
  rolePlayer: (factTypeId: string, role: string) => {
    if (factTypeId === "vw:coaIssuanceFact" && role === "certificate")
      return "vw:CertificateOfAuthenticity";
    if (factTypeId === "vw:coaIssuanceFact" && role === "print") return "vw:ArtPrint";
    if (factTypeId === "vw:coaIssuanceFact" && role === "edition") return "vw:Edition";
    if (role === "qty") return "xsd:integer";
    return "owl:Thing";
  },
};

describe("bind", () => {
  it("resolves a known edition without minting", async () => {
    const r = await bind(
      {
        factTypeId: "vw:coaIssuanceFact",
        roles: {
          certificate: "COA-048",
          print: "Spring Bloom #3 print 48",
          edition: "Spring Bloom #3",
        },
        source: "pattern",
        confidence: 0.9,
      },
      resolver,
      factTypeIndex,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.roles.edition).toBe("vw:Edition/spring-bloom-3");
  });

  it("mints a fresh COA on first sight (mint-allowed concept)", async () => {
    const r = await bind(
      {
        factTypeId: "vw:coaIssuanceFact",
        roles: {
          certificate: "COA-048",
          print: "Spring Bloom #3 print 48",
          edition: "Spring Bloom #3",
        },
        source: "pattern",
        confidence: 0.9,
      },
      resolver,
      factTypeIndex,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.roles.certificate).toBe("vw:CertificateOfAuthenticity/coa-048");
  });

  it("denies mint and quarantines for an unknown Edition (mint-denied concept)", async () => {
    const r = await bind(
      {
        factTypeId: "vw:coaIssuanceFact",
        roles: { certificate: "COA-099", print: "p", edition: "Phantom Edition X-12" },
        source: "pattern",
        confidence: 0.9,
      },
      resolver,
      factTypeIndex,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("unknown-mint-denied");
      expect(r.role).toBe("edition");
      expect(r.concept).toBe("vw:Edition");
    }
  });

  it("passes literal-typed roles (xsd:integer) through without resolution", async () => {
    const r = await bind(
      {
        factTypeId: "vw:editionMaxQuantityFact",
        roles: { edition: "Spring Bloom #3", qty: 50 },
        source: "pattern",
        confidence: 0.9,
      },
      resolver,
      { rolePlayer: (_ft, role) => (role === "edition" ? "vw:Edition" : "xsd:integer") },
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.roles.qty).toBe("50");
  });
});
```

**Step 3: Run test → FAIL**

**Step 4: Implement**

```ts
// src/cognitive/assimilation/bind.ts
import type { Candidate, Bound, BindFailure } from "./types";

export type ResolveResult =
  | { ok: true; iri: string; minted?: boolean }
  | { ok: false; reason: "mint-denied" | "mint-failed"; cause?: string };

export interface EntityResolver {
  resolveOrMint(label: string, concept: string): Promise<ResolveResult>;
}

export interface FactTypeIndex {
  rolePlayer(factTypeId: string, role: string): string;
}

const LITERAL_PLAYERS = /^xsd:/;

export async function bind(
  c: Candidate,
  resolver: EntityResolver,
  idx: FactTypeIndex,
): Promise<Bound | BindFailure> {
  const roles: Record<string, string> = {};
  for (const [role, value] of Object.entries(c.roles)) {
    const concept = idx.rolePlayer(c.factTypeId, role);
    if (LITERAL_PLAYERS.test(concept)) {
      roles[role] = String(value);
      continue;
    }
    const r = await resolver.resolveOrMint(String(value), concept);
    if (!r.ok) {
      if (r.reason === "mint-denied") {
        return { ok: false, reason: "unknown-mint-denied", role, value, concept };
      }
      return {
        ok: false,
        reason: "mint-failed",
        role,
        value,
        concept,
        cause: r.cause ?? "unknown",
      };
    }
    roles[role] = r.iri;
  }
  return { ok: true, factTypeId: c.factTypeId, roles, confidence: c.confidence, source: c.source };
}
```

**Step 5: Run test → PASS**

**Note for Task 11 (build-ctx)**: the production `EntityResolver` needs a concrete mint-policy table — recommended starting point:

```ts
const MINT_POLICY: Record<string, "allow" | "deny"> = {
  "vw:CertificateOfAuthenticity": "allow",
  "vw:ArtPrint": "allow",
  "vw:Order": "allow",
  "vw:Edition": "deny", // editions must be created via dedicated workflow
  "vw:Collector": "deny", // collectors come from auth/identity provider
  "mabos:Goal": "deny", // goals are explicit, never minted from belief text
  "mabos:Capability": "deny",
};
```

**Step 4: Run test → PASS**

**Step 6: Commit**

```bash
scripts/committer "MABOS: entity binding with mint-policy resolver" \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/bind.ts \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/types.ts \
  extensions/mabos/extensions-mabos/tests/assimilation-bind.test.ts
```

---

## Task 5: Minimal SHACL subset validator

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/shacl-mini.ts`
- Test: `extensions/mabos/extensions-mabos/tests/assimilation-shacl-mini.test.ts`

**Why hand-rolled:** `shapes-sbvr.jsonld` uses only `sh:minCount`, `sh:maxCount`, `sh:datatype`, `sh:minInclusive`, `sh:maxInclusive`, `sh:in`. Adding a full SHACL engine for this is overkill and pulls in a transitive dep tree.

**Step 1: Write failing test**

```ts
// tests/assimilation-shacl-mini.test.ts
import { describe, it, expect } from "vitest";
import { validateAgainstShape, type ShapeNode } from "../src/cognitive/assimilation/shacl-mini";

const NounConceptShape: ShapeNode = {
  targetClass: "sbvr:NounConcept",
  properties: [
    { path: "sbvr:designation", minCount: 1, maxCount: 1, datatype: "xsd:string" },
    { path: "sbvr:definition", minCount: 1, maxCount: 1, datatype: "xsd:string" },
    { path: "sbvr:vocabulary", minCount: 1, maxCount: 1, datatype: "xsd:string" },
  ],
};

describe("validateAgainstShape", () => {
  it("passes a complete noun concept", () => {
    const r = validateAgainstShape(
      {
        "@type": "sbvr:NounConcept",
        "sbvr:designation": "edition",
        "sbvr:definition": "A limited print run",
        "sbvr:vocabulary": "vividwalls",
      },
      NounConceptShape,
    );
    expect(r.conforms).toBe(true);
  });

  it("fails when a required property is missing", () => {
    const r = validateAgainstShape(
      {
        "@type": "sbvr:NounConcept",
        "sbvr:designation": "edition",
      },
      NounConceptShape,
    );
    expect(r.conforms).toBe(false);
    expect(r.violations.map((v) => v.path)).toContain("sbvr:definition");
  });

  it("fails when an integer is out of range", () => {
    const shape: ShapeNode = {
      targetClass: "sbvr:ProofEntry",
      properties: [
        {
          path: "sbvr:entryConfidence",
          minCount: 1,
          maxCount: 1,
          datatype: "xsd:float",
          minInclusive: 0,
          maxInclusive: 1,
        },
      ],
    };
    const r = validateAgainstShape({ "sbvr:entryConfidence": 1.5 }, shape);
    expect(r.conforms).toBe(false);
    expect(r.violations[0].kind).toBe("range");
  });
});
```

**Step 2: Run test → FAIL**

**Step 3: Implement**

```ts
// src/cognitive/assimilation/shacl-mini.ts
export interface PropertyConstraint {
  path: string;
  minCount?: number;
  maxCount?: number;
  datatype?: "xsd:string" | "xsd:integer" | "xsd:float" | "xsd:boolean";
  minInclusive?: number;
  maxInclusive?: number;
  in?: unknown[];
}

export interface ShapeNode {
  targetClass: string;
  properties: PropertyConstraint[];
}

export interface Violation {
  path: string;
  kind: "minCount" | "maxCount" | "datatype" | "range" | "in";
  message: string;
}

export interface ShaclResult {
  conforms: boolean;
  violations: Violation[];
}

function asArray(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function checkDatatype(v: unknown, dt: string): boolean {
  switch (dt) {
    case "xsd:string":
      return typeof v === "string";
    case "xsd:integer":
      return typeof v === "number" && Number.isInteger(v);
    case "xsd:float":
      return typeof v === "number";
    case "xsd:boolean":
      return typeof v === "boolean";
    default:
      return true;
  }
}

export function validateAgainstShape(node: Record<string, unknown>, shape: ShapeNode): ShaclResult {
  const violations: Violation[] = [];
  for (const p of shape.properties) {
    const values = asArray(node[p.path]);
    if (p.minCount !== undefined && values.length < p.minCount) {
      violations.push({
        path: p.path,
        kind: "minCount",
        message: `expected ≥${p.minCount}, got ${values.length}`,
      });
      continue;
    }
    if (p.maxCount !== undefined && values.length > p.maxCount) {
      violations.push({
        path: p.path,
        kind: "maxCount",
        message: `expected ≤${p.maxCount}, got ${values.length}`,
      });
    }
    for (const v of values) {
      if (p.datatype && !checkDatatype(v, p.datatype)) {
        violations.push({ path: p.path, kind: "datatype", message: `expected ${p.datatype}` });
      }
      if (typeof v === "number") {
        if (p.minInclusive !== undefined && v < p.minInclusive)
          violations.push({ path: p.path, kind: "range", message: `<${p.minInclusive}` });
        if (p.maxInclusive !== undefined && v > p.maxInclusive)
          violations.push({ path: p.path, kind: "range", message: `>${p.maxInclusive}` });
      }
      if (p.in && !p.in.includes(v))
        violations.push({ path: p.path, kind: "in", message: `not in {${p.in.join(",")}}` });
    }
  }
  return { conforms: violations.length === 0, violations };
}
```

**Step 4: Run test → PASS**

**Step 5: Commit**

```bash
scripts/committer "MABOS: minimal SHACL validator for shapes-sbvr.jsonld subset" \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/shacl-mini.ts \
  extensions/mabos/extensions-mabos/tests/assimilation-shacl-mini.test.ts
```

---

## Task 5.5: N-ary fact-store adapter

> **Added 2026-05-02**: The existing fact store at [src/tools/fact-store.ts:65–158](../../extensions/mabos/extensions-mabos/src/tools/fact-store.ts:65) stores binary `(subject, predicate, object)` triples. SBVR fact types are n-ary (e.g., 3-ary `vw:coaIssuanceFact` with roles `certificate`, `print`, `edition`). Without an adapter, deontic checks that count or aggregate over n-ary facts (e.g., `prin:NoOverissuance` requires `count(coas) for edition`) cannot run. This task introduces a parallel n-ary store; the existing binary store is unchanged.

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/nary-store.ts`
- Test: `extensions/mabos/extensions-mabos/tests/assimilation-nary-store.test.ts`

**Step 1: Write failing test**

```ts
// tests/assimilation-nary-store.test.ts
import { describe, it, expect } from "vitest";
import { NaryFactStore } from "../src/cognitive/assimilation/nary-store";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("NaryFactStore", () => {
  it("asserts and counts n-ary facts by role-value filter", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nary-"));
    const store = new NaryFactStore(join(dir, "nary.json"));
    await store.assertNary({
      factTypeId: "vw:coaIssuanceFact",
      roles: {
        certificate: "vw:CertificateOfAuthenticity/coa-001",
        print: "vw:ArtPrint/p1",
        edition: "vw:Edition/sb-3",
      },
      provenance: { run_id: "r1", ts: new Date().toISOString() },
    });
    await store.assertNary({
      factTypeId: "vw:coaIssuanceFact",
      roles: {
        certificate: "vw:CertificateOfAuthenticity/coa-002",
        print: "vw:ArtPrint/p2",
        edition: "vw:Edition/sb-3",
      },
      provenance: { run_id: "r1", ts: new Date().toISOString() },
    });
    await store.assertNary({
      factTypeId: "vw:coaIssuanceFact",
      roles: {
        certificate: "vw:CertificateOfAuthenticity/coa-003",
        print: "vw:ArtPrint/p3",
        edition: "vw:Edition/other-edition",
      },
      provenance: { run_id: "r1", ts: new Date().toISOString() },
    });
    const n = await store.countNary("vw:coaIssuanceFact", { edition: "vw:Edition/sb-3" });
    expect(n).toBe(2);
  });

  it("returns 0 when no facts match", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nary-"));
    const store = new NaryFactStore(join(dir, "nary.json"));
    expect(await store.countNary("vw:coaIssuanceFact", { edition: "vw:Edition/none" })).toBe(0);
  });

  it("queryNary returns matching n-tuples", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nary-"));
    const store = new NaryFactStore(join(dir, "nary.json"));
    await store.assertNary({
      factTypeId: "vw:coaIssuanceFact",
      roles: {
        certificate: "vw:CertificateOfAuthenticity/coa-001",
        print: "vw:ArtPrint/p1",
        edition: "vw:Edition/sb-3",
      },
      provenance: { run_id: "r1", ts: new Date().toISOString() },
    });
    const results = await store.queryNary("vw:coaIssuanceFact", { edition: "vw:Edition/sb-3" });
    expect(results).toHaveLength(1);
    expect(results[0].roles.certificate).toBe("vw:CertificateOfAuthenticity/coa-001");
  });

  it("dedupes on identical role tuples (same fact-type + same roles → one entry)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "nary-"));
    const store = new NaryFactStore(join(dir, "nary.json"));
    const fact = {
      factTypeId: "vw:coaIssuanceFact",
      roles: {
        certificate: "vw:CertificateOfAuthenticity/coa-001",
        print: "vw:ArtPrint/p1",
        edition: "vw:Edition/sb-3",
      },
      provenance: { run_id: "r1", ts: new Date().toISOString() },
    };
    await store.assertNary(fact);
    await store.assertNary(fact);
    expect(await store.countNary("vw:coaIssuanceFact", {})).toBe(1);
  });
});
```

**Step 2: Run test → FAIL**

Run: `pnpm --filter @openclaw/mabos test -- assimilation-nary-store`

**Step 3: Implement**

```ts
// src/cognitive/assimilation/nary-store.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

export interface NaryFact {
  id: string; // hash(factTypeId + sorted roles)
  factTypeId: string;
  roles: Record<string, string>;
  provenance: { run_id: string; ts: string; model?: string };
}

export interface NaryAssertion {
  factTypeId: string;
  roles: Record<string, string>;
  provenance: { run_id: string; ts: string; model?: string };
}

interface StoreShape {
  facts: NaryFact[];
  version: number;
}

function hash(factTypeId: string, roles: Record<string, string>): string {
  const sortedKeys = Object.keys(roles).sort();
  const tuple = sortedKeys.map((k) => `${k}=${roles[k]}`).join("|");
  return `${factTypeId}#${tuple}`;
}

export class NaryFactStore {
  constructor(private path: string) {}

  private async load(): Promise<StoreShape> {
    try {
      return JSON.parse(await readFile(this.path, "utf-8"));
    } catch {
      return { facts: [], version: 0 };
    }
  }

  private async save(s: StoreShape): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(s, null, 2), "utf-8");
  }

  async assertNary(a: NaryAssertion): Promise<{ id: string; action: "asserted" | "deduped" }> {
    const s = await this.load();
    const id = hash(a.factTypeId, a.roles);
    const existing = s.facts.findIndex((f) => f.id === id);
    if (existing !== -1) return { id, action: "deduped" };
    s.facts.push({ id, factTypeId: a.factTypeId, roles: a.roles, provenance: a.provenance });
    s.version++;
    await this.save(s);
    return { id, action: "asserted" };
  }

  async countNary(factTypeId: string, where: Partial<Record<string, string>>): Promise<number> {
    const s = await this.load();
    return s.facts.filter(
      (f) =>
        f.factTypeId === factTypeId && Object.entries(where).every(([k, v]) => f.roles[k] === v),
    ).length;
  }

  async queryNary(factTypeId: string, where: Partial<Record<string, string>>): Promise<NaryFact[]> {
    const s = await this.load();
    return s.facts.filter(
      (f) =>
        f.factTypeId === factTypeId && Object.entries(where).every(([k, v]) => f.roles[k] === v),
    );
  }
}
```

**Step 4: Run test → PASS**

**Step 5: Note for Task 6 (deontic-check)**: the `DeonticStore` interface in Task 6 is now backed by `NaryFactStore`:

```ts
// In build-ctx.ts (Task 11), the deontic store adapter:
const deonticStore: DeonticStore = {
  countFacts: (factTypeId, where) => naryStore.countNary(factTypeId, where),
  getProperty: async (iri, property) => {
    // Property lookup: query the singleton fact `(iri, property, ?value)` from the n-ary store
    const r = await naryStore.queryNary(`${property}Fact`, { subject: iri });
    return r[0]?.roles.value;
  },
};
```

**Step 6: Note for Task 9 (commit)**: the commit stage's `assertVersioned` call writes through to _both_ the binary fact-store (legacy projection, for inference-tools.ts pattern matching) and the n-ary store (canonical, for SBVR/deontic):

```ts
// commit.ts assertVersioned shape:
async assertVersioned(v: ValidatedBelief, p: Provenance) {
  await naryStore.assertNary({ factTypeId: v.factTypeId, roles: v.roles, provenance: p });
  // Optional: also project into binary fact-store if the fact type has a defined binary projection
  // (Out of scope for v1 — binary projection is a follow-up plan.)
}
```

**Step 7: Commit**

```bash
scripts/committer "MABOS: n-ary fact-store adapter with dedupe and role-filter queries" \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/nary-store.ts \
  extensions/mabos/extensions-mabos/tests/assimilation-nary-store.test.ts
```

---

## Task 6: Extract pure deontic-check from createDeonticTool

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/reasoning/formal/deontic.ts`
- Create: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/deontic-check.ts`
- Test: `extensions/mabos/extensions-mabos/tests/assimilation-deontic-check.test.ts`

**Background:** Today deontic logic is wrapped inside `createDeonticTool()` ([deontic.ts:43](../../extensions/mabos/extensions-mabos/src/reasoning/formal/deontic.ts:43)) — only invokable via the tool API. We need a pure `evaluateDeonticRule()` so the gate can call it synchronously without going through the agent tool loop.

**Step 1: Read the existing tool implementation**

```bash
cat extensions/mabos/extensions-mabos/src/reasoning/formal/deontic.ts
```

Identify the core evaluation logic (likely a function inside the `handler` of `createDeonticTool`). Plan to extract it into a top-level `evaluateDeonticRule(fact, rule, store): { violated: boolean; witness?: unknown }`.

**Step 2: Write a failing test for the extracted function**

```ts
// tests/assimilation-deontic-check.test.ts
import { describe, it, expect } from "vitest";
import { evaluateDeonticRule } from "../src/reasoning/formal/deontic";

describe("evaluateDeonticRule", () => {
  it("flags a prohibited COA issuance that would exceed edition quantity", async () => {
    const rule = {
      id: "prin:NoOverissuance",
      ruleModality: "deontic",
      ruleType: "behavioral",
      constrainsFact: "vw:coaIssuanceFact",
      condition: "count(coa for edition) >= edition.maxQuantity",
      modal: "prohibition",
    };
    const fact = {
      factTypeId: "vw:coaIssuanceFact",
      roles: {
        certificate: "COA-051",
        print: "ArtPrint/sb-3-051",
        edition: "vw:Edition/spring-bloom-3",
      },
    };
    const store = {
      countFacts: async () => 50,
      getProperty: async () => 50,
    };
    const result = await evaluateDeonticRule(fact as any, rule as any, store as any);
    expect(result.violated).toBe(true);
  });

  it("passes when issuance is within quantity", async () => {
    const rule = {
      id: "prin:NoOverissuance",
      ruleModality: "deontic",
      ruleType: "behavioral",
      constrainsFact: "vw:coaIssuanceFact",
      condition: "count(coa for edition) >= edition.maxQuantity",
      modal: "prohibition",
    };
    const fact = {
      factTypeId: "vw:coaIssuanceFact",
      roles: { certificate: "COA-047", print: "p", edition: "vw:Edition/sb-3" },
    };
    const store = { countFacts: async () => 46, getProperty: async () => 50 };
    const r = await evaluateDeonticRule(fact as any, rule as any, store as any);
    expect(r.violated).toBe(false);
  });
});
```

**Step 3: Run test → FAIL (export not found)**

**Step 4: Refactor `deontic.ts` to extract `evaluateDeonticRule`**

Move the evaluation logic out of the tool handler into a top-level export. Keep `createDeonticTool` as a thin wrapper that calls it. Pseudocode:

```ts
// src/reasoning/formal/deontic.ts
export interface DeonticStore {
  countFacts(factTypeId: string, where: Record<string, string>): Promise<number>;
  getProperty(iri: string, property: string): Promise<unknown>;
}

export interface DeonticEvaluation {
  violated: boolean;
  witness?: unknown;
}

export async function evaluateDeonticRule(
  fact: { factTypeId: string; roles: Record<string, string> },
  rule: {
    id: string;
    ruleModality: string;
    modal?: string;
    condition: string;
    constrainsFact: string;
  },
  store: DeonticStore,
): Promise<DeonticEvaluation> {
  if (rule.ruleModality !== "deontic") return { violated: false };
  if (rule.constrainsFact !== fact.factTypeId) return { violated: false };
  // Evaluate the condition expression against store + fact.
  // (Reuse whatever expression evaluator existed inside createDeonticTool;
  //  if only natural-language conditions exist today, gate this behind a
  //  structured `rule.predicate` field and skip rules without predicates.)
  // ...
  return { violated: false };
}

// Keep existing tool wrapper:
export function createDeonticTool(api: OpenClawPluginApi): AnyAgentTool {
  return {
    /* ... */
    handler: async (params) => {
      const r = await evaluateDeonticRule(params.fact, params.rule, params.store);
      return r;
    },
  };
}
```

**Note for the executing engineer:** if the existing tool only accepts natural-language conditions and does not yet have a structured predicate format, this refactor reveals a real gap — file a follow-up issue and have `evaluateDeonticRule` return `{ violated: false }` for rules without structured predicates. Validate works correctly without deontic enforcement; it just becomes structural-only until predicates are added.

**Step 5: Create the assimilation-side adapter**

```ts
// src/cognitive/assimilation/deontic-check.ts
import { evaluateDeonticRule, type DeonticStore } from "../../reasoning/formal/deontic";
import type { Bound } from "./types";

export async function deonticCheck(
  bound: Bound,
  rules: Array<{
    id: string;
    ruleModality: string;
    modal?: string;
    condition: string;
    constrainsFact: string;
  }>,
  store: DeonticStore,
): Promise<{ violated: false } | { violated: true; ruleId: string; witness: unknown }> {
  for (const rule of rules) {
    const r = await evaluateDeonticRule(bound, rule, store);
    if (r.violated) return { violated: true, ruleId: rule.id, witness: r.witness };
  }
  return { violated: false };
}
```

**Step 6: Run test → PASS**

**Step 7: Commit (two commits — refactor first, then new file)**

```bash
scripts/committer "MABOS: extract evaluateDeonticRule from tool handler" \
  extensions/mabos/extensions-mabos/src/reasoning/formal/deontic.ts \
  extensions/mabos/extensions-mabos/tests/assimilation-deontic-check.test.ts

scripts/committer "MABOS: deontic-check adapter for assimilation" \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/deontic-check.ts
```

---

## Task 7: Validate orchestrator

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/validate.ts`
- Test: `extensions/mabos/extensions-mabos/tests/assimilation-validate.test.ts`

**Step 1: Write failing test combining SHACL + deontic + confidence**

```ts
// tests/assimilation-validate.test.ts
import { describe, it, expect } from "vitest";
import { validate } from "../src/cognitive/assimilation/validate";

const passingShape = { targetClass: "any", properties: [] };

describe("validate", () => {
  it("returns ok when all checks pass", async () => {
    const r = await validate(
      {
        ok: true,
        factTypeId: "vw:editionMaxQuantityFact",
        roles: { edition: "vw:Edition/sb-3", qty: "50" },
        confidence: 0.9,
        source: "pattern",
      },
      { shape: passingShape, rules: [], store: {} as any },
    );
    expect(r.ok).toBe(true);
  });

  it("fails on low confidence below pattern threshold", async () => {
    const r = await validate(
      { ok: true, factTypeId: "x", roles: {}, confidence: 0.5, source: "pattern" },
      { shape: passingShape, rules: [], store: {} as any },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("low-confidence");
  });

  it("fails on deontic violation", async () => {
    const rule = {
      id: "test:rule",
      ruleModality: "deontic",
      modal: "prohibition",
      condition: "always",
      constrainsFact: "x",
    };
    const store = { countFacts: async () => 999, getProperty: async () => 0 };
    const r = await validate(
      { ok: true, factTypeId: "x", roles: {}, confidence: 0.9, source: "pattern" },
      { shape: passingShape, rules: [rule] as any, store: store as any },
    );
    // depends on evaluateDeonticRule returning violated=true for "always" condition;
    // adjust test once Task 6's predicate format is finalised
    expect(r.ok).toBe(false);
  });
});
```

**Step 2: Run test → FAIL**

**Step 3: Implement**

```ts
// src/cognitive/assimilation/validate.ts
import type { Bound, ValidationResult } from "./types";
import { validateAgainstShape, type ShapeNode } from "./shacl-mini";
import { deonticCheck } from "./deontic-check";
import type { DeonticStore } from "../../reasoning/formal/deontic";

const THRESHOLDS = { pattern: 0.85, llm: 0.7 } as const;

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
}

export async function validate(b: Bound, ctx: ValidateCtx): Promise<ValidationResult> {
  // 1. Confidence gate (cheapest first)
  const threshold = THRESHOLDS[b.source];
  if (b.confidence < threshold) {
    return { ok: false, reason: "low-confidence", threshold };
  }

  // 2. Structural — bound n-tuple as a JSON-LD-ish node against the shape
  const node: Record<string, unknown> = {
    "@type": b.factTypeId,
    ...Object.fromEntries(Object.entries(b.roles).map(([k, v]) => [`role:${k}`, v])),
  };
  const shacl = validateAgainstShape(node, ctx.shape);
  if (!shacl.conforms) return { ok: false, reason: "shacl", report: shacl.violations };

  // 3. Modal — deontic rules constraining this fact type
  const dr = await deonticCheck(
    b,
    ctx.rules.filter((r) => r.constrainsFact === b.factTypeId),
    ctx.store,
  );
  if (dr.violated) return { ok: false, reason: "deontic", ruleId: dr.ruleId, witness: dr.witness };

  return { ok: true, validated: b };
}
```

**Step 4: Run test → PASS**

**Step 5: Commit**

```bash
scripts/committer "MABOS: validate orchestrator (SHACL + deontic + confidence)" \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/validate.ts \
  extensions/mabos/extensions-mabos/tests/assimilation-validate.test.ts
```

---

## Task 8: Quarantine append-only store

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/quarantine.ts`

**Step 1: Implement (no failing test needed — pure I/O wrapper)**

```ts
// src/cognitive/assimilation/quarantine.ts
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { QuarantineEntry } from "./types";

export class QuarantineStore {
  constructor(private path: string) {}

  async append(entry: QuarantineEntry): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, JSON.stringify(entry) + "\n", "utf-8");
  }

  async appendAll(entries: QuarantineEntry[]): Promise<void> {
    for (const e of entries) await this.append(e);
  }
}
```

**Step 2: Verify build**

Run: `pnpm --filter @openclaw/mabos check` → PASS

**Step 3: Commit**

```bash
scripts/committer "MABOS: quarantine append-only jsonl store" \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/quarantine.ts
```

---

## Task 9: Commit stage

**Files:**

- Create: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/commit.ts`
- Test: `extensions/mabos/extensions-mabos/tests/assimilation-commit.test.ts`

**Step 1: Write failing test with fake stores**

```ts
// tests/assimilation-commit.test.ts
import { describe, it, expect, vi } from "vitest";
import { commit } from "../src/cognitive/assimilation/commit";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("commit", () => {
  it("writes to TypeDB, projects to Beliefs.md, and publishes an event", async () => {
    const dir = mkdtempSync(join(tmpdir(), "assim-"));
    const typedb = { assertVersioned: vi.fn().mockResolvedValue(undefined) };
    const bus = { publish: vi.fn().mockResolvedValue(undefined) };
    const validated = {
      ok: true as const,
      factTypeId: "vw:editionMaxQuantityFact",
      roles: { edition: "vw:Edition/sb-3", qty: "50" },
      confidence: 0.9,
      source: "pattern" as const,
    };
    const provenance = {
      run_id: "r1",
      model: "test",
      prompt_hash: "h",
      signal_ids: [],
      ts: "now",
      lift_source: "pattern" as const,
      confidence: 0.9,
    };
    await commit(validated, {
      agentDir: dir,
      typedb,
      bus,
      forwardChain: async () => [],
      rules: [],
    });
    expect(typedb.assertVersioned).toHaveBeenCalled();
    expect(bus.publish).toHaveBeenCalledWith(expect.objectContaining({ type: "belief.committed" }));
  });
});
```

**Step 2: Run test → FAIL**

**Step 3: Implement (forward-chain hook, recursive validation deferred to Task 11)**

```ts
// src/cognitive/assimilation/commit.ts
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import type { ValidatedBelief, Provenance } from "./types";

export interface CommitCtx {
  agentDir: string;
  typedb: { assertVersioned: (v: ValidatedBelief, p: Provenance) => Promise<void> };
  bus: {
    publish: (e: { type: string; fact: ValidatedBelief; provenance: Provenance }) => Promise<void>;
  };
  forwardChain: (v: ValidatedBelief) => Promise<ValidatedBelief[]>;
  rules: unknown[];
}

function renderBelief(v: ValidatedBelief, p: Provenance): string {
  const roleStr = Object.entries(v.roles)
    .map(([k, val]) => `${k}=${val}`)
    .join(", ");
  return `- [${v.factTypeId}] ${roleStr} (conf=${v.confidence.toFixed(2)}, src=${p.lift_source}, run=${p.run_id})`;
}

export async function commit(v: ValidatedBelief, ctx: CommitCtx, p?: Provenance): Promise<void> {
  const provenance: Provenance = p ?? {
    run_id: "unknown",
    model: "unknown",
    prompt_hash: "",
    signal_ids: [],
    ts: new Date().toISOString(),
    lift_source: v.source,
    confidence: v.confidence,
  };

  // 1. TypeDB versioned write (source of truth)
  await ctx.typedb.assertVersioned(v, provenance);

  // 2. Markdown projection
  await mkdir(ctx.agentDir, { recursive: true });
  const beliefsPath = join(ctx.agentDir, "Beliefs.md");
  let beliefs = "";
  try {
    beliefs = await readFile(beliefsPath, "utf-8");
  } catch {}
  if (!beliefs) beliefs = `# Beliefs\n\n## Current Beliefs\n`;
  if (!beliefs.includes("## Current Beliefs")) beliefs += "\n\n## Current Beliefs\n";
  const idx = beliefs.indexOf("## Current Beliefs");
  const insertAt = beliefs.indexOf("\n## ", idx + 20);
  const line = `\n${renderBelief(v, provenance)}`;
  beliefs =
    insertAt === -1 ? beliefs + line : beliefs.slice(0, insertAt) + line + beliefs.slice(insertAt);
  await writeFile(beliefsPath, beliefs, "utf-8");

  // 3. Event bus
  await ctx.bus.publish({ type: "belief.committed", fact: v, provenance });
}
```

**Step 4: Run test → PASS**

**Step 5: Commit**

```bash
scripts/committer "MABOS: commit stage with TypeDB write + Markdown projection" \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/commit.ts \
  extensions/mabos/extensions-mabos/tests/assimilation-commit.test.ts
```

---

## Task 10: assimilate orchestrator

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/index.ts`

**Step 1: Implement**

```ts
// src/cognitive/assimilation/index.ts
import type { LlmAction } from "../../tools/cognitive-router";
import type { AssimilationResult, Provenance, QuarantineEntry, ValidatedBelief } from "./types";
import { liftByPattern } from "./lift-pattern";
import { bind, type EntityResolver, type FactTypeIndex } from "./bind";
import { validate, type ValidateCtx } from "./validate";
import { commit, type CommitCtx } from "./commit";
import { QuarantineStore } from "./quarantine";
import type { FactTemplate } from "./vocabulary-index";

export interface AssimilationCtx extends CommitCtx, ValidateCtx {
  agentId: string;
  templates: FactTemplate[];
  resolver: EntityResolver;
  factTypeIndex: FactTypeIndex;
  quarantineStore: QuarantineStore;
  provenance: Omit<Provenance, "lift_source" | "confidence">;
}

export async function assimilate(
  actions: LlmAction[],
  ctx: AssimilationCtx,
): Promise<AssimilationResult> {
  const accepted: ValidatedBelief[] = [];
  const quarantined: QuarantineEntry[] = [];
  const rejected: QuarantineEntry[] = [];

  for (const action of actions) {
    if (action.type !== "belief_update") continue; // Tasks 12+ extend to goal/intention
    const bullet = String((action.data as { content: string }).content);

    const lifted = liftByPattern(bullet, ctx.templates);
    if (!lifted) {
      quarantined.push(qEntry(ctx, action, "lift", "unliftable"));
      continue;
    }

    const bound = await bind(lifted, ctx.resolver, ctx.factTypeIndex);
    if (!bound.ok) {
      quarantined.push(
        qEntry(ctx, action, "bind", bound.reason, { role: bound.role, value: bound.value }),
      );
      continue;
    }

    const v = await validate(bound, ctx);
    if (!v.ok) {
      const isHardFail = v.reason === "shacl";
      const entry = qEntry(ctx, action, "validate", v.reason, v);
      (isHardFail ? rejected : quarantined).push(entry);
      continue;
    }

    const provenance: Provenance = {
      ...ctx.provenance,
      lift_source: bound.source,
      confidence: bound.confidence,
    };
    await commit(v.validated, ctx, provenance);
    accepted.push(v.validated);

    // Recursive validation of derived facts
    const derived = await ctx.forwardChain(v.validated);
    for (const d of derived) {
      const dv = await validate(d, ctx);
      if (dv.ok) {
        await commit(dv.validated, ctx, { ...provenance, lift_source: "derived" });
        accepted.push(dv.validated);
      } else {
        quarantined.push(qEntry(ctx, action, "validate", `derived:${dv.reason}`, dv));
      }
    }
  }

  await ctx.quarantineStore.appendAll([...quarantined, ...rejected]);
  return { accepted, quarantined, rejected };
}

function qEntry(
  ctx: AssimilationCtx,
  action: LlmAction,
  stage: "lift" | "bind" | "validate",
  reason: string,
  detail?: unknown,
): QuarantineEntry {
  return {
    ts: new Date().toISOString(),
    agent_id: ctx.agentId,
    action,
    stage,
    reason,
    detail,
    run_id: ctx.provenance.run_id,
  };
}
```

**Step 2: Verify build**

Run: `pnpm --filter @openclaw/mabos check` → PASS

**Step 3: Commit**

```bash
scripts/committer "MABOS: assimilate orchestrator wiring all stages" \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/index.ts
```

---

## Task 11: Wire into cognitive-router

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts:1472–1477`

**Step 1: Read the call site to confirm exact context**

Run: `sed -n '1465,1490p' extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts`

**Step 2: Replace executeLlmActions invocation with assimilate**

Edit at the call site:

```ts
// before:
const llmActions = parseLlmActions(result.conclusion);
if (llmActions.length > 0) {
  const applied = await executeLlmActions(agentId, agentDir, workspaceDir, llmActions, log);
  log.info(`[cognitive-router] LLM actions applied: ${applied}/${llmActions.length}`);
}

// after:
const llmActions = parseLlmActions(result.conclusion);
if (llmActions.length > 0) {
  const ctx = await buildAssimilationCtx({
    agentId,
    agentDir,
    workspaceDir,
    runId: result.runId,
    model: result.model,
    promptHash: result.promptHash,
    signals: signals.map((s) => s.id),
    api,
  });
  const r = await assimilate(llmActions, ctx);
  log.info(
    `[cognitive-router] assimilate: accepted=${r.accepted.length} quarantined=${r.quarantined.length} rejected=${r.rejected.length}`,
  );
  // Keep executeLlmActions only for goal_progress + new_intention until Task 13 extends assimilate
  await executeLlmActions(
    agentId,
    agentDir,
    workspaceDir,
    llmActions.filter((a) => a.type !== "belief_update"),
    log,
  );
}
```

**Step 3: Implement `buildAssimilationCtx`**

Add a helper module:

```ts
// src/cognitive/assimilation/build-ctx.ts
import { join } from "node:path";
import { mergeOntologies, loadOntologies, loadSBVRShapes } from "../../ontology";
import { compileFactTemplates } from "./vocabulary-index";
import { QuarantineStore } from "./quarantine";
// ... import or define resolver + typedb adapter + bus stub

export async function buildAssimilationCtx(input: {
  agentId: string;
  agentDir: string;
  workspaceDir: string;
  runId: string;
  model: string;
  promptHash: string;
  signals: string[];
  api: unknown;
}) {
  const ontologies = loadOntologies();
  const merged = mergeOntologies(ontologies);
  const factTypes = merged.factTypes; // see ontology/index.ts for actual API
  const templates = compileFactTemplates(factTypes);
  // ... build resolver, factTypeIndex, store, bus, forwardChain
  return {
    agentId: input.agentId,
    agentDir: input.agentDir,
    templates,
    /* ... */
    provenance: {
      run_id: input.runId,
      model: input.model,
      prompt_hash: input.promptHash,
      signal_ids: input.signals,
      ts: new Date().toISOString(),
    },
    quarantineStore: new QuarantineStore(
      join(input.workspaceDir, ".quarantine", `${input.agentId}.jsonl`),
    ),
  };
}
```

**Note:** the executing engineer should follow imports in `ontology/index.ts` — `mergeOntologies` returns a `MergedGraph`, not a fact-type list directly; use `getFactTypesForConcept` or a similar query function. Stub TypeDB / resolver / bus with minimal in-memory implementations if real ones aren't yet available; a `// TODO(plan): wire real adapters` comment is acceptable for v1 as long as types line up.

**Step 4: Verify build**

Run: `pnpm --filter @openclaw/mabos check` → PASS

**Step 5: Run full test suite**

Run: `pnpm --filter @openclaw/mabos test`
Expected: existing tests continue to pass.

**Step 6: Commit**

```bash
scripts/committer "MABOS: wire assimilate into cognitive-router for belief_update" \
  extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/build-ctx.ts
```

---

## Task 12: VividWalls round-trip integration test

**Files:**

- Create: `extensions/mabos/extensions-mabos/tests/assimilation-vividwalls-roundtrip.test.ts`

**Step 1: Write the integration test**

```ts
// tests/assimilation-vividwalls-roundtrip.test.ts
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { assimilate } from "../src/cognitive/assimilation";
import { compileFactTemplates } from "../src/cognitive/assimilation/vocabulary-index";
import { QuarantineStore } from "../src/cognitive/assimilation/quarantine";

describe("VividWalls assimilation round-trip", () => {
  it("accepts a valid edition fact, quarantines an unliftable bullet, rejects an unbound entity", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vw-roundtrip-"));
    const factTypes = [
      {
        id: "vw:editionMaxQuantityFact",
        reading: "edition has maximum quantity",
        arity: 2,
        roles: [
          { roleName: "edition", rolePlayer: "vw:Edition" },
          { roleName: "qty", rolePlayer: "xsd:integer" },
        ],
      },
    ];
    const templates = compileFactTemplates(factTypes as any);
    const resolver = {
      resolve: async (label: string) =>
        label === "Spring Bloom #3" ? "vw:Edition/spring-bloom-3" : null,
    };
    const factTypeIndex = {
      rolePlayer: (_ft: string, role: string) =>
        role === "edition" ? "vw:Edition" : "xsd:integer",
    };
    const typedb = { assertVersioned: vi.fn().mockResolvedValue(undefined) };
    const bus = { publish: vi.fn().mockResolvedValue(undefined) };
    const quarantineStore = new QuarantineStore(join(dir, "quarantine.jsonl"));

    const actions = [
      {
        type: "belief_update" as const,
        data: { content: "Spring Bloom #3 has maximum quantity 50" },
      },
      { type: "belief_update" as const, data: { content: "Vibe is off this week" } },
      { type: "belief_update" as const, data: { content: "X-12 has maximum quantity 4" } },
    ];

    const r = await assimilate(actions, {
      agentId: "vw-cfo",
      agentDir: dir,
      templates,
      resolver,
      factTypeIndex,
      typedb,
      bus,
      quarantineStore,
      shape: { targetClass: "any", properties: [] },
      rules: [],
      store: { countFacts: async () => 0, getProperty: async () => 0 },
      forwardChain: async () => [],
      provenance: { run_id: "r1", model: "test", prompt_hash: "h", signal_ids: [], ts: "t" },
    });

    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0].roles.edition).toBe("vw:Edition/spring-bloom-3");
    expect(r.quarantined.map((q) => q.reason)).toEqual(
      expect.arrayContaining(["unliftable", "unbound-role"]),
    );
    expect(typedb.assertVersioned).toHaveBeenCalledTimes(1);
    expect(bus.publish).toHaveBeenCalledWith(expect.objectContaining({ type: "belief.committed" }));

    // Quarantine file contains both rejections
    const q = await readFile(join(dir, "quarantine.jsonl"), "utf-8");
    expect(q.split("\n").filter(Boolean)).toHaveLength(2);
  });
});
```

**Step 2: Run test → PASS**

Run: `pnpm --filter @openclaw/mabos test -- assimilation-vividwalls-roundtrip`
Expected: PASS.

**Step 3: Commit**

```bash
scripts/committer "MABOS: VividWalls assimilation round-trip integration test" \
  extensions/mabos/extensions-mabos/tests/assimilation-vividwalls-roundtrip.test.ts
```

---

## Task 13: Extend assimilate to goal_progress and new_intention

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/cognitive/assimilation/index.ts`

**Step 1: Add a small per-action-type handler**

Replace the `if (action.type !== "belief_update") continue;` block with a switch that:

- For `goal_progress`: bind `goalId` against the agent's `Goals.md` catalog (reject hallucinated G-IDs); validate `progress ∈ [0,100]` via SHACL; reject regressions unless flagged.
- For `new_intention`: bind to `mabos:Intention` fact type; validate that `commitsTo` resolves to an existing goal.

(Detailed code omitted here — the executing engineer follows the same lift→bind→validate→commit shape with a different fact-type set.)

**Step 2: Add tests for both action types**

Mirror Task 12 with goal_progress and new_intention scenarios.

**Step 3: Remove the legacy `executeLlmActions` filter from Task 11**

Delete the `.filter(a => a.type !== "belief_update")` carve-out so all three action types now flow through `assimilate`.

**Step 4: Run tests**

Run: `pnpm --filter @openclaw/mabos test`
Expected: all assimilation tests pass; existing cognitive-fixes test continues to pass.

**Step 5: Commit**

```bash
scripts/committer "MABOS: extend assimilate to goal_progress and new_intention" \
  extensions/mabos/extensions-mabos/src/cognitive/assimilation/index.ts \
  extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts \
  extensions/mabos/extensions-mabos/tests/assimilation-goal-progress.test.ts \
  extensions/mabos/extensions-mabos/tests/assimilation-new-intention.test.ts
```

---

## Task 14: Prompt-side multiplier (optional in v1, recommended)

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts:608` (system prompt)

**Step 1: Append a vocabulary hint to the system prompt**

After the existing `BELIEF_UPDATES:` instruction, add:

```
For each BELIEF_UPDATE bullet, prefer matching one of the agent's known fact types verbatim (e.g. "<edition> has maximum quantity <integer>"). Free-form bullets are accepted but may be quarantined for review.

KNOWN FACT TYPES FOR THIS AGENT:
${vocabularyHint}
```

Where `vocabularyHint` is generated from `compileFactTemplates(...)` — list each `reading` with role types.

**Step 2: Verify existing cognitive-fixes test still passes**

Run: `pnpm --filter @openclaw/mabos test -- cognitive-fixes`
Expected: PASS.

**Step 3: Commit**

```bash
scripts/committer "MABOS: vocabulary hint in deliberative system prompt" \
  extensions/mabos/extensions-mabos/src/tools/cognitive-router.ts
```

---

## Task 15: Final verification + docs

**Files:**

- Modify: `extensions/mabos/extensions-mabos/README.md` (add Assimilation Pipeline section)

**Step 1: Run full test suite**

Run: `pnpm --filter @openclaw/mabos test`
Expected: all tests pass.

**Step 2: Run typecheck**

Run: `pnpm --filter @openclaw/mabos check`
Expected: PASS.

**Step 3: Run repo-level checks**

Run: `pnpm tsgo` and `pnpm check`
Expected: PASS.

**Step 4: Add a brief README section**

Document:

- What the pipeline does (lift → bind → validate → commit)
- Where quarantine entries land (`<workspace>/.quarantine/<agent>.jsonl`)
- How to add a new fact type and have it become a tool surface (forward-link to follow-up plan)

**Step 5: Commit**

```bash
scripts/committer "MABOS: document assimilation pipeline" \
  extensions/mabos/extensions-mabos/README.md
```

**Step 6: Open PR**

Title: `MABOS: validate LLM output through SBVR/SHACL/deontic gate before persistence`

Body must include:

- Problem section (lifted from Issue Capture above)
- Architecture diagram
- Test summary (assimilation-\* + vividwalls-roundtrip)
- Manual verification steps
- Follow-ups: LLM-based lifter, model-router wiring, observation-stream belief revision, memory tier separation, TOGAF upper-ontology

---

## Follow-up plans (do not start until this lands)

1. `2026-05-XX-llm-lifter-fallback.md` — LLM lifter for unliftable bullets, with structured-output schema derived from candidate fact types.
2. `2026-05-XX-model-router-wiring.md` — replace direct fetch in `callLlm` with `model-router/resolver`.
3. `2026-05-XX-observation-stream.md` — continuous belief revision triggered by external observations (channels, webhooks).
4. `2026-05-XX-memory-tier-separation.md` — separate episodic / semantic / procedural stores under one query API.
5. `2026-05-XX-reflector-loop.md` — episodic→semantic consolidation, depends on (4).
6. `2026-05-XX-togaf-upper-ontology.md` — `arch:Subject` identity backbone + ADM phase state machine.

Each follow-up references the gate this plan establishes — none of them should bypass it.
