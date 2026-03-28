/**
 * Google Analytics Sync Adapter — stub for direct GA4 → Fact Store sync.
 *
 * Reads GA4_PROPERTY_ID from environment. When implemented, will fetch:
 * - Sessions, users, page views
 * - Top landing pages
 * - Conversion rates
 * - Traffic sources
 */
import type { SyncAdapter, SyncTriple } from "./sync-runner.js";

export function createGASyncAdapter(businessId: string): SyncAdapter {
  return {
    name: "ga",

    isConfigured(): boolean {
      return !!process.env.GA4_PROPERTY_ID;
    },

    async fetchTriples(): Promise<SyncTriple[]> {
      // TODO: Implement GA4 Data API calls
      console.log("[ga-sync] Stub: not yet implemented");
      return [];
    },
  };
}
