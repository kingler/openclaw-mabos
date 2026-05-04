import { describe, it, expect } from "vitest";
import { deriveGap } from "../src/capability/gap-derivation.js";
import type { CapabilityCatalog } from "../src/capability/types.js";

const catalog: CapabilityCatalog = {
  requiredFor: async (goalId) =>
    goalId === "G-VW-TRUST-003"
      ? [
          { id: "cap:CertificateIssuance", label: "COA issuance" },
          { id: "cap:EditionRegistry", label: "Edition registry" },
          { id: "cap:GalleryNotification", label: "Gallery notification" },
        ]
      : [],
  heldBy: async (agentId) =>
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
    expect(typeof g.ts).toBe("string");
  });

  it("returns empty missing when agent holds all required capabilities", async () => {
    const fullCatalog: CapabilityCatalog = {
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

  it("returns empty missing when goal requires nothing", async () => {
    const g = await deriveGap("vw-cfo", "G-UNKNOWN", catalog);
    expect(g.missing).toEqual([]);
  });

  it("returns full set of required when agent holds nothing", async () => {
    const g = await deriveGap("phantom-agent", "G-VW-TRUST-003", catalog);
    expect(g.missing).toHaveLength(3);
  });
});
