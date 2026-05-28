# Identified Issues - OpenClaw-MABOS

**Generated**: 2026-05-22

Issues found during the codebase walk and gate runs (`pnpm exec vitest run ... --config vitest.extensions.config.ts`, `pnpm check`, `pnpm tsgo`). Each has a Linear issue ID. Higher severity = more likely to block a release.

## High severity

### 1. Native better-sqlite3 binding missing for Node ABI 127 — [ONEK-431](https://linear.app/designthru-ai/issue/ONEK-431)

Vitest fails when constructing `SessionIndex` (and the governance ledger/audit/tools) because no compiled `.node` binding resolves under `node_modules/.pnpm/better-sqlite3@12.8.0/`. `pnpm rebuild better-sqlite3` returns empty without error. **Blast radius:** 17 of the 33 failing assertions trace here. **Likely root cause:** pnpm `ignore-scripts` or hoist-pattern is preventing the install hook from compiling for the current Node ABI.

### 2. Plugin API mock gap — registerHttpRoute absent — [ONEK-432](https://linear.app/designthru-ai/issue/ONEK-432)

`security-registration.test.ts` (2 failures) and likely `acl-message-delivery.test.ts` (12 failures) fail at the test-harness layer because the `OpenClawPluginApi` mock used in tests doesn't stub `registerHttpRoute`. All six new modules call it; only Security's registration test currently exercises it. Add a shared mock in the extension test helpers.

### 3. Phase 5-8 zero progress against published milestones

Phase 5 (Mission Control Migration) targets 2026-06-15; Phase 6 (Unified Console SPA) targets 2026-07-01. Neither has any source-tree work yet. No `src/mission-control/` or `src/orchestrator/` directories exist. Slipping is increasingly likely without a focused MC port starting in the next 2-week window.

## Medium severity

### 4. Root tsgo red — UI router tsconfig + one infra type error — [ONEK-433](https://linear.app/designthru-ai/issue/ONEK-433)

`pnpm tsgo` reports TS2307 for every `@/pages/*` import in [extensions/mabos/extensions-mabos/ui/src/router.tsx](extensions/mabos/extensions-mabos/ui/src/router.tsx), plus TS17004 (JSX flag missing). The root tsconfig is picking these UI files up but the UI's own `tsconfig.json` (with `paths` + `jsx: "react-jsx"`) isn't being honoured for them. Vite still builds the SPA. Also fix [src/infra/update-runner.test.ts:347](src/infra/update-runner.test.ts) where a test-time `CommandRunner` mock has `cwd: string` instead of `cwd?: string`.

### 5. Formatting drift — 13 files fail oxfmt --check

`pnpm check` reports format issues in 13 files including `docs/plans/2026-05-22-cli-agent-design.md`, `docs/plans/2026-05-22-cli-agent-implementation.md`, several `cli-engineer/*.md`, `extensions/mabos/extensions-mabos/scripts/director-orchestrator.ts`, `ui/src/index.css`, `ui/src/styles/design-tokens.css`, `dashboard/index.html`. Auto-fixable via `pnpm format:fix`. No Linear issue required — fix in the next PR.

### 6. ACL message delivery — 12 test failures

`acl-message-delivery.test.ts` fails 12 assertions across access control + delivery + round-trip + multi-agent chain scenarios. Likely the same plugin-API mock gap as ONEK-432, but needs independent verification: the failure rationale isn't in the truncated output. Filed under ONEK-432 for now; if root cause differs, split into its own bug.

### 7. Ontology range references unresolved — 1 test failure

`ontology.test.ts > Ontology Structure > should have all range references resolve`. Indicates one or more `@id`/`@range` references in the .jsonld corpus point at something that no longer exists in the schema. Low-impact but should be cleaned before any consumer relies on transitive range traversal.

### 8. GDC domain-agent generator — 1 test failure

`gdc-domain-agent-generator.test.ts > generates domain agents from LLM response`. Likely a mock-response shape that drifted from the real generator's parsing expectations. Investigate the GDC orchestrator path before it bites in onboarding.

### 9. Reasoning engine suite — file-level failure

`reasoning-engine.test.ts` reports a file-level FAIL (not a per-test count). Could be an import-time / module-load error rather than a logic bug. Worth opening the file and running it solo to surface the underlying error.

## Low severity

### 10. CLI Agent integration — Task 11 deferred (capability registration unwired)

Per [docs/plans/2026-05-22-cli-agent-design.md](docs/plans/2026-05-22-cli-agent-design.md) verification log: `cli-engineer/Task.md` documents the intended ACL smoke-test flow as "not verified" because the orchestrator's ad-hoc message contract is undocumented. Capability-registration mechanism is also marked unwired in v1. Low-impact since the consume path (`/pp-linear`) is proven, but a follow-up is needed before MABOS agents can rely on the CLI Agent in production.

### 11. CLI Agent — Persona.md symlink dependency

MABOS `cli-engineer/Persona.md` is a symlink to `~/.claude/agents/cli-agent.md`. New contributors must run `scripts/install-cli-agent.sh` once per machine or the symlink dangles. Bootstrap script warns clearly; no action needed unless we see new-contributor friction.

### 12. Multiple Dockerfiles ahead of Phase 8 consolidation

4 Dockerfiles at the repo root (`Dockerfile`, `.sandbox`, `.sandbox-browser`, `.sandbox-common`) plus `docker-compose.yml` and `setup-podman.sh`. Functional, but the consolidation tracked in [ONEK-428](https://linear.app/designthru-ai/issue/ONEK-428) will simplify operator setup considerably.

### 13. Markdownlint warnings on tables

Cosmetic only. Markdownlint reports MD060 column-alignment drift in many tables. Doesn't block CI. Consider a project-level `.markdownlint-cli2.jsonc` override or a one-pass cleanup if it grows annoying.

## Out of scope for this analysis

- Real-data sync correctness (Shopify, Stripe, SendGrid, GA) — passing in current suite but live tests not run.
- Performance characteristics under load — would require a separate audit.
- Security audit of the runtime — different scope; SECURITY.md applies repo-wide.
