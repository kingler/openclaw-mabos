import { describe, it, expect } from "vitest";
import {
  evaluateDeonticRule,
  type DeonticRule,
  type DeonticStore,
} from "../src/reasoning/formal/deontic";

const baseFact = {
  factTypeId: "vw:coaIssuanceFact",
  roles: {
    certificate: "vw:CertificateOfAuthenticity/coa-051",
    print: "vw:ArtPrint/sb-3-051",
    edition: "vw:Edition/spring-bloom-3",
  },
};

const noOverissuanceRule: DeonticRule = {
  id: "prin:NoOverissuance",
  ruleModality: "deontic",
  modal: "prohibition",
  constrainsFact: "vw:coaIssuanceFact",
  condition: "count of coa for edition >= edition.maxQuantity",
  predicate: {
    kind: "count_threshold",
    factTypeId: "vw:coaIssuanceFact",
    where: { edition: "$role:edition" },
    operator: "ge",
    threshold: {
      kind: "property",
      iri: "$role:edition",
      property: "vw:maxQuantity",
    },
  },
};

describe("evaluateDeonticRule", () => {
  it("flags violation when prohibition's predicate holds (count >= max)", async () => {
    const store: DeonticStore = {
      countFacts: async () => 50,
      getProperty: async () => 50,
    };
    const r = await evaluateDeonticRule(baseFact, noOverissuanceRule, store);
    expect(r.violated).toBe(true);
  });

  it("passes when prohibition's predicate does not hold (count < max)", async () => {
    const store: DeonticStore = {
      countFacts: async () => 46,
      getProperty: async () => 50,
    };
    const r = await evaluateDeonticRule(baseFact, noOverissuanceRule, store);
    expect(r.violated).toBe(false);
  });

  it("returns violated: false when rule has no structured predicate (NL only)", async () => {
    const ruleNoPredicate: DeonticRule = {
      id: "prin:Vague",
      ruleModality: "deontic",
      modal: "prohibition",
      constrainsFact: "vw:coaIssuanceFact",
      condition: "It is prohibited to do bad things",
    };
    const store: DeonticStore = {
      countFacts: async () => 999,
      getProperty: async () => 0,
    };
    const r = await evaluateDeonticRule(baseFact, ruleNoPredicate, store);
    expect(r.violated).toBe(false);
  });

  it("skips rules whose constrainsFact does not match the fact type", async () => {
    const r = await evaluateDeonticRule(
      baseFact,
      { ...noOverissuanceRule, constrainsFact: "other:Fact" },
      { countFacts: async () => 50, getProperty: async () => 50 },
    );
    expect(r.violated).toBe(false);
  });

  it("skips non-deontic modalities (alethic etc.)", async () => {
    const r = await evaluateDeonticRule(
      baseFact,
      { ...noOverissuanceRule, ruleModality: "alethic" },
      { countFacts: async () => 50, getProperty: async () => 50 },
    );
    expect(r.violated).toBe(false);
  });

  it("flags obligation violation when predicate does NOT hold", async () => {
    const obligationRule: DeonticRule = {
      id: "prin:MustHaveCertificate",
      ruleModality: "deontic",
      modal: "obligation",
      constrainsFact: "vw:coaIssuanceFact",
      condition: "every issued print must have at least one COA",
      predicate: {
        kind: "count_threshold",
        factTypeId: "vw:coaIssuanceFact",
        where: { print: "$role:print" },
        operator: "ge",
        threshold: { kind: "literal", value: 1 },
      },
    };
    const noCoa: DeonticStore = {
      countFacts: async () => 0,
      getProperty: async () => 0,
    };
    const r = await evaluateDeonticRule(baseFact, obligationRule, noCoa);
    expect(r.violated).toBe(true);
  });
});
