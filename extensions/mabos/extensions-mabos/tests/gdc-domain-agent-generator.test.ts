import { describe, expect, it, vi } from "vitest";
import {
  generateDomainAgents,
  parseAgentResponse,
  validateAgents,
} from "../src/gdc/domain-agent-generator.js";
import type { CompanyDNA, DomainAgentSpec, LlmCallFn, Stage1Output } from "../src/gdc/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockCompanyDNA: CompanyDNA = {
  business_description: "Online store selling artisan widgets globally",
  mission: "Make widgets accessible to everyone",
  vision: "Global widget marketplace leader by 2030",
  industry: "e-commerce",
  stage: "growth",
  revenue: "$2M ARR",
  team_size: 15,
  key_products: ["Premium Widgets", "Widget Subscriptions"],
  channels: ["website", "mobile-app"],
  constraints: ["limited engineering bandwidth"],
};

const mockStage1: Stage1Output = {
  goals: [
    {
      id: "RG-001",
      statement: "Increase monthly revenue by 30%",
      type: "achieve",
      conditions: ["revenue >= 1.3x baseline"],
      timeframe: "6 months",
      priority: 1,
      strategic_alignment: "Revenue growth",
      kpi_metric: "monthly_revenue",
      kpi_target: "$260K",
      category: "revenue",
    },
    {
      id: "OG-001",
      statement: "Reduce order fulfillment time to under 24h",
      type: "maintain",
      conditions: ["avg_fulfillment_time < 24h"],
      timeframe: "3 months",
      priority: 2,
      strategic_alignment: "Operational excellence",
      kpi_metric: "fulfillment_time_hours",
      kpi_target: "24",
      category: "operations",
    },
  ],
  metadata: {
    company_name: "Widget Co",
    industry: "e-commerce",
    generated_at: "2026-04-05T00:00:00Z",
    model_used: "claude-sonnet-4-6",
  },
};

const ECOMMERCE_AGENTS: DomainAgentSpec[] = [
  {
    id: "inventory-mgr",
    role: "Inventory Manager",
    description: "Manages stock levels and reorder points",
    capabilities: ["stock_tracking", "reorder_automation"],
    reasoning_methods: ["threshold_monitoring"],
    terminal_desires: ["optimal_stock_levels"],
    source: "industry",
  },
  {
    id: "fulfillment-mgr",
    role: "Fulfillment Manager",
    description: "Oversees order fulfillment pipeline",
    capabilities: ["order_routing", "shipping_optimization"],
    reasoning_methods: ["constraint_satisfaction"],
    terminal_desires: ["sub_24h_fulfillment"],
    source: "goal_analysis",
  },
  {
    id: "product-mgr",
    role: "Product Manager",
    description: "Manages product catalog and pricing",
    capabilities: ["catalog_management", "price_optimization"],
    reasoning_methods: ["market_analysis"],
    terminal_desires: ["revenue_maximization"],
    source: "bmc",
  },
];

