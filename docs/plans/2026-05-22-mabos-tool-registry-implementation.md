# MABOS Tool Registry Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a dynamic capability-registration mechanism to the MABOS runtime so that printed CLIs (`<slug>-pp-cli` binaries from `cli-printing-press`) auto-register at boot and become callable by BDI agents through the existing `AnyAgentTool` interface. v1 wires `linear-pp-cli` and makes it callable by `cli-engineer`.

**Architecture:** Boot-time scan of `$GOPATH/bin/*-pp-cli`. Each binary's `agent-context --json` subcommand emits a manifest used to construct an `AnyAgentTool` whose `execute` shells out to the binary. The new tools concatenate with the existing 40+ static tool imports in `index.ts`. In-memory only — no persistence; rescan every boot. See [2026-05-22-mabos-tool-registry-design.md](2026-05-22-mabos-tool-registry-design.md) for full rationale.

**Tech Stack:** TypeScript (ESM, Node 22), `@sinclair/typebox` (parameter schemas, already used by other tools), `openclaw/plugin-sdk` (provides `AnyAgentTool` + `OpenClawPluginApi`), `node:fs/promises`, `node:child_process` (`execFile`), `node:util.promisify`, vitest (existing test framework at `extensions/mabos/extensions-mabos/tests/`).

---

## Pre-flight checks

Before starting, the executing agent must confirm:

- [ ] You are on branch `main` with my changes already committed (the previous CLI Agent implementation landed at commits `4a44b42874`, `2e002fe0a3`, `a46a739601`).
- [ ] You have read [docs/plans/2026-05-22-mabos-tool-registry-design.md](2026-05-22-mabos-tool-registry-design.md).
- [ ] `pnpm install` has run recently (or run it; the existing test pattern relies on vitest being available).
- [ ] `linear-pp-cli` is on PATH (`which linear-pp-cli` succeeds; if not, the earlier bootstrap script `scripts/install-cli-agent.sh` plus a `npx -y @mvanhorn/printing-press-library install linear` puts it there).
- [ ] Commits happen only after the user confirms (per `CLAUDE.md`: "Only create commits when requested by the user"). Each task below ends with a stage-only commit step.

**Optional worktree per multi-agent-safety:** create one for the in-repo work if other agents may be modifying the same files in parallel.

```bash
git worktree add -b mabos-tool-registry .worktrees/mabos-tool-registry main
```

---

### Task 1: Scaffold the file and write the first failing unit test

This task establishes the TDD discipline for the rest of the plan: write a test that fails because the module doesn't exist, then create the minimal module to make it pass.

**Files:**

- Create: `extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts`
- Create: `extensions/mabos/extensions-mabos/src/tools/printed-cli-tools.ts`

**Step 1: Write the failing test**

Create `extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { discoverPrintedClis } from "../src/tools/printed-cli-tools.js";

describe("discoverPrintedClis", () => {
  it("returns empty array when GOPATH/bin contains no printed CLIs", async () => {
    const tools = await discoverPrintedClis({
      gopathBin: "/nonexistent/path/that/does/not/exist",
    });
    expect(tools).toEqual([]);
  });
});
```

**Step 2: Run the test, expect it to fail**

Run from the repo root:

```bash
npx vitest run --config vitest.extensions.config.ts extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts 2>&1 | tail -20
```

Expected: failure with `Cannot find module '../src/tools/printed-cli-tools.js'`.

**Step 3: Create the minimal module**

Create `extensions/mabos/extensions-mabos/src/tools/printed-cli-tools.ts`:

```ts
/**
 * Printed-CLI tools — boot-time discovery of <slug>-pp-cli binaries
 * produced by `cli-printing-press`. Each discovered binary becomes an
 * AnyAgentTool that shells out to the binary via execFile.
 *
 * See docs/plans/2026-05-22-mabos-tool-registry-design.md for rationale.
 */

import type { AnyAgentTool } from "openclaw/plugin-sdk";

export interface DiscoverOptions {
  /** Directory to scan. Defaults to $(go env GOPATH)/bin when omitted. */
  gopathBin?: string;
}

export async function discoverPrintedClis(_opts: DiscoverOptions = {}): Promise<AnyAgentTool[]> {
  return [];
}
```

