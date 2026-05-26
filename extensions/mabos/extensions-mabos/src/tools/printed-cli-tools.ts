/**
 * Printed-CLI tools — boot-time discovery of <slug>-pp-cli binaries
 * produced by `cli-printing-press`. Each discovered binary becomes an
 * AnyAgentTool that shells out to the binary via execFile.
 *
 * See docs/plans/2026-05-22-mabos-tool-registry-design.md for rationale.
 */

import { execFile as execFileCb } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk";

const execFileDefault = promisify(execFileCb);

export interface DiscoverOptions {
  /** Directory to scan. Defaults to $(go env GOPATH)/bin when omitted. */
  gopathBin?: string;
}

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
      `printed-cli-tools: agent-context from ${binaryPath} expected string field "name" (got ${typeof obj.name})`,
    );
  }
  if (obj.name.trim() === "") {
    throw new Error(`printed-cli-tools: agent-context from ${binaryPath} field "name" is empty`);
  }
  if (typeof obj.description !== "string") {
    throw new Error(
      `printed-cli-tools: agent-context from ${binaryPath} expected string field "description" (got ${typeof obj.description})`,
    );
  }
  if (obj.description.trim() === "") {
    throw new Error(
      `printed-cli-tools: agent-context from ${binaryPath} field "description" is empty`,
    );
  }
  return {
    name: obj.name,
    description: obj.description,
    version: typeof obj.version === "string" && obj.version.trim() !== "" ? obj.version : undefined,
  };
}

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
      console.warn(
        `[printed-cli-tools] skipping ${path}: agent-context probe exited ${probe.code} (${probe.stderr.trim() || "no stderr"})`,
      );
      continue;
    }

    let meta: PrintedCliManifest;
    try {
      meta = parseAgentContext(probe.stdout, path);
    } catch (err) {
      console.warn(`[printed-cli-tools] skipping ${path}: ${(err as Error).message}`);
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
        description:
          "Subcommand and flags as a string array (e.g. ['command', '--flag', 'value']).",
      }),
    }),
    execute: async (_toolCallId: string, params: { args: string[] }) => {
      const result = await runPrintedCli(binaryPath, params.args);
      const text =
        result.code === 0
          ? result.stdout.trim()
            ? result.stdout
            : "(no output)"
          : `Command failed with exit ${result.code}\n${result.stderr}`;
      return {
        content: [{ type: "text" as const, text }],
        details: result,
      };
    },
  };
}
