# Fact Store Integrity: Source Authority & Contradiction Detection

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent LLM-generated hallucinations from being persisted as authoritative facts by adding source authority tiers and automatic contradiction detection to the fact store.

**Architecture:** Add a `source_authority` module that classifies sources into tiers (T1 API-verified > T2 human-entered > T3 agent-inferred > T4 heartbeat/autonomous). On every `fact_assert`, check for existing facts with the same subject+predicate but different object — if the new fact comes from a lower-authority source, block it and return a conflict warning. Replace the current hardcoded financial predicate guard with this general-purpose system.

**Tech Stack:** TypeScript, Vitest, OpenClaw plugin SDK (`openclaw/plugin-sdk`), `@sinclair/typebox`

**VPS:** `kingler@100.79.202.93` (Tailscale SSH). All file paths are relative to `~/openclaw-mabos/extensions/mabos/extensions-mabos/`.

---

### Task 1: Source Authority Module

**Files:**

- Create: `src/tools/source-authority.ts`
- Test: `tests/source-authority.test.ts`

**Step 1: Write the failing tests**

Create `tests/source-authority.test.ts`:

```typescript
/**
 * Source authority tier resolution and conflict detection tests.
 */
import { describe, it, expect } from "vitest";
import {
  resolveAuthorityTier,
  AuthorityTier,
  detectContradiction,
  type Fact,
} from "../src/tools/source-authority.js";

describe("resolveAuthorityTier", () => {
  it("classifies shopify-sync as T1_API_VERIFIED", () => {
    expect(resolveAuthorityTier("shopify-sync-2026-03-23")).toBe(AuthorityTier.T1_API_VERIFIED);
  });

  it("classifies Shopify API as T1_API_VERIFIED", () => {
    expect(resolveAuthorityTier("Shopify API")).toBe(AuthorityTier.T1_API_VERIFIED);
  });

  it("classifies stripe- sources as T1_API_VERIFIED", () => {
    expect(resolveAuthorityTier("stripe-webhook-2026-03")).toBe(AuthorityTier.T1_API_VERIFIED);
  });

  it("classifies google-analytics as T1_API_VERIFIED", () => {
    expect(resolveAuthorityTier("google-analytics-sync")).toBe(AuthorityTier.T1_API_VERIFIED);
  });

  it("classifies sendgrid-api as T1_API_VERIFIED", () => {
    expect(resolveAuthorityTier("sendgrid-api-report")).toBe(AuthorityTier.T1_API_VERIFIED);
  });

  it("classifies stakeholder-input as T2_HUMAN_VERIFIED", () => {
    expect(resolveAuthorityTier("stakeholder-input")).toBe(AuthorityTier.T2_HUMAN_VERIFIED);
  });

  it("classifies manual-entry as T2_HUMAN_VERIFIED", () => {
    expect(resolveAuthorityTier("manual-entry")).toBe(AuthorityTier.T2_HUMAN_VERIFIED);
  });

  it("classifies ceo-directive as T2_HUMAN_VERIFIED", () => {
    expect(resolveAuthorityTier("ceo-directive")).toBe(AuthorityTier.T2_HUMAN_VERIFIED);
  });

  it("classifies bdi-cycle-observation as T3_AGENT_INFERRED", () => {
    expect(resolveAuthorityTier("bdi-cycle-observation")).toBe(AuthorityTier.T3_AGENT_INFERRED);
  });

  it("classifies agent-analysis as T3_AGENT_INFERRED", () => {
    expect(resolveAuthorityTier("agent-analysis")).toBe(AuthorityTier.T3_AGENT_INFERRED);
  });

  it("classifies heartbeat-tracking as T4_AUTONOMOUS", () => {
    expect(resolveAuthorityTier("heartbeat-tracking")).toBe(AuthorityTier.T4_AUTONOMOUS);
  });

  it("classifies bdi_heartbeat_metrics as T4_AUTONOMOUS", () => {
    expect(resolveAuthorityTier("bdi_heartbeat_metrics")).toBe(AuthorityTier.T4_AUTONOMOUS);
  });

  it("classifies enhanced_bdi_heartbeat as T4_AUTONOMOUS", () => {
    expect(resolveAuthorityTier("enhanced_bdi_heartbeat")).toBe(AuthorityTier.T4_AUTONOMOUS);
  });

  it("classifies autonomous-operation-tracking as T4_AUTONOMOUS", () => {
    expect(resolveAuthorityTier("autonomous-operation-tracking")).toBe(AuthorityTier.T4_AUTONOMOUS);
  });

  it("classifies q1-performance-tracking as T4_AUTONOMOUS", () => {
    expect(resolveAuthorityTier("q1-performance-tracking")).toBe(AuthorityTier.T4_AUTONOMOUS);
  });

  it("defaults unknown sources to T3_AGENT_INFERRED", () => {
    expect(resolveAuthorityTier("some-random-source")).toBe(AuthorityTier.T3_AGENT_INFERRED);
  });
});

describe("detectContradiction", () => {
  const baseFact: Fact = {
    id: "F-existing",
    subject: "vividwalls",
    predicate: "hasTotalRevenue",
    object: "3498",
    confidence: 1.0,
    source: "shopify-sync-2026-03-23",
    created_at: "2026-03-23T10:00:00Z",
    updated_at: "2026-03-23T10:00:00Z",
  };

  it("returns null when no existing facts match subject+predicate", () => {
    const result = detectContradiction([], "vividwalls", "hasTotalRevenue", "3498", "shopify-sync");
    expect(result).toBeNull();
  });

  it("returns null when same subject+predicate+object (no conflict)", () => {
    const result = detectContradiction(
      [baseFact],
      "vividwalls",
      "hasTotalRevenue",
      "3498",
      "shopify-sync-2026-03-26",
    );
    expect(result).toBeNull();
  });

  it("returns null when new source has higher authority", () => {
    const inferredFact = { ...baseFact, source: "heartbeat-tracking", object: "116400" };
    const result = detectContradiction(
      [inferredFact],
      "vividwalls",
      "hasTotalRevenue",
      "3498",
      "shopify-sync-2026-03-23",
    );
    expect(result).toBeNull();
  });

  it("blocks when new source has lower authority than existing", () => {
    const result = detectContradiction(
      [baseFact],
      "vividwalls",
      "hasTotalRevenue",
      "116400",
      "heartbeat-tracking",
    );
    expect(result).not.toBeNull();
    expect(result!.action).toBe("BLOCK");
    expect(result!.existingFact.id).toBe("F-existing");
  });

  it("returns WARN when sources have equal authority but values differ", () => {
    const result = detectContradiction(
      [baseFact],
      "vividwalls",
      "hasTotalRevenue",
      "5698",
      "shopify-sync-2026-03-24",
    );
    expect(result).not.toBeNull();
    expect(result!.action).toBe("WARN");
  });

  it("normalizes numeric object values for comparison", () => {
    const result = detectContradiction(
      [baseFact],
      "vividwalls",
      "hasTotalRevenue",
      "$3,498.00",
      "shopify-sync-2026-03-26",
    );
    expect(result).toBeNull();
  });

  it("uses most recent fact when multiple exist for same subject+predicate", () => {
    const olderFact = {
      ...baseFact,
      id: "F-older",
      object: "2812",
      updated_at: "2026-02-18T01:00:00Z",
    };
    const newerFact = {
      ...baseFact,
      id: "F-newer",
      object: "3498",
      updated_at: "2026-03-23T10:00:00Z",
    };
    const result = detectContradiction(
      [olderFact, newerFact],
      "vividwalls",
      "hasTotalRevenue",
      "116400",
      "heartbeat-tracking",
    );
    expect(result).not.toBeNull();
    expect(result!.existingFact.id).toBe("F-newer");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd ~/openclaw-mabos && pnpm vitest run extensions/mabos/extensions-mabos/tests/source-authority.test.ts`