**Step 4: Run the test, expect it to pass**

Run:

```bash
npx vitest run --config vitest.extensions.config.ts extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts 2>&1 | tail -10
```

Expected: `1 passed`.

**Step 5: Stage commit (do not run without user approval)**

```bash
git add extensions/mabos/extensions-mabos/src/tools/printed-cli-tools.ts extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts
git commit -m "MABOS: scaffold printed-cli-tools registry module"
```

---

### Task 2: Implement `parseAgentContext` (TDD)

The discovery scan invokes `<binary> agent-context --json` on each candidate to extract a manifest. This task implements the parser as a pure function, fully unit-tested with mocked input.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/tools/printed-cli-tools.ts`
- Modify: `extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts`

**Step 1: Write the failing tests**

Append to `tests/printed-cli-tools.test.ts`:

```ts
import { parseAgentContext } from "../src/tools/printed-cli-tools.js";

describe("parseAgentContext", () => {
  it("returns a manifest for valid agent-context JSON", () => {
    const json = JSON.stringify({
      name: "linear-pp-cli",
      description: "Linear CLI — Offline-capable, agent-native Linear CLI",
      version: "1.0.0",
    });
    const meta = parseAgentContext(json, "/usr/local/bin/linear-pp-cli");
    expect(meta).toEqual({
      name: "linear-pp-cli",
      description: "Linear CLI — Offline-capable, agent-native Linear CLI",
      version: "1.0.0",
    });
  });

  it("throws with the binary path when JSON is malformed", () => {
    expect(() => parseAgentContext("not json", "/path/foo-pp-cli")).toThrow(/\/path\/foo-pp-cli/);
  });

  it("throws when required fields are missing", () => {
    expect(() => parseAgentContext('{"description":"x"}', "/path/foo-pp-cli")).toThrow(/name/);
    expect(() => parseAgentContext('{"name":"x"}', "/path/foo-pp-cli")).toThrow(/description/);
  });
});
```

**Step 2: Run tests, expect parseAgentContext tests to fail**

Run:

```bash
npx vitest run --config vitest.extensions.config.ts extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts 2>&1 | tail -20
```

Expected: 1 passing (Task 1's test), 3 failing (the 3 new tests) — `parseAgentContext is not exported` or similar.

**Step 3: Implement `parseAgentContext`**

Add to `printed-cli-tools.ts` (after the `DiscoverOptions` interface, before `discoverPrintedClis`):

```ts
export interface PrintedCliManifest {
  name: string;
  description: string;
  version?: string;
}

export function parseAgentContext(stdout: string, binaryPath: string): PrintedCliManifest {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch (err) {
    throw new Error(
      `printed-cli-tools: malformed agent-context JSON from ${binaryPath}: ${(err as Error).message}`,
    );
  }
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`printed-cli-tools: agent-context output from ${binaryPath} is not an object`);
  }
  const top = raw as Record<string, unknown>;
  // printing-press schema v3+ nests identity under .cli; older/test shapes
  // expose name/description at the top level. Accept either.
  const obj =
    top.cli && typeof top.cli === "object" && top.cli !== null
      ? (top.cli as Record<string, unknown>)
      : top;
  if (typeof obj.name !== "string") {
    throw new Error(
      `printed-cli-tools: agent-context from ${binaryPath} missing string field "name"`,
    );
  }
  if (typeof obj.description !== "string") {
    throw new Error(
      `printed-cli-tools: agent-context from ${binaryPath} missing string field "description"`,
    );
  }
  return {
    name: obj.name,
    description: obj.description,
    version: typeof obj.version === "string" ? obj.version : undefined,
  };
}
```

**Step 4: Run tests, expect all to pass**

Run:

```bash
npx vitest run --config vitest.extensions.config.ts extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts 2>&1 | tail -10
```

Expected: `4 passed`.

**Step 5: Stage commit**

```bash
git add extensions/mabos/extensions-mabos/src/tools/printed-cli-tools.ts extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts
git commit -m "MABOS: parse printed-CLI agent-context manifests"
```

---

### Task 3: Implement the subprocess adapter (TDD)

Build the `AnyAgentTool.execute` body that shells out to a binary, with timeout handling, exit-code reporting, and missing-binary safety. Uses `vi.mock` to isolate from real subprocesses.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/tools/printed-cli-tools.ts`
- Modify: `extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts`

