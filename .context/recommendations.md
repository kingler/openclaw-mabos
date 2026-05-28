# Recommendations - OpenClaw-MABOS

**Generated**: 2026-05-22

Ordered by leverage — top item is the highest ratio of unblock-impact to effort.

## P0 — Do this week

### 1. Unblock the test suite

Three small fixes restore 27 of 33 failing assertions:

- Fix `better-sqlite3` ABI mismatch ([ONEK-431](https://linear.app/designthru-ai/issue/ONEK-431)) — try `pnpm install --shamefully-hoist` or set `node-linker: hoisted` in `.npmrc` so the better-sqlite3 install hook compiles for Node 22.13.1.
- Add the missing `registerHttpRoute` stub in the extension test-harness ([ONEK-432](https://linear.app/designthru-ai/issue/ONEK-432)) — single file under `extensions/mabos/extensions-mabos/tests/helpers/`, reused by all module-registration suites.
- Run `pnpm format:fix` to clear the 13-file oxfmt drift; gate `pnpm check` in CI.

### 2. Repair root tsconfig vs UI tsconfig ([ONEK-433](https://linear.app/designthru-ai/issue/ONEK-433))

Either exclude `extensions/**/ui/**` from the root tsconfig or wire up project references so the UI's own tsconfig is honoured during `pnpm tsgo`. Also fix the lone `cwd: string` vs `cwd?: string` mismatch in [src/infra/update-runner.test.ts:347](src/infra/update-runner.test.ts).

## P1 — Start in the next 2 weeks

### 3. Kick off Phase 5 (Mission Control Migration)

Lead with [ONEK-414](https://linear.app/designthru-ai/issue/ONEK-414) (tasks CRUD + agents + SSE + dispatch routes) since it's the smallest tracer-bullet slice that lets Phase 6 UI work begin against a real MC backend. Phase 5 milestone targets 2026-06-15; start now.

Suggested cut order:

1. ONEK-414 → routes only, no MC engine internals.
2. ONEK-416 → kanban routes (small, isolatable).
3. ONEK-415 → planning workflow.
4. ONEK-417 → sync engine + learner (heaviest; do last).

### 4. Spec the orchestrator boundary before code

Phase 7 ([ONEK-422](https://linear.app/designthru-ai/issue/ONEK-422)..[ONEK-426](https://linear.app/designthru-ai/issue/ONEK-426)) is the deepest unknown. Before writing code, write a 1-page spec for the adapter-manager to Hermes Python bridge IPC contract (JSON-RPC over stdio, capability advertisement, error propagation). This is the same lesson the CLI Agent integration ran into when Task 11 deferred — without the ad-hoc message contract documented, every consumer reinvents it.

## P2 — Useful next month

### 5. Investigate the ACL test cluster

12 failures in `acl-message-delivery.test.ts` are almost certainly the same harness gap as ONEK-432, but verify by running it solo after the registerHttpRoute mock lands. If failures persist, file a separate bug with the actual error.

### 6. Clean up the deferred CLI Agent gaps

- Document the orchestrator's ad-hoc message contract so [cli-engineer/Task.md](extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/Task.md) can move from "not verified" to a working integration smoke test.
- Decide whether capability-registration becomes an explicit orchestrator route or stays as a v2 question.

### 7. Pre-tighten the CI loop ahead of Phase 8

The Phase 8 release will be much easier if CI is already green and required. Don't wait until ONEK-429 / ONEK-430 to land before turning `pnpm check`, `pnpm tsgo`, and the extension test suite into required PR checks. Aim for required gates on `main` by the end of Phase 6.

### 8. Consider migrating to the new Linear MCP transport

The deprecated `/sse` transport this analysis used is being phased out. Roughly half the calls in this session were rejected as pre-removal deprecation signals; future automated syncs will be unreliable on it. Migrate `~/.claude/mcp_servers.json` (or equivalent) to point at `https://mcp.linear.app/mcp` per the migration guide before the SSE endpoint disappears entirely.

## Not recommended (yet)

- **Don't** rewrite the BDI cycle / cognitive context / fact store yet — they pass tests and are not on the unified design's critical path for Phase 5/6/7. Refactor only when a Phase 5 dependency forces it.
- **Don't** ship a public release before Phase 8 (ONEK-427 / ONEK-428 / ONEK-429 / ONEK-430). The Docker setup, deployment docs, and end-to-end test gate are all on the same milestone for a reason.
- **Don't** start contributing the printed CLIs upstream to `printing-press-library` until Apollo (Tracer B) actually ships in a MABOS use case. Premature contribution couples our release rhythm to the library's.
