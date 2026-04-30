# Recommendations — OpenClaw-MABOS

**Updated**: 2026-04-15  
Prioritized for **deployment readiness** and **tracker accuracy**.

## P0 — Block release / CI green

1. **Restore `pnpm-lock.yaml`** (or regenerate with team agreement) so `pnpm install` and `pnpm build` are reproducible and A2UI bundling succeeds.
2. **Run `pnpm format:fix`** and commit formatted sources so `pnpm check` passes.

## P1 — Test reliability

3. **Rebuild or install `better-sqlite3`** for the active Node ABI on developer machines and CI images (`pnpm rebuild better-sqlite3` after `pnpm install`).
4. **Extend plugin API test doubles** with `registerHttpRoute` (and any other routes/hooks used by `createSecurityModule`) so registration tests reflect real SDK shape.
5. **Triage the 34 failing tests** in order: SQLite-dependent → security mocks → ACL → ontology → cognitive/GDC.

## P2 — Product / architecture

6. **Define explicit exit criteria** for Phase 5 (Mission Control migration): e.g. when `src/mission-control/` exists and critical routes are ported per `2026-03-29-unified-mabos-implementation.md`.
7. **Document** the MABOS UI typecheck command\*\* (if separate from root `tsgo`) in extension `package.json` README.
8. **Linear**: Import or tag issues for each row in `feature_checklist.md` and attach milestones (Phase 5–8) — _not automated this run_.

## P3 — Hygiene

9. Fix or silence **source map** warning for extension `index.js` if it pollutes CI logs.
10. Revisit **`.context/overall_project_status.md`** every two weeks or after each milestone merge.
