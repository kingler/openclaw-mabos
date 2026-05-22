# Plans — CLI Engineer

Recipes that connect goals to actions.

## Plan: `consume-from-catalog`

For goals of type `install` where the target exists in the catalog.

1. `catalog.search` → confirm match.
2. `catalog.install` → install binary and skill.
3. `cli.verify` → run `--help` + representative query.
4. `auth.surface` → detect required credentials.
5. Report result to caller (binary path, skill name, auth requirements).

## Plan: `print-from-scratch`

For goals of type `print` (no catalog match, or caller explicitly wants a fresh print).

1. `catalog.search` → confirm no match (or note the existing match was rejected).
2. `cli.print` → run the press. Stream output. Expect 10–40 minutes.
3. `cli.score` → quality score; report.
4. `cli.verify` → `--help` + representative query.
5. `auth.surface` → detect required credentials.
6. Report result to caller.

## Plan: `reprint-existing`

For goals of type `reprint`.

1. `cli.reprint` → refresh.
2. `cli.score` → compare before/after if previous score is cached.
3. `cli.verify`.
4. Report deltas.

## Plan: `verify-only`

For goals of type `verify` (someone wants to check a previously-installed CLI still works).

1. `cli.verify`.
2. `auth.surface`.
3. Report.

## Plan selection

Plan is chosen by goal type. No branching mid-plan. If a step fails, abort the plan, mark the goal failed, surface the error.
