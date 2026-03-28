#!/usr/bin/env node
import { homedir } from "node:os";
/**
 * Direct API Sync CLI — runs sync adapters from cron or command line.
 *
 * Usage:
 *   node run-sync-cli.js shopify       # Shopify only
 *   node run-sync-cli.js stripe        # Stripe only
 *   node run-sync-cli.js all           # All configured adapters
 *
 * Requires workspace dir at ~/.openclaw/workspace (or OPENCLAW_WORKSPACE env).
 */
import { join } from "node:path";
import { createGASyncAdapter } from "./ga-sync.js";
import { createSendGridSyncAdapter } from "./sendgrid-sync.js";
import { createShopifySyncAdapter } from "./shopify-sync.js";
import { createStripeSyncAdapter } from "./stripe-sync.js";
import { runSync, type SyncAdapter, type SyncRunResult } from "./sync-runner.js";

function createMinimalApi(workspaceDir: string): any {
  return {
    config: { agents: { defaults: { workspace: workspaceDir } } },
    pluginConfig: {},
    logger: {
      info: (...args: any[]) => console.log("[INFO]", ...args),
      debug: (...args: any[]) => {},
      warn: (...args: any[]) => console.warn("[WARN]", ...args),
      error: (...args: any[]) => console.error("[ERROR]", ...args),
    },
  };
}

function getAdapters(filter: string): SyncAdapter[] {
  const businessId = process.env.SYNC_BUSINESS_ID || "vividwalls";

  const all: SyncAdapter[] = [
    createShopifySyncAdapter(businessId),
    createStripeSyncAdapter(businessId),
    createGASyncAdapter(businessId),
    createSendGridSyncAdapter(businessId),
  ];

  if (filter === "all") return all;
  return all.filter((a) => a.name === filter);
}

async function main() {
  const filter = process.argv[2] || "all";
  const workspaceDir = process.env.OPENCLAW_WORKSPACE || join(homedir(), ".openclaw", "workspace");

  console.log(`[direct-sync] Starting sync: ${filter}`);
  console.log(`[direct-sync] Workspace: ${workspaceDir}`);

  const api = createMinimalApi(workspaceDir);
  const adapters = getAdapters(filter);

  if (adapters.length === 0) {
    console.log(`[direct-sync] No adapters matched filter "${filter}"`);
    process.exit(0);
  }

  const results: SyncRunResult[] = [];

  for (const adapter of adapters) {
    console.log(`[direct-sync] Running adapter: ${adapter.name}`);
    const result = await runSync(api, adapter);
    results.push(result);

    if (result.skipped) {
      console.log(`[direct-sync]   Skipped: ${result.error}`);
    } else if (result.error) {
      console.error(`[direct-sync]   Error: ${result.error}`);
    } else {
      const asserted = result.results.filter((r) => r.action === "asserted").length;
      const updated = result.results.filter((r) => r.action === "updated").length;
      const blocked = result.results.filter((r) => r.action === "blocked").length;
      console.log(
        `[direct-sync]   Done: ${asserted} asserted, ${updated} updated, ${blocked} blocked`,
      );
    }
  }

  console.log(`[direct-sync] Sync complete.`);
}

main().catch((err) => {
  console.error("[direct-sync] Fatal error:", err);
  process.exit(1);
});
