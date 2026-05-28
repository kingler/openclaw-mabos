# Deployment Readiness - OpenClaw-MABOS

**Generated**: 2026-05-22
**Verdict**: **Not ready** for public release. Internal/dev deployments fine.

## Go / No-Go Checklist

### Build & test gates

| Gate                                                                | Status       | Blockers                                                               |
| ------------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------- |
| `pnpm install` (with lifecycle scripts)                             | OK           | none                                                                   |
| `pnpm check` (oxlint + oxfmt)                                       | **Fail**     | 13 format-drift files; auto-fixable via `pnpm format:fix`              |
| `pnpm tsgo` (root typecheck)                                        | **Fail**     | UI router.tsx tsconfig path/JSX (ONEK-433); 1 infra type error         |
| `pnpm exec vitest run extensions/mabos/extensions-mabos/tests/ ...` | 377/410 pass | 33 failing — all infra (ONEK-431 SQLite ABI, ONEK-432 plugin API mock) |
| `pnpm build`                                                        | Not run      | Pending the two failures above                                         |
| `pnpm release:check`                                                | Not run      | Required pre-tag per docs/reference/RELEASING.md                       |

### Source-tree completeness vs unified design

| Area                        | State                                                                                                                                                                             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Six unified runtime modules | Present under [extensions/mabos/extensions-mabos/src/](extensions/mabos/extensions-mabos/src/) (security, governance, model-router, session-intel, execution-sandbox, skill-loop) |
| Foundation packages         | Present under [packages/](packages/) (shared, db, gateway-client, ui-kit)                                                                                                         |
| Mission Control engine      | **Missing** — no `src/mission-control/` tree (Phase 5)                                                                                                                            |
| Orchestrator                | **Missing** — no `src/orchestrator/` tree (Phase 7)                                                                                                                               |
| Hermes Python adapter       | **Missing** (Phase 7)                                                                                                                                                             |
| Unified console SPA         | Pages present (29) but Vite base path, login route, MC component imports, and 8-section nav are **pending** (Phase 6)                                                             |
| Docker setup                | 4 Dockerfiles + docker-compose.yml present but consolidation pending (Phase 8 / [ONEK-428](https://linear.app/designthru-ai/issue/ONEK-428))                                      |
| Deployment docs             | **Missing** — Phase 8 / [ONEK-429](https://linear.app/designthru-ai/issue/ONEK-429); current docs in `docs/` cover dev workflows, not consolidated MABOS install                  |

### Operational readiness

| Concern                              | State                                                                                                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| End-to-end test (console to runtime) | **Missing** — Phase 8 / [ONEK-430](https://linear.app/designthru-ai/issue/ONEK-430)                                                                                            |
| Data migration from legacy MC        | **Missing** — Phase 8 / [ONEK-427](https://linear.app/designthru-ai/issue/ONEK-427)                                                                                            |
| Auth                                 | **Missing** — Better Auth wiring in Phase 7 / [ONEK-424](https://linear.app/designthru-ai/issue/ONEK-424); current admin routes rely on plugin auth + dashboard referer bypass |
| Monitoring / observability           | Partial — `clawlog.sh` script + structured logs; no consolidated dashboard for the new modules                                                                                 |
| Secrets management                   | OK — `.env.enc` + sops in place; release signing/notary docs in `docs/reference/RELEASING.md` and `docs/platforms/mac/release.md`                                              |
| Release signing                      | OK — Sparkle appcast + notary env vars expected (documented)                                                                                                                   |

## Deployment paths and status

| Target                              | Status               | What's needed before release                                                                                                                       |
| ----------------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local dev (Node 22 + pnpm)**      | Works today          | Run `pnpm format:fix` + fix SQLite ABI; suite goes green.                                                                                          |
| **Docker (dev compose)**            | Works today          | Compose stack runs; consolidation in [ONEK-428](https://linear.app/designthru-ai/issue/ONEK-428) is a polish, not a blocker.                       |
| **exe.dev VM**                      | Works today          | Standard openclaw install + gateway-mode=local works (`docs/gateway/doctor.md`).                                                                   |
| **Mac app (Sparkle)**               | Works today for core | The new MABOS modules need a release pass after Phase 5-8; current Mac app shipping is on the existing openclaw cadence, not on the unified MABOS. |
| **Public release of unified MABOS** | **Not ready**        | All of Phase 5-8 + the maintenance fixes above.                                                                                                    |

## Risk register

| Risk                                                                    | Mitigation                                                                               |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| SQLite native binding breaks in CI/exe.dev VM                           | Pin install path + lifecycle scripts; ONEK-431                                           |
| Phase 5 slips past 2026-06-15, cascades to Phase 6 / 7                  | Start ONEK-414 this week; tracer-bullet route slice first                                |
| Orchestrator to Hermes IPC contract drifts mid-implementation           | Write the 1-page IPC spec before writing code (see recommendations §4)                   |
| CLI Agent integration goes stale before Task 11 (smoke cycle) completes | Finish the orchestrator message contract; ONEK-422 effectively unblocks this             |
| Deprecated Linear `/sse` MCP transport finally removed mid-cycle        | Migrate to `https://mcp.linear.app/mcp` per the migration guide (see recommendations §8) |

## Recommended release cadence

1. **2026-W22 (this week):** unblock tests + lint + tsgo (P0).
2. **2026-W23-24:** Phase 5 routes land (tasks CRUD + kanban + planning).
3. **2026-W25-26:** Phase 5 sync/learner + Phase 6 console SPA work in parallel.
4. **2026-W27-28:** Phase 7 orchestrator + Hermes adapter.
5. **2026-W29-30:** Phase 8 polish — Docker consolidation, docs, e2e, migration script.
6. **2026-W31:** Public unified MABOS release candidate.

This is aggressive but matches the milestone targets in the Linear project.
