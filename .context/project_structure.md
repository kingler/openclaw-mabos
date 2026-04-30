# Project Structure — OpenClaw-MABOS

**Updated**: 2026-04-15  
**Approx. file count** (excluding `node_modules`, `.git`, `dist`): **~9,647** files (`find` estimate).

## Top-level

| Path                                | Role                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `src/`                              | OpenClaw core (CLI, gateway, channels, providers, …)                                       |
| `extensions/`                       | Channel + feature plugins (**`extensions/mabos/`** = MABOS)                                |
| `apps/`                             | macOS, iOS, Android, shared                                                                |
| `packages/`                         | Workspace libs (`@mabos/shared`, `@mabos/db`, `@mabos/gateway-client`, `@mabos/ui-kit`, …) |
| `docs/`                             | Product and developer documentation                                                        |
| `test/`                             | Core repo tests                                                                            |
| `skills/`                           | Bundled skills                                                                             |
| `ui/`                               | Control UI (core)                                                                          |
| `MULTI_AGENT_SYSTEM.md`             | Root architecture index                                                                    |
| `MABOS-DESCRIPTION.md`, `VISION.md` | Product / vision                                                                           |

## MABOS plugin (`extensions/mabos/extensions-mabos/`)

### `src/` (plugin backend)

```
cron-bridge.ts
dashboard/
execution-sandbox/
gdc/
governance/
knowledge/
model-router/
onboarding/
ontology/
reasoning/
security/
session-intel/
skill-loop/
sync/
tools/
types/
```

**Not present** (per unified plan future phases): `mission-control/`, `orchestrator/` as first-class folders.

### `ui/src/pages/` — 29 pages

Includes: `OverviewPage`, `WorkspacePage`, `BusinessGoalsPage`, `ProjectsPage`, `InitiativesPage`, `MarketingPage`, `TasksPage`, `AgentsPage`, `GovernancePage`, `SecurityPage`, `SessionsPage`, `SkillsPage`, `WorkflowsPage`, `OnboardingPage`, … (full list: `ls extensions/mabos/extensions-mabos/ui/src/pages/`).

### `tests/` — 55 `*.test.ts` files

Covers security, governance, model-router, GDC, sandbox, skill-loop, session-intel, plugin, sync, ontology, tools, etc.

## Workspace packages (`packages/`)

- `clawdbot`, `db`, `gateway-client`, `moltbot`, `shared`, `ui-kit`

## Related docs

- `docs/plans/2026-03-29-unified-mabos-design.md` — architecture
- `docs/plans/2026-03-29-unified-mabos-implementation.md` — phased implementation
- `.context/README.md` — quick module map table

## Consolidation plans

- **`.claude/plans/`**: empty in this snapshot — no active decomposition tree here.
