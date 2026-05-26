# MABOS Tool Registry Design

> **Status:** Design only. Implementation plan to follow via `superpowers:writing-plans`.
> **Date:** 2026-05-22
> **Source:** Brainstorming session 2026-05-22, downstream of the CLI Agent install ([2026-05-22-cli-agent-design.md](2026-05-22-cli-agent-design.md)).

## Goal

Add a dynamic capability-registration mechanism to the MABOS runtime so that printed CLIs (`<slug>-pp-cli` binaries produced by `cli-printing-press`) — and, eventually, MCPs and other external tools — can register themselves at boot and become callable by MABOS BDI agents through the same `AnyAgentTool` interface the existing in-process tools use.

The smallest shippable slice (v1) registers `linear-pp-cli` and lets `cli-engineer` invoke it through the registry. No other agents change.

## Premise check (the audit that reframed this work)

The original request was "convert all the tools, MCPs, and APIs to CLI for the MABOS agents." A read-only audit of the 14 MABOS agent BDI templates and the runtime TypeScript surface (373 files inspected by an `Explore` subagent) found:

- **MABOS does not call any MCP today.** Zero hits for `mcp`, `MCP`, `@modelcontextprotocol` across `extensions/mabos/extensions-mabos/src/`.
- **External-service references in agent BDI files are aspirational.** Only 4 of 8 candidate services are mentioned anywhere across 15 agents: Stripe (3, all in compliance text), Cloudflare (1, dead code in `cto/Capabilities.md`), Linear (2, both added in the previous session), Notion/Gmail/Calendar/Drive/Figma (0).
- **The tool registry is static.** Tools are hardcoded imports in [extensions/mabos/extensions-mabos/index.ts](../../extensions/mabos/extensions-mabos/index.ts) lines 121-164. Adding a tool requires editing this file, rebuilding, and redeploying.

So there is nothing to _convert_. The accurate framing is: **MABOS doesn't yet have an extensibility point for runtime-discoverable tools.** Before printing CLIs for MABOS to use, build the registry so they have somewhere to land.

## Architecture: in-memory + boot-time discovery scan

Three options were considered:

| Option                                                  | Persistence                       | Effort     | Picked? |
| ------------------------------------------------------- | --------------------------------- | ---------- | ------- |
| A. JSON file at `~/.openclaw-mabos/registry.json`       | survives restart, per-machine     | ~half day  | no      |
| B. TypeDB-backed entities                               | per-tenant, queryable, fits MABOS | ~1-2 days  | no      |
| C. In-memory + boot-time scan of `$GOPATH/bin/*-pp-cli` | none; rescan every boot           | ~2-3 hours | **yes** |

C wins because: (1) every printed CLI follows the `<slug>-pp-cli` naming convention upstream, so the discovery scan is trivial; (2) no storage layer to maintain; (3) state can't go stale — if you `rm` a binary, the next restart drops it; (4) the upgrade path to B (TypeDB) is clean when multi-tenancy becomes a real requirement. Trade-off accepted: no per-tenant scoping in v1. For VividWalls as a single tenant on this machine, fine.

## Adapter contract

