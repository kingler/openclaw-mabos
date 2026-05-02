import { describe, it, expect } from "vitest";
import type { ShapeNode } from "../src/cognitive/assimilation/shacl-mini.js";
import { validate } from "../src/cognitive/assimilation/validate.js";
import type { DeonticRule, DeonticStore } from "../src/reasoning/formal/deontic.js";

const passingShape: ShapeNode = { targetClass: "any", properties: [] };

const okStore: DeonticStore = {
  countFacts: async () => 0,
  getProperty: async () => 0,
};

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
      { shape: passingShape, rules: [], store: okStore },
    );
    expect(r.ok).toBe(true);
  });

  it("fails on low confidence below pattern threshold", async () => {
    const r = await validate(
      {
        ok: true,
        factTypeId: "x",
        roles: {},
        confidence: 0.5,
        source: "pattern",
      },
      { shape: passingShape, rules: [], store: okStore },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("low-confidence");
      if (r.reason === "low-confidence") expect(r.threshold).toBe(0.85);
    }
  });

  it("uses a lower threshold for llm-sourced candidates", async () => {
    const r = await validate(
      { ok: true, factTypeId: "x", roles: {}, confidence: 0.75, source: "llm" },
      { shape: passingShape, rules: [], store: okStore },
    );
    expect(r.ok).toBe(true);
  });

  it("fails on SHACL violation", async () => {
    const shape: ShapeNode = {
      targetClass: "any",
      properties: [{ path: "role:edition", minCount: 1 }],
    };
    const r = await validate(
      {
        ok: true,
        factTypeId: "vw:editionMaxQuantityFact",
        roles: { qty: "50" },
        confidence: 0.9,
        source: "pattern",
      },
      { shape, rules: [], store: okStore },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("shacl");
  });

  it("fails on deontic violation", async () => {
    const rule: DeonticRule = {
      id: "test:rule",
      ruleModality: "deontic",
      modal: "prohibition",
      constrainsFact: "vw:coaIssuanceFact",
      condition: "always",
      predicate: { kind: "always" },
    };
    const r = await validate(
      {
        ok: true,
        factTypeId: "vw:coaIssuanceFact",
        roles: { certificate: "c", print: "p", edition: "e" },
        confidence: 0.9,
        source: "pattern",
      },
      { shape: passingShape, rules: [rule], store: okStore },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("deontic");
  });

  it("filters rules by constrainsFact before evaluating", async () => {
    const irrelevantRule: DeonticRule = {
      id: "test:rule",
      ruleModality: "deontic",
      modal: "prohibition",
      constrainsFact: "other:Fact",
      condition: "always",
      predicate: { kind: "always" },
    };
    const r = await validate(
      {
        ok: true,
        factTypeId: "vw:coaIssuanceFact",
        roles: {},
        confidence: 0.9,
        source: "pattern",
      },
      { shape: passingShape, rules: [irrelevantRule], store: okStore },
    );
    expect(r.ok).toBe(true);
  });
});
