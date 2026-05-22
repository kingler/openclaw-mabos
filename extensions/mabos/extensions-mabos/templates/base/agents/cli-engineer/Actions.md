# Actions — CLI Engineer

Concrete commands the agent runs. Each action maps to one capability and one or more shell invocations.

## `catalog.search`

```bash
npx -y @mvanhorn/printing-press-library search "${query}" --json
```

Output: JSON array of catalog matches. Parse for `slug`, `category`, `release.tag`.

## `catalog.install`

```bash
npx -y @mvanhorn/printing-press-library install "${slug}"
```

Output: binary installed to `$(go env GOPATH)/bin/${slug}-pp-cli`, skill symlinked into `~/.claude/skills/pp-${slug}/`.

## `cli.print`

```bash
cli-printing-press print "${api_or_url}"
```

Print runs can take 10–40 minutes depending on API surface. Stream output; do not silently retry on failure.

## `cli.reprint`

```bash
cli-printing-press reprint "${slug}"
```

Use when an existing CLI is missing features added to the latest "machine."

## `cli.score`

```bash
cli-printing-press score "${slug}" --json
```

Output: numeric quality score + dimensions. Surface to caller; do not auto-act on a low score.

## `cli.verify`

```bash
"${binary_name}" --help
"${binary_name}" ${representative_query}
```

Representative query is action-specific. For Linear: `issues list --me`. For Apollo: `people search --title CEO --limit 1`.

## `auth.surface`

```bash
"${binary_name}" auth status 2>&1 || true
```

Many printed CLIs expose `auth status`. If exit code is non-zero, parse stderr for required env vars and report to caller.
