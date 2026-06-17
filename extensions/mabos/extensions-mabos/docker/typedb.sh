#!/usr/bin/env bash
#
# typedb.sh — manage the local MABOS TypeDB knowledge-graph server.
#
# Subcommands:
#   up         Start the TypeDB container and wait until the HTTP API responds.
#   down       Stop and remove the container (data volume is preserved).
#   status     Show container state and probe the HTTP API.
#   logs       Follow container logs.
#   bootstrap  Create a database and apply the MABOS base schema. Pass a db
#              name, or set MABOS_TYPEDB_DB (default: mabos_knowledge).
#   reset      Stop the container AND delete the data volume (destructive).
#
# Examples:
#   ./typedb.sh up
#   ./typedb.sh bootstrap mabos_acme
#   TYPEDB_HTTP_PORT=9000 ./typedb.sh up
#
# Env: reads ./typedb.env if present (see typedb.env.example).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

ENV_FILE="$SCRIPT_DIR/typedb.env"
COMPOSE_ENV_ARGS=()
if [[ -f "$ENV_FILE" ]]; then
  COMPOSE_ENV_ARGS=(--env-file "$ENV_FILE")
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
fi

HTTP_PORT="${TYPEDB_HTTP_PORT:-8729}"
HTTP_URL="http://127.0.0.1:${HTTP_PORT}"

# Resolve `docker compose` (v2) vs legacy `docker-compose` (v1).
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "error: docker compose is required (install Docker Desktop or the compose plugin)." >&2
  exit 1
fi

compose() { "${COMPOSE[@]}" "${COMPOSE_ENV_ARGS[@]}" "$@"; }

# Probe the HTTP API. TypeDB returns 401/404 without auth, which still proves
# the server is listening — treat any HTTP status (non-000) as "up".
http_up() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${HTTP_URL}/v1/version" 2>/dev/null || echo 000)"
  [[ "$code" != "000" ]]
}

wait_until_ready() {
  echo -n "Waiting for TypeDB HTTP API at ${HTTP_URL} "
  for _ in $(seq 1 60); do
    if http_up; then echo " ready."; return 0; fi
    echo -n "."
    sleep 1
  done
  echo
  echo "error: TypeDB did not become ready within 60s. Check: ./typedb.sh logs" >&2
  return 1
}

run_ts() {
  # Run a TypeScript entry point with whatever runner is available.
  local file="$1"; shift
  if command -v bun >/dev/null 2>&1; then
    bun "$file" "$@"
  elif command -v tsx >/dev/null 2>&1; then
    tsx "$file" "$@"
  elif command -v npx >/dev/null 2>&1; then
    npx --yes tsx "$file" "$@"
  else
    echo "error: need bun, tsx, or npx to run the bootstrap script." >&2
    exit 1
  fi
}

cmd="${1:-}"
case "$cmd" in
  up)
    compose up -d
    wait_until_ready
    echo "TypeDB is up. Point MABOS at it with:  export TYPEDB_URL=${HTTP_URL}"
    ;;
  down)
    compose down
    echo "TypeDB stopped. Data volume preserved (use 'reset' to delete it)."
    ;;
  status)
    compose ps
    if http_up; then
      echo "HTTP API: reachable at ${HTTP_URL}"
    else
      echo "HTTP API: NOT reachable at ${HTTP_URL}"
    fi
    ;;
  logs)
    compose logs -f
    ;;
  bootstrap)
    if ! http_up; then
      echo "error: TypeDB is not reachable at ${HTTP_URL}. Run './typedb.sh up' first." >&2
      exit 1
    fi
    export TYPEDB_URL="${TYPEDB_URL:-$HTTP_URL}"
    run_ts "$SCRIPT_DIR/bootstrap-schema.ts" "${2:-${MABOS_TYPEDB_DB:-mabos_knowledge}}"
    ;;
  reset)
    read -r -p "This deletes ALL TypeDB data in the volume. Continue? [y/N] " ans
    if [[ "${ans:-}" =~ ^[Yy]$ ]]; then
      compose down -v
      echo "TypeDB stopped and data volume deleted."
    else
      echo "Aborted."
    fi
    ;;
  *)
    sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
