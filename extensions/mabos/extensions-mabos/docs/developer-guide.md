# MABOS Developer Guide

This guide is the entry point for developers building on or extending MABOS — the
Multi-Agent Business Operating System. It connects the moving parts (runtime,
agents, knowledge graph, control-plane APIs, tools) and shows how to set up,
run, extend, and test the system.

For the full product overview, agent roster, and the 99-tool reference, see the
[README](../README.md). For deeper dives, see the linked docs throughout.

## Table of contents

- [Architecture at a glance](#architecture-at-a-glance)
- [Prerequisites](#prerequisites)
- [Install and build](#install-and-build)
- [Enable and run](#enable-and-run)
- [Configuration and environment](#configuration-and-environment)
- [The knowledge graph (TypeDB)](#the-knowledge-graph-typedb)
- [Control-plane APIs](#control-plane-apis)
- [Working with agents (BDI)](#working-with-agents-bdi)
- [Data model: facts, ontology, assumptions](#data-model-facts-ontology-assumptions)
- [Extending MABOS](#extending-mabos)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Code map](#code-map)

## Architecture at a glance

MABOS is an OpenClaw extension. OpenClaw provides the plugin SDK, gateway, CLI,
and channel infrastructure; MABOS adds the agent-intelligence layer on top.

```text
            ┌──────────────────────────────────────────────┐
            │ OpenClaw runtime (gateway, CLI, plugin SDK)    │
            └───────────────┬──────────────────────────────┘
                            │ registers
            ┌───────────────▼──────────────────────────────┐
            │ MABOS extension (index.ts)                     │
            │  • ~40 tool factories  → agent tools           │
            │  • HTTP routes (/mabos/*) → control plane       │
            │  • lifecycle hooks (persona inject, audit)      │
            └───────┬───────────────────────┬───────────────┘
                    │                       │
         ┌──────────▼─────────┐   ┌─────────▼──────────────┐
         │ Workspace (files)   │   │ TypeDB knowledge graph │
         │ businesses/<id>/...  │   │ ontology + facts +     │
         │ agents/<role>/...    │◄─►│ rules + memory + BDI   │
         │ (canonical mirror)   │   │ (graph queries)        │
         └─────────────────────┘   └────────────────────────┘
```

Two persistence layers always coexist: the **workspace files** are canonical and
always written; the **TypeDB graph** is a best-effort, query-optimized projection
of the same data. See [graceful degradation](typedb-knowledge-graph.md#graceful-degradation).

## Prerequisites

- **Node 22+** (Bun is supported and preferred for running TypeScript).
- **pnpm** (the repo's package manager; `bun install` also works).
- **Docker** — only needed to run the TypeDB knowledge graph locally.
- An LLM provider key for agent reasoning (e.g. `ANTHROPIC_API_KEY`,
  `OPENAI_API_KEY`); MABOS routes model calls through its
  [model router](#configuration-and-environment).

## Install and build

From the combined repository root:

```bash
git clone https://github.com/kingler/openclaw-mabos.git
cd openclaw-mabos
pnpm install
pnpm build
```

The MABOS extension lives at `extensions/mabos/extensions-mabos/` and is part of
the pnpm workspace, so the root install/build covers it. To type-check just the
extension:

```bash
cd extensions/mabos/extensions-mabos
pnpm check   # tsc --noEmit
```

## Enable and run

MABOS is an OpenClaw plugin. Enable it in your config (`~/.openclaw/openclaw.json`):

```json
{
  "plugins": {
    "entries": {
      "mabos": { "enabled": true }
    }
  }
}
```

The repo root ships `mabos.mjs`, the MABOS CLI entry point (sets `MABOS_PRODUCT=1`
and delegates to the runtime):

| Command               | Description                                   |
| --------------------- | --------------------------------------------- |
| `mabos onboard`       | Start the guided business onboarding pipeline |
| `mabos agents`        | List and manage agents across businesses      |
| `mabos bdi cycle`     | Manually trigger a BDI reasoning cycle        |
| `mabos business list` | List all managed business ventures            |
| `mabos dashboard`     | Open the stakeholder dashboard                |

The **control-plane HTTP routes** (`/mabos/*`) are served by the OpenClaw
gateway. Start the gateway and call the routes with the gateway bearer token
(see [Control-plane APIs](#control-plane-apis)).

## Configuration and environment

### Plugin configuration

MABOS reads its config from the plugin config block (typed as
`MabosPluginConfig`, accessed via `getPluginConfig(api)` in
`src/tools/common.ts`). Notable keys:

- `workspaceDir` / `agents.defaults.workspace` — where business and agent
  workspaces live (`resolveWorkspaceDir`).
- `modelRouter` — effort/cost/capacity policy for model selection
  (`modelRouter.effortPolicy`, provider registry, `costBudget`). See the
  [Enrichment API](enrichment-api.md) and `src/model-router/`.

### Environment variables

| Variable                | Purpose                                                              |
| ----------------------- | -------------------------------------------------------------------- |
| `TYPEDB_URL`            | TypeDB HTTP API base URL (set to your local server)                  |
| `TYPEDB_SKIP`           | `1` to disable TypeDB (file-based only)                              |
| `OPENCLAW_GATEWAY_TOKEN`| Bearer token for the `/mabos/*` control-plane routes                 |
| `OPENCLAW_WORKSPACE`    | Workspace base directory                                            |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY` | Provider keys for the model router  |
| `MABOS_BRAND_*`         | Branding overrides for generated artifacts                           |

Integration tools read service-specific keys (`STRIPE_SECRET_KEY`,
`SHOPIFY_ACCESS_TOKEN`, `SENDGRID_API_KEY`, `NOTION_API_KEY`, etc.) — only the
ones for integrations you use are required.

## The knowledge graph (TypeDB)

TypeDB is the graph database and ontology store. To run it locally:

```bash
cd extensions/mabos/extensions-mabos/docker
./typedb.sh up
export TYPEDB_URL=http://127.0.0.1:8729
```

Full details — Docker setup, schema, database naming, data flow, and
troubleshooting — are in [TypeDB Knowledge Graph](typedb-knowledge-graph.md).

## Control-plane APIs

MABOS exposes REST + tool surfaces (gateway bearer auth) for creating,
operating, and enriching instances. All routes are under `/mabos/*` and require:

```text
Authorization: Bearer <OPENCLAW_GATEWAY_TOKEN>
```

| API                                       | Surface                | What it does                                                 |
| ----------------------------------------- | ---------------------- | ------------------------------------------------------------ |
| [Provisioning API](provisioning-api.md)   | `/mabos/provision/*`   | Create + deploy instances (async, pollable jobs)             |
| [Tool API](tool-api.md)                   | `/mabos/tools`, `/mabos/api/index` | Discover and invoke any MABOS tool over REST       |
| [Enrichment API](enrichment-api.md)       | `/mabos/enrichment/*`  | Smart-default assumptions, validation, predict/prescribe     |

The Tool API is the most general entry point: every registered agent tool is
also callable over HTTP, and `/mabos/api/index` returns the machine-readable
catalog.

## Working with agents (BDI)

Each business gets 9 C-suite agents (CEO, CFO, COO, CMO, CTO, HR, Legal,
Strategy, Knowledge) plus domain agents. Every agent has a workspace of 10
cognitive files (`Persona.md`, `Beliefs.md`, `Desires.md`, `Goals.md`,
`Intentions.md`, `Plans.md`, `Capabilities.md`, `Memory.md`, `Cases.md`,
`Playbook.md`) — see the [README](../README.md#agent-architecture).

Agents reason through a 5-phase **BDI cycle**:

```text
PERCEIVE → DELIBERATE → PLAN → ACT → LEARN
```

Trigger one with the `bdi_cycle` tool:

```text
bdi_cycle(agent_id: "ceo", depth: "full")
```

Agent-emitted updates (BELIEF_UPDATES, GOAL_UPDATES, NEW_INTENTIONS) are not
written verbatim — they pass through the five-stage **assimilation pipeline**
(`src/cognitive/assimilation/`) that validates against the SBVR ontology, SHACL
shapes, and deontic rules before committing. See the
[README](../README.md#llm-output-assimilation-pipeline).

## Data model: facts, ontology, assumptions

- **Facts** — SPO triples (`subject`, `predicate`, `object`) with confidence,
  source, and temporal validity. Written via `assertFactDirect`
  (`src/tools/fact-store.ts`), which dual-writes the JSON mirror and TypeDB and
  runs contradiction detection. Facts are scoped to a role agent (the
  business is the `subject`).
- **Ontology** — a 3-layer JSON-LD/OWL stack (upper, business-core, per-domain)
  in `src/ontology/`, validated with SHACL shapes and converted to TypeQL by
  `src/knowledge/typedb-schema.ts`.
- **Assumptions** — during onboarding, missing `CompanyDNA` fields are inferred
  as tracked `Assumption`s. When validated (explicitly or via Bayesian evidence)
  they are **promoted into the knowledge-agent fact store** so reasoning only
  ever sees confirmed knowledge. See the [Enrichment API](enrichment-api.md).

## Extending MABOS

### Add a new tool module

1. Create `src/tools/my-feature-tools.ts` exporting a factory:

   ```ts
   import type { OpenClawPluginApi, AnyAgentTool } from "openclaw/plugin-sdk";

   export function createMyFeatureTools(api: OpenClawPluginApi): AnyAgentTool[] {
     return [
       {
         name: "my_feature_do",
         description: "…",
         // input schema via @sinclair/typebox
         async run(params) {
           /* … */
         },
       },
     ];
   }
   ```

2. Register it in `index.ts` by adding the factory to the `factories` array
   (around the `createBdiTools, createPlanningTools, …` list). Each factory is
   called with `api`, its tools are registered with `api.registerTool(tool)`, and
   they are automatically exposed over the Tool API.

Follow the existing patterns: typed schemas (no `any`), `textResult(...)` for
tool output, `resolveWorkspaceDir(api)` / `getPluginConfig(api)` for paths and
config (`src/tools/common.ts`).

### Add an HTTP control-plane route

Register routes with `api.registerHttpRoute(...)` under the `/mabos/*` prefix
and `auth: "gateway"`. Mirror an existing module — `registerProvisioning(api)`,
`registerEnrichmentRoutes(api, deps)`, and `registerToolApi(api, { tools })` are
all wired from `index.ts`.

### Write to the knowledge graph

Use the singleton client and always guard on availability:

```ts
import { getTypeDBClient } from "../knowledge/typedb-client.js";

const client = getTypeDBClient();
if (client.isAvailable()) {
  await client.insertData(typeql, `mabos_${role}`);
}
```

Prefer routing fact writes through `assertFactDirect` rather than hand-writing
TypeQL, so you get the JSON mirror, contradiction detection, and materialization
for free. See [TypeDB Knowledge Graph](typedb-knowledge-graph.md#how-data-flows-into-the-graph).

## Testing

The extension uses Vitest via the repo's extensions config. From the repo root:

```bash
# all MABOS tests
pnpm test -- --config vitest.extensions.config.ts extensions/mabos/extensions-mabos

# a single file
npx vitest run --root . --config vitest.extensions.config.ts \
  extensions/mabos/extensions-mabos/tests/enrichment.test.ts
```

Or from the extension directory: `pnpm test` (the package script already points
Vitest at the repo root and config).

Tests run file-based by default. To force TypeDB off in a test run, set
`TYPEDB_SKIP=1`. Stub the LLM with a fake `LlmCallFn` and use temp workspaces
(see `tests/enrichment.test.ts` for the pattern).

## Troubleshooting

- **TypeDB writes not landing** — see
  [TypeDB troubleshooting](typedb-knowledge-graph.md#troubleshooting).
- **`/mabos/*` returns 401** — missing/wrong `OPENCLAW_GATEWAY_TOKEN` bearer.
- **Tool not appearing over REST** — confirm its factory is in the `factories`
  array in `index.ts`; the Tool API reflects the live registered-tools list.
- **Model calls failing** — ensure at least one provider key is set; the model
  router only considers providers with a key and fails over on 429/5xx.

## Code map

| Path                              | Responsibility                                         |
| --------------------------------- | ------------------------------------------------------ |
| `index.ts`                        | Plugin entry: tool registration, routes, hooks         |
| `src/tools/`                      | Agent tool modules (BDI, facts, memory, marketing, …)  |
| `src/knowledge/`                  | TypeDB client, query builders, schema, dashboard        |
| `src/ontology/`                   | JSON-LD/OWL ontology, loader, SBVR exporter, SHACL      |
| `src/cognitive/assimilation/`     | LLM-output assimilation pipeline (5-stage gate)         |
| `src/gdc/`                        | Goal Decomposition Chain (onboarding cognitive build)   |
| `src/provisioning/`               | Provisioning control plane (`/mabos/provision/*`)       |
| `src/enrichment/`                 | Smart defaults, assumptions, predict/prescribe          |
| `src/model-router/`               | Effort/cost/capacity-aware LLM provider selection       |
| `src/tool-api/`                   | REST exposure of the tool surface (`/mabos/tools`)      |
| `src/reasoning/`                  | Multi-method reasoning (Bayesian, causal, social, …)    |
| `src/coordination/`               | ACL messaging, BDI API, agent coordination              |
| `docker/`                         | Local TypeDB knowledge-graph stack                      |
| `ui/`                             | React stakeholder dashboard                             |
| `docs/`                           | This guide and the control-plane API references         |
