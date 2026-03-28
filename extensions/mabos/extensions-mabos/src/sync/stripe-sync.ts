/**
 * Stripe Sync Adapter — stub for direct Stripe → Fact Store sync.
 *
 * Reads STRIPE_SECRET_KEY from environment. When implemented, will fetch:
 * - Monthly Recurring Revenue (MRR)
 * - Total charges / revenue
 * - Subscription counts
 * - Churn rate
 */
import type { SyncAdapter, SyncTriple } from "./sync-runner.js";

export function createStripeSyncAdapter(businessId: string): SyncAdapter {
  return {
    name: "stripe",

    isConfigured(): boolean {
      return !!process.env.STRIPE_SECRET_KEY;
    },

    async fetchTriples(): Promise<SyncTriple[]> {
      // TODO: Implement Stripe API calls
      // const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      // Fetch charges, subscriptions, etc.
      console.log("[stripe-sync] Stub: not yet implemented");
      return [];
    },
  };
}