Expected: FAIL — module `source-authority.js` does not exist

**Step 3: Write the implementation**

Create `src/tools/source-authority.ts`:

```typescript
/**
 * Source Authority — Tiered source classification and contradiction detection.
 *
 * Prevents low-authority sources (LLM heartbeats, autonomous processes) from
 * overwriting facts established by high-authority sources (API syncs, human input).
 *
 * Authority tiers:
 *   T1 — API-verified: direct integration data (Shopify, Stripe, GA, SendGrid)
 *   T2 — Human-verified: stakeholder input, manual entry, CEO directives
 *   T3 — Agent-inferred: BDI cycle observations, agent analysis, inference
 *   T4 — Autonomous: heartbeat tracking, autonomous operations, performance extrapolations
 */

export enum AuthorityTier {
  T1_API_VERIFIED = 1,
  T2_HUMAN_VERIFIED = 2,
  T3_AGENT_INFERRED = 3,
  T4_AUTONOMOUS = 4,
}

export type Fact = {
  id: string;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source: string;
  valid_from?: string;
  valid_until?: string;
  derived_from?: string[];
  rule_id?: string;
  created_at: string;
  updated_at: string;
};

export type ContradictionResult = {
  action: "BLOCK" | "WARN";
  existingFact: Fact;
  existingTier: AuthorityTier;
  incomingTier: AuthorityTier;
  message: string;
};

/** Patterns that classify a source string into an authority tier. */
const T1_PATTERNS = [
  "shopify-sync",
  "shopify-api",
  "shopify api",
  "stripe-",
  "stripe api",
  "google-analytics",
  "ga4-",
  "sendgrid-api",
  "sendgrid-sync",
  "apollo-api",
  "meta-api",
  "pinterest-api",
  "tiktok-api",
];

const T2_PATTERNS = [
  "stakeholder",
  "manual-entry",
  "human-verified",
  "ceo-directive",
  "cfo-report",
  "user-input",
];

const T4_PATTERNS = [
  "heartbeat",
  "autonomous-operation",
  "bdi_heartbeat",
  "enhanced_bdi",
  "performance-tracking",
  "q1-performance",
  "q2-performance",
  "q3-performance",
  "q4-performance",
];

export function resolveAuthorityTier(source: string): AuthorityTier {
  const s = source.toLowerCase();
  if (T1_PATTERNS.some((p) => s.includes(p))) return AuthorityTier.T1_API_VERIFIED;
  if (T2_PATTERNS.some((p) => s.includes(p))) return AuthorityTier.T2_HUMAN_VERIFIED;
  if (T4_PATTERNS.some((p) => s.includes(p))) return AuthorityTier.T4_AUTONOMOUS;
  return AuthorityTier.T3_AGENT_INFERRED;
}

/** Strip currency symbols, commas, and trailing decimals for numeric comparison. */
function normalizeNumericValue(value: string): string {
  const stripped = value.replace(/[$,]/g, "").trim();
  const num = parseFloat(stripped);
  if (!isNaN(num)) return String(num);
  return value.trim().toLowerCase();
}

/**
 * Check whether a new fact contradicts an existing fact.
 *
 * Returns null if no contradiction (safe to write).
 * Returns { action: "BLOCK" } if the incoming source is lower authority.
 * Returns { action: "WARN" } if sources have equal authority but values differ.
 */
export function detectContradiction(
  existingFacts: Fact[],
  subject: string,
  predicate: string,
  newObject: string,
  newSource: string,
): ContradictionResult | null {
  // Find existing facts with matching subject + predicate
  const matches = existingFacts.filter((f) => f.subject === subject && f.predicate === predicate);

  if (matches.length === 0) return null;

  // Use the most recently updated fact as the authoritative one
  const authoritative = matches.sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  )[0];

  // Check if values are the same (after normalization)
  const normalizedExisting = normalizeNumericValue(authoritative.object);
  const normalizedNew = normalizeNumericValue(newObject);
  if (normalizedExisting === normalizedNew) return null;

  const existingTier = resolveAuthorityTier(authoritative.source);
  const incomingTier = resolveAuthorityTier(newSource);

  // Higher tier number = lower authority
  if (incomingTier > existingTier) {
    return {
      action: "BLOCK",
      existingFact: authoritative,
      existingTier,
      incomingTier,
      message:
        `BLOCKED: Contradiction detected for (${subject}, ${predicate}). ` +
        `Existing value "${authoritative.object}" from T${existingTier} source "${authoritative.source}" ` +
        `conflicts with incoming "${newObject}" from T${incomingTier} source "${newSource}". ` +
        `Lower-authority source cannot overwrite higher-authority fact.`,
    };
  }

  if (incomingTier === existingTier) {
    return {
      action: "WARN",
      existingFact: authoritative,
      existingTier,
      incomingTier,
      message:
        `WARNING: Same-tier contradiction for (${subject}, ${predicate}). ` +
        `Existing: "${authoritative.object}" (${authoritative.source}), ` +
        `Incoming: "${newObject}" (${newSource}). ` +
        `Both are T${existingTier}. Newer value accepted but flagged for review.`,
    };
  }

  // Incoming is higher authority — no conflict, allow it
  return null;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd ~/openclaw-mabos && pnpm vitest run extensions/mabos/extensions-mabos/tests/source-authority.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
cd ~/openclaw-mabos
git add extensions/mabos/extensions-mabos/src/tools/source-authority.ts extensions/mabos/extensions-mabos/tests/source-authority.test.ts
git commit -m "feat(fact-store): add source authority tiers and contradiction detection"
```

