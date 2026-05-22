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

# 6. Create or repair the MABOS Persona.md symlink (gitignored; per-machine).
# The symlink target is an absolute $HOME path, which is why it cannot live in
# git — a committed symlink would point at the original author's username and
# break for every other contributor. Each machine creates its own symlink here
# pointing at its own $PERSONA_FILE.
MABOS_TEMPLATE_DIR="$(dirname "$MABOS_PERSONA_SRC")"
if [ -d "$MABOS_TEMPLATE_DIR" ]; then
  if [ ! -f "$PERSONA_FILE" ] && [ ! -L "$PERSONA_FILE" ]; then
    log "Skipping MABOS Persona.md symlink: $PERSONA_FILE doesn't exist yet."
  elif [ -L "$MABOS_PERSONA_SRC" ] && [ "$(readlink "$MABOS_PERSONA_SRC")" = "$PERSONA_FILE" ]; then
    log "MABOS Persona.md -> $PERSONA_FILE (already correct)"
  elif [ -L "$MABOS_PERSONA_SRC" ]; then
    log "MABOS Persona.md symlink target outdated; repairing to $PERSONA_FILE"
    ln -snf "$PERSONA_FILE" "$MABOS_PERSONA_SRC"
  elif [ -e "$MABOS_PERSONA_SRC" ]; then
    log "WARNING: $MABOS_PERSONA_SRC exists and is not a symlink. Refusing to overwrite."
    log "         To replace: rm $MABOS_PERSONA_SRC && rerun this script."
  else
    log "Creating MABOS Persona.md -> $PERSONA_FILE"
    ln -s "$PERSONA_FILE" "$MABOS_PERSONA_SRC"
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
