# Identified Issues — OpenClaw-MABOS

**Updated**: 2026-04-15

## Build / repo

| ID  | Severity | Finding                                                                                             |
| --- | -------- | --------------------------------------------------------------------------------------------------- |
| B-1 | **P0**   | **`pnpm-lock.yaml` missing** at repository root → `pnpm build` fails (`canvas:a2ui:bundle` ENOENT). |
| B-2 | **P1**   | **`pnpm check`** fails **oxfmt** on 18 files (format drift).                                        |

## Tests (Vitest extension suite)

| ID  | Severity | Finding                                                                                                                                                                                                                                   |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-1 | **P1**   | **`better-sqlite3` native bindings** not loadable in current env → `SessionIndex` / governance SQLite tests fail.                                                                                                                         |
| T-2 | **P1**   | **`security-registration.test.ts`**: `api.registerHttpRoute is not a function` — mock `OpenClawPluginApi` incomplete.                                                                                                                     |
| T-3 | **P2**   | **`ontology.test.ts`**: range reference resolution failure for at least one property.                                                                                                                                                     |
| T-4 | **P2**   | **`acl-message-delivery.test.ts`**: multiple failures (agent messaging / heartbeat integration).                                                                                                                                          |
| T-5 | **P2**   | **`gdc-domain-agent-generator.test.ts`**: one test failure on domain agent generation from LLM response.                                                                                                                                  |
| T-6 | **P2**   | **`cognitive-fixes.test.ts`**: Intention ID parsing (`I-COO-001` style).                                                                                                                                                                  |
| T-7 | **P3**   | Several suites report **0 tests** (`memory-bridge`, `capabilities-endpoint`, `onboarding-e2e`, `plugin`, `reasoning-engine`, `vividwalls-onboarding-e2e`, `setup-wizard`) — likely **skipped** or empty `describe` when conditions unmet. |

## Tooling noise

| ID  | Severity | Finding                                                                                    |
| --- | -------- | ------------------------------------------------------------------------------------------ |
| N-1 | **P3**   | Vite SSR warning: missing `index.js.map` for `extensions/mabos/extensions-mabos/index.js`. |

## Typecheck (root `pnpm tsgo` on extension UI)

| ID  | Severity | Finding                                                                                                                                                                                                                           |
| --- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Y-1 | **P2**   | `extensions/mabos/extensions-mabos/ui/src/router.tsx` reports unresolved `@/pages/*` and JSX flag when checked from root — may be **expected** if UI uses a separate tsconfig; verify `pnpm` script that typechecks the Vite app. |

## Security / product (static review — not a full audit)

- No new CVEs triaged in this pass; follow `SECURITY.md` for advisory handling.
- Production deployment should not proceed until SQLite + plugin tests are reliable in CI.

## Linear sync gaps

- **Could not verify** code-to-issue mapping; manual comparison required after `list_issues` from Linear.