**Step 1: Write the failing tests**

Append to `tests/printed-cli-tools.test.ts`:

```ts
import { vi } from "vitest";
import { runPrintedCli } from "../src/tools/printed-cli-tools.js";

describe("runPrintedCli", () => {
  it("returns code/stdout/stderr on success", async () => {
    const fakeExec = vi.fn(async () => ({ stdout: "hello\n", stderr: "" }));
    const result = await runPrintedCli("/path/foo-pp-cli", ["echo", "hello"], {
      execFile: fakeExec,
      timeoutMs: 1000,
    });
    expect(result).toEqual({ code: 0, stdout: "hello\n", stderr: "" });
    expect(fakeExec).toHaveBeenCalledWith(
      "/path/foo-pp-cli",
      ["echo", "hello"],
      expect.objectContaining({ timeout: 1000 }),
    );
  });

  it("reports non-zero exit codes verbatim", async () => {
    const err = Object.assign(new Error("exit 2"), { code: 2, stdout: "", stderr: "bad arg" });
    const fakeExec = vi.fn(async () => {
      throw err;
    });
    const result = await runPrintedCli("/path/foo-pp-cli", ["bogus"], {
      execFile: fakeExec,
      timeoutMs: 1000,
    });
    expect(result).toEqual({ code: 2, stdout: "", stderr: "bad arg" });
  });

  it("returns code 124 on timeout", async () => {
    // Real Node async execFile timeout: child killed by SIGTERM,
    // error has killed=true and signal='SIGTERM' (NOT code='ETIMEDOUT').
    const err = Object.assign(new Error("Command failed"), {
      code: null,
      killed: true,
      signal: "SIGTERM",
      stdout: "",
      stderr: "",
    });
    const fakeExec = vi.fn(async () => {
      throw err;
    });
    const result = await runPrintedCli("/path/foo-pp-cli", ["slow"], {
      execFile: fakeExec,
      timeoutMs: 50,
    });
    expect(result.code).toBe(124);
    expect(result.stderr).toMatch(/timeout/i);
  });

  it("returns code 127 when binary is missing", async () => {
    const err = Object.assign(new Error("not found"), { code: "ENOENT" });
    const fakeExec = vi.fn(async () => {
      throw err;
    });
    const result = await runPrintedCli("/path/missing-pp-cli", ["--help"], {
      execFile: fakeExec,
      timeoutMs: 1000,
    });
    expect(result.code).toBe(127);
    expect(result.stderr).toMatch(/missing-pp-cli/);
  });
});
```

**Step 2: Run tests, expect runPrintedCli tests to fail**

Run:

```bash
npx vitest run --config vitest.extensions.config.ts extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts 2>&1 | tail -20
```

Expected: 7 passing (Tasks 1+2 — Task 2 ended at 7 tests after code-quality fixes, not 4 as the original spec said), 4 failing.

**Step 3: Implement `runPrintedCli`**

Add to `printed-cli-tools.ts`:

```ts
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFileDefault = promisify(execFileCb);

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Override execFile for testing. Defaults to node:child_process.execFile. */
  execFile?: typeof execFileDefault;
  /** Per-call timeout in ms. Defaults to 60_000. */
  timeoutMs?: number;
}

export async function runPrintedCli(
  binaryPath: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  const exec = opts.execFile ?? execFileDefault;
  const timeout = opts.timeoutMs ?? 60_000;
  try {
    const { stdout, stderr } = await exec(binaryPath, args, {
      timeout,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr: stderr ?? "" };
  } catch (err: unknown) {
    const e = err as {
      code?: number | string;
      killed?: boolean;
      signal?: string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    // Timeout: async execFile kills the child with killSignal (default SIGTERM)
    // and sets killed/signal on the error. err.code is NOT "ETIMEDOUT".
    if (e.killed === true && typeof e.signal === "string") {
      return {
        code: 124,
        stdout: e.stdout ?? "",
        stderr: `timeout after ${timeout}ms (killed by ${e.signal})`,
      };
    }
    if (e.code === "ENOENT") {
      return { code: 127, stdout: "", stderr: `binary not found: ${binaryPath}` };
    }
    return {
      code: typeof e.code === "number" ? e.code : 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.message ?? "unknown error",
    };
  }
}
```

