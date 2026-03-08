/**
 * Shopify credential resolution.
 *
 * 1. Try workspace integration store via resolveWorkspaceIntegrationEntry("shopify")
 * 2. Fall back to SHOPIFY_STORE + SHOPIFY_ACCESS_TOKEN env vars
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { resolveWorkspaceIntegrationEntry } from "../common.js";

export type ShopifyCredentials = {
  accessToken: string;
  shop: string;
};

export async function resolveShopifyCredentials(
  api: OpenClawPluginApi,
): Promise<ShopifyCredentials | null> {
  // 1. Try workspace integration
  const resolved = await resolveWorkspaceIntegrationEntry(api, "shopify");
  if (resolved) {
    const { entry } = resolved;
    const accessToken =
      (entry.access_token as string) || (entry.accessToken as string) || (entry.api_key as string);
    const shop =
      (entry.shop as string) ||
      (entry.store as string) ||
      (entry.store_name as string) ||
      (entry.myshopify_domain as string);

    if (accessToken && shop) {
      return { accessToken, shop };
    }
  }

  // 2. Fall back to environment variables
  const envToken = process.env.SHOPIFY_ACCESS_TOKEN;
  const envStore = process.env.SHOPIFY_STORE;
  if (envToken && envStore) {
    return { accessToken: envToken, shop: envStore };
  }

  return null;
}
