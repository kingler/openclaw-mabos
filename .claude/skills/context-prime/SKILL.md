---
name: context-prime
description: Use when starting work on a task, onboarding to the codebase, or needing project context — produces a scannable summary of project state, architecture, key files, and recommended next steps. Supports focus modes (full, ui, backend, erp, bdi, extensions, or custom keyword).
---

# Context Prime

## Overview

Unified context priming skill that reads project structure, documentation, and git state to produce a concise, actionable project summary. Supports **focus modes** to narrow output to specific areas.

**Important**: This skill does NOT re-read `CLAUDE.md` (symlinked from `AGENTS.md`) — it is already injected as project instructions in system context. Reading it again wastes tokens.

## When to Use

- Starting a new conversation or task and need project context
- Onboarding to an unfamiliar part of the codebase
- Before planning a feature to understand current state
- After being away from the project to catch up on changes
- When narrowing focus to a specific area (UI, backend, ERP, BDI, extensions)

## When NOT to Use

- When you already have sufficient context from the current conversation
- For deep debugging of a specific file (just read that file directly)

## Prerequisites

- Working directory is the project root (`/Users/kinglerbercy/openclaw-mabos`)
- Git repository initialized

## Command Usage

```bash
# Full project context (default)
/context-prime

# Focus on UI/frontend (Lit web UI + MABOS React dashboard)
/context-prime ui

# Focus on backend/core gateway
/context-prime backend

# Focus on MABOS ERP subsystem
/context-prime erp

# Focus on BDI cognitive architecture / agents
/context-prime bdi

# Focus on extensions/plugins
/context-prime extensions

# Focus on API/gateway protocol
/context-prime api

```

## Focus Modes

| Mode         | Triggers                                  | Primary Targets                                                                 |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------------------- |
| `full`       | No argument, or `full`                    | README, package.json, architecture overview                                     |
| `ui`         | `ui`, `frontend`, `design`, `dashboard`   | `ui/src/ui/` (Lit), `extensions/mabos/ui/src/` (React), Tailwind config         |
| `backend`    | `backend`, `gateway`, `server`, `core`    | `src/` core modules, `src/agents/`, `src/gateway/`, `src/channels/`             |
| `erp`        | `erp`, `shopify`, `finance`, `inventory`  | `mabos/erp/`, `mabos/erp/db/`, `mabos/erp/shopify-sync/`                        |
| `bdi`        | `bdi`, `agents`, `cognitive`, `reasoning` | `extensions/mabos/src/tools/bdi-tools.ts`, `mabos/bdi-runtime/`, ontology files |
| `extensions` | `extensions`, `plugins`, `mabos-ext`      | `extensions/*/`, `extensions/mabos/index.ts`, plugin manifests                  |
| `api`        | `api`, `routes`, `endpoints`, `acp`       | `src/gateway/`, `src/acp/`, `src/plugin-sdk/`                                   |
| Custom       | Anything else                             | Full mode reads + Grep for keywords                                             |

---

## Steps

### Step 1: Determine Focus Mode

Parse `$ARGUMENTS` to determine the focus mode:

- If empty or `full` → **full** mode
- If matches a known mode keyword (see table above, case-insensitive) → that mode
- Otherwise → **custom** mode with `$ARGUMENTS` as the search keyword

Announce the mode:

```
Priming context in **{MODE}** mode...
```

### Step 2: Scan Project Structure

Run `find` to get the directory tree (fast, avoids slow `git ls-files` on external drive):

```bash
find . -maxdepth 3 -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.md" -o -name "*.json" -o -name "*.sql" \) | head -200
```

Also run:

```bash
find . -maxdepth 2 -type d | sort
```

These two commands give structure context without the overhead of `git ls-files`.

### Step 3: Read Documentation (Mode-Dependent)

Read files **in parallel** based on the focus mode. Only read what the mode needs.

#### Full Mode

- `README.md`
- `package.json` (first 60 lines — name, version, scripts, key deps)
- `AGENTS.md` — skip if already in system context
- `docs/concepts/` directory listing (if exists)

#### UI Mode

- `README.md` (first 30 lines for project name/purpose)
- List `ui/src/ui/` directory (2 levels deep) — Lit web components
- List `extensions/mabos/ui/src/` directory (2 levels deep) — React dashboard
- List `extensions/mabos/ui/src/pages/` contents
- Read `extensions/mabos/ui/tailwind.config.ts` or root Tailwind config

#### Backend Mode

- `README.md` (first 30 lines)
- List `src/` directory (2 levels deep)
- List `src/agents/` directory contents
- List `src/gateway/` directory contents
- List `src/channels/` directory contents
- List `src/plugins/` directory contents

#### ERP Mode

- `README.md` (first 30 lines)
- List `mabos/erp/` directory (2 levels deep)
- List `mabos/erp/db/` directory — migrations, seeds, postgres.ts
- Read `mabos/erp/index.ts` (ERP entry point)
- List `mabos/erp/shopify-sync/` directory
- Read any recent migration files (last 3)

#### BDI Mode

- `README.md` (first 30 lines)
- List `mabos/bdi-runtime/` directory
- Read `mabos/bdi-runtime/index.ts` (first 100 lines — heartbeat service)
- List `extensions/mabos/src/tools/` — BDI, reasoning, inference, observer tools
- List `extensions/mabos/src/ontology/` — SBVR/JSON-LD ontologies
- List `extensions/mabos/src/reasoning/` — 35 reasoning methods