**Note: stdin is deferred to v2.** Original spec had a `stdin: string | undefined` parameter passed as `input: stdin` to execFile, but Node's async `execFile` does NOT support `input` (only `execFileSync` does — stdin would silently be dropped). Removed for v1; cli-engineer's first use case (`linear-pp-cli --version`) doesn't need stdin. v2 will rewrite to `spawn` + manual `child.stdin` piping when a real workflow needs it. See Task 3 code-quality review for full context.

**Step 4: Run tests, expect all 8 to pass**

Run:

```bash
npx vitest run --config vitest.extensions.config.ts extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts 2>&1 | tail -10
```

Expected: `11 passed` (7 from Tasks 1+2 + 4 new).

**Step 5: Stage commit**

```bash
git add extensions/mabos/extensions-mabos/src/tools/printed-cli-tools.ts extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts
git commit -m "MABOS: subprocess adapter for printed CLIs"
```

---

### Task 4: Implement `discoverPrintedClis` fully (TDD)

Wire `parseAgentContext` + `runPrintedCli` together. Glob `<gopathBin>/*-pp-cli`, call `agent-context --json` on each, skip binaries that fail, return `AnyAgentTool[]`.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/src/tools/printed-cli-tools.ts`
- Modify: `extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts`

**Step 1: Write the failing tests**

Append to `tests/printed-cli-tools.test.ts`:

```ts
import { mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach } from "vitest";

