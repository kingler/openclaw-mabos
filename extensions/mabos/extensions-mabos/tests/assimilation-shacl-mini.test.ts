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
    expect(r.violations).toEqual([]);
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
    const paths = r.violations.map((v) => v.path);
    expect(paths).toContain("sbvr:definition");
    expect(paths).toContain("sbvr:vocabulary");
  });

  it("fails when a float is out of range", () => {
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

  it("enforces sh:in membership", () => {
    const shape: ShapeNode = {
      targetClass: "test:Thing",
      properties: [
        {
          path: "test:modality",
          minCount: 1,
          maxCount: 1,
          datatype: "xsd:string",
          in: ["alethic", "deontic"],
        },
      ],
    };
    const ok = validateAgainstShape({ "test:modality": "deontic" }, shape);
    const bad = validateAgainstShape({ "test:modality": "epistemic" }, shape);
    expect(ok.conforms).toBe(true);
    expect(bad.conforms).toBe(false);
    expect(bad.violations[0].kind).toBe("in");
  });

  it("treats array values via cardinality (maxCount)", () => {
    const shape: ShapeNode = {
      targetClass: "test:Thing",
      properties: [{ path: "test:tag", minCount: 1, maxCount: 1 }],
    };
    const r = validateAgainstShape({ "test:tag": ["a", "b"] }, shape);
    expect(r.conforms).toBe(false);
    expect(r.violations[0].kind).toBe("maxCount");
  });
});
