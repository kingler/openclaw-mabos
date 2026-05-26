# Capabilities — CLI Engineer

| ID                | Capability                                     | Tools                                | Inputs          | Outputs                   |
| ----------------- | ---------------------------------------------- | ------------------------------------ | --------------- | ------------------------- |
| `catalog.search`  | Search printing-press library                  | `npx printing-press-library search`  | query string    | list of catalog entries   |
| `catalog.install` | Install a pre-printed CLI from catalog         | `npx printing-press-library install` | slug            | binary path, skill name   |
| `cli.print`       | Print a new CLI from API/URL                   | `cli-printing-press print`           | API name or URL | binary path, skill name   |
| `cli.reprint`     | Refresh an existing CLI against latest machine | `cli-printing-press reprint`         | slug            | updated binary path       |
| `cli.score`       | Score a printed CLI's quality                  | `cli-printing-press score`           | slug            | score report              |
| `cli.verify`      | Run `--help` + a representative query          | Bash                                 | binary name     | exit code, sample output  |
| `auth.surface`    | Detect auth requirements and surface to caller | Bash + Read                          | binary name     | auth.json or env var list |
| `cli.invoke`      | Invoke any printed CLI via the registry        | discovered `cli.*` tools             | command + args  | code, stdout, stderr      |