describe("discoverPrintedClis (with real filesystem)", () => {
  let scratchDir: string;

  beforeEach(async () => {
    scratchDir = join(tmpdir(), `mabos-discover-${randomUUID()}`);
    await mkdir(scratchDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(scratchDir, { recursive: true, force: true });
  });

  it("returns empty array when directory is empty", async () => {
    const tools = await discoverPrintedClis({ gopathBin: scratchDir });
    expect(tools).toEqual([]);
  });

  it("skips files that don't match *-pp-cli", async () => {
    await writeFile(join(scratchDir, "some-other-binary"), "#!/bin/sh\necho hi", { mode: 0o755 });
    await writeFile(join(scratchDir, "another.txt"), "not a binary", { mode: 0o644 });
    const tools = await discoverPrintedClis({ gopathBin: scratchDir });
    expect(tools).toEqual([]);
  });

  it("registers binaries whose agent-context returns valid JSON", async () => {
    const fakeBin = join(scratchDir, "fake-pp-cli");
    const script = `#!/bin/sh
if [ "$1" = "agent-context" ]; then
  echo '{"name":"fake-pp-cli","description":"Fake CLI for tests","version":"0.0.1"}'
  exit 0
fi
echo "unknown subcommand"
exit 2
`;
    await writeFile(fakeBin, script);
    await chmod(fakeBin, 0o755);
    const tools = await discoverPrintedClis({ gopathBin: scratchDir });
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("cli.fake-pp-cli");
    expect(tools[0].label).toBe("fake-pp-cli");
    expect(tools[0].description).toBe("Fake CLI for tests");
  });

  it("skips binaries whose agent-context fails", async () => {
    const badBin = join(scratchDir, "bad-pp-cli");
    await writeFile(badBin, `#!/bin/sh\nexit 2\n`);
    await chmod(badBin, 0o755);
    const tools = await discoverPrintedClis({ gopathBin: scratchDir });
    expect(tools).toEqual([]);
  });
});
```

**Step 2: Run tests, expect new discoverPrintedClis tests to fail**

Run:

```bash
npx vitest run --config vitest.extensions.config.ts extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts 2>&1 | tail -25
```

Expected: 11 passing, 4 new ones failing because `discoverPrintedClis` still returns `[]` unconditionally.

**Step 3: Implement full `discoverPrintedClis`**

Replace the stub `discoverPrintedClis` in `printed-cli-tools.ts` with:

```ts
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";

function defaultGopathBin(): string {
  // Mirror `go env GOPATH`/bin without actually shelling out at module-init.
  // If unset, fall back to the conventional ~/go/bin.
  const fromEnv = process.env.GOPATH;
  if (fromEnv) return join(fromEnv, "bin");
  return join(process.env.HOME ?? "", "go", "bin");
}

export async function discoverPrintedClis(opts: DiscoverOptions = {}): Promise<AnyAgentTool[]> {
  const dir = opts.gopathBin ?? defaultGopathBin();

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const candidates = entries.filter((name) => name.endsWith("-pp-cli"));
  const tools: AnyAgentTool[] = [];

  for (const name of candidates) {
    const path = join(dir, name);
    try {
      const s = await stat(path);
      if (!s.isFile()) continue;
    } catch {
      continue;
    }

    const probe = await runPrintedCli(path, ["agent-context", "--json"], {
      timeoutMs: 5_000,
    });
    if (probe.code !== 0) {
      continue;
    }

    let meta: PrintedCliManifest;
    try {
      meta = parseAgentContext(probe.stdout, path);
    } catch {
      continue;
    }

    tools.push(adapt(path, meta));
  }

  return tools;
}

function adapt(binaryPath: string, meta: PrintedCliManifest): AnyAgentTool {
  const name = `cli.${meta.name}`;
  // execute returns an AgentToolResult<RunResult>: human-readable text in
  // `content` for the agent, plus the structured RunResult in `details` for
  // callers that want to inspect exit codes / stderr.
  return {
    name,
    label: meta.name,
    description: meta.description,
    parameters: Type.Object({
      args: Type.Array(Type.String(), {
        description: "Subcommand and flags (e.g. ['issues','list','--me','--json']).",
      }),
    }),
    execute: async (_toolCallId: string, params: { args: string[] }) => {
      const result = await runPrintedCli(binaryPath, params.args);
      const text =
        result.code === 0
          ? result.stdout || "(no output)"
          : `Command failed with exit ${result.code}\n${result.stderr}`;
      return {
        content: [{ type: "text" as const, text }],
        details: result,
      };
    },
  };
}
```

Note: the `as AnyAgentTool` cast may need refinement if the SDK's interface has stricter typing — adjust based on real type errors at compile time.

**Step 4: Run tests, expect all 12 to pass**

Run:

```bash
npx vitest run --config vitest.extensions.config.ts extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts 2>&1 | tail -10
```

Expected: `15 passed` (11 from Tasks 1-3 + 4 new).

**Step 5: TypeScript typecheck**

Run from repo root:

```bash
pnpm tsgo 2>&1 | tail -20
```

Expected: no new errors. If `as AnyAgentTool` is too loose, fix the type and re-run.

**Step 6: Stage commit**

```bash
git add extensions/mabos/extensions-mabos/src/tools/printed-cli-tools.ts extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts
git commit -m "MABOS: implement printed-CLI discovery scan"
```

---

### Task 5: Integration test against a real fake-CLI subprocess

Task 4's tests already exercise real subprocesses (via `vi.beforeEach` writing bash scripts). This task adds a more representative end-to-end test that calls a discovered tool's `execute` to confirm the adapter contract works in practice.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts`

**Step 1: Write the failing test**

Append to `tests/printed-cli-tools.test.ts`:

```ts
describe("printed CLI adapter (end-to-end against fake binary)", () => {
  let scratchDir: string;
  let fakeBin: string;

  beforeEach(async () => {
    scratchDir = join(tmpdir(), `mabos-adapter-${randomUUID()}`);
    await mkdir(scratchDir, { recursive: true });
    fakeBin = join(scratchDir, "echo-pp-cli");
    const script = `#!/bin/sh
case "$1" in
  agent-context)
    echo '{"name":"echo-pp-cli","description":"Echoes its args","version":"0.0.1"}'
    ;;
  greet)
    echo "hello $2"
    ;;
  fail)
    echo "boom" >&2
    exit 3
    ;;
  *)
    echo "unknown" >&2
    exit 1
    ;;
