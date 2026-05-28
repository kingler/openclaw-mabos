# Feature Checklist - OpenClaw-MABOS

**Generated**: 2026-05-22
**Source**: codebase walk of `extensions/mabos/extensions-mabos/src/` + `packages/` + `ui/src/pages/`, cross-referenced with `docs/plans/2026-03-29-unified-mabos-design.md` and the OpenClaw-MABOS Linear board.

Module rows show implementation completion (code present + tests written), test pass rate (subject to environment fixes in [ONEK-431](https://linear.app/designthru-ai/issue/ONEK-431) / [ONEK-432](https://linear.app/designthru-ai/issue/ONEK-432)), and the Linear issue mirroring the work.

## Phase 1-3: Backend Runtime Modules — 100% code complete

| Capability                                                    | Source                                                                                                     | Tests                                        | Linear   | Notes                                                                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| Prompt-injection scanner (8 default patterns + extras)        | [src/security/injection-scanner.ts](extensions/mabos/extensions-mabos/src/security/injection-scanner.ts)   | security-scanner.test.ts                     | ONEK-406 | Passing                                                                                                    |
| SSRF URL validator                                            | [src/security/url-validator.ts](extensions/mabos/extensions-mabos/src/security/url-validator.ts)           | security-url-validator.test.ts               | ONEK-406 | Passing                                                                                                    |
| Dangerous-tool approval guard                                 | [src/security/tool-guard.ts](extensions/mabos/extensions-mabos/src/security/tool-guard.ts)                 | security-tool-guard.test.ts                  | ONEK-406 | 5/5 passing                                                                                                |
| Security hooks + HTTP routes                                  | [src/security/](extensions/mabos/extensions-mabos/src/security/)                                           | security-hooks/-routes/-registration.test.ts | ONEK-406 | Registration 2 failing — plugin API mock gap ([ONEK-432](https://linear.app/designthru-ai/issue/ONEK-432)) |
| Budget ledger w/ reservations + settlements                   | [src/governance/budget-ledger.ts](extensions/mabos/extensions-mabos/src/governance/budget-ledger.ts)       | governance-budget-ledger.test.ts             | ONEK-407 | 5 failing — SQLite ABI ([ONEK-431](https://linear.app/designthru-ai/issue/ONEK-431))                       |
| RBAC + company scope                                          | [src/governance/](extensions/mabos/extensions-mabos/src/governance/)                                       | governance-rbac.test.ts                      | ONEK-407 | Passing                                                                                                    |
| Audit log                                                     | [src/governance/audit-log.ts](extensions/mabos/extensions-mabos/src/governance/audit-log.ts)               | governance-audit-log.test.ts                 | ONEK-407 | 3 failing — SQLite ABI                                                                                     |
| Governance tools (budget_status, budget_request, audit_query) | [src/governance/tools.ts](extensions/mabos/extensions-mabos/src/governance/tools.ts)                       | governance-tools.test.ts                     | ONEK-407 | 4 failing — SQLite ABI                                                                                     |
| Model registry + resolver                                     | [src/model-router/](extensions/mabos/extensions-mabos/src/model-router/)                                   | model-router-resolver.test.ts                | ONEK-408 | Passing                                                                                                    |
| Mixture-of-Agents ensemble                                    | [src/model-router/moa.ts](extensions/mabos/extensions-mabos/src/model-router/moa.ts)                       | model-router-moa.test.ts                     | ONEK-408 | Passing                                                                                                    |
| Cost estimator + prompt cache                                 | [src/model-router/](extensions/mabos/extensions-mabos/src/model-router/)                                   | (covered by hooks/routes)                    | ONEK-408 | Passing                                                                                                    |
| Model router hooks + routes                                   | [src/model-router/](extensions/mabos/extensions-mabos/src/model-router/)                                   | model-router-hooks/-routes.test.ts           | ONEK-408 | Passing                                                                                                    |
| FTS5 session index                                            | [src/session-intel/session-index.ts](extensions/mabos/extensions-mabos/src/session-intel/session-index.ts) | session-intel-index.test.ts                  | ONEK-409 | 8 failing — SQLite ABI                                                                                     |
| Session recall + user model                                   | [src/session-intel/](extensions/mabos/extensions-mabos/src/session-intel/)                                 | session-intel-index.test.ts (groups)         | ONEK-409 | Same SQLite cause                                                                                          |
| Session-intel hooks + routes                                  | [src/session-intel/](extensions/mabos/extensions-mabos/src/session-intel/)                                 | session-intel-hooks/-routes.test.ts          | ONEK-409 | Passing                                                                                                    |
| Execution sandbox manager + local backend                     | [src/execution-sandbox/](extensions/mabos/extensions-mabos/src/execution-sandbox/)                         | sandbox-local.test.ts                        | ONEK-410 | Passing                                                                                                    |
| Sandbox hooks + routes                                        | [src/execution-sandbox/](extensions/mabos/extensions-mabos/src/execution-sandbox/)                         | sandbox-hooks/-routes.test.ts                | ONEK-410 | Passing                                                                                                    |
| Skill registry + creator + nudge                              | [src/skill-loop/](extensions/mabos/extensions-mabos/src/skill-loop/)                                       | skill-loop-registry.test.ts                  | ONEK-411 | Passing                                                                                                    |
| Skill marketplace + injector                                  | [src/skill-loop/](extensions/mabos/extensions-mabos/src/skill-loop/)                                       | (covered by hooks/routes)                    | ONEK-411 | Passing                                                                                                    |
| Skill-loop hooks + routes                                     | [src/skill-loop/](extensions/mabos/extensions-mabos/src/skill-loop/)                                       | skill-loop-hooks/-routes.test.ts             | ONEK-411 | Passing                                                                                                    |

## Phase 1-3 supporting subsystems (existing MABOS core, kept Done by association)

| Capability                                                        | Source                                                                                                                               | Tests                                                                                                                   | Notes                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| BDI cognitive loop + tool registry                                | [src/tools/](extensions/mabos/extensions-mabos/src/tools/) (76 files)                                                                | cognitive-fixes, observer, reflector, fact-store-integrity, source-authority, temporal-utils, tool-filter, domain-tools | Largely passing                                 |
| Knowledge / TypeDB                                                | [src/knowledge/](extensions/mabos/extensions-mabos/src/knowledge/)                                                                   | typedb-fallback, typedb-reverse-sync, ontology                                                                          | One ontology range failure                      |
| Reasoning engine (formal/causal/probabilistic/social/meta/fusion) | [src/reasoning/](extensions/mabos/extensions-mabos/src/reasoning/)                                                                   | reasoning-engine.test.ts                                                                                                | File-level failure flagged; needs investigation |
| GDC (cognitive writer, persona, prompt builder, domain agent)     | [src/gdc/](extensions/mabos/extensions-mabos/src/gdc/)                                                                               | gdc-\* (6 test files)                                                                                                   | Domain agent generator 1 failing                |
| Cron bridge + sync runner                                         | [src/cron-bridge.ts](extensions/mabos/extensions-mabos/src/cron-bridge.ts), [src/sync/](extensions/mabos/extensions-mabos/src/sync/) | cron-bridge, shopify-sync, direct-api-sync, capabilities-sync                                                           | Recent stale-parent recovery coverage added     |
| Ontology corpus                                                   | [src/ontology/](extensions/mabos/extensions-mabos/src/ontology/) (10 jsonld files)                                                   | ontology.test.ts                                                                                                        | 1 range-resolution failure                      |

## Phase 4: Foundation Packages — 100%

| Package                                                | Path                                                 | Linear   | Notes                                          |
| ------------------------------------------------------ | ---------------------------------------------------- | -------- | ---------------------------------------------- |
| @mabos/shared (zod types + constants)                  | [packages/shared/](packages/shared/)                 | ONEK-413 | v0.1.0                                         |
| @mabos/db (better-sqlite3 client)                      | [packages/db/](packages/db/)                         | ONEK-413 | v0.1.0; depends on ONEK-431 native binding fix |
| @mabos/gateway-client (REST + SSE)                     | [packages/gateway-client/](packages/gateway-client/) | ONEK-413 | v0.1.0; depends on @mabos/shared               |
| @mabos/ui-kit (StatusBadge, MetricCard, SectionHeader) | [packages/ui-kit/](packages/ui-kit/)                 | ONEK-413 | v0.1.0; React 19 peer                          |

## Phase 5: Mission Control Migration — 0%

| Slice                                | Linear   | Status      |
| ------------------------------------ | -------- | ----------- |
| Tasks CRUD + agents + SSE + dispatch | ONEK-414 | Todo (High) |
| Planning workflow routes             | ONEK-415 | Todo        |
| Kanban + workspace routes            | ONEK-416 | Todo        |
| Sync engine + learner                | ONEK-417 | Todo        |

## Phase 6: Unified Console SPA — ~30% (existing 29 pages predate this phase)

| Slice                                       | Linear   | Status |
| ------------------------------------------- | -------- | ------ |
| MC UI components (MissionQueue, ...)        | ONEK-418 | Todo   |
| 8-section navigation merge                  | ONEK-419 | Todo   |
| Vite base path migration to /mabos/console/ | ONEK-420 | Todo   |
| Login page + auth integration               | ONEK-421 | Todo   |

## Phase 7: Orchestrator + Hermes Adapter — 0%

| Slice                       | Linear   | Status      |
| --------------------------- | -------- | ----------- |
| Adapter manager             | ONEK-422 | Todo (High) |
| Hermes Python adapter       | ONEK-423 | Todo        |
| Better Auth integration     | ONEK-424 | Todo        |
| Heartbeat scheduling        | ONEK-425 | Todo        |
| Adapters + Plugins admin UI | ONEK-426 | Todo        |

## Phase 8: Polish + Release — 0%

| Slice                                | Linear   | Status |
| ------------------------------------ | -------- | ------ |
| Data migration from legacy MC SQLite | ONEK-427 | Todo   |
| Docker consolidation                 | ONEK-428 | Todo   |
| README + deployment docs             | ONEK-429 | Todo   |
| End-to-end test suite                | ONEK-430 | Todo   |

## Cross-cutting maintenance

| Issue                                            | Linear   | Priority |
| ------------------------------------------------ | -------- | -------- |
| better-sqlite3 prebuild for Node ABI 127         | ONEK-431 | High     |
| Mock registerHttpRoute in plugin API test double | ONEK-432 | Medium   |
| UI router tsconfig (paths + JSX) for tsgo        | ONEK-433 | Medium   |
