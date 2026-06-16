import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detectMissingFields, runEnrichment } from "../src/enrichment/enricher.js";
import { predictAndPrescribe } from "../src/enrichment/predictor.js";
import { enrichBusiness } from "../src/enrichment/service.js";
import { AssumptionStore } from "../src/enrichment/store.js";
import type { Assumption } from "../src/enrichment/types.js";
import { bayesUpdate, validateByEvidence, validateExplicit } from "../src/enrichment/validator.js";
import type { CompanyDNA, LlmCallFn } from "../src/gdc/types.js";

// Minimal plugin API stub: assertFactDirect only needs resolveWorkspaceDir(api),
// which reads config.workspaceDir. TypeDB write-through is best-effort and is a
// no-op here (no client available), so the JSON mirror is the source of truth.
function fakeApi(workspaceDir: string) {
  return { config: { workspaceDir } } as never;
}

function dna(overrides: Partial<CompanyDNA> = {}): CompanyDNA {
  return {
    business_description: "Acme sells widgets globally.",
    mission: "",
    vision: "",
    industry: "ecommerce",
    stage: "growth",
    revenue: "",
    team_size: 12,
    key_products: [],
    channels: [],
    constraints: [],
    ...overrides,
  };
}

const gapResponse: LlmCallFn = async () =>
  JSON.stringify([
    {
      field: "mission",
      value: "Make widgets delightful.",
      rationale: "industry norm",
      confidence: 0.7,
    },
    {
      field: "vision",
      value: "A widget on every desk.",
      rationale: "aspirational",
      confidence: 0.6,
    },
    {
      field: "key_products",
      value: ["Widget Pro", "Widget Lite"],
      rationale: "typical",
      confidence: 0.5,
    },
  ]);

describe("enricher", () => {
  it("detects empty/missing fields", () => {
    const missing = detectMissingFields(dna());
    expect(missing).toContain("mission");
    expect(missing).toContain("key_products");
    expect(missing).toContain("bmc.value_propositions");
  });

  it("infers only requested missing fields and leaves the original untouched", async () => {
    const original = dna();
    const out = await runEnrichment({
      businessId: "acme",
      companyDNA: original,
      callLlm: gapResponse,
      trigger: "manual",
      effort: "low",
      fields: ["mission", "vision", "key_products"],
    });
    expect(out.calledLlm).toBe(true);
    expect(out.assumptions).toHaveLength(3);
    expect(out.assumptions.every((a) => a.status === "assumed")).toBe(true);
    expect(out.enrichedDNA.mission).toBe("Make widgets delightful.");
    expect(out.enrichedDNA.key_products).toEqual(["Widget Pro", "Widget Lite"]);
    expect(original.mission).toBe(""); // original not mutated
  });

  it("skips the LLM entirely when nothing is missing", async () => {
    const full = dna({
      mission: "m",
      vision: "v",
      revenue: "$1M",
      key_products: ["p"],
      channels: ["web"],
      constraints: ["c"],
      bmc: {
        customer_segments: [{ title: "s", description: "d" }],
        value_propositions: [{ title: "v", description: "d" }],
        channels: [{ title: "c", description: "d" }],
        customer_relationships: [{ title: "r", description: "d" }],
        revenue_streams: [{ title: "rs", description: "d" }],
        key_resources: [{ title: "kr", description: "d" }],
        key_activities: [{ title: "ka", description: "d" }],
        key_partners: [{ title: "kp", description: "d" }],
        cost_structure: [{ title: "cs", description: "d" }],
      },
    });
    const spy = vi.fn(gapResponse);
    const out = await runEnrichment({
      businessId: "acme",
      companyDNA: full,
      callLlm: spy,
      trigger: "manual",
      effort: "low",
    });
    expect(spy).not.toHaveBeenCalled();
    expect(out.calledLlm).toBe(false);
    expect(out.assumptions).toHaveLength(0);
  });
});

describe("store (append-only + history)", () => {
  let ws: string;
  beforeEach(async () => {
    ws = await mkdtemp(join(tmpdir(), "mabos-enr-"));
  });
  afterEach(async () => {
    await rm(ws, { recursive: true, force: true });
  });

  function fakeAssumption(id: string): Assumption {
    const now = new Date().toISOString();
    return {
      id,
      business_id: "acme",
      field: "mission",
      value: "m",
      confidence: 0.5,
      rationale: "r",
      source: "llm_inference",
      status: "assumed",
      evidence: [],
      history: [],
      enrichment_id: "ENR-x",
      created_at: now,
      updated_at: now,
    };
  }

  it("appends records and bumps version", async () => {
    const store = new AssumptionStore(ws);
    const rec = {
      id: "ENR-1",
      business_id: "acme",
      trigger: "manual" as const,
      effort: "low",
      cost_usd: 0,
      inferred_fields: [],
      diffs: [],
      created_at: new Date().toISOString(),
    };
    await store.append("acme", [fakeAssumption("A-1")], rec);
    await store.append("acme", [fakeAssumption("A-2")], { ...rec, id: "ENR-2" });
    const file = await store.load("acme");
    expect(file.assumptions).toHaveLength(2);
    expect(file.records).toHaveLength(2);
    expect(file.version).toBe(2);
  });

  it("updateStatus appends to history without overwriting", async () => {
    const store = new AssumptionStore(ws);
    const rec = {
      id: "ENR-1",
      business_id: "acme",
      trigger: "manual" as const,
      effort: "low",
      cost_usd: 0,
      inferred_fields: [],
      diffs: [],
      created_at: new Date().toISOString(),
    };
    await store.append("acme", [fakeAssumption("A-1")], rec);
    const updated = await store.updateStatus("acme", "A-1", { status: "validated", by: "user" });
    expect(updated.status).toBe("validated");
    expect(updated.history).toHaveLength(1);
    expect(updated.history[0]).toMatchObject({ from: "assumed", to: "validated" });
  });
});

