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
