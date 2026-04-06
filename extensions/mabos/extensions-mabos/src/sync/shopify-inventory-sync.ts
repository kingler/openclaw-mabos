/**
 * Shopify → TypeDB Inventory Sync
 *
 * Pulls product catalog from Shopify Admin GraphQL API and writes
 * product entities with inventory data into TypeDB. Also saves the
 * catalog to product-catalog-live.json for offline access.
 *
 * Sync flow:
 *  1. Load Shopify credentials (integrations.json or env vars)
 *  2. Fetch all products via paginated GraphQL query
 *  3. Write each product as a TypeDB `product` entity (upsert pattern)
 *  4. Save flat JSON catalog for dashboard API fallback
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";

// ── Types ────────────────────────────────────────────────────────────

interface ShopifyCreds {
  store: string;
  accessToken: string;
}

export interface SyncedProduct {
  shopify_gid: string;
  product_id: string;
  title: string;
  handle: string;
  product_type: string;
  tags: string[];
  status: string;
  sku: string;
  price: number;
  inventory_qty: number;
  image_url: string;
  updated_at: string;
}

export interface InventorySyncResult {
  synced: number;
  skipped: number;
  errors: number;
  source: "shopify" | "catalog_json";
}

// ── Credential loader ────────────────────────────────────────────────

async function readJson(p: string) {
  try {
    return JSON.parse(await readFile(p, "utf-8"));
  } catch {
    return null;
  }
}

export async function loadShopifyCreds(workspaceDir: string): Promise<ShopifyCreds | null> {
  for (const p of [
    join(workspaceDir, "businesses", "vividwalls", "integrations.json"),
    join(workspaceDir, "integrations.json"),
  ]) {
    const data = await readJson(p);
    const entry = (data?.integrations || []).find(
      (i: any) => (i.id === "shopify-main" || i.id === "shopify-admin") && i.enabled,
    );
    if (entry?.api_key) {
      const domain = entry.metadata?.domain || entry.metadata?.store || "";
      const store = domain.replace(".myshopify.com", "");
      if (store) return { store, accessToken: entry.api_key };
    }
  }
  const store = process.env.SHOPIFY_STORE;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;
  if (store && token) return { store, accessToken: token };
  return null;
}

// ── Shopify GraphQL ──────────────────────────────────────────────────

const SHOPIFY_API_VERSION = "2024-04";

const PRODUCTS_QUERY = `
query($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
    edges {
      cursor
      node {
        id
        title
        handle
        productType
        tags
        status
        updatedAt
        images(first: 1) { edges { node { url } } }
        variants(first: 250) {
          edges {
            node {
              id title sku price
              inventoryQuantity
            }
          }
        }
      }
    }
    pageInfo { hasNextPage endCursor }
  }
}`;

async function fetchShopifyProducts(creds: ShopifyCreds): Promise<SyncedProduct[]> {
  const products: SyncedProduct[] = [];
  let cursor: string | null = null;
  let page = 0;

  while (page < 20) {
    // max 20 pages = 1000 products
    const resp = await fetch(
      `https://${creds.store}.myshopify.com/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": creds.accessToken,
        },
        body: JSON.stringify({
          query: PRODUCTS_QUERY,
          variables: { first: 50, after: cursor },
        }),
      },
    );

    if (!resp.ok) throw new Error(`Shopify API ${resp.status}: ${await resp.text()}`);

    const json = await resp.json();
    if (json.errors) throw new Error(`Shopify GraphQL: ${json.errors[0]?.message}`);

    const edges = json.data?.products?.edges || [];
    for (const edge of edges) {
      const node = edge.node;
      const variants = (node.variants?.edges || []).map((e: any) => e.node);
      const primaryVariant = variants[0];
      const totalQty = variants.reduce(
        (sum: number, v: any) => sum + (v.inventoryQuantity ?? 0),
        0,
      );

      products.push({
        shopify_gid: node.id,
        product_id: node.id.replace("gid://shopify/Product/", "P-"),
        title: node.title,
        handle: node.handle,
        product_type: node.productType || "",
        tags: node.tags || [],
        status: node.status?.toLowerCase() || "active",
        sku: primaryVariant?.sku || `VW-${node.handle}`,
        price: parseFloat(primaryVariant?.price || "0"),
        inventory_qty: totalQty,
        image_url: node.images?.edges?.[0]?.node?.url || "",
        updated_at: node.updatedAt,
      });
    }

    const pageInfo = json.data?.products?.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    cursor = pageInfo.endCursor;
    page++;
  }

  return products;
}

// ── TypeDB writer ────────────────────────────────────────────────────

async function ensureProductSchema(client: any, db: string): Promise<void> {
  const def = (q: string) => client.defineSchema(q, db).catch(() => {});
  // product entity uses uid @key from base schema, plus inventory attributes
  await def(
    `define attribute inventory_qty, value integer; attribute unit_cost, value double; attribute reorder_point, value integer; attribute warehouse, value string; attribute image_url, value string; attribute handle, value string; attribute product_type, value string;`,
  );
  await def(
    `define entity inventory_item, owns uid @key, owns name, owns description, owns status, owns category, owns inventory_qty, owns unit_cost, owns reorder_point, owns warehouse, owns image_url, owns handle, owns product_type, owns created_at, owns updated_at;`,
  );
  await def(`define inventory_item plays agent_owns:owned;`);
}

async function writeProductsToTypeDB(
  client: any,
  db: string,
  products: SyncedProduct[],
  logger: { info: (m: string) => void; warn: (m: string) => void },
): Promise<{ written: number; errors: number }> {
  await ensureProductSchema(client, db);

  let written = 0;
  let errors = 0;
  const now = new Date().toISOString();

  for (const p of products) {
    try {
      // Delete existing entry if present (upsert)
      await client
        .deleteData(
          `match $i isa inventory_item, has uid "${p.product_id}"; delete $i isa inventory_item;`,
          db,
        )
        .catch(() => {});

      const reorderPoint = Math.max(5, Math.round(p.inventory_qty * 0.15));
      const unitCost = Math.round(p.price * 0.4 * 100) / 100;
      const status =
        p.inventory_qty <= 0
          ? "out_of_stock"
          : p.inventory_qty <= reorderPoint
            ? "low_stock"
            : "in_stock";

      await client.insertData(
        `insert $i isa inventory_item, has uid "${p.product_id}", has name ${JSON.stringify(p.title)}, has description ${JSON.stringify(p.handle)}, has status "${status}", has category ${JSON.stringify(p.product_type || "general")}, has inventory_qty ${p.inventory_qty}, has unit_cost ${unitCost}, has reorder_point ${reorderPoint}, has warehouse "VividWalls Main", has image_url ${JSON.stringify(p.image_url)}, has handle ${JSON.stringify(p.handle)}, has product_type ${JSON.stringify(p.product_type || "general")}, has created_at "${now}", has updated_at "${now}";`,
        db,
      );
      written++;
    } catch (err) {
      errors++;
      logger.warn(`[inventory-sync] Failed to write ${p.product_id}: ${err}`);
    }
  }

  return { written, errors };
}

// ── Save catalog JSON ────────────────────────────────────────────────

async function saveCatalogJson(catalogPath: string, products: SyncedProduct[]): Promise<void> {
  await mkdir(dirname(catalogPath), { recursive: true });
  const catalog = {
    synced_at: new Date().toISOString(),
    product_count: products.length,
    products: products.map((p) => ({
      id: p.product_id,
      shopify_gid: p.shopify_gid,
      title: p.title,
      name: p.title,
      handle: p.handle,
      sku: p.sku,
      price: p.price,
      stock: p.inventory_qty,
      quantity: p.inventory_qty,
      product_type: p.product_type,
      tags: p.tags,
      status: p.status,
      image_url: p.image_url,
      reorder_point: Math.max(5, Math.round(p.inventory_qty * 0.15)),
      unit_cost: Math.round(p.price * 0.4 * 100) / 100,
    })),
  };
  await writeFile(catalogPath, JSON.stringify(catalog, null, 2), "utf-8");
}

// ── Public sync function ─────────────────────────────────────────────

export async function syncShopifyInventoryToTypeDB(params: {
  client: any;
  db: string;
  workspaceDir: string;
  catalogPath: string;
  logger: { info: (m: string) => void; warn: (m: string) => void };
}): Promise<InventorySyncResult> {
  const { client, db, workspaceDir, catalogPath, logger } = params;

  // Load Shopify credentials
  const creds = await loadShopifyCreds(workspaceDir);
  if (!creds) {
    logger.warn("[inventory-sync] No Shopify credentials found, skipping sync");
    return { synced: 0, skipped: 0, errors: 0, source: "catalog_json" };
  }

  // Fetch products from Shopify
  logger.info("[inventory-sync] Fetching products from Shopify...");
  let products: SyncedProduct[];
  try {
    products = await fetchShopifyProducts(creds);
  } catch (err) {
    logger.warn(`[inventory-sync] Shopify fetch failed: ${err}`);
    return { synced: 0, skipped: 0, errors: 1, source: "shopify" };
  }

  if (products.length === 0) {
    logger.info("[inventory-sync] No products found in Shopify");
    return { synced: 0, skipped: 0, errors: 0, source: "shopify" };
  }

  logger.info(`[inventory-sync] Fetched ${products.length} products from Shopify`);

  // Write to TypeDB
  const { written, errors } = await writeProductsToTypeDB(client, db, products, logger);

  // Save catalog JSON for offline access
  await saveCatalogJson(catalogPath, products).catch((err) =>
    logger.warn(`[inventory-sync] Failed to save catalog JSON: ${err}`),
  );

  logger.info(
    `[inventory-sync] Sync complete: ${written} written to TypeDB, ${errors} errors, ${products.length - written - errors} skipped`,
  );

  return {
    synced: written,
    skipped: products.length - written - errors,
    errors,
    source: "shopify",
  };
}

// ── TypeDB inventory query ───────────────────────────────────────────

export async function queryInventoryFromTypeDB(client: any, db: string): Promise<any[] | null> {
  try {
    if (!client.isAvailable()) return null;

    const res = await client.matchQuery(
      `match $i isa inventory_item, has uid $id, has name $n, has status $st, has inventory_qty $qty, has unit_cost $uc, has reorder_point $rp, has warehouse $wh, has handle $h, has product_type $pt;`,
      db,
    );

    if (!res || res.answerType !== "conceptRows" || !res.answers?.length) return null;

    const getVal = (concept: any) => (concept && "value" in concept ? concept.value : null);

    return res.answers.map((row: any) => ({
      id: getVal(row.data["id"]),
      product_id: getVal(row.data["id"]),
      name: getVal(row.data["n"]),
      sku: getVal(row.data["h"]) || getVal(row.data["id"]),
      quantity: getVal(row.data["qty"]) ?? 0,
      reorder_point: getVal(row.data["rp"]) ?? 10,
      unit_cost: getVal(row.data["uc"]) ?? 0,
      status: getVal(row.data["st"]) || "in_stock",
      warehouse: getVal(row.data["wh"]) || "VividWalls Main",
      warehouse_id: "WH-001",
      warehouse_name: getVal(row.data["wh"]) || "VividWalls Main",
      product_type: getVal(row.data["pt"]) || "",
    }));
  } catch {
    return null;
  }
}