---

### Task 2: Integrate Into fact_assert

**Files:**

- Modify: `src/tools/fact-store.ts` (lines 121-143 — replace the hardcoded financial guard)
- Test: `tests/fact-store-integrity.test.ts`

**Step 1: Write the failing test**

Create `tests/fact-store-integrity.test.ts`:

```typescript
/**
 * Fact store integrity tests — contradiction detection integration.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { createFactStoreTools } from "../src/tools/fact-store.js";

const WORKSPACE = "/tmp/mabos-fact-integrity-test";

function mockApi(): any {
  return {
    config: { agents: { defaults: { workspace: WORKSPACE } } },
    pluginConfig: {},
    logger: { info: () => {}, debug: () => {}, warn: () => {}, error: () => {} },
  };
}

async function setupStore(agentId: string, facts: any[] = []) {
  const dir = join(WORKSPACE, "agents", agentId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "facts.json"), JSON.stringify({ facts, version: 1 }));
}

async function readStore(agentId: string) {
  const raw = await readFile(join(WORKSPACE, "agents", agentId, "facts.json"), "utf-8");
  return JSON.parse(raw);
}

describe("fact_assert contradiction detection", () => {
  let tools: any[];
  let factAssert: any;

  beforeEach(async () => {
    await rm(WORKSPACE, { recursive: true, force: true });
    tools = createFactStoreTools(mockApi());
    factAssert = tools.find((t) => t.name === "fact_assert");
  });

  it("allows first assertion with no existing facts", async () => {
    await setupStore("ceo", []);
    const result = await factAssert.execute("test", {
      agent_id: "ceo",
      subject: "vividwalls",
      predicate: "hasTotalRevenue",
      object: "3498",
      confidence: 1.0,
      source: "shopify-sync-2026-03-23",
    });
    expect(result.content[0].text).toContain("asserted");
    const store = await readStore("ceo");
    expect(store.facts).toHaveLength(1);
  });

  it("blocks lower-authority source contradicting higher-authority fact", async () => {
    await setupStore("ceo", [
      {
        id: "F-existing",
        subject: "vividwalls",
        predicate: "hasTotalRevenue",
        object: "3498",
        confidence: 1.0,
        source: "shopify-sync-2026-03-23",
        created_at: "2026-03-23T10:00:00Z",
        updated_at: "2026-03-23T10:00:00Z",
      },
    ]);

    const result = await factAssert.execute("test", {
      agent_id: "ceo",
      subject: "vividwalls",
      predicate: "hasTotalRevenue",
      object: "116400",
      confidence: 1.0,
      source: "heartbeat-tracking",
    });
    expect(result.content[0].text).toContain("BLOCKED");

    // Verify original fact is unchanged
    const store = await readStore("ceo");
    expect(store.facts).toHaveLength(1);
    expect(store.facts[0].object).toBe("3498");
  });

  it("allows higher-authority source to update lower-authority fact", async () => {
    await setupStore("ceo", [
      {
        id: "F-existing",
        subject: "vividwalls",
        predicate: "hasTotalRevenue",
        object: "116400",
        confidence: 0.95,
        source: "heartbeat-tracking",
        created_at: "2026-03-21T20:00:00Z",
        updated_at: "2026-03-21T20:00:00Z",
      },
    ]);

    const result = await factAssert.execute("test", {
      agent_id: "ceo",
      subject: "vividwalls",
      predicate: "hasTotalRevenue",
      object: "3498",
      confidence: 1.0,
      source: "shopify-sync-2026-03-23",
    });
    expect(result.content[0].text).toContain("asserted");
  });

  it("warns on same-tier contradiction but still writes", async () => {
    await setupStore("ceo", [
      {
        id: "F-existing",
        subject: "vividwalls",
        predicate: "hasTotalRevenue",
        object: "3498",
        confidence: 1.0,
        source: "shopify-sync-2026-03-23",
        created_at: "2026-03-23T10:00:00Z",
        updated_at: "2026-03-23T10:00:00Z",
      },
    ]);

    const result = await factAssert.execute("test", {
      agent_id: "ceo",
      subject: "vividwalls",
      predicate: "hasTotalRevenue",
      object: "3598",
      confidence: 1.0,
      source: "shopify-sync-2026-03-26",
    });
    // Same-tier updates are allowed with a warning
    expect(result.content[0].text).toMatch(/WARNING|asserted/);
  });

  it("does not flag when object values are numerically equivalent", async () => {
    await setupStore("ceo", [
      {
        id: "F-existing",
        subject: "vividwalls",
        predicate: "hasTotalRevenue",
        object: "3498",
        confidence: 1.0,
        source: "shopify-sync-2026-03-23",
        created_at: "2026-03-23T10:00:00Z",
        updated_at: "2026-03-23T10:00:00Z",
      },
    ]);

    const result = await factAssert.execute("test", {
      agent_id: "ceo",
      subject: "vividwalls",
      predicate: "hasTotalRevenue",
      object: "$3,498.00",
      confidence: 1.0,
      source: "shopify-api-2026-03-26",
    });
    expect(result.content[0].text).not.toContain("BLOCKED");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd ~/openclaw-mabos && pnpm vitest run extensions/mabos/extensions-mabos/tests/fact-store-integrity.test.ts`
