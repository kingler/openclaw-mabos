# Beliefs — CLI Engineer

What the agent believes about the world. Refreshed on each BDI cycle.

## Static beliefs

- The `cli-printing-press` binary exists on PATH and is version ≥ 1.26.3.
- `npx @mvanhorn/printing-press-library` is available.
- `~/.claude/skills/` exists and is auto-discovered by Claude Code.

## Dynamic beliefs (refresh per cycle)

- **Catalog state:** `npx -y @mvanhorn/printing-press-library list --json` — keep the count and last-updated timestamp.
- **Installed CLIs:** `npx -y @mvanhorn/printing-press-library list --installed --json`.
- **Go version:** `go version` — fail-fast belief; if < 1.26.3, set status to "blocked".
- **Auth health:** for each installed CLI, run `<binary> auth status` and cache the result for 1 hour.

## Belief revision

When a print succeeds, add the new CLI to installed-CLIs cache without re-running the full list. When a print fails, do not retract any belief — surface the failure to the caller.
