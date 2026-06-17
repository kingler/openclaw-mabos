/**
 * bootstrap-schema.ts — create a MABOS knowledge-graph database and apply the
 * base TypeQL schema (core attributes, BDI entities, agent_owns scoping, etc.).
 *
 * MABOS auto-creates databases and pushes schema on demand (onboarding,
 * fact-store writes, rule engine), so running this is optional — it is handy
 * for verifying connectivity and pre-provisioning a database before first use.
 *
 * Usage (via the wrapper, which sets TYPEDB_URL for you):
 *   ./typedb.sh bootstrap [db-name]
 *
 * Or directly:
 *   TYPEDB_URL=http://127.0.0.1:8729 bun docker/bootstrap-schema.ts mabos_knowledge
 *
 * Reuses the exact client + base schema the runtime uses, so the bootstrapped
 * database is identical to what MABOS would create itself.
 */

import { getTypeDBClient } from "../src/knowledge/typedb-client.js";
import { getBaseSchema } from "../src/knowledge/typedb-queries.js";

async function main(): Promise<void> {
  const db = process.argv[2] || process.env.MABOS_TYPEDB_DB || "mabos_knowledge";
  const url = process.env.TYPEDB_URL || "http://127.0.0.1:8729";

  console.log(`Connecting to TypeDB at ${url} ...`);
  const client = getTypeDBClient(url);

  const health = await client.healthCheck();
  if (!health.available) {
    console.error(
      `error: TypeDB is not reachable at ${url}.\n` +
        `Start it with './typedb.sh up' and confirm TYPEDB_URL points at the HTTP port.`,
    );
    process.exit(1);
  }
  console.log(`Connected. Existing databases: ${health.databases.join(", ") || "(none)"}`);

  console.log(`Ensuring database "${db}" ...`);
  await client.ensureDatabase(db);

  console.log(`Applying base schema to "${db}" ...`);
  await client.defineSchema(getBaseSchema(), db);

  console.log(`Done. Database "${db}" is ready with the MABOS base schema.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`Bootstrap failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