Expected: FAIL — current fact_assert has no contradiction detection

**Step 3: Replace the hardcoded guard with source authority integration**

In `src/tools/fact-store.ts`, make these changes:

1. Add import at the top (after line 18):

```typescript
import { resolveAuthorityTier, detectContradiction } from "./source-authority.js";
```

2. Replace lines 122-143 (the hardcoded `FINANCIAL_PREDICATES` guard) with:

```typescript
// ── Contradiction detection: check for conflicting facts ──
const store = await loadFacts(api, params.agent_id);
const contradiction = detectContradiction(
  store.facts,
  params.subject,
  params.predicate,
  params.object,
  params.source,
);

if (contradiction?.action === "BLOCK") {
  return textResult(contradiction.message);
}

let warning = "";
if (contradiction?.action === "WARN") {
  warning = `\n${contradiction.message}`;
}
```

3. Remove the duplicate `const store = await loadFacts(...)` line that was previously at line 145 (now redundant — we load it above).

4. Update the return statement at the end of the function (around line 202) to include the warning:

Change:

```typescript
return textResult(
  `Fact ${factId} ${existing !== -1 ? "updated" : "asserted"}: (${params.subject}, ${params.predicate}, ${params.object}) [confidence: ${params.confidence}]`,
);
```

To:

