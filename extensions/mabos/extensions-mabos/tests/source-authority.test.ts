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

  it("classifies stripe-sync as T1_API_VERIFIED", () => {
    expect(resolveAuthorityTier("stripe-sync-2026-03-28")).toBe(AuthorityTier.T1_API_VERIFIED);
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