esac
`;
    await writeFile(fakeBin, script);
    await chmod(fakeBin, 0o755);
  });

  afterEach(async () => {
    await rm(scratchDir, { recursive: true, force: true });
  });

  it("invokes the discovered tool with subcommand args", async () => {
    const tools = await discoverPrintedClis({ gopathBin: scratchDir });
    expect(tools).toHaveLength(1);
    const result = await tools[0].execute!("cli.echo-pp-cli", {
      args: ["greet", "world"],
    });
    // adapt() returns AgentToolResult<RunResult>: text content for the agent
    // + structured RunResult in details.
    expect(result.details).toMatchObject({ code: 0, stdout: "hello world\n" });
    expect(result.content).toEqual([{ type: "text", text: "hello world\n" }]);
  });

  it("surfaces non-zero exit codes from the discovered tool", async () => {
    const tools = await discoverPrintedClis({ gopathBin: scratchDir });
    const result = await tools[0].execute!("cli.echo-pp-cli", { args: ["fail"] });
    expect(result.details).toMatchObject({ code: 3, stderr: "boom\n" });
    // Failure case: content text describes the failure for the agent.
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect((result.content[0] as { text: string }).text).toMatch(/exit 3/);
  });
});
```

**Step 2: Run tests, expect both new ones to pass (no implementation change needed)**

Run:

```bash
npx vitest run --config vitest.extensions.config.ts extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts 2>&1 | tail -10
```

Expected: `17 passed` (15 from Tasks 1-4 + 2 new).

If they fail, that's evidence the adapter shape from Task 4 doesn't match what real callers need — fix the adapter, not the tests.

**Step 3: Stage commit**

```bash
git add extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts
git commit -m "MABOS: integration tests for printed-CLI adapter"
```

---

### Task 6: Wire `discoverPrintedClis` into `index.ts`

