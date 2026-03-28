/**
 * Shopify Sync Adapter tests — mapToTriples with mock order data.
 */
import { describe, it, expect } from "vitest";
import { mapToTriples, type ShopifyOrderForSync } from "../src/sync/shopify-sync.js";

const PAID_ORDER_1: ShopifyOrderForSync = {
  id: "gid://shopify/Order/1001",
  name: "#1001",
  createdAt: "2026-03-01T10:00:00Z",
  displayFinancialStatus: "PAID",
  totalPriceSet: { shopMoney: { amount: "89.99", currencyCode: "USD" } },
  customer: { id: "gid://shopify/Customer/501", email: "alice@example.com" },
  lineItems: {
    nodes: [
      {
        id: "li-1",
        title: "Mountain Sunset Canvas",
        quantity: 1,
        originalTotalSet: { shopMoney: { amount: "89.99", currencyCode: "USD" } },
        variant: null,
      },
    ],
  },
};

const PAID_ORDER_2: ShopifyOrderForSync = {
  id: "gid://shopify/Order/1002",
  name: "#1002",
  createdAt: "2026-03-10T14:30:00Z",
  displayFinancialStatus: "PAID",
  totalPriceSet: { shopMoney: { amount: "149.99", currencyCode: "USD" } },
  customer: { id: "gid://shopify/Customer/502", email: "bob@example.com" },
  lineItems: {
    nodes: [
      {
        id: "li-2",
        title: "Ocean Waves Canvas",
        quantity: 2,
        originalTotalSet: { shopMoney: { amount: "149.99", currencyCode: "USD" } },
        variant: null,
      },
    ],
  },
};

const REFUNDED_ORDER: ShopifyOrderForSync = {
  id: "gid://shopify/Order/1003",
  name: "#1003",
  createdAt: "2026-03-15T09:00:00Z",
  displayFinancialStatus: "REFUNDED",
  totalPriceSet: { shopMoney: { amount: "79.99", currencyCode: "USD" } },
  customer: { id: "gid://shopify/Customer/501", email: "alice@example.com" },
  lineItems: {
    nodes: [
      {
        id: "li-3",
        title: "Forest Path Canvas",
        quantity: 1,
        originalTotalSet: { shopMoney: { amount: "79.99", currencyCode: "USD" } },
        variant: null,
      },
    ],
  },
};

const PENDING_ORDER: ShopifyOrderForSync = {
  id: "gid://shopify/Order/1004",
  name: "#1004",
  createdAt: "2026-03-20T16:00:00Z",
  displayFinancialStatus: "PENDING",
  totalPriceSet: { shopMoney: { amount: "199.99", currencyCode: "USD" } },
  customer: { id: "gid://shopify/Customer/503", email: "carol@example.com" },
  lineItems: {
    nodes: [
      {
        id: "li-4",
        title: "Mountain Sunset Canvas",
        quantity: 1,
        originalTotalSet: { shopMoney: { amount: "199.99", currencyCode: "USD" } },
        variant: null,
      },
    ],
  },
};

describe("shopify-sync mapToTriples", () => {
  const businessId = "vividwalls";

  it("only counts PAID orders for revenue", () => {
    const triples = mapToTriples(businessId, [
      PAID_ORDER_1,
      PAID_ORDER_2,
      REFUNDED_ORDER,
      PENDING_ORDER,
    ]);

    const revTriple = triples.find((t) => t.predicate === "hasTotalRevenue");
    expect(revTriple).toBeDefined();
    // 89.99 + 149.99 = 239.98
    expect(parseFloat(revTriple!.object)).toBeCloseTo(239.98, 2);
  });

  it("counts only PAID orders in orderCount", () => {
    const triples = mapToTriples(businessId, [
      PAID_ORDER_1,
      PAID_ORDER_2,
      REFUNDED_ORDER,
      PENDING_ORDER,
    ]);
    const orderTriple = triples.find((t) => t.predicate === "hasOrderCount");
    expect(orderTriple).toBeDefined();
    expect(orderTriple!.object).toBe("2");
  });

  it("counts unique customers from PAID orders", () => {
    const triples = mapToTriples(businessId, [PAID_ORDER_1, PAID_ORDER_2, REFUNDED_ORDER]);
    const custTriple = triples.find((t) => t.predicate === "hasCustomerCount");
    expect(custTriple).toBeDefined();
    expect(custTriple!.object).toBe("2");
  });

  it("computes average order value from PAID orders", () => {
    const triples = mapToTriples(businessId, [PAID_ORDER_1, PAID_ORDER_2, REFUNDED_ORDER]);
    const aovTriple = triples.find((t) => t.predicate === "hasAOV");
    expect(aovTriple).toBeDefined();
    // (89.99 + 149.99) / 2 = 119.99
    expect(parseFloat(aovTriple!.object)).toBeCloseTo(119.99, 2);
  });

  it("identifies top products by revenue from PAID orders", () => {
    const triples = mapToTriples(businessId, [PAID_ORDER_1, PAID_ORDER_2, REFUNDED_ORDER]);
    const topTriple = triples.find((t) => t.predicate === "hasTopProductByRevenue");
    expect(topTriple).toBeDefined();
    // Ocean Waves Canvas at 149.99 > Mountain Sunset at 89.99
    expect(topTriple!.object).toContain("Ocean Waves Canvas");
  });

  it("sets subject to businessId and source to shopify-sync", () => {
    const triples = mapToTriples(businessId, [PAID_ORDER_1]);
    for (const t of triples) {
      expect(t.subject).toBe("vividwalls");
      expect(t.source).toContain("shopify-sync");
      expect(t.confidence).toBe(1.0);
    }
  });

  it("returns empty array for no orders", () => {
    const triples = mapToTriples(businessId, []);
    expect(triples).toEqual([]);
  });
});
