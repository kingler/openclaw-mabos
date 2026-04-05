import { describe, it, expect } from "vitest";
import { generatePersona, generatePersonaBatch } from "../src/gdc/persona-generator.js";
import type { DomainAgentSpec, CompanyDNA, LlmCallFn } from "../src/gdc/types.js";

const SAMPLE_SPEC: DomainAgentSpec = {
  id: "inventory-mgr",
  role: "Inventory Manager",
  description: "Manages product inventory, stock levels, and reorder processes",
  capabilities: ["inventory_tracking", "reorder_automation", "stock_forecasting"],
  reasoning_methods: ["statistical", "optimization"],
  terminal_desires: ["Optimal stock levels", "Zero stockouts", "Minimize carrying costs"],
  source: "industry",
};

const SAMPLE_DNA: CompanyDNA = {
  business_description: "E-commerce company selling artisan kitchen tools",
  mission: "Connect home cooks with beautifully crafted tools",
  vision: "Leading marketplace for artisan kitchen tools",
  industry: "E-commerce",
  stage: "Growth",
  revenue: "$2M ARR",
  team_size: 15,
  key_products: ["Chef knives", "Cutting boards", "Cookware"],
  channels: ["Shopify", "Amazon"],
  constraints: ["Limited warehouse space", "Seasonal demand fluctuations"],
};

const mockLlm: LlmCallFn = async () => {
  return `## Identity
**Inventory Manager** — Ensures optimal stock levels across all product lines.

## Core Responsibilities
- Monitor real-time inventory across all warehouses
- Automate reorder triggers based on demand forecasting
- Coordinate with fulfillment team on stock allocation
- Analyze seasonal demand patterns

## Decision Authority
- **Autonomous:** Reorder standard items below threshold
- **Escalate:** New supplier onboarding, bulk purchase >$10K

## Success Metrics
- Stockout rate < 2%
- Inventory turnover ratio > 6x
- Carrying cost < 15% of inventory value`;
};

describe("Persona Generator", () => {
  it("generates a persona with required sections", async () => {
    const persona = await generatePersona({
      agentSpec: SAMPLE_SPEC,
      companyDNA: SAMPLE_DNA,
      businessName: "Acme Widgets",
      coreAgentRoles: ["CEO", "COO", "CFO"],
      callLlm: mockLlm,
    });
    expect(persona).toContain("# Persona: Inventory Manager");
    expect(persona).toContain("inventory-mgr");
    expect(persona).toContain("Acme Widgets");
    expect(persona).toContain("Core Responsibilities");
  });

  it("generates batch personas with fallback on failure", async () => {
    let callCount = 0;
    const failSecondLlm: LlmCallFn = async (params) => {
      callCount++;
      if (callCount === 2) throw new Error("Rate limited");
      return mockLlm(params);
    };

    const results = await generatePersonaBatch({
      agentSpecs: [
        SAMPLE_SPEC,
        { ...SAMPLE_SPEC, id: "fulfillment-mgr", role: "Fulfillment Manager" },
      ],
      companyDNA: SAMPLE_DNA,
      businessName: "Acme",
      callLlm: failSecondLlm,
    });

    expect(results.size).toBe(2);
    expect(results.get("inventory-mgr")).toContain("Core Responsibilities");
    // Second one should be fallback
    expect(results.get("fulfillment-mgr")).toContain("Fulfillment Manager");
    expect(results.get("fulfillment-mgr")).toContain("Terminal Desires");
  });

  it("includes metadata header with timestamp and source", async () => {
    const persona = await generatePersona({
      agentSpec: SAMPLE_SPEC,
      companyDNA: SAMPLE_DNA,
      businessName: "Test Co",
      coreAgentRoles: ["CEO"],
      callLlm: mockLlm,
    });
    expect(persona).toMatch(/Generated: \d{4}-\d{2}-\d{2}/);
    expect(persona).toContain("Source: industry analysis");
  });
});
