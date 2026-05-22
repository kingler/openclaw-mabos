# CLI Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stand up a "CLI Agent" globally in `~/.claude/` (Claude Code subagent + printing-press machinery) and bridge it into MABOS as a new BDI agent template (`cli-engineer`), so any MABOS business agent can delegate API integration to it.

**Architecture:** Three layers of canonical (cloned upstream repo → authored persona → MABOS BDI bridge), with the project bridge symlinking to the global persona. See [2026-05-22-cli-agent-design.md](2026-05-22-cli-agent-design.md) for full rationale and diagrams.

**Tech Stack:** Go ≥ 1.26.3, `mvanhorn/cli-printing-press`, `@mvanhorn/printing-press-library`, Claude Code 2.x subagent format (YAML frontmatter + markdown), MABOS BDI 11-file template, bash for the bootstrap script.

**Two tracers gate completion:** Tracer A (consume `/pp-linear` from the catalog) and Tracer B (print `/pp-apollo` from scratch). See Tasks 5 and 10.

---

## Pre-flight checks

Before starting, the executing agent must confirm:

- [ ] You are on branch `main` with a clean working tree (or have explicit user approval to work on the current branch).
- [ ] You have read [docs/plans/2026-05-22-cli-agent-design.md](2026-05-22-cli-agent-design.md).
- [ ] The user has explicitly approved running `brew install go@latest` (Task 0 is the first irreversible action and requires confirmation).
- [ ] Commits happen only after the user confirms (per `CLAUDE.md`: "Only create commits when requested by the user"). Each task below includes a commit step; treat it as **prepared but not run** until the user says "commit."

**Optional but recommended:** create a worktree for the in-repo changes before Task 6:

```bash
git worktree add -b cli-agent .worktrees/cli-agent main
```

The global-side work (Tasks 0–5, 10) is filesystem work outside the repo and is unaffected by worktrees.

---

### Task 0: Upgrade Go to ≥ 1.26.3

**Files:**

- No files modified in the repo.
- System change: Homebrew `go` formula upgraded.

**Step 1: Confirm current Go version**

