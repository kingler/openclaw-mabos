import { describe, it, expect } from "vitest";
import { bind, type EntityResolver } from "../src/cognitive/assimilation/bind";

const known: Record<string, string> = {
  "Spring Bloom #3": "vw:Edition/spring-bloom-3",
};

const resolver: EntityResolver = {
  resolveOrMint: async (label, concept) => {
    if (known[label]) return { ok: true, iri: known[label] };
    if (concept === "vw:CertificateOfAuthenticity" || concept === "vw:ArtPrint") {
      return {
        ok: true,
        iri: `${concept}/${label.replace(/\s+/g, "-").toLowerCase()}`,
        minted: true,
      };
    }
    if (concept === "vw:Edition") return { ok: false, reason: "mint-denied" };
    return { ok: false, reason: "mint-denied" };
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

  it("propagates mint-failed when resolver returns mint-failed", async () => {
    const failingResolver: EntityResolver = {
      resolveOrMint: async () => ({ ok: false, reason: "mint-failed", cause: "db-down" }),
    };
    const r = await bind(
      {
        factTypeId: "vw:coaIssuanceFact",
        roles: { certificate: "COA-001", print: "p", edition: "Spring Bloom #3" },
        source: "pattern",
        confidence: 0.9,
      },
      failingResolver,
      factTypeIndex,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("mint-failed");
      if (r.reason === "mint-failed") expect(r.cause).toBe("db-down");
    }
  });
});
