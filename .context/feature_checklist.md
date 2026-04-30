# Feature Checklist — OpenClaw-MABOS

**Updated**: 2026-04-15  
Maps major capabilities to implementation location and test coverage. Linear issue IDs (**ONEK-XXX**) must be filled manually after board sync.

| Capability                                                       | Source path (extension)                       | Test files (pattern)                          | Est. completion                    | Linear      |
| ---------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------- | ---------------------------------- | ----------- |
| Security (scanner, sanitizer, URL validator, tool guard, routes) | `src/security/`                               | `security-*.test.ts` (6 files)                | ~85% code; tests flaky/mocks       | ONEK-\_\_\_ |
| Governance (budget, RBAC, audit, tools, routes)                  | `src/governance/`                             | `governance-*.test.ts` (4 files)              | ~85% code; DB tests env-sensitive  | ONEK-\_\_\_ |
| Model router (registry, resolver, MoA, hooks, routes)            | `src/model-router/`                           | `model-router-*.test.ts` (4 files)            | ~90%                               | ONEK-\_\_\_ |
| Session intel (index, recall, hooks, routes)                     | `src/session-intel/`                          | `session-intel-*.test.ts` (3 files)           | ~85%; SQLite binding issue         | ONEK-\_\_\_ |
| Execution sandbox (local/docker/ssh/modal, hooks, routes)        | `src/execution-sandbox/`                      | `sandbox-*.test.ts` (3 files)                 | ~85%                               | ONEK-\_\_\_ |
| Skill loop (registry, creator, hooks, routes)                    | `src/skill-loop/`                             | `skill-loop-*.test.ts` (3 files)              | ~90%                               | ONEK-\_\_\_ |
| Knowledge / TypeDB                                               | `src/knowledge/`                              | `typedb-*.test.ts`, `fact-store-*.test.ts`, … | Ongoing                            | ONEK-\_\_\_ |
| Reasoning engine                                                 | `src/reasoning/`                              | `reasoning-engine.test.ts`, …                 | High surface                       | ONEK-\_\_\_ |
| GDC / onboarding                                                 | `src/gdc/`, `src/onboarding/`                 | `gdc-*.test.ts`, `onboarding-*.test.ts`       | Partial                            | ONEK-\_\_\_ |
| Mission Control UI                                               | `ui/src/pages/` (29 `.tsx`)                   | E2E/manual                                    | High page count; migration pending | ONEK-\_\_\_ |
| Foundation packages                                              | `packages/{shared,db,gateway-client,ui-kit}/` | Package-level tests if any                    | Scaffolded                         | ONEK-\_\_\_ |
| Mission Control **service** migration                            | _planned_ `src/mission-control/`              | `mc-*.test.ts` _n/a_                          | 0%                                 | Phase 5     |
| Orchestrator + Hermes adapter                                    | _planned_ `src/orchestrator/`                 | `orch-*.test.ts` _n/a_                        | 0%                                 | Phase 7     |

## Test file counts (extensions-mabos)

| Pattern                                                             | Count  |
| ------------------------------------------------------------------- | ------ |
| `security-*.test.ts`                                                | 6      |
| `governance-*.test.ts`                                              | 4      |
| `model-router-*.test.ts`                                            | 4      |
| `session-intel-*.test.ts`                                           | 3      |
| `sandbox-*.test.ts`                                                 | 3      |
| `skill-loop-*.test.ts`                                              | 3      |
| **Total `*.test.ts` in `extensions/mabos/extensions-mabos/tests/`** | **55** |

## Dashboard pages (`ui/src/pages/`)

29 files including: Overview, Workspace, Business goals, Projects, **Initiatives**, Marketing, Tasks, Agents, Governance, Security, Sessions, Skills, Workflows, Onboarding, etc.
