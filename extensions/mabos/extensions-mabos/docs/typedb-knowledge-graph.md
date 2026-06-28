# MABOS TypeDB Knowledge Graph

TypeDB is the graph database and ontology store for MABOS. It holds the
SBVR-aligned ontology schema plus the runtime knowledge each agent
accumulates: SPO facts, inference rules, memory items, case-based-reasoning
cases, and the full BDI state (beliefs, desires, goals, intentions, plans) and
workflow models.

This document explains how MABOS connects to TypeDB, how to run a local
instance with Docker, how databases and the schema are organized, and how data
flows in.

## Graceful degradation

MABOS works fully without TypeDB. Every write is **dual-pathed**: the canonical
JSON mirror under the workspace is always written, and the TypeDB write is
attempted best-effort on top. If the server is unreachable, the JSON file is the
source of truth and the run continues. TypeDB adds typed, cross-entity graph
queries and inference over that same data.

This means you can develop against files only and add TypeDB when you need graph
queries — nothing breaks either way.

## Connection and configuration

MABOS talks to TypeDB over its **HTTP API** via the `typedb-driver-http` driver
(see `src/knowledge/typedb-client.ts`).

| Variable      | Default                       | Purpose                                                        |
| ------------- | ----------------------------- | -------------------------------------------------------------- |
| `TYPEDB_URL`  | `http://157.230.13.13:8729`   | Base URL of the TypeDB HTTP API. Set this to your own server.  |
| `TYPEDB_SKIP` | unset                         | Set to `1` to disable TypeDB entirely (file-based only).       |

Default credentials are `admin` / `password` (the driver defaults baked into
the stock image). Override them for any non-local deployment.

> The built-in default points at a shared remote. For local development always
> set `TYPEDB_URL` to your own instance, e.g. `export TYPEDB_URL=http://127.0.0.1:8729`.

### Ports

A TypeDB 3.x server exposes two ports:

| Port   | Protocol      | Used by                                            |
| ------ | ------------- | -------------------------------------------------- |
| `8000` | HTTP API      | MABOS (`typedb-driver-http`)                       |
| `1729` | native        | TypeDB Studio and native gRPC drivers              |

Inside the container the HTTP API is always on `8000`. The provided Docker setup
publishes it on host port **`8729`** to match the MABOS `TYPEDB_URL` port
convention, so `http://127.0.0.1:8729` reaches it from the host.

## Run a local instance with Docker

All Docker assets live in `extensions/mabos/extensions-mabos/docker/`:

| File                  | Purpose                                                  |
| --------------------- | -------------------------------------------------------- |
| `docker-compose.yml`  | TypeDB 3.x service (HTTP `8729→8000`, native `1729`)     |
| `typedb.env.example`  | Copyable env file (versions, ports, container/volume)    |
| `typedb.sh`           | Management wrapper: `up` / `down` / `status` / `logs` / `bootstrap` / `reset` |
| `bootstrap-schema.ts` | Create a database and apply the base schema (optional)   |

### Quick start

```bash
cd extensions/mabos/extensions-mabos/docker

# optional: customize ports/version
cp typedb.env.example typedb.env

# start the server and wait until the HTTP API responds
./typedb.sh up

# point MABOS at it (add to your shell profile / .env)
export TYPEDB_URL=http://127.0.0.1:8729

# optional: pre-create a database and apply the base schema
./typedb.sh bootstrap mabos_knowledge

# check state / tail logs
./typedb.sh status
./typedb.sh logs
```

`./typedb.sh down` stops the container but **keeps** the data volume.
`./typedb.sh reset` stops it and **deletes** the data volume (destructive).

### Plain docker compose

If you prefer not to use the wrapper:

```bash
cd extensions/mabos/extensions-mabos/docker
docker compose --env-file typedb.env up -d
```

Data persists in the named volume `mabos-typedb-data`
(`/opt/typedb-server-linux-x86_64/server/data` inside the container).

## Databases

MABOS does not use one global database — it creates databases on demand
(`ensureDatabase`) and falls into two naming conventions:

| Pattern                | Created by                                  | Holds                                                            |
| ---------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| `mabos_<business_id>`  | onboarding / provisioning bootstrap         | the business's full ontology-derived schema + SBVR concepts     |
| `mabos_<role>`         | fact store, rule engine, memory, sync       | per-role facts/rules/memory (e.g. `mabos_knowledge`, `mabos_cfo`) |

The per-role databases are keyed off the `agent_id` (the first path segment of
the agent id becomes the database name). Facts are written by the role agent —
for example validated business assumptions are promoted into `mabos_knowledge`
with the business carried as the SPO subject.

Every database is created automatically the first time it is needed, so you do
not have to pre-create anything; `bootstrap` is only a convenience.

## Schema

The schema is applied in two layers (`src/knowledge/`):

