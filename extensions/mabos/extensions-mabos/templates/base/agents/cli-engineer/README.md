# cli-engineer

MABOS BDI agent that wraps the global `cli-agent` (Claude Code subagent at `~/.claude/agents/cli-agent.md`) and the `cli-printing-press` binary. Other MABOS business agents (CEO, CMO, lead-gen, outreach, ecommerce, etc.) delegate API-integration jobs to this agent.

## Bootstrap

This agent requires the global cli-agent install. Run once per machine:

```bash
./scripts/install-cli-agent.sh
```

The script is idempotent. It clones (or updates) `cli-printing-press` into `~/.claude/plugins/`, installs the Go binary, symlinks skills into `~/.claude/skills/`, and creates `Persona.md` here as a symlink to `~/.claude/agents/cli-agent.md`.

## Files

- `agent.json` — BDI manifest.
- `Persona.md` — symlink to `~/.claude/agents/cli-agent.md` (canonical). **Gitignored, created by `scripts/install-cli-agent.sh`** because the absolute `$HOME` path varies per machine.
- `Skill.md`, `Capabilities.md`, `Actions.md` — execution contract; wrap the binary.
- `Beliefs.md`, `Desires.md`, `Goals.md`, `Intentions.md`, `Plans.md`, `Task.md` — BDI completeness.
- `inbox.json` (workspace only) — delegation messages from other agents.

## Design

See [docs/plans/2026-05-22-cli-agent-design.md](../../../../../../../docs/plans/2026-05-22-cli-agent-design.md).