function makeLlmMock(response: string): LlmCallFn {
  return vi.fn().mockResolvedValue(response);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GDC Domain Agent Generator", () => {
  describe("generateDomainAgents", () => {
    it("generates domain agents from LLM response", async () => {
      const callLlm = makeLlmMock(JSON.stringify(ECOMMERCE_AGENTS));

      const result = await generateDomainAgents({
        companyDNA: mockCompanyDNA,
        stage1Goals: mockStage1,
        toolInventory: ["shopify_api", "stripe_api"],
        callLlm,
      });

      expect(result).toHaveLength(3);
      expect(result[0].id).toBe("inventory-mgr");
      expect(result[1].id).toBe("fulfillment-mgr");
      expect(result[2].id).toBe("product-mgr");

      // Verify LLM was called with correct params
      expect(callLlm).toHaveBeenCalledOnce();
      const call = (callLlm as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Default routes to the task-execution model (see dual-model routing, 55e219d647).
      expect(call.model).toBe("gpt-5.4");
      expect(call.temperature).toBe(0.3);
      expect(call.maxTokens).toBe(4096);
    });

    it("filters out agents that conflict with core agent IDs", async () => {
      const agentsWithConflict: DomainAgentSpec[] = [
        ...ECOMMERCE_AGENTS,
        {
          id: "ceo",
          role: "CEO Override",
          description: "Should be filtered",
          capabilities: [],
          reasoning_methods: [],
          terminal_desires: [],
          source: "industry",
        },
        {
          id: "cfo",
          role: "CFO Override",
          description: "Should be filtered",
          capabilities: [],
          reasoning_methods: [],
          terminal_desires: [],
          source: "industry",
        },
      ];
      const callLlm = makeLlmMock(JSON.stringify(agentsWithConflict));

      const result = await generateDomainAgents({
        companyDNA: mockCompanyDNA,
        stage1Goals: mockStage1,
        toolInventory: [],
        callLlm,
      });

      expect(result).toHaveLength(3);
      expect(result.every((a) => !["ceo", "cfo"].includes(a.id))).toBe(true);
    });

    it("respects maxAgents limit", async () => {
      const callLlm = makeLlmMock(JSON.stringify(ECOMMERCE_AGENTS));

      const result = await generateDomainAgents({
        companyDNA: mockCompanyDNA,
        stage1Goals: mockStage1,
        toolInventory: [],
        callLlm,
        config: { maxAgents: 2 },
      });

      expect(result).toHaveLength(2);
    });

    it("handles missing optional fields gracefully", async () => {
      const sparseAgents = [
        {
          id: "support-agent",
          role: "Support",
          description: "Handles customer support",
          // missing capabilities, reasoning_methods, terminal_desires, source
        },
      ];
      const callLlm = makeLlmMock(JSON.stringify(sparseAgents));

      const result = await generateDomainAgents({
        companyDNA: mockCompanyDNA,
        stage1Goals: mockStage1,
        toolInventory: [],
        callLlm,
      });

      expect(result).toHaveLength(1);
      expect(result[0].capabilities).toEqual([]);
      expect(result[0].reasoning_methods).toEqual([]);
      expect(result[0].terminal_desires).toEqual([]);
      expect(result[0].source).toBe("industry");
    });
  });

  describe("parseAgentResponse", () => {
    it("handles LLM returning { domain_agents: [...] } wrapper", () => {
      const wrapped = JSON.stringify({ domain_agents: ECOMMERCE_AGENTS });
      const result = parseAgentResponse(wrapped);
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe("inventory-mgr");
    });

    it("handles LLM returning direct array", () => {
      const direct = JSON.stringify(ECOMMERCE_AGENTS);
      const result = parseAgentResponse(direct);
      expect(result).toHaveLength(3);
    });

    it("handles code-fenced JSON response", () => {
      const fenced = `Here are the agents:\n\`\`\`json\n${JSON.stringify(ECOMMERCE_AGENTS)}\n\`\`\``;
      const result = parseAgentResponse(fenced);
      expect(result).toHaveLength(3);
    });

    it("throws on invalid response", () => {
      expect(() => parseAgentResponse("no json here at all")).toThrow(
        "No valid JSON in domain agent response",
      );
    });
  });

  describe("validateAgents", () => {
    it("normalizes agent IDs to kebab-case", () => {
      const agents: DomainAgentSpec[] = [
        {
          id: "Inventory Manager",
          role: "Inventory",
          description: "Manages inventory",
          capabilities: [],
          reasoning_methods: [],
          terminal_desires: [],
          source: "industry",
        },
        {
          id: "FULFILLMENT_MGR",
          role: "Fulfillment",
          description: "Handles fulfillment",
          capabilities: [],
          reasoning_methods: [],
          terminal_desires: [],
          source: "industry",
        },
      ];

      const result = validateAgents(agents, 10);
      expect(result[0].id).toBe("inventory-manager");
      expect(result[1].id).toBe("fulfillment-mgr");
    });

    it("skips agents missing required fields", () => {
      const agents = [
        { id: "valid", role: "Valid", description: "Has all fields" },
        { id: "", role: "NoId", description: "Missing ID" },
        { id: "no-role", role: "", description: "Missing role" },
        { id: "no-desc", role: "NoDesc", description: "" },
      ] as unknown as DomainAgentSpec[];

      const result = validateAgents(agents, 10);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("valid");
    });

    it("deduplicates agents by normalized ID", () => {
      const agents: DomainAgentSpec[] = [
        {
          id: "inventory-mgr",
          role: "Inventory A",
          description: "First",
          capabilities: [],
          reasoning_methods: [],
          terminal_desires: [],
          source: "industry",
        },
        {
          id: "inventory-mgr",
          role: "Inventory B",
          description: "Duplicate",
          capabilities: [],
          reasoning_methods: [],
          terminal_desires: [],
          source: "industry",
        },
      ];

      const result = validateAgents(agents, 10);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe("Inventory A");
    });
  });
});
