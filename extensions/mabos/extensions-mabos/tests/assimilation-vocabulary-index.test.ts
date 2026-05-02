import { describe, it, expect } from "vitest";
import { compileFactTemplates } from "../src/cognitive/assimilation/vocabulary-index.js";

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
    const [t] = compileFactTemplates([factType]);
    expect(t.factTypeId).toBe("vw:editionMaxQuantityFact");
    expect(t.roles).toEqual(["edition", "qty"]);
    const m = "Spring Bloom #3 has maximum quantity 50".match(t.pattern);
    expect(m?.groups?.edition).toBe("Spring Bloom #3");
    expect(m?.groups?.qty).toBe("50");
  });

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
    const [t] = compileFactTemplates([ft]);
    const m = "COA-001 certifies print of Spring Bloom #3".match(t.pattern);
    expect(m?.groups?.certificate).toBe("COA-001");
    expect(m?.groups?.edition).toBe("Spring Bloom #3");
  });

  it("casts xsd:integer roles via parseInt", () => {
    const factType = {
      id: "test:fact",
      reading: "thing has count",
      arity: 2,
      roles: [
        { roleName: "thing", rolePlayer: "test:Thing" },
        { roleName: "count", rolePlayer: "xsd:integer" },
      ],
    };
    const [t] = compileFactTemplates([factType]);
    expect(t.caster.count("42")).toBe(42);
    expect(t.caster.thing("abc")).toBe("abc");
  });
});