1. **Base schema** — `getBaseSchema()` in `typedb-queries.ts`. A fixed TypeQL
   `define` block with:
   - **Core attributes**: `uid`, `name`, `subject`, `predicate`, `object_value`,
     `confidence`, `source`, `valid_from`/`valid_until`, timestamps, etc.
   - **Core entities**: `agent`, `spo_fact`, `knowledge_rule`, `memory_item`,
     `cbr_case`.
   - **BDI cognitive entities**: `belief`, `desire`, `goal`, plans, steps.
   - **Relations**: `agent_owns` (the scoping relation that ties every fact /
     rule / memory to its owning agent), plus BDI relations like
     `belief_supports_goal`, `desire_motivates_goal`, `goal_requires_plan`, and
     workflow/goal-hierarchy relations.

2. **Ontology-derived schema** — `jsonldToTypeQL()` + `generateDefineQuery()` in
   `typedb-schema.ts`. Walks the merged JSON-LD/OWL ontology graph
   (`src/ontology/`) and emits TypeQL for `owl:Class` → entities,
   `owl:DatatypeProperty` → attributes, and `owl:ObjectProperty` (with
   `sbvr:roles`) → relations. Name collisions and TypeQL reserved words are
   resolved automatically.

During onboarding both layers are pushed (see `src/tools/onboarding-tools.ts`):

```text
ensureDatabase(`mabos_<business_id>`)
defineSchema(getBaseSchema())
defineSchema(generateDefineQuery(jsonldToTypeQL(ontologyGraph)))
```

### Agent scoping

Every fact, rule, and memory item is tied to its owning agent through the
`agent_owns` relation, so a query in a shared database can still isolate one
agent's knowledge:

```typeql
match
  $agent isa agent, has uid "knowledge";
  $fact isa spo_fact, has subject $s, has predicate $p, has object_value $o;
  (owner: $agent, owned: $fact) isa agent_owns;
```

The query builders for facts, rules, memory, inference, and BPMN live in
`src/knowledge/{typedb-queries,bpmn-queries}.ts`.

## How data flows into the graph

| Source                          | Code                                  | Writes                              |
| ------------------------------- | ------------------------------------- | ----------------------------------- |
| Fact assertions / promotion     | `src/tools/fact-store.ts`             | `spo_fact` via `assertFactDirect`   |
| Rule create/list/delete         | `src/tools/rule-engine.ts`            | `knowledge_rule`                    |
| Memory store/recall             | `src/tools/memory-tools.ts`           | `memory_item`                       |
| Inference                       | `src/tools/inference-tools.ts`        | derived `spo_fact`                  |
| Workflows (BPMN)                | `src/tools/workflow-tools.ts`         | workflow entities + relations       |
| Onboarding / provisioning       | `src/tools/onboarding-tools.ts`       | schema + SBVR concepts              |
| Integration sync (Shopify, etc) | `src/sync/*`                          | `spo_fact` (LLM-free, bulk)         |
| Reverse sync (graph → files)    | `src/sync/typedb-reverse-sync.ts`     | reads back into JSON                |

All of these import the singleton via `getTypeDBClient()` and guard their writes
with `client.isAvailable()`, so an unreachable server is silently skipped.

## TypeDB agent tools

The extension exposes tools (see `src/tools/typedb-tools.ts`) for operating on
the graph from an agent session or the Tool API:

| Tool                    | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| `typedb_status`         | Health check: availability + list of databases                  |
| `typedb_sync_schema`    | Ensure a database and (re)apply base + ontology schema           |
| `typedb_query`          | Run a read TypeQL query against a database                       |
| `typedb_sync_agent_data`| Bulk-import an agent's JSON files (facts, rules, memory) into the graph |

`typedb_status` is the fastest way to confirm connectivity from inside MABOS.

## Troubleshooting

- **Writes silently not appearing in TypeDB.** The server was unreachable at
  write time, so only the JSON mirror was updated. Run `typedb_status` (or
  `./typedb.sh status`) and confirm `TYPEDB_URL` points at the HTTP port.
- **Connecting to `157.230.13.13` unexpectedly.** `TYPEDB_URL` is unset and the
  built-in remote default is in effect. Export `TYPEDB_URL=http://127.0.0.1:8729`.
- **Port already in use.** Override `TYPEDB_HTTP_PORT` / `TYPEDB_NATIVE_PORT` in
  `typedb.env` (and update `TYPEDB_URL` to match the host HTTP port).
- **Want to disable TypeDB during tests/CI.** Set `TYPEDB_SKIP=1`; the client
  short-circuits to an unreachable stub and everything stays file-based.
- **Server won't become ready.** `./typedb.sh logs` to inspect startup; ensure
  the image tag in `typedb.env` is a valid 3.x version.

## Production notes

- Change the default `admin` / `password` credentials.
- Run TypeDB on a private network; the HTTP API has no MABOS-level auth in front
  of it beyond TypeDB's own.
- Back up the data volume (`mabos-typedb-data`) like any stateful service.
- Pin `TYPEDB_VERSION` to a specific 3.x tag rather than `latest`.