```typescript
return textResult(
  `Fact ${factId} ${existing !== -1 ? "updated" : "asserted"}: (${params.subject}, ${params.predicate}, ${params.object}) [confidence: ${params.confidence}]${warning}`,
);
```

**Step 4: Run all tests to verify they pass**

Run: `cd ~/openclaw-mabos && pnpm vitest run extensions/mabos/extensions-mabos/tests/fact-store-integrity.test.ts extensions/mabos/extensions-mabos/tests/source-authority.test.ts`
Expected: All tests PASS

**Step 5: Run existing tests to ensure no regressions**

Run: `cd ~/openclaw-mabos && pnpm vitest run extensions/mabos/extensions-mabos/tests/plugin.test.ts extensions/mabos/extensions-mabos/tests/domain-tools.test.ts`
Expected: All existing tests PASS

**Step 6: Commit**

```bash
cd ~/openclaw-mabos
git add extensions/mabos/extensions-mabos/src/tools/fact-store.ts extensions/mabos/extensions-mabos/tests/fact-store-integrity.test.ts
git commit -m "feat(fact-store): integrate contradiction detection into fact_assert

Replace hardcoded financial predicate guard with general-purpose
source authority system. Any fact assertion now checks for existing
contradictions and blocks lower-authority sources from overwriting
higher-authority facts."
```

---

### Task 3: Build, Deploy, Verify

**Files:**

- No new files — build and deploy changes from Tasks 1-2

**Step 1: Build the project**

Run: `cd ~/openclaw-mabos && export PATH=$HOME/.local/share/pnpm:$PATH && pnpm run build`
Expected: Clean build with no errors

**Step 2: Restart the gateway**