describe("validator", () => {
  let ws: string;
  beforeEach(async () => {
    ws = await mkdtemp(join(tmpdir(), "mabos-val-"));
  });
  afterEach(async () => {
    await rm(ws, { recursive: true, force: true });
  });

  it("bayesUpdate applies Bayes' rule", () => {
    expect(
      bayesUpdate(0.5, [
        { description: "e", source: "s", likelihood: 0.9, marginal: 0.5, observed_at: "" },
      ]),
    ).toBeCloseTo(0.9, 6);
  });

  async function seed(store: AssumptionStore): Promise<void> {
    const now = new Date().toISOString();
    await store.append(
      "acme",
      [
        {
          id: "A-1",
          business_id: "acme",
          field: "mission",
          value: "m",
          confidence: 0.5,
          rationale: "r",
          source: "llm_inference",
          status: "assumed",
          evidence: [],
          history: [],
          enrichment_id: "ENR-1",
          created_at: now,
          updated_at: now,
        },
      ],
      {
        id: "ENR-1",
        business_id: "acme",
        trigger: "manual",
        effort: "low",
        cost_usd: 0,
        inferred_fields: ["mission"],
        diffs: [],
        created_at: now,
      },
    );
  }

  it("explicit validate promotes to the knowledge-agent fact store; reject does not", async () => {
    const store = new AssumptionStore(ws);
    await seed(store);
    await validateExplicit(store, fakeApi(ws), "acme", "A-1", "validated");
    // Promotion routes through assertFactDirect → canonical agents/<role>/facts.json
    // (role-global "knowledge" agent, business carried as the SPO subject).
    const factsPath = join(ws, "agents", "knowledge", "facts.json");
    expect(existsSync(factsPath)).toBe(true);
    const facts = JSON.parse(await readFile(factsPath, "utf-8"));
    expect(facts.facts[0]).toMatchObject({ subject: "acme", predicate: "mission" });
  });

  it("evidence-based validation flips status across threshold", async () => {
    const store = new AssumptionStore(ws);
    await seed(store);
    const out = await validateByEvidence(store, fakeApi(ws), "acme", "A-1", [
      {
        description: "strong signal",
        source: "market",
        likelihood: 0.95,
        marginal: 0.5,
        observed_at: "",
      },
    ]);
    expect(out.posterior).toBeGreaterThanOrEqual(0.75);
    expect(out.assumption.status).toBe("validated");
    expect(out.transitioned).toBe(true);
  });
});

describe("predictor", () => {
  let ws: string;
  beforeEach(async () => {
    ws = await mkdtemp(join(tmpdir(), "mabos-pred-"));
  });
  afterEach(async () => {
    await rm(ws, { recursive: true, force: true });
  });

  it("gate=validated_only includes only validated assumptions; fast mode makes no LLM call", async () => {
    const store = new AssumptionStore(ws);
    const now = new Date().toISOString();
    await store.append(
      "acme",
      [
        {
          id: "A-1",
          business_id: "acme",
          field: "mission",
          value: "m",
          confidence: 0.9,
          rationale: "r",
          source: "llm_inference",
          status: "validated",
          evidence: [],
          history: [],
          enrichment_id: "ENR-1",
          created_at: now,
          updated_at: now,
        },
        {
          id: "A-2",
          business_id: "acme",
          field: "vision",
          value: "v",
          confidence: 0.4,
          rationale: "r",
          source: "llm_inference",
          status: "assumed",
          evidence: [],
          history: [],
          enrichment_id: "ENR-1",
          created_at: now,
          updated_at: now,
        },
      ],
      {
        id: "ENR-1",
        business_id: "acme",
        trigger: "manual",
        effort: "low",
        cost_usd: 0,
        inferred_fields: [],
        diffs: [],
        created_at: now,
      },
    );
    const result = await predictAndPrescribe({
      store,
      businessId: "acme",
      mode: "fast",
      gate: "validated_only",
    });
    expect(result.calledLlm).toBe(false);
    expect(result.basis).toMatchObject({ validated: 1, assumed: 1 });
    expect(result.predictions.bayesian).toHaveLength(1);
    expect(result.predictions.bayesian[0].derived_from).toBe("validated");
  });
});

describe("service.enrichBusiness", () => {
  let ws: string;
  beforeEach(async () => {
    ws = await mkdtemp(join(tmpdir(), "mabos-svc-"));
  });
  afterEach(async () => {
    await rm(ws, { recursive: true, force: true });
  });

  it("persists assumptions.json and rewrites company_dna.json", async () => {
    const store = new AssumptionStore(ws);
    const makeCallLlm = () => gapResponse;
    const out = await enrichBusiness({
      workspaceDir: ws,
      store,
      makeCallLlm,
      businessId: "acme",
      companyDNA: dna(),
      trigger: "manual",
      effort: "low",
      fields: ["mission", "vision", "key_products"],
    });
    expect(out.assumptions.length).toBe(3);
    expect(existsSync(join(ws, "businesses", "acme", "assumptions.json"))).toBe(true);
    const written = JSON.parse(
      await readFile(join(ws, "businesses", "acme", "company_dna.json"), "utf-8"),
    );
    expect(written.mission).toBe("Make widgets delightful.");
  });
});
