/**
 * SendGrid Sync Adapter — stub for direct SendGrid → Fact Store sync.
 *
 * Reads SENDGRID_API_KEY from environment. When implemented, will fetch:
 * - Email delivery stats (sent, delivered, opened, clicked)
 * - Bounce rates
 * - Unsubscribe rates
 * - Campaign performance
 */
import type { SyncAdapter, SyncTriple } from "./sync-runner.js";

export function createSendGridSyncAdapter(businessId: string): SyncAdapter {
  return {
    name: "sendgrid",

    isConfigured(): boolean {
      return !!process.env.SENDGRID_API_KEY;
    },

    async fetchTriples(): Promise<SyncTriple[]> {
      // TODO: Implement SendGrid API calls
      console.log("[sendgrid-sync] Stub: not yet implemented");
      return [];
    },
  };
}
