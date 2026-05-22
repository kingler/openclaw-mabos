# Skills — CLI Engineer

Last inventoried: 2026-05-22

## Skill Registry

| ID                | Skill                | Backing tool                     | Status |
| ----------------- | -------------------- | -------------------------------- | ------ |
| `catalog.search`  | Catalog search       | `printing-press-library` (npx)   | active |
| `catalog.install` | Catalog install      | `printing-press-library` (npx)   | active |
| `cli.print`       | Print new CLI        | `cli-printing-press` (Go binary) | active |
| `cli.reprint`     | Reprint existing CLI | `cli-printing-press` (Go binary) | active |
| `cli.score`       | Quality score        | `cli-printing-press` (Go binary) | active |
| `cli.verify`      | Smoke verify         | bash                             | active |

## Notes

Unlike LLM-native MABOS agents, `cli-engineer` shells out to external binaries for all execution. The binaries must exist on PATH before the agent runs. Bootstrap via `scripts/install-cli-agent.sh`. If `cli-printing-press --version` fails, the agent surfaces the failure and refuses to act.

The `skill_inventory` tool can re-run against this file to detect upstream skill additions.
