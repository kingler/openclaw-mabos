import { describe, it, expect } from "vitest";
import { GapCache } from "../src/capability/gap-cache.js";
import { topMissingForAgent, gapForGoal } from "../src/capability/gap-query.js";
import type { CapabilityCatalog } from "../src/capability/types.js";

const catalog: CapabilityCatalog = {
  requiredFor: async (goalId) => {
    if (goalId === "G-VW-TRUST-003")
      return [
        { id: "cap:CertificateIssuance", label: "" },
        { id: "cap:EditionRegistry", label: "" },
        { id: "cap:GalleryNotification", label: "" },
      ];
    if (goalId === "G-VW-OPS-001")
      return [
        { id: "cap:GalleryNotification", label: "" },
        { id: "cap:Fulfillment", label: "" },
      ];
    return [];
  },
  heldBy: async (agentId) =>
    agentId === "vw-cfo"
      ? [
          { id: "cap:CertificateIssuance", label: "" },
          { id: "cap:EditionRegistry", label: "" },
        ]
      : [],
};

describe("topMissingForAgent", () => {
  it("ranks missing capabilities by how many active goals need them", async () => {
    const cache = GapCache.fromCatalog(catalog);
    const top = await topMissingForAgent(cache, "vw-cfo", ["G-VW-TRUST-003", "G-VW-OPS-001"]);
    // GalleryNotification missing for both goals → rank 1; Fulfillment for one
    expect(top[0]).toBe("cap:GalleryNotification");
    expect(top).toContain("cap:Fulfillment");
    expect(top).not.toContain("cap:CertificateIssuance"); // held
  });

  it("respects the limit", async () => {
    const cache = GapCache.fromCatalog(catalog);
    const top = await topMissingForAgent(cache, "vw-cfo", ["G-VW-TRUST-003", "G-VW-OPS-001"], 1);
    expect(top).toHaveLength(1);
    expect(top[0]).toBe("cap:GalleryNotification");
  });
});

describe("gapForGoal", () => {
  it("returns the missing capability ids for a single goal", async () => {
    const cache = GapCache.fromCatalog(catalog);
    const missing = await gapForGoal(cache, "vw-cfo", "G-VW-TRUST-003");
    expect(missing).toEqual(["cap:GalleryNotification"]);
  });

  it("returns empty when the agent holds everything the goal requires", async () => {
    const fullCatalog: CapabilityCatalog = {
      ...catalog,
      heldBy: async () => [
        { id: "cap:CertificateIssuance", label: "" },
        { id: "cap:EditionRegistry", label: "" },
        { id: "cap:GalleryNotification", label: "" },
      ],
    };
    const cache = GapCache.fromCatalog(fullCatalog);
    const missing = await gapForGoal(cache, "vw-cfo", "G-VW-TRUST-003");
    expect(missing).toEqual([]);
  });
});
