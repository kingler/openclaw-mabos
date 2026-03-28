# Direct API → Fact Store Sync

**Date**: 2026-03-28
**Status**: In Progress
**Goal**: Eliminate LLM mediation from API→fact_store pipeline to prevent hallucinated metrics.

## Problem

The current fact store requires LLM mediation to write facts from APIs. This caused hallucinated revenue ($116K instead of real $3.5K).

## Solution

Direct API→fact_store sync with no LLM in the pipeline, using source authority tiers for contradiction detection.

## Tasks

### Task 1: Extract assertFactDirect from fact-store.ts

- Export callable function bypassing tool wrapper
- Accepts (api, params: DirectFactParams) → DirectFactResult
- Runs detectContradiction from source-authority.ts
- Refactor fact_assert to use it internally (DRY)

### Task 2: Shopify Sync Adapter

- src/sync/sync-runner.ts — SyncAdapter interface + runSync()
- src/sync/shopify-sync.ts — Shopify adapter using ShopifyClient.loadOrders
- Computes: totalRevenue (PAID only), orderCount, customerCount, AOV, top products

### Task 3: Sync Runner CLI Entry Point

- src/sync/run-sync-cli.ts — Node script for cron execution
- Args: shopify, all, etc.

### Task 4: Cron Integration

- Add CRON-direct-sync-shopify to vividwalls cron-jobs.json

### Task 5: TypeDB Reverse Sync

- src/sync/typedb-reverse-sync.ts
- Graceful degradation when TypeDB unavailable

### Task 6: Stripe, GA, SendGrid Sync Stubs

- Stub adapters following SyncAdapter interface

### Task 7: Verify source-authority.ts patterns

- Ensure stripe-sync in T1_PATTERNS