#### Extensions Mode

- `README.md` (first 30 lines)
- List `extensions/` directory (1 level — all plugin names)
- Read `extensions/mabos/openclaw.plugin.json` (plugin manifest)
- Read `extensions/mabos/package.json` (first 30 lines)
- List `extensions/mabos/src/` directory (2 levels deep)

#### API Mode

- `README.md` (first 30 lines)
- List `src/gateway/` directory (WebSocket/HTTP server)
- List `src/acp/` directory (Agent Client Protocol)
- List `src/plugin-sdk/` directory (public plugin API)
- List `src/hooks/` directory (lifecycle hooks)

#### Custom Mode

- Read all **Full Mode** files
- Run Grep for `$ARGUMENTS` keywords across `*.ts`, `*.tsx`, `*.md` files (limit to 30 results)

### Step 4: Identify Key Files

Based on mode and what was read in Steps 2-3, identify **8-12 key files** grouped by category:

- **Configuration**: `package.json`, `tsconfig.json`, `tsdown.config.ts`, `vitest.config.ts`, `fly.toml`
- **Entry Points**: `openclaw.mjs`, `mabos.mjs`, `src/entry.ts`, `src/index.ts`
- **Core Gateway**: `src/gateway/`, `src/agents/`, `src/channels/`, `src/plugins/`
- **MABOS Extension**: `extensions/mabos/index.ts`, tool files, ontology
- **MABOS ERP**: `mabos/erp/`, `mabos/bdi-runtime/`
- **UI**: `ui/src/ui/` (Lit), `extensions/mabos/ui/src/` (React)
- **Tests**: `test/`, `extensions/mabos/tests/`, `mabos/erp/shared/*.test.ts`
- **Documentation**: `docs/`, `AGENTS.md`

For focused modes, bias toward files in the focus area.

### Step 5: Assess Git State

Run these commands to understand current development state:

```bash
# Current branch and tracking
git branch --show-current

# Recent commits (last 10, one-line)
git log --oneline -10

# Uncommitted changes summary
git status --short

# Any stashes
git stash list
```

### Step 6: Produce Output

Format the output using the template below. Keep it **scannable and bullet-heavy**. Do not dump raw file contents — synthesize and summarize.

---

## Output Template

```markdown
## Project Context: OpenClaw MABOS [{MODE} Focus]

### Overview

<!-- 1-3 sentences: OpenClaw multi-channel AI gateway + MABOS business operating system for VividWalls -->

### Architecture

<!-- Stack, patterns, key integrations. Bullet points. -->

- **Runtime**: TypeScript ESM, Node.js >= 22.12.0, pnpm workspace monorepo
- **Build**: tsdown (esbuild), Vite (UI), tsc (types)
- **Core**: Express 5 gateway, WebSocket protocol, plugin/extension system
- **MABOS**: BDI cognitive architecture, 9 C-suite agents, SBVR ontology
- **ERP**: PostgreSQL (mabos_erp), 16 domain modules, Shopify sync
- **Knowledge Graph**: TypeDB with TypeQL, JSON-LD ontologies
- **Memory**: SQLite + FTS5 + sqlite-vec (hybrid BM25 + vector search)
- **UI**: Lit web components (chat) + React 19/TanStack (MABOS dashboard)
- **Deploy**: Fly.io, Render.com, Docker, npm publish

### Current State

<!-- Branch, recent work, uncommitted changes, blockers -->

- **Branch**: `{branch}` tracking `{remote}`
- **Recent commits**:
  - `{hash}` {message}
  - `{hash}` {message}
  - `{hash}` {message}
- **Uncommitted changes**: {count} files ({summary})
- **Blockers/Issues**: {any known issues from git state}

### Key Files

<!-- 8-12 files grouped by category, with 1-line descriptions -->

**Configuration**

- `package.json` — Root monorepo config, scripts, dependencies
- `tsdown.config.ts` — Build: bundles src/entry.ts, plugin-sdk, hooks
- ...

**Core Gateway**

- `src/entry.ts` — CLI entry point, process setup
- `src/gateway/` — WebSocket + HTTP gateway server (port 18789)
- ...

**MABOS**

- `extensions/mabos/index.ts` — Plugin registration (99+ tools, 21 modules)
- `mabos/bdi-runtime/index.ts` — BDI heartbeat background service
- `mabos/erp/index.ts` — ERP subsystem entry point
- ...

**{Mode-specific category}**

- ...

### Focus Areas

<!-- Traffic-light assessment -->

- **Strong**: {areas working well}
- **In Progress**: {areas under active development}
- **Needs Attention**: {areas with issues, staleness, or gaps}

### Recommended Next

<!-- 2-3 actionable items based on git state and project status -->

1. ...
2. ...
3. ...
```

---

## Error Handling

- If a file doesn't exist, skip it silently (don't error out).
- If `find` returns too many results, the `head -200` cap prevents output overflow.
- If on a slow filesystem, the `find -maxdepth 3` approach is intentionally bounded.
- If `AGENTS.md`/`CLAUDE.md` is already in system context, skip re-reading it.