Run: `systemctl --user restart openclaw-gateway.service && sleep 5 && systemctl --user status openclaw-gateway.service --no-pager`
Expected: `active (running)`

**Step 3: Verify the guard works with a live test**

Simulate the exact scenario that caused the original corruption. Use the gateway dashboard or a direct WebSocket call to invoke `fact_assert` as the CEO agent:

```
Tool: fact_assert
Params: {
  agent_id: "ceo",
  subject: "vividwalls",
  predicate: "hasTotalRevenue",
  object: "999999",
  confidence: 1.0,
  source: "heartbeat-tracking"
}
```

Expected: Response contains `BLOCKED: Contradiction detected` — the T4 heartbeat source cannot overwrite the existing T1 shopify-sync fact.

**Step 4: Verify legitimate updates still work**

```
Tool: fact_assert
Params: {
  agent_id: "ceo",
  subject: "vividwalls",
  predicate: "hasTotalRevenue",
  object: "3600",
  confidence: 1.0,
  source: "shopify-sync-2026-03-28"
}
```

Expected: Response contains `asserted` or `updated` — T1 source can update T1 facts.

**Step 5: Commit the build artifacts**

```bash
cd ~/openclaw-mabos
git add -A
git commit -m "build: deploy fact store integrity system with source authority tiers"
```

---

### Task 4: Audit and Clean Existing Fact Stores

**Files:**

- No code changes — data cleanup across agent fact stores

**Step 1: Run an audit of all agent fact stores**

Write and run a one-time audit script that scans all agent `facts.json` files and flags:

- Facts from T4 sources (heartbeat/autonomous) that contradict T1 facts
- Duplicate subject+predicate entries with conflicting objects
- Facts with numeric-looking predicates (revenue, count, total) from non-API sources

```bash
ssh kingler@100.79.202.93 'python3 << "PYEOF"
import json, os, glob

workspace = os.path.expanduser("~/.openclaw/workspace")
fact_files = glob.glob(f"{workspace}/agents/*/facts.json") + \
             glob.glob(f"{workspace}/businesses/*/agents/*/facts.json")

T1_PATTERNS = ["shopify-sync", "shopify-api", "shopify api", "stripe-", "google-analytics", "sendgrid-api"]
T4_PATTERNS = ["heartbeat", "autonomous-operation", "bdi_heartbeat", "enhanced_bdi", "performance-tracking"]

def get_tier(source):
    s = source.lower()
    if any(p in s for p in T1_PATTERNS): return 1
    if any(p in s for p in T4_PATTERNS): return 4
    return 3

for fpath in sorted(fact_files):
    with open(fpath) as f:
        try:
            data = json.load(f)
        except:
            continue
    facts = data.get("facts", data) if isinstance(data, dict) else data
    if not isinstance(facts, list):
        continue

    # Group by subject+predicate
    groups = {}
    for fact in facts:
        key = (fact.get("subject", ""), fact.get("predicate", ""))
        groups.setdefault(key, []).append(fact)

    agent = fpath.split("/agents/")[-1].split("/")[0]
    issues = []
    for (subj, pred), group in groups.items():
        if len(group) < 2:
            continue
        objects = set(f["object"] for f in group)
        if len(objects) < 2:
            continue
        tiers = [(f["object"], f["source"], get_tier(f["source"])) for f in group]
        has_t1 = any(t == 1 for _, _, t in tiers)
        has_t4 = any(t == 4 for _, _, t in tiers)
        if has_t1 and has_t4:
            issues.append(f"  CONFLICT: ({subj}, {pred}) has T1 and T4 sources with different values:")
            for obj, src, tier in sorted(tiers, key=lambda x: x[2]):
                issues.append(f"    T{tier}: {obj} (source: {src})")

    if issues:
        print(f"\n{agent} ({len(facts)} facts):")
        for issue in issues:
            print(issue)

print("\nAudit complete.")
PYEOF'
```

Expected: Output showing any remaining T1/T4 conflicts (should be clean after our earlier data fix, but verify).

**Step 2: If conflicts found, remove T4 facts that contradict T1 facts**

Use `fact_retract` or a cleanup script to remove any remaining fabricated facts.

**Step 3: Commit any data fixes**

Only if cleanup was needed:

```bash
git commit -m "fix(data): remove remaining T4 fabricated facts contradicting T1 sources"
```