Every printed CLI exposes `<binary> agent-context --json` (confirmed in `linear-pp-cli`'s help output: `agent-context  Emit structured JSON describing this CLI for agents`). The discovery scan invokes this once per binary at boot to extract a manifest, then wraps the binary as an `AnyAgentTool`:

```ts
// extensions/mabos/extensions-mabos/src/tools/printed-cli-tools.ts (new)
async function discoverPrintedClis(): Promise<AnyAgentTool[]> {
  const binaries = await glob(`${process.env.GOPATH}/bin/*-pp-cli`);
  return Promise.all(
    binaries.map(async (path) => {
      const { stdout } = await execFile(path, ["agent-context", "--json"]);
      const meta = JSON.parse(stdout);
      return {
        id: `cli.${meta.name}`,
        label: meta.name,
        description: meta.description,
        parameters: Type.Object({
          args: Type.Array(Type.String(), {
            description: "Subcommand and flags, e.g. ['issues', 'list', '--me', '--json']",
          }),
          stdin: Type.Optional(Type.String()),
        }),
        execute: async (_id, params) => {
          const { stdout, stderr, code } = await execFile(path, params.args, {
            input: params.stdin,
            timeout: 60_000,
          });
          return { code, stdout, stderr };
        },
      };
    }),
  );
}
```

### Why 1 tool per CLI (not 1 per subcommand)

Linear-pp-cli alone exposes 30+ subcommands. Across 7 candidate CLIs that's ~70-200 tools. Flattening every subcommand into a separate `AnyAgentTool` would overwhelm an agent's tool list and burn context.

The 1-per-CLI shape gives each CLI a single tool ID (`cli.linear-pp-cli`) and passes the subcommand path as an array parameter (`args: ['issues', 'list', '--me', '--json']`). Agents reference the CLI by its tool ID in their `Capabilities.md` and learn the relevant subcommands from prose. Less type-checking on individual flag combinations; much smaller tool surface.

Upgrade path: if v1 reveals that agents struggle with the flat shape, parse `agent-context --json` more deeply and emit typed sub-tools per top-level command. Defer until evidence shows it's worth doing.

### Adapter failure handling

- Binary missing `agent-context` subcommand → skipped at scan time with a warning (some older printed CLIs may not have it)
- `execFile` timeout (60s default) → returns `{ code: 124, stderr: 'timeout after 60s' }`
- Non-zero exit → returns code + stderr verbatim; the calling agent decides whether to retry, surface, or escalate
- Discovery scan failure (e.g. `$GOPATH/bin/` unreadable) → logged at warn level; MABOS boots normally with just the static tools

## Integration point in `index.ts`

The change is additive and localized:

```ts
// extensions/mabos/extensions-mabos/index.ts (current lines ~121-164)
// Existing static imports stay unchanged.
import { createCloudflareTools } from "./src/tools/cloudflare-tools.js";
import { createCommunicationTools } from "./src/tools/communication-tools.js";
// ... 40+ more

const staticTools = [
  ...createCloudflareTools(api),
  ...createCommunicationTools(api),
  // ... unchanged
];

// NEW: discovery scan, additive, never throws
import { discoverPrintedClis } from "./src/tools/printed-cli-tools.js";
const printedClis = await discoverPrintedClis().catch((err) => {
  api.log.warn(`printed-CLI discovery failed: ${err.message}; continuing without`);
  return [];
});

const tools = [...staticTools, ...printedClis];
```

Static tools come first so they win on ID collision (defensive — no current static tool uses the `cli.*` prefix, but cheap insurance).

## v1 scope — what gets built, what doesn't

**In scope:**

1. New file `extensions/mabos/extensions-mabos/src/tools/printed-cli-tools.ts` (~80 LOC: `discoverPrintedClis()` + adapter)
2. New file `extensions/mabos/extensions-mabos/src/tools/printed-cli-tools.test.ts` (unit tests with `execFile` mocked)
3. New file `extensions/mabos/extensions-mabos/src/tools/printed-cli-tools.integration.test.ts` (real subprocess, fake bash-script CLI in a temp dir)
4. 3-line change in `extensions/mabos/extensions-mabos/index.ts` (import + discover + concat)
5. 1-row addition to `extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/Capabilities.md` (`cli.invoke` capability)
6. Manual smoke test against the real `linear-pp-cli` through the registry, driven by a MABOS BDI cycle for `cli-engineer`

**Out of scope (v1 deferrals):**

- Mass updates to other agents' BDI files. The audit showed no organic demand. Other agents add their own `Capabilities.md` rows when a concrete workflow needs a specific CLI.
- N-tool-per-CLI typed expansion. Single tool per binary; subcommand is a string parameter.
- Persistence. Discovery rescans at every boot. Newly printed CLIs require a MABOS restart to appear.
- Tenant scoping. Every MABOS instance on the machine sees the same `$GOPATH/bin/*-pp-cli` set.
- Periodic re-scan. Boot-time only.
- Retry/backoff on subprocess failures. Adapter returns exit code + stderr; caller decides.
- Telemetry on registry usage.
- Auto-registration hook in `scripts/install-cli-agent.sh` after a fresh print. Manual restart is fine for now.

## Testing strategy

Three levels, in execution order:

| Level        | What                                                                                      | Fast/slow                      | Requires                                                          |
| ------------ | ----------------------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| Unit         | parse `agent-context`, adapter behavior, scan edge cases                                  | fast (~ms)                     | nothing (mock `execFile`)                                         |
| Integration  | real subprocess against a fake bash-script CLI in a temp dir                              | medium (~1s)                   | bash, `chmod +x`                                                  |
| Manual smoke | invoke `linear-pp-cli` via the registry through a real MABOS BDI cycle for `cli-engineer` | slow (depends on orchestrator) | the deferred orchestrator-trigger contract from the previous plan |

Unit + integration tests are gating for the PR. Manual smoke is informational — if the orchestrator trigger turns out to be the same blocker that deferred Task 11 in the previous plan, we ship v1 with only the first two layers verified and document the manual-smoke gap.

## Risks and known unknowns

- **Orchestrator-trigger contract still unknown.** The previous implementation plan deferred its MABOS smoke test for the same reason — we don't know the entrypoint that triggers a single agent's BDI cycle with an ad-hoc inbox message. If we can't crack this for v1, the registry plumbing still ships (unit + integration tests pass), but the end-to-end MABOS-uses-a-CLI claim stays unverified.
- **`agent-context --json` is not universal.** Confirmed for `linear-pp-cli`. The adapter gracefully skips binaries that don't support it, but if many printed CLIs lack the subcommand, demand-side enrollment numbers drop. Verify per-CLI before mass-enrollment.
- **`execFile` 60s timeout is one value for every CLI.** Long-running subcommands (e.g. `linear-pp-cli sync --full`) will hit it. Tune per-call when a real workflow needs it; v1 hardcodes 60s for simplicity.
- **No per-tenant scoping.** Fine for the single-tenant (VividWalls) state today; promote to option B (TypeDB-backed) when a second tenant arrives.

## Effort estimate

| Task                                     | Estimate                                  |
| ---------------------------------------- | ----------------------------------------- |
| 1. Author `printed-cli-tools.ts`         | ~1 hr                                     |
| 2. Author unit tests                     | ~45 min                                   |
| 3. Author integration test               | ~45 min                                   |
| 4. Modify `index.ts`                     | ~10 min                                   |
| 5. Update `cli-engineer/Capabilities.md` | ~5 min                                    |
| 6. Manual smoke against `linear-pp-cli`  | ~1-3 hr (depends on orchestrator unknown) |
| **Total**                                | **~4-6 hours**                            |

## Next step

Implementation plan via `superpowers:writing-plans`, then execution via `superpowers:subagent-driven-development`. Phase 6 (manual smoke) is best-effort — if the orchestrator-trigger contract turns out to need its own brainstorming pass, we ship v1 with units + integration coverage and surface the gap explicitly.