Add the import + boot-time call + concat. Must not break the existing 40+ tool registrations.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/index.ts` (specifically the existing tools-array assembly; the audit located this at lines ~121-164 but verify in the actual file before editing)

**Step 1: Read the existing tools-array section**

Run:

```bash
grep -n "createCommunicationTools\|tools.*=.*\[" extensions/mabos/extensions-mabos/index.ts | head -10
```

Find the line where `const tools = [` (or similar) starts and where it ends. Read those lines to understand the exact shape. Different from the audit's estimate is fine — work with the actual file.

**Step 2: Add the import**

Add this import at the top of `index.ts`, near the other `./src/tools/*` imports:

```ts
import { discoverPrintedClis } from "./src/tools/printed-cli-tools.js";
```

**Step 3: Add fire-and-forget discovery + registration**

**Plan adapted to the real `index.ts` shape:** The MABOS plugin loader expects a synchronous `register()` function — it explicitly ignores returned promises (see `src/plugins/loader.ts`). Static tools are registered via `api.registerTool(tool)` in a loop iterating a `factories` array, not via a top-level `const tools = [...]` literal. So the discovery has to be fire-and-forget rather than awaited.

`api.registerTool` is a closure that works after boot. Static tools register first synchronously (so they win on any ID collision); the async discovery then registers printed CLIs as they're resolved. First BDI cycle that needs a CLI will find it available after a brief delay (typically < 2s).

Add this block AFTER the static tools have been registered in the for-loop, BEFORE the end of `register()`:

```ts
// Discover and register printed CLIs (<slug>-pp-cli binaries on PATH).
// Fire-and-forget: the plugin loader ignores promises returned from register(),
// so we register asynchronously after the static tools so that static tools
// win on any ID collision. Discovery never throws (degrades to []) but we add
// a defensive .catch anyway. See docs/plans/2026-05-22-mabos-tool-registry-design.md
discoverPrintedClis()
  .then((printedClis) => {
    for (const tool of printedClis) {
      api.registerTool(tool);
      registeredToolNames.push(tool.name);
    }
    if (printedClis.length > 0) {
      log.info?.(`[mabos] Registered ${printedClis.length} printed-CLI tool(s)`);
    }
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn?.(`[mabos] printed-CLI discovery failed: ${msg}; continuing without`);
  });
```

Notes:

- `log` is the file-local alias for `api.logger` (not `api.log`)
- `registeredToolNames` is an existing array used by the file's tool-filter export; push the new names so the filter stays consistent
- Trade-off: `tool.name` collisions resolve in favor of whoever registered first. Since static tools register first synchronously, they always win.

**Step 4: No-op** (the original Step 4 about concatenating into a tools array literal doesn't apply; there is no such literal in the actual file).

**Step 5: Verify TypeScript build**

Run from repo root:

```bash
pnpm tsgo 2>&1 | tail -20
```

Expected: no new errors. If the `await` inside top-level `index.ts` body errors with "await is only valid in async functions" — the file's top level may need to be wrapped, or the discovery call may need to happen inside an existing async setup function. Read the file's existing structure and adapt.

**Step 6: Run all MABOS tests to confirm nothing broke**

Run:

```bash
npx vitest run --config vitest.extensions.config.ts 2>&1 | tail -10
```

Expected: all existing tests pass plus the 14 new ones from the previous tasks.

**Step 7: Stage commit**

```bash
git add extensions/mabos/extensions-mabos/index.ts
git commit -m "MABOS: register printed CLIs at boot via discovery scan"
```

---

### Task 7: Add `cli.invoke` capability to `cli-engineer`

Document the new capability in the `cli-engineer` template so the agent knows it can call printed CLIs through the registry.

**Files:**

- Modify: `extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/Capabilities.md`

**Step 1: Add the row**

Open the file and add this row to the existing capabilities table:

```markdown
| `cli.invoke` | Invoke any printed CLI via the registry | discovered `cli.*` tools | command + args | code, stdout, stderr |
```

Place it at the end of the table (after `auth.surface`). The exact column count must match the existing rows in the table.

**Step 2: Verify the file still parses**

Just open it to eyeball the table; markdown table syntax breaks silently. If `cat extensions/.../Capabilities.md` shows the new row in the same alignment as the others, it's fine.

**Step 3: Stage commit**

```bash
git add extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/Capabilities.md
git commit -m "MABOS: expose cli.invoke capability on cli-engineer"
```

---

### Task 8: Manual smoke test against `linear-pp-cli` (best-effort)

This is the same end-to-end-via-MABOS smoke test that was deferred from the earlier CLI Agent plan (Task 11 there). If the orchestrator-trigger contract can't be cracked in a reasonable time, document the gap and ship v1 with units + integration coverage.

**Files:**

- Create (workspace, not template): `extensions/mabos/extensions-mabos/workspace/agents/cli-engineer/inbox.json` (only if you can actually trigger a cycle)

**Step 1: Verify the binary is discoverable**

From the repo root:

```bash
node --experimental-vm-modules -e "
import('./extensions/mabos/extensions-mabos/src/tools/printed-cli-tools.js').then(async (m) => {
  const tools = await m.discoverPrintedClis();
  console.log(JSON.stringify(tools.map(t => ({id: t.id, label: t.label, description: t.description})), null, 2));
});
" 2>&1 | tail -20
```

Expected: an array with at least one entry — `{id: "cli.linear-pp-cli", label: "linear-pp-cli", description: "Linear CLI — Offline-capable, agent-native..."}`. If empty, debug: check `which linear-pp-cli`, confirm `$GOPATH` is set, confirm the binary supports `agent-context --json` (`linear-pp-cli agent-context --json` should return JSON).

If the `node --experimental-vm-modules` invocation errors, use the project's standard runner — likely `pnpm openclaw <something>` or run via a one-off vitest test.

**Step 2: Investigate the MABOS BDI-cycle trigger**

Read these in order to understand how a cycle is triggered:

- `extensions/mabos/extensions-mabos/scripts/director-orchestrator.ts`
- `extensions/mabos/extensions-mabos/scripts/run-heartbeat.ts`

Goal: find the function or CLI command that drops an inbox message at an agent and runs one BDI cycle. Document what you find — even if the answer is "there's no test entrypoint for this."

**Step 3 (if Step 2 found a usable trigger): instantiate cli-engineer and drop a message**

```bash
mkdir -p extensions/mabos/extensions-mabos/workspace/agents/cli-engineer
cat > extensions/mabos/extensions-mabos/workspace/agents/cli-engineer/inbox.json <<'EOF'
[
  {
    "id": "TASK-smoke-001",
    "from": "ceo",
    "to": "cli-engineer",
    "performative": "REQUEST",
    "subject": "cli-request",
    "content": "[CLI Request] action=invoke target=cli.linear-pp-cli args=[\"--version\"]",
    "priority": "normal",
    "timestamp": "2026-05-22T00:00:00.000Z",
    "read": false,
    "task_id": "T-SMOKE-001",
    "goal_id": "G-SMOKE-001",
    "plan_id": "P-SMOKE-001"
  }
]
EOF
```

Trigger one cycle using whatever entrypoint Step 2 surfaced.

Expected: cli-engineer's response (in its outbox or in the requester's inbox) reports `code: 0` and `stdout: "linear-pp-cli 1.0.0"`.

**Step 4 (if Step 2 found no trigger): document the gap**

If you couldn't trigger a cycle, add this note to the bottom of `extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/Task.md` (in the "Runtime smoke test" section that already exists):

```markdown
> **Update 2026-05-22:** The orchestrator-trigger contract is still unknown
> as of the printed-CLI registry implementation. The registry plumbing
> (`src/tools/printed-cli-tools.ts`) is unit + integration tested and the
> standalone discovery scan returns the expected adapter. Wiring a real
> end-to-end BDI cycle that calls `cli.linear-pp-cli` through this agent
> requires understanding how `director-orchestrator.ts` or `run-heartbeat.ts`
> accepts ad-hoc test messages — deferred to a follow-up session.
```

**Step 5: Stage commit (for either Step 3 success or Step 4 gap documentation)**

If Step 3 succeeded:

```bash
git add extensions/mabos/extensions-mabos/workspace/agents/cli-engineer/inbox.json
git commit -m "MABOS: cli-engineer smoke test for printed-CLI registry"
```

If Step 4 was needed:

```bash
git add extensions/mabos/extensions-mabos/templates/base/agents/cli-engineer/Task.md
git commit -m "Docs: note unresolved orchestrator-trigger contract"
```

---

## Final acceptance criteria

The plan is complete when all of these are true:

- [ ] `extensions/mabos/extensions-mabos/src/tools/printed-cli-tools.ts` exists and exports `discoverPrintedClis`, `parseAgentContext`, `runPrintedCli`.
- [ ] `extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts` has at least 17 passing tests covering parse, run, discover, and adapter end-to-end against a fake CLI.
- [ ] `npx vitest run --config vitest.extensions.config.ts extensions/mabos/extensions-mabos/tests/printed-cli-tools.test.ts` from the repo root returns all-green.
- [ ] `pnpm tsgo` from repo root has no new errors.
- [ ] `index.ts` imports `discoverPrintedClis`, calls it at boot with `.catch`, and concatenates the result into the tools array.
- [ ] `cli-engineer/Capabilities.md` has a `cli.invoke` row.
- [ ] Manual verification: running the standalone discovery scan (Task 8 Step 1) returns at least `cli.linear-pp-cli` on this machine.
- [ ] Task 8's end-to-end smoke either passed (and is documented) or was unsuccessful (and the gap is documented in `Task.md`).
- [ ] No commit was made without explicit user approval.

## What this plan deliberately does NOT do (deferred)

- Updates to any agent's BDI files other than `cli-engineer/Capabilities.md`. The audit showed no organic demand from ceo/cfo/etc.; mass enrollment is a v2 question.
- N-tool-per-CLI typed expansion. v1 ships a single tool per binary.
- Persistence — discovery rescans at every MABOS restart.
- Auto-registration of newly-printed CLIs without a restart. cli-engineer can shell out to a fresh binary directly via `Bash` if needed before the next restart.
- Periodic re-scan.
- Tenant scoping. Single-tenant `$GOPATH/bin` for v1.
- Telemetry on which tools agents actually call.
- An auto-hook in `scripts/install-cli-agent.sh` to register a new print without restart.
- Changes to any other static tool module.
