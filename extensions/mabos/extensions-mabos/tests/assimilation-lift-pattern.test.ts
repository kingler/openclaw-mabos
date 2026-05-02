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
    const templates = compileFactTemplates(factTypes);
    const c = liftByPattern("Spring Bloom #3 has maximum quantity 50", templates);
    expect(c).not.toBeNull();
    expect(c!.factTypeId).toBe("vw:editionMaxQuantityFact");
    expect(c!.roles).toEqual({ edition: "Spring Bloom #3", qty: 50 });
    expect(c!.source).toBe("pattern");
    expect(c!.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it("returns null for non-matching bullets", () => {
    const templates = compileFactTemplates(factTypes);
    expect(liftByPattern("Vibe is off this week", templates)).toBeNull();
  });

  it("trims surrounding whitespace from the bullet before matching", () => {
    const templates = compileFactTemplates(factTypes);
    const c = liftByPattern("   Spring Bloom #3 has maximum quantity 50   ", templates);
    expect(c).not.toBeNull();
    expect(c!.roles.edition).toBe("Spring Bloom #3");
  });
});
