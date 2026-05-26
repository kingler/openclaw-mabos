import { randomUUID } from "node:crypto";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  discoverPrintedClis,
  parseAgentContext,
  runPrintedCli,
} from "../src/tools/printed-cli-tools.js";

describe("discoverPrintedClis", () => {
  it("returns empty array when GOPATH/bin contains no printed CLIs", async () => {
    const tools = await discoverPrintedClis({
      gopathBin: "/nonexistent/path/that/does/not/exist",
    });
    expect(tools).toEqual([]);
  });
});

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

  it("rejects when name is wrong type with type-aware message", () => {
    expect(() => parseAgentContext('{"name":42,"description":"x"}', "/path/foo-pp-cli")).toThrow(
      /got number/,
    );
  });

  it("rejects array input", () => {
    expect(() => parseAgentContext("[]", "/path/foo-pp-cli")).toThrow();
  });

  it("rejects empty name", () => {
    expect(() => parseAgentContext('{"name":"","description":"x"}', "/path/foo-pp-cli")).toThrow(
      /empty/,
    );
  });

  it("accepts printing-press v3 schema (identity nested under .cli)", () => {
    const json = JSON.stringify({
      schema_version: "3",
      cli: {
        name: "linear-pp-cli",
        description: "Offline-capable Linear CLI",
        version: "1.0.0",
      },
      auth: { mode: "api_key" },
      commands: [{ name: "issues" }],
    });
    const meta = parseAgentContext(json, "/usr/local/bin/linear-pp-cli");
    expect(meta).toEqual({
      name: "linear-pp-cli",
      description: "Offline-capable Linear CLI",
      version: "1.0.0",
    });
  });
});

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
