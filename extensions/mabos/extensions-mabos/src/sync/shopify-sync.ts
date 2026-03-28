/**
 * Shopify Sync Adapter — fetches orders from Shopify and maps to SPO triples.
 *
 * Only counts PAID orders for revenue metrics. Uses ShopifyClient.loadOrders()
 * for pagination. No LLM in the pipeline.
 */
import { ShopifyClient } from "../tools/shopify/client/ShopifyClient.js";
import type { SyncAdapter, SyncTriple } from "./sync-runner.js";

/**
 * Minimal order type for sync (subset of ShopifyOrderGraphql).
 * Exported for test mocking.
 */
export type ShopifyOrderForSync = {
  id: string;
  name: string;
  createdAt: string;
  displayFinancialStatus: string;
  totalPriceSet: {
    shopMoney: { amount: string; currencyCode: string };
  };
  customer: { id: string; email: string } | null;
  lineItems: {
    nodes: Array<{
      id: string;
      title: string;
      quantity: number;
      originalTotalSet: { shopMoney: { amount: string; currencyCode: string } };
      variant: { id: string; title: string; sku: string | null; price: string } | null;
    }>;
  };
};

export function resolveShopifyEnvConfig(): { accessToken: string; store: string } | null {
  const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const store = process.env.SHOPIFY_STORE;
  if (!accessToken || !store) return null;
  return { accessToken, store };
}

/**
 * Map raw Shopify orders to SPO triples.
 * Only PAID orders count toward revenue, orderCount, customerCount, AOV.
 */
export function mapToTriples(businessId: string, orders: ShopifyOrderForSync[]): SyncTriple[] {
  if (orders.length === 0) return [];

  const paidOrders = orders.filter((o) => o.displayFinancialStatus === "PAID");

  if (paidOrders.length === 0) return [];

  const now = new Date().toISOString();
  const source = `shopify-sync-${now.slice(0, 10)}`;
  const agentId = "cfo";

  // Total revenue
  const totalRevenue = paidOrders.reduce(
    (sum, o) => sum + parseFloat(o.totalPriceSet.shopMoney.amount),
    0,
  );

  // Order count
  const orderCount = paidOrders.length;

  // Unique customers
  const customerIds = new Set<string>();
  for (const o of paidOrders) {
    if (o.customer?.id) customerIds.add(o.customer.id);
  }
  const customerCount = customerIds.size;

  // AOV
  const aov = totalRevenue / orderCount;

  // Top products by revenue
  const productRevenue = new Map<string, number>();
  for (const o of paidOrders) {
    for (const li of o.lineItems.nodes) {
      const prev = productRevenue.get(li.title) || 0;
      productRevenue.set(li.title, prev + parseFloat(li.originalTotalSet.shopMoney.amount));
    }
  }
  const topProducts = [...productRevenue.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, rev]) => `${name}: $${rev.toFixed(2)}`)
    .join(", ");

  const base = {
    agent_id: agentId,
    subject: businessId,
    confidence: 1.0,
    source,
    valid_from: now,
  };

  return [
    { ...base, predicate: "hasTotalRevenue", object: totalRevenue.toFixed(2) },
    { ...base, predicate: "hasOrderCount", object: String(orderCount) },
    { ...base, predicate: "hasCustomerCount", object: String(customerCount) },
    { ...base, predicate: "hasAOV", object: aov.toFixed(2) },
    { ...base, predicate: "hasTopProductByRevenue", object: topProducts },
  ];
}

/**
 * Create a Shopify sync adapter.
 */
export function createShopifySyncAdapter(businessId: string): SyncAdapter {
  return {
    name: "shopify",

    isConfigured(): boolean {
      return resolveShopifyEnvConfig() !== null;
    },

    async fetchTriples(): Promise<SyncTriple[]> {
      const config = resolveShopifyEnvConfig();
      if (!config) return [];

      const client = new ShopifyClient();
      const allOrders: ShopifyOrderForSync[] = [];
      let cursor: string | undefined;
      let hasNext = true;

      while (hasNext) {
        const response = await client.loadOrders(config.accessToken, config.store, {
          first: 50,
          after: cursor,
          sortKey: "CREATED_AT",
          reverse: false,
        });

        allOrders.push(...(response.orders as unknown as ShopifyOrderForSync[]));
        hasNext = response.pageInfo.hasNextPage;
        cursor = response.pageInfo.endCursor ?? undefined;
      }

      return mapToTriples(businessId, allOrders);
    },
  };
}