Run: `go version`
Expected: `go version go1.25.7 darwin/arm64` (the version we're upgrading from).

**Step 2: Get explicit user approval before touching brew**

Halt and ask: _"Phase 0 will run `brew upgrade go`. This modifies your system toolchain. Approve?"_

Do not proceed without an explicit yes.

**Step 3: Upgrade Go via Homebrew**

Run: `brew upgrade go`
Expected: Brew downloads and installs Go 1.26.x (or newer).

If `brew upgrade` reports "go not installed," fall back to: `brew install go`.

**Step 4: Verify the new version**

Run: `go version`
Expected: `go version go1.26.x darwin/arm64` (any 1.26.3 or higher). If you get less, stop and report — the rest of the plan depends on this.

**Step 5: Confirm `$GOPATH/bin` is on PATH**

Run: `echo $PATH | tr ':' '\n' | grep -E "go(path)?/bin"` and `go env GOPATH`
Expected: at least one line containing `$(go env GOPATH)/bin` (typically `~/go/bin`). If absent, add this to `~/.zshrc`:

```bash
export PATH="$PATH:$(go env GOPATH)/bin"
```

Then `source ~/.zshrc` in the current shell.

**Step 6: No commit** — this task makes no repo changes.

---

### Task 1: Clone `cli-printing-press` and install the binary

**Files:**

- Create: `~/.claude/plugins/cli-printing-press/` (cloned repo, outside this repo's tree)
- System change: new binary at `$(go env GOPATH)/bin/cli-printing-press`

**Step 1: Create the plugins parent directory**

Run: `mkdir -p ~/.claude/plugins`
Expected: silent success (idempotent).

**Step 2: Clone the upstream repo**

Run: `git clone https://github.com/mvanhorn/cli-printing-press.git ~/.claude/plugins/cli-printing-press`
Expected: clone completes; `ls ~/.claude/plugins/cli-printing-press/` shows `skills/`, `cmd/`, `go.mod`, `README.md`, etc.

If the directory already exists, skip the clone and instead run:

```bash
cd ~/.claude/plugins/cli-printing-press && git pull --ff-only
```

**Step 3: Install the Go binary**

Run:

```bash
cd ~/.claude/plugins/cli-printing-press && go install ./cmd/cli-printing-press
```

Expected: completes with no output (Go's silent success). On error, paste the full output before retrying.

**Step 4: Verify the binary is on PATH**

Run: `cli-printing-press --version`
Expected: a version string (format depends on upstream — could be a semver tag or a git SHA). If `command not found`, re-check Step 5 of Task 0.

**Step 5: No commit** — nothing in this repo changed.

---

### Task 2: Symlink printing-press skills into `~/.claude/skills/`

**Files:**

- Create directory: `~/.claude/skills/` (if absent)
- Create N symlinks: one per skill dir found under `~/.claude/plugins/cli-printing-press/skills/`

The upstream repo currently ships 10 skills (`printing-press`, `printing-press-amend`, `printing-press-catalog`, `printing-press-import`, `printing-press-output-review`, `printing-press-polish`, `printing-press-publish`, `printing-press-reprint`, `printing-press-retro`, `printing-press-score`). New skills added upstream will be picked up automatically if we use a loop.

**Step 1: Ensure target directory exists**

Run: `mkdir -p ~/.claude/skills`
Expected: silent success.

**Step 2: Create one symlink per upstream skill**

Run:

```bash
for src in ~/.claude/plugins/cli-printing-press/skills/*/; do
  name=$(basename "$src")
  ln -snf "$src" ~/.claude/skills/"$name"
done
```

Expected: silent success. Re-running is safe (`-f` overwrites).

**Step 3: Verify each symlink resolves**

Run: `ls -la ~/.claude/skills/ | grep printing-press`
Expected: 10 lines, each ending with `-> /Users/kinglerbercy/.claude/plugins/cli-printing-press/skills/<name>/`.

**Step 4: Smoke-test that Claude Code discovers them**

Open a fresh Claude Code session in any directory and type `/printing-press` (don't press enter). The slash-command picker should show `printing-press`, `printing-press-reprint`, and the other 8.

If they don't appear:

- Confirm `~/.claude/skills/printing-press/SKILL.md` is a real file (`cat` the symlink target).
- Check the skill's frontmatter has a `name` field matching the directory.
- Restart Claude Code.

**Step 5: No commit** — global-only changes.

---

### Task 3: Author the global Claude Code subagent persona

**Files:**

- Create: `~/.claude/agents/cli-agent.md`

This is the **canonical persona** for both the global Claude Code subagent and (via symlink in Task 7) the MABOS `cli-engineer`'s `Persona.md`. Keep it under ~120 lines. It must work for both runtimes, so use plain markdown after the frontmatter (no Claude-Code-only syntax inside the body).

**Step 1: Ensure `~/.claude/agents/` exists**

Run: `mkdir -p ~/.claude/agents`
Expected: silent success.

**Step 2: Write `~/.claude/agents/cli-agent.md`**

Create with this content:

````markdown
---
name: cli-agent
description: Use when the user (or another agent) needs to install or generate a typed CLI for an API or website. Wraps `cli-printing-press` and the `printing-press-library` catalog. Picks "consume from catalog" vs "print from scratch" based on whether the target already exists.
model: inherit
tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
---

# CLI Agent

## Identity

You are the CLI Agent. Your job is to give other agents (and the user) **muscle memory** for any API or website. When asked to interact with an external service, you either:

1. Install a pre-printed CLI from the `printing-press-library` catalog (163 available; preferred when a match exists), or
2. Print a new CLI from scratch using `cli-printing-press` (the "press").

You are not a research agent, not a general-purpose assistant. You build, install, and verify CLIs. Anything outside that scope, you decline politely and point to a better-suited agent.

## Decision rule: consume vs print

Before printing anything new, **always** check the catalog first:

```bash
npx -y @mvanhorn/printing-press-library search <api-name> --json
```
````

If a match exists with a healthy release, install it:

```bash
npx -y @mvanhorn/printing-press-library install <slug>
```

If no match exists, print from scratch:

```bash
cli-printing-press print <api-name-or-url>
```

The reprint flow (`cli-printing-press reprint <name>`) is for refreshing an already-printed CLI against the latest "machine" version. Use it when an existing CLI feels stale or under-featured.

## Tool affordances

You have these tools and these only:

- **Bash** — run `cli-printing-press`, `npx @mvanhorn/printing-press-library`, `go install`, verification commands.
- **Read / Glob / Grep** — inspect skill files, installed CLIs, and `registry.json`.
- **Write / Edit** — author or tweak a generated SKILL.md if the print output needs polish.

You do not write production code outside the printing flow. You do not modify `~/.claude/plugins/cli-printing-press/` directly (that's an upstream clone; changes get clobbered by `git pull`).

## Workflow contract

For every job, follow this loop:

1. **Frame** — restate the request in one sentence so the caller can confirm.
2. **Check catalog** — `search` first, even if the user named a specific API.
3. **Choose path** — consume or print. State your choice and why before acting.
4. **Execute** — install or print. Capture stdout/stderr.
5. **Verify** — run the resulting binary's `--help` and one representative query.
6. **Report** — return the binary path, the slash-skill name, and one example invocation.

If a print fails midway, **fail loud**. Do not silently retry. Surface the error verbatim and let the caller decide whether to retry, switch APIs, or escalate.

## When you are invoked from MABOS

The MABOS `cli-engineer` agent symlinks this file as its `Persona.md`. When MABOS calls you, the request arrives as an `inbox.json` message with a structured body. Treat the request body the same as a Claude Code prompt and follow the workflow contract above. On success, return the new CLI's path and skill name so MABOS can register it as a capability the other business agents can call.

## Boundaries

- You do not authenticate against APIs on the caller's behalf. If a print needs credentials, surface the requirement; let the caller provide them.
- You do not contribute prints back to the upstream catalog automatically. That is a separate, deliberate action.
- You do not generate CLIs in languages other than Go. The press is opinionated on this; respect that opinion.

## Failure modes to watch for

- **Go version too old.** The press needs Go ≥ 1.26.3. If `cli-printing-press --version` fails, run `go version` and report the gap.
- **Dangling symlinks.** If `~/.claude/skills/printing-press/SKILL.md` is broken, the upstream clone is missing or moved. Run `scripts/install-cli-agent.sh` (in the MABOS repo) to repair.
- **Stale catalog.** `printing-press-library` caches under npm; if `search` returns stale results, append `--no-cache` or clear `~/.npm/_npx`.

````

**Step 3: Verify the file parses as a valid Claude Code subagent**

Run: `head -10 ~/.claude/agents/cli-agent.md`
Expected: the YAML frontmatter exactly as written above.

Open a fresh Claude Code session, run `/agents` (or whatever the current discovery command is for your version), and confirm `cli-agent` appears in the list.

**Step 4: Smoke-test the subagent**

In a throwaway Claude Code session, prompt:
> "Use the cli-agent subagent to list what printing-press CLIs are installed on this machine."

Expected: the subagent spawns, runs `npx -y @mvanhorn/printing-press-library list --installed` (or equivalent), and returns the list. Don't worry if the list is empty — you haven't installed anything yet.

**Step 5: No commit** — global-only.

---

### Task 4: Add `~/.claude/agents/` to your Claude Code agents settings (if required)

**Files:**
- Possibly modify: `~/.claude/settings.json` (only if `~/.claude/agents/` isn't auto-discovered)

**Step 1: Check whether the file is already discoverable**

If Task 3 Step 4 worked (the subagent showed up), this task is a no-op. Skip to Task 5.

If the subagent didn't appear, continue.

**Step 2: Read current settings**

Run: `cat ~/.claude/settings.json`
Expected: a JSON object. Note any existing `agents` or `agentPaths` keys.

**Step 3: Add the agents directory if missing**

Edit `~/.claude/settings.json` to ensure it contains:
```json
{
  "agentPaths": ["~/.claude/agents"]
}
````

(merged with whatever else is there — do not clobber existing keys).

**Step 4: Restart Claude Code and re-verify**

Restart, then redo Task 3 Step 4. Stop and report if the subagent still doesn't appear; this likely means the Claude Code version uses a different discovery mechanism and the plan needs adjustment.

**Step 5: No commit** — global-only.

---

### Task 5: Tracer A — install `/pp-linear` from the catalog

**Files:**

- System change: new binary `$(go env GOPATH)/bin/linear-pp-cli`
- System change: new skill `~/.claude/skills/pp-linear/`

This tracer proves the **consume path** (library install + Claude Code skill plumbing) works on this machine before we sink time into the bigger Phase 4 build.

**Step 1: Install Linear from the catalog**

Run: `npx -y @mvanhorn/printing-press-library install linear`
Expected: npx fetches the catalog, installs the Go binary, and drops a skill into `~/.claude/skills/pp-linear/`.

**Step 2: Verify the binary**

Run: `linear-pp-cli --help`
Expected: a help screen listing Linear commands (issues, projects, cycles, etc.).

**Step 3: Verify the skill is discovered**

In a fresh Claude Code session, type `/pp-linear` — the slash-command picker should show it.

**Step 4: Run one real query**

In the same Claude Code session, prompt:

> "/pp-linear show me my Linear assigned issues"

Expected: the skill runs the binary, returns issues. If Linear auth isn't configured, the binary will prompt; follow its instructions to authenticate, then retry.

**Step 5: Capture evidence for the design doc**

Save the output of `linear-pp-cli --version` and one successful query to your notes. You'll reference this in the Tracer B handoff.

**Step 6: No commit** — global-only.

---

### Task 6: Create the MABOS `cli-engineer` template skeleton

**Files:**

- Create: `extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/agent.json`
- Create: `extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/README.md`
- Create directory: `extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/`

This is the skeleton. The BDI files come in Tasks 7 and 8.

**Step 1: Create the directory**

Run:

```bash
mkdir -p extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer
```

Expected: silent success.

**Step 2: Write `agent.json`**

Create `extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/agent.json` with:

```json
{
  "id": "cli-engineer",
  "name": "CLI Engineer",
  "bdi": {
    "commitmentStrategy": "single-minded",
    "cycleFrequency": {
      "fullCycleMinutes": 60,
      "quickCheckMinutes": 10
    },
    "reasoningMethods": ["means-ends", "case-based"],
    "cognitiveRouter": {
      "enabled": true,
      "thresholds": {
        "reflexiveCeiling": 0.4,
        "deliberativeFloor": 0.6,
        "reflexiveConfidenceMin": 0.8,
        "analyticalConfidenceMin": 0.7,
        "maxConsecutiveReflexive": 6
      }
    }
  }
}
```

Rationale: `single-minded` commitment because a print run is one focused goal, not strategic exploration. Cycle frequency is shorter than CEO's (a CLI build is a 30-min job, not a quarterly arc). Reasoning methods are means-ends (input → CLI) and case-based (catalog has 163 examples to learn from).

**Step 3: Write `README.md`**

Create with:

````markdown
# cli-engineer

MABOS BDI agent that wraps the global `cli-agent` (Claude Code subagent at `~/.claude/agents/cli-agent.md`) and the `cli-printing-press` binary. Other MABOS business agents (CEO, CMO, lead-gen, outreach, ecommerce, etc.) delegate API-integration jobs to this agent.

## Bootstrap

This agent requires the global cli-agent install. Run once per machine:

```bash
./scripts/install-cli-agent.sh
```
````

The script is idempotent. It clones (or updates) `cli-printing-press` into `~/.claude/plugins/`, installs the Go binary, symlinks skills into `~/.claude/skills/`, and verifies the `Persona.md` symlink.

## Files

- `agent.json` — BDI manifest.
- `Persona.md` — symlink to `~/.claude/agents/cli-agent.md` (canonical).
- `Skill.md`, `Capabilities.md`, `Actions.md` — execution contract; wrap the binary.
- `Beliefs.md`, `Desires.md`, `Goals.md`, `Intentions.md`, `Plans.md`, `Task.md` — BDI completeness.
- `inbox.json` (workspace only) — delegation messages from other agents.

## Design

See [docs/plans/2026-05-22-cli-agent-design.md](../../../../../../../docs/plans/2026-05-22-cli-agent-design.md).

````

**Step 4: Verify directory contents**

Run: `ls extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/`
Expected: two files — `agent.json`, `README.md`.

**Step 5: Stage commit (do not run without user approval)**

```bash
git add extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/
git commit -m "MABOS: add cli-engineer template skeleton"
````

---

### Task 7: Author `cli-engineer`'s executable BDI trio (Skill, Capabilities, Actions) + Persona symlink

**Files:**

- Create symlink: `extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/Persona.md` → `~/.claude/agents/cli-agent.md`
- Create: `Capabilities.md`
- Create: `Skill.md`
- Create: `Actions.md`

These three files are the "executable" trio — they define what the agent can do and how it does it. The other BDI files (Task 8) round out the BDI mental model but are not on the hot path.

**Step 1: Symlink `Persona.md` to the global canonical**

Run:

```bash
cd extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer
ln -s ~/.claude/agents/cli-agent.md Persona.md
```

Expected: silent success.

**Step 2: Verify the symlink resolves**

Run: `cat Persona.md | head -5`
Expected: the YAML frontmatter from `~/.claude/agents/cli-agent.md`.

If `cat` fails with "no such file," the symlink points at a missing target. Re-run Task 3 first.

**Step 3: Write `Capabilities.md`**

Mirror the affordances listed in `Persona.md`. Create with:

```markdown
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
```

**Step 4: Write `Skill.md`**

This file replaces the auto-populated template (see `ceo/Skill.md` for the original shape). Create with:

```markdown
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
```

**Step 5: Write `Actions.md`**

Create with:

````markdown
# Actions — CLI Engineer

Concrete commands the agent runs. Each action maps to one capability and one or more shell invocations.

## `catalog.search`

```bash
npx -y @mvanhorn/printing-press-library search "${query}" --json
```
````

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

````

**Step 6: Verify files exist**

Run: `ls extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/`
Expected: `Actions.md`, `Capabilities.md`, `Persona.md` (symlink), `README.md`, `Skill.md`, `agent.json` — 6 entries.

**Step 7: Stage commit (do not run without user approval)**

```bash
git add extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/
git commit -m "MABOS: wire cli-engineer Persona symlink + Capabilities/Skill/Actions"
````

---

### Task 8: Author the remaining 6 BDI files for completeness

**Files:**

- Create: `Beliefs.md`, `Desires.md`, `Goals.md`, `Intentions.md`, `Plans.md`, `Task.md` (all under `cli-engineer/`)

These complete the 11-file BDI template so `cli-engineer` is a structurally first-class MABOS agent. They are read by the MABOS runtime during BDI cycles. Keep each file short — none should exceed ~50 lines.

**Step 1: Write `Beliefs.md`**

```markdown
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
```

**Step 2: Write `Desires.md`**

```markdown
# Desires — CLI Engineer

What the agent wants to be true.

1. **Primary desire:** Every API or website the MABOS organization needs to interact with is accessible as a typed CLI on this machine.
2. **Secondary desire:** Each installed CLI passes its own `verify` step (binary is executable, `--help` works, one representative query succeeds).
3. **Tertiary desire:** The catalog cache is fresh (last refreshed < 24h ago).

Desires are not goals. They describe steady-state preferences. Goals (next file) are time-bound commitments derived from desires + caller requests.
```

**Step 3: Write `Goals.md`**

````markdown
# Goals — CLI Engineer

Active, time-bound commitments derived from caller requests.

## Goal template

```yaml
id: <slug>
type: install | print | reprint | verify
target: <api-or-url-or-slug>
requester: <agent-id>
deadline: <ISO-8601 timestamp>
status: pending | in-progress | succeeded | failed
result: <binary-path-and-skill-name on success | error string on failure>
```
````

## Active goals

Populated at runtime from `inbox.json`. Workspace instance only; the template version is empty.

## Goal selection

When multiple goals are pending, prioritize by:

1. Caller priority (CEO > C-suite > line agents).
2. Deadline (earliest first).
3. Estimated effort (install < reprint < print).

````

**Step 4: Write `Intentions.md`**

```markdown
# Intentions — CLI Engineer

Plans the agent has committed to and is actively executing.

## Intention shape

```yaml
goal_id: <slug>
plan: <plan-name from Plans.md>
step: <current-step-name>
started_at: <ISO-8601>
last_progress_at: <ISO-8601>
artifacts: []
````

## Single-minded commitment

Per `agent.json` (`commitmentStrategy: single-minded`), once committed to a print, the agent does not drop the intention to chase a higher-priority new goal mid-print. New higher-priority goals queue behind the current intention. Aborts only on failure or explicit caller cancellation.

````

**Step 5: Write `Plans.md`**

```markdown
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
````

**Step 6: Write `Task.md`**

````markdown
# Task — CLI Engineer

Standard task template for incoming delegations.

## Inbox message shape

```json
{
  "from": "<requester-agent-id>",
  "type": "cli-request",
  "body": {
    "action": "install | print | reprint | verify",
    "target": "<api-name | url | slug>",
    "priority": "low | normal | high | urgent",
    "deadline": "<ISO-8601 | null>",
    "notes": "<optional caller context>"
  }
}
```
````

## Response shape

On success:

```json
{
  "to": "<requester-agent-id>",
  "type": "cli-result",
  "status": "succeeded",
  "result": {
    "slug": "<cli-slug>",
    "binary_path": "<absolute path>",
    "skill_name": "/pp-<slug>",
    "auth_required": [
      /* env vars or "none" */
    ]
  }
}
```

On failure:

```json
{
  "to": "<requester-agent-id>",
  "type": "cli-result",
  "status": "failed",
  "error": {
    "phase": "search | install | print | verify",
    "message": "<verbatim error>",
    "next_steps": "<one-line suggestion: retry | provide-auth | escalate>"
  }
}
```

## Capability registration

On success, the agent ALSO emits a capability-registration message to the MABOS tool registry so other agents discover the new CLI:

```json
{
  "to": "tool-registry",
  "type": "capability-add",
  "capability": {
    "id": "cli.<slug>",
    "skill": "/pp-<slug>",
    "binary": "<absolute path>",
    "provided_by": "cli-engineer"
  }
}
```

````

**Step 7: Verify all 11 files now exist**

Run: `ls extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/`
Expected: 11 entries — `Actions.md`, `Beliefs.md`, `Capabilities.md`, `Desires.md`, `Goals.md`, `Intentions.md`, `Persona.md`, `Plans.md`, `README.md`, `Skill.md`, `Task.md`, `agent.json` (that's 12; README is bonus, the BDI 11 are all present).

**Step 8: Stage commit (do not run without user approval)**

```bash
git add extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/
git commit -m "MABOS: complete cli-engineer BDI files (Beliefs/Desires/Goals/Intentions/Plans/Task)"
````

---

### Task 9: Write the idempotent bootstrap script

**Files:**

- Create: `scripts/install-cli-agent.sh`
- Create: `scripts/install-cli-agent.test.sh` (smoke test)

This is the script other contributors (or fresh machines) run to re-create the global install.

**Step 1: Write the failing smoke test FIRST (TDD)**

Create `scripts/install-cli-agent.test.sh`:

```bash
#!/usr/bin/env bash
# Smoke test for scripts/install-cli-agent.sh
# Runs against a temp HOME so it doesn't clobber the real install.

set -euo pipefail

fake_home=$(mktemp -d)
export HOME="$fake_home"
# Go's module cache writes files mode 0444 under $HOME/go/pkg/mod; rm -rf cannot
# delete those without first restoring write permission. chmod -R u+w first.
cleanup() {
  chmod -R u+w "$fake_home" 2>/dev/null || true
  rm -rf "$fake_home"
}
trap cleanup EXIT

# Stub the Persona file BEFORE invoking the script.
# Why: the install script intentionally does NOT create the persona file
# (the persona is authored content, not auto-generated). On a real machine
# the user has already authored ~/.claude/agents/cli-agent.md before running
# the bootstrap script. We simulate that here with a stub so the assertion
# below reflects the real-world contract: install runs AFTER persona authoring.
mkdir -p "$fake_home/.claude/agents"
echo "# Stub for test" > "$fake_home/.claude/agents/cli-agent.md"

echo "=== Running install-cli-agent.sh against fake HOME ==="
bash scripts/install-cli-agent.sh

echo "=== Verifying expected artifacts ==="
test -d "$fake_home/.claude/plugins/cli-printing-press" || { echo "MISSING: cloned repo"; exit 1; }
test -d "$fake_home/.claude/skills" || { echo "MISSING: skills dir"; exit 1; }
test -L "$fake_home/.claude/skills/printing-press" || { echo "MISSING: printing-press symlink"; exit 1; }
test -f "$fake_home/.claude/agents/cli-agent.md" || { echo "MISSING: cli-agent.md"; exit 1; }

echo "=== Running script a second time (idempotency check) ==="
bash scripts/install-cli-agent.sh

echo "=== PASS ==="
```

**Two deviations from the initial draft (both shipped):**

1. **Persona stub before script invocation.** The install script does not create the persona file (the persona is authored content, not auto-generated). The test must simulate the real-world contract: the user authors `~/.claude/agents/cli-agent.md` first, then runs the bootstrap. Without the stub, the final assertion would fail.
2. **`cleanup()` function with `chmod -R u+w` before `rm -rf`.** A literal `trap 'rm -rf "$fake_home"' EXIT` fails on macOS because `go install` writes files mode 0444 under `$HOME/go/pkg/mod`. Under `set -e`, the failing trap makes the test exit 1 even after `=== PASS ===` prints.

Make it executable: `chmod +x scripts/install-cli-agent.test.sh`

**Step 2: Run the test, watch it fail**

Run: `bash scripts/install-cli-agent.test.sh`
Expected: fails because `scripts/install-cli-agent.sh` doesn't exist yet.

**Step 3: Write the script**

Create `scripts/install-cli-agent.sh`:

```bash
#!/usr/bin/env bash
# Bootstrap the global "CLI Agent" install.
# Idempotent: safe to run multiple times.
# Required: Go ≥ 1.26.3, git, npx.

set -euo pipefail

REPO_URL="https://github.com/mvanhorn/cli-printing-press.git"
PLUGIN_DIR="$HOME/.claude/plugins/cli-printing-press"
SKILLS_DIR="$HOME/.claude/skills"
AGENTS_DIR="$HOME/.claude/agents"
PERSONA_FILE="$AGENTS_DIR/cli-agent.md"
THIS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$THIS_DIR/.." && pwd)"
MABOS_PERSONA_SRC="$REPO_ROOT/extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/Persona.md"

log() { echo "[install-cli-agent] $*"; }

# 1. Pre-flight: Go version
if ! command -v go >/dev/null; then
  log "ERROR: Go is not installed. Install Go ≥ 1.26.3 first."
  exit 1
fi
go_version=$(go version | awk '{print $3}' | sed 's/go//')
log "Go version: $go_version"
# crude version check: 1.26.3+
required="1.26.3"
if [ "$(printf '%s\n%s\n' "$required" "$go_version" | sort -V | head -n1)" != "$required" ]; then
  log "ERROR: Go >= $required required (have $go_version). Run 'brew upgrade go'."
  exit 1
fi

# 2. Clone or update the upstream repo
mkdir -p "$(dirname "$PLUGIN_DIR")"
if [ -d "$PLUGIN_DIR/.git" ]; then
  log "Updating $PLUGIN_DIR"
  if ! git -C "$PLUGIN_DIR" pull --ff-only; then
    log "ERROR: git pull --ff-only failed in $PLUGIN_DIR."
    log "       This usually means you have local commits or upstream force-pushed."
    log "       To recover: git -C $PLUGIN_DIR reset --hard origin/main"
    exit 1
  fi
else
  log "Cloning $REPO_URL → $PLUGIN_DIR"
  git clone "$REPO_URL" "$PLUGIN_DIR"
fi

# 3. Install the Go binary
log "Installing cli-printing-press binary"
(cd "$PLUGIN_DIR" && go install ./cmd/cli-printing-press)

# 4. Symlink skills
mkdir -p "$SKILLS_DIR"
for src in "$PLUGIN_DIR"/skills/*/; do
  name=$(basename "$src")
  dest="$SKILLS_DIR/$name"
  if [ -e "$dest" ] && [ ! -L "$dest" ]; then
    log "ERROR: $dest exists and is not a symlink. Refusing to overwrite."
    log "       Move or delete it manually, then re-run."
    exit 1
  fi
  ln -snf "$src" "$dest"
  log "  symlink: $dest"
done

# 5. Persona — only create if MABOS template has it
mkdir -p "$AGENTS_DIR"
if [ -f "$PERSONA_FILE" ] || [ -L "$PERSONA_FILE" ]; then
  log "Persona already at $PERSONA_FILE (leaving untouched)"
else
  log "WARNING: $PERSONA_FILE missing. Author it before re-running this script."
  log "         See docs/plans/2026-05-22-cli-agent-implementation.md Task 3."
fi

# 6. Verify MABOS Persona.md symlink (if MABOS template exists)
if [ -e "$MABOS_PERSONA_SRC" ]; then
  if [ -L "$MABOS_PERSONA_SRC" ]; then
    target=$(readlink "$MABOS_PERSONA_SRC")
    log "MABOS Persona.md -> $target"
  else
    log "WARNING: $MABOS_PERSONA_SRC exists but is not a symlink."
    log "         To fix: rm $MABOS_PERSONA_SRC && ln -sf $PERSONA_FILE $MABOS_PERSONA_SRC"
  fi
fi

# 7. Smoke verification
log "Verifying binary..."
binary_path="$(go env GOPATH)/bin/cli-printing-press"
if [ ! -x "$binary_path" ]; then
  log "  ERROR: binary not found at $binary_path. 'go install' may have failed silently."
  exit 1
fi
if output=$(cli-printing-press --version 2>&1); then
  log "  OK: $output"
else
  log "  WARNING: cli-printing-press --version failed: $output"
  log "         Binary exists at $binary_path. Likely cause: \$GOPATH/bin not on PATH."
fi

log "Done."
```

Make it executable: `chmod +x scripts/install-cli-agent.sh`

**Step 4: Run the smoke test, expect it to pass**

Run: `bash scripts/install-cli-agent.test.sh`
Expected: PASS.

If it fails, read the output. The most likely cause is the persona file check — the script intentionally warns rather than fails when the persona is missing in the fake HOME (this is correct behavior; the persona must be authored, not auto-generated).

**Step 5: Stage commit (do not run without user approval)**

```bash
git add scripts/install-cli-agent.sh scripts/install-cli-agent.test.sh
git commit -m "Scripts: add idempotent install-cli-agent.sh + smoke test"
```

---

### Task 10: Tracer B — print `/pp-apollo` from scratch

**Files:**

- System change: new binary `$(go env GOPATH)/bin/apollo-pp-cli` (name may differ depending on press output)
- System change: new skill `~/.claude/skills/pp-apollo/`

This is the headline tracer — proves the full generator end-to-end. **Allow 10–40 minutes** for the print itself.

**Step 1: Confirm the API isn't already in the catalog**

Run: `npx -y @mvanhorn/printing-press-library search apollo --json`
Expected: no exact match for Apollo.io (if it exists, switch to a different API or use the existing entry instead).

**Step 2: Kick off the print**

In a Claude Code session, prompt:

> "Use the cli-agent subagent. Print a CLI for apollo.io."

The subagent should:

1. Confirm no catalog match.
2. Decide "print from scratch."
3. Invoke `cli-printing-press print apollo.io`.
4. Stream output.

Alternative direct invocation (bypassing the subagent):

```bash
cli-printing-press print apollo.io
```

**Step 3: Wait for completion**

Print runs are long. Don't interrupt unless it stalls > 5 min with no output. Capture the full log; on success you'll need it for Step 5.

**Step 4: Verify the binary**

Run: `apollo-pp-cli --help` (substitute the actual binary name from the print output)
Expected: a help screen listing Apollo commands.

**Step 5: Run a representative query**

Run: `apollo-pp-cli people search --title "CEO" --limit 1`

If auth is required (likely — Apollo needs an API key), the binary will surface the requirement. Set the env var per the binary's instructions and retry.

**Step 6: Verify the skill is discoverable**

In a fresh Claude Code session, type `/pp-apollo` — should appear in the picker.

**Step 7: Commit nothing in this repo** — the prints land outside the tree. Note the binary path and skill name; you'll need them for Task 11.

---

### Task 11: MABOS integration smoke test

**Files:**

- Create (workspace, not template): `extensions/mabos/extensions-mabos/workspace/agents/cli-engineer/inbox.json`

This proves MABOS delegation works end-to-end: a business agent → cli-engineer → cli-printing-press → result back.

**Step 1: Instantiate cli-engineer in the workspace**

Run:

```bash
mkdir -p extensions/mabos/extensions-mabos/workspace/agents/cli-engineer
echo '[]' > extensions/mabos/extensions-mabos/workspace/agents/cli-engineer/inbox.json
```

Expected: silent success.

(The workspace agent inherits from the template; only `inbox.json` is workspace-specific, matching the pattern of `ceo/`, `cfo/`, etc.)

**Step 2: Drop a delegation message**

Write to `extensions/mabos/extensions-mabos/workspace/agents/cli-engineer/inbox.json`:

```json
[
  {
    "from": "ceo",
    "type": "cli-request",
    "body": {
      "action": "verify",
      "target": "apollo",
      "priority": "normal",
      "deadline": null,
      "notes": "Smoke test from cli-agent implementation plan, Task 11. Verify the Apollo CLI printed in Task 10 still works."
    }
  }
]
```

**Step 3: Trigger a MABOS cycle**

Per the MABOS runtime conventions (check `extensions/mabos/extensions-mabos/scripts/` for the right entrypoint — likely `director-orchestrator.ts`), trigger one BDI cycle for `cli-engineer`.

Expected: cli-engineer reads `inbox.json`, follows the `verify-only` plan from `Plans.md`, runs `apollo-pp-cli --help` + one query, and writes a `cli-result` message back.

**Step 4: Inspect the result**

Look for a response in the requester's (`ceo`) inbox or in `cli-engineer`'s outbox (whichever MABOS uses). Expected shape matches `Task.md` response schema.

**Step 5: Stage commit (do not run without user approval)**

```bash
git add extensions/mabos/extensions-mabos/workspace/agents/cli-engineer/
git commit -m "MABOS: instantiate cli-engineer in workspace + smoke-test inbox message"
```

---

### Task 12: Update the design doc with verified behavior

**Files:**

- Modify: `docs/plans/2026-05-22-cli-agent-design.md` (append a "Verification log" section)

**Step 1: Append a "Verification log" section to the design doc**

Add at the bottom:

```markdown
## Verification log

- **2026-05-22 — Tracer A complete.** `/pp-linear` installed via catalog. `linear-pp-cli --version`: `<version>`. Sample query: `<query>` returned `<count>` issues.
- **2026-05-22 — Tracer B complete.** `cli-printing-press print apollo.io` ran in `<duration>`. Binary at `<path>`. Score: `<score>`. Auth requirements: `<env-vars>`.
- **2026-05-22 — MABOS smoke complete.** `inbox.json` delegation from ceo → cli-engineer → verify → response in `<duration>`.
```

**Step 2: Stage commit (do not run without user approval)**

```bash
git add docs/plans/2026-05-22-cli-agent-design.md
git commit -m "Docs: log CLI Agent verification results"
```

---

## Final acceptance criteria

The plan is complete when all of these are true:

- [ ] `cli-printing-press --version` runs successfully on PATH.
- [ ] `/printing-press` and 9 sibling slash commands appear in Claude Code.
- [ ] `cli-agent` subagent is discoverable and responds to prompts.
- [ ] `/pp-linear` works (Tracer A).
- [ ] `/pp-apollo` works (Tracer B); `apollo-pp-cli --help` runs.
- [ ] MABOS `cli-engineer` template has all 11 BDI files + README, with `Persona.md` symlinked to the global persona.
- [ ] `scripts/install-cli-agent.sh` is idempotent and its smoke test passes against a fake HOME.
- [ ] MABOS integration smoke (Task 11) returns a successful `cli-result` message.
- [ ] Design doc has a Verification log entry for each tracer.
- [ ] No commit was made without explicit user approval.

## What this plan deliberately does NOT cover (deferred)

- Auto-print-on-demand from other MABOS agents (v2).
- Contributing the printed Apollo CLI back upstream to `printing-press-library` (separate PR).
- Retry/cooldown logic on failed prints (manual handling for v1).
- A web UI for `cli-engineer` (not in scope).
- Pinning the upstream `cli-printing-press` commit (`scripts/install-cli-agent.sh` currently pulls HEAD; pin if upstream churn becomes a problem).
- Auto-detecting whether `~/.claude/settings.json` needs an `agentPaths` entry (Task 4 is reactive, not proactive).
