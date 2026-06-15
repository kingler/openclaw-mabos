# Multi-Agent System Architecture (OpenClaw-MABOS)

This document is the **root-level architecture index** for the multi-agent stack in this repository. Canonical marketing and deep detail remain in [`README.md`](README.md); OpenClaw gateway and channel docs live under [`docs/`](docs/).

## Purpose

**OpenClaw-MABOS** layers a Multi-Agent Business Operating System on [OpenClaw](https://github.com/openclaw/openclaw): many isolated agents, a single gateway process, messaging channels, and the **MABOS** extension plugin (BDI-style agents, governance, TypeDB knowledge, Mission Control UI).

## Runtime topology

```
Mission Control (dashboard UI)
        ↓
OpenClaw Gateway (default port 18789)
        ↓
MABOS extension modules (hooks + REST under /mabos/{module}/...)
        ↓
Channels (35+ messaging surfaces) · Storage (TypeDB, PostgreSQL, SQLite, LanceDB, …)
```

## MABOS extension layout

Implementation lives under `extensions/mabos/extensions-mabos/src/`:

| Area                 | Role                                           |
| -------------------- | ---------------------------------------------- |
| `knowledge/`         | TypeDB knowledge graph (TypeQL, queries, sync) |
| `governance/`        | Budget ledger, RBAC, audit                     |
| `model-router/`      | Multi-model routing, cost, prompt cache        |
| `session-intel/`     | Session search, recall, user modeling          |
| `security/`          | Injection/SSRF/tool guards                     |
| `execution-sandbox/` | Docker / SSH / Modal / local backends          |
| `skill-loop/`        | Skill creation and marketplace hooks           |
| `provisioning/`      | Control plane to create + deploy instances (`/mabos/provision/*`) |
| `tool-api/`          | REST access to all MABOS tools + unified API index (`/mabos/tools`, `/mabos/api/index`) |
| `enrichment/`        | Smart-default assumptions, continuous enrichment, validation, predict/prescribe (`/mabos/enrichment/*`) |
| `reasoning/`         | Reasoning methods                              |
| `ontology/`          | SBVR-aligned schemas                           |
| `tools/`             | Business integrations (e.g. Shopify)           |
| `gdc/`               | Goal Decomposition Chain                       |
| `dashboard/`         | Mission Control UI pieces                      |

Each runtime area typically exposes **lifecycle hooks** (`api.on(...)`) and **HTTP routes** for dashboard and automation.

## Cognitive model (summary)

- **BDI loop** per agent with structured workspace state (beliefs, desires, goals, intentions, etc.).
- **Dual-process router**: reflexive → analytical → deliberative tiers.
- **Reasoning**: large catalog of methods (formal, probabilistic, causal, social, meta).
- **Knowledge**: TypeDB for graph data; SBVR-oriented ontology for vocabulary and rules.

## Isolation and routing (OpenClaw core)

For how multiple **agent IDs**, workspaces, `agentDir`, and channel **bindings** interact in one gateway, see [Multi-Agent Routing](docs/concepts/multi-agent.md).

## Related references

- [README.md](README.md) — full architecture diagram, agent roster, module APIs
- [.context/README.md](.context/README.md) — module map and area status
- [docs/concepts/multi-agent.md](docs/concepts/multi-agent.md) — gateway multi-agent routing
- [docs/tools/multi-agent-sandbox-tools.md](docs/tools/multi-agent-sandbox-tools.md) — sandbox tools
