/**
 * Execution sandbox module — isolated terminal execution backends
 * (local, Docker, SSH, Modal) with file transfer support.
 */

import { Type } from "@sinclair/typebox";
import type { OpenClawPluginApi, AnyAgentTool } from "openclaw/plugin-sdk";
import { textResult, generatePrefixedId } from "../tools/common.js";
import { registerSandboxHooks } from "./hooks.js";
import { SandboxManager } from "./manager.js";
import { registerSandboxRoutes } from "./routes.js";
import type { ExecutionSandboxConfig } from "./types.js";

export function registerExecutionSandbox(
  api: OpenClawPluginApi,
  config: { sandbox?: ExecutionSandboxConfig },
): void {
  const log = api.logger;
  const sbConfig = config.sandbox ?? {};
  const manager = new SandboxManager(sbConfig);

  // Tool: sandbox_exec
  api.registerTool({
    name: "sandbox_exec",
    label: "Execute in Sandbox",
    description:
      "Execute a command in an isolated sandbox environment (local, Docker, SSH, or Modal).",
    parameters: Type.Object({
      command: Type.String({ description: "Command to execute" }),
      task_id: Type.Optional(Type.String({ description: "Task ID for sandbox reuse" })),
      backend: Type.Optional(Type.String({ description: "Backend: local, docker, ssh, modal" })),
      cwd: Type.Optional(Type.String({ description: "Working directory" })),
      timeout_ms: Type.Optional(Type.Number({ description: "Timeout in ms" })),
    }),
    async execute(
      _id: string,
      params: {
        command: string;
        task_id?: string;
        backend?: string;
        cwd?: string;
        timeout_ms?: number;
      },
    ) {
      const taskId = params.task_id ?? generatePrefixedId("sandbox");
      const sandbox = await manager.getOrCreate(taskId, params.backend);
      const result = await sandbox.exec(params.command, {
        cwd: params.cwd,
        timeoutMs: params.timeout_ms,
      });
      const output = [
        `[${result.backend}] Exit code: ${result.exitCode} (${result.durationMs}ms)`,
        result.stdout ? `stdout:\n${result.stdout.slice(0, 4000)}` : "",
        result.stderr ? `stderr:\n${result.stderr.slice(0, 2000)}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      return textResult(output);
    },
  } as AnyAgentTool);

  // Tool: sandbox_upload
  api.registerTool({
    name: "sandbox_upload",
    label: "Upload to Sandbox",
    description: "Upload a file from the local filesystem into an active sandbox environment.",
    parameters: Type.Object({
      task_id: Type.String({ description: "Sandbox task ID" }),
      local_path: Type.String({ description: "Local file path to upload" }),
      remote_path: Type.String({ description: "Destination path inside the sandbox" }),
    }),
    async execute(
      _id: string,
      params: { task_id: string; local_path: string; remote_path: string },
    ) {
      const sandbox = await manager.getOrCreate(params.task_id);
      // Use exec to copy file content via base64 encoding for portability
      const { readFile } = await import("node:fs/promises");
      try {
        const content = await readFile(params.local_path);
        const b64 = content.toString("base64");
        const result = await sandbox.exec(`echo '${b64}' | base64 -d > ${params.remote_path}`, {
          timeoutMs: 30_000,
        });
        if (result.exitCode !== 0) {
          return textResult(`Upload failed: ${result.stderr}`);
        }
        return textResult(
          `Uploaded ${params.local_path} → ${params.remote_path} in sandbox "${params.task_id}"`,
        );
      } catch (err) {
        return textResult(`Upload failed: ${err}`);
      }
    },
  } as AnyAgentTool);

  // Tool: sandbox_download
  api.registerTool({
    name: "sandbox_download",
    label: "Download from Sandbox",
    description: "Download a file from an active sandbox environment to the local filesystem.",
    parameters: Type.Object({
      task_id: Type.String({ description: "Sandbox task ID" }),
      remote_path: Type.String({ description: "File path inside the sandbox" }),
      local_path: Type.String({ description: "Local destination path" }),
    }),
    async execute(
      _id: string,
      params: { task_id: string; remote_path: string; local_path: string },
    ) {
      const sandbox = await manager.getOrCreate(params.task_id);
      try {
        const result = await sandbox.exec(`base64 ${params.remote_path}`, { timeoutMs: 30_000 });
        if (result.exitCode !== 0) {
          return textResult(`Download failed: ${result.stderr}`);
        }
        const { writeFile } = await import("node:fs/promises");
        const content = Buffer.from(result.stdout.trim(), "base64");
        await writeFile(params.local_path, content);
        return textResult(
          `Downloaded ${params.remote_path} → ${params.local_path} from sandbox "${params.task_id}"`,
        );
      } catch (err) {
        return textResult(`Download failed: ${err}`);
      }
    },
  } as AnyAgentTool);

  // Tool: sandbox_status
  api.registerTool({
    name: "sandbox_status",
    label: "Sandbox Status",
    description: "List active sandbox environments.",
    parameters: Type.Object({}),
    async execute() {
      const active = manager.getActiveSandboxes();
      if (active.length === 0) return textResult("No active sandboxes.");
      const lines = active.map((s) => `  ${s.taskId} -> ${s.backend}`);
      return textResult(`Active sandboxes (${active.length}):\n${lines.join("\n")}`);
    },
  } as AnyAgentTool);

  // Tool: sandbox_destroy
  api.registerTool({
    name: "sandbox_destroy",
    label: "Destroy Sandbox",
    description: "Destroy a specific sandbox or all sandboxes.",
    parameters: Type.Object({
      all: Type.Optional(Type.Boolean({ description: "Destroy all sandboxes" })),
    }),
    async execute(_id: string, params: { all?: boolean }) {
      if (params.all) {
        await manager.destroyAll();
        return textResult("All sandboxes destroyed.");
      }
      return textResult("Specify all=true to destroy all sandboxes.");
    },
  } as AnyAgentTool);

  // Register hooks for terminal interception
  registerSandboxHooks(api, manager, sbConfig);

  // Register HTTP routes
  registerSandboxRoutes(api, manager);

  log.info(
    `[sandbox] Execution sandbox initialized (default backend: ${sbConfig.defaultBackend ?? "local"})`,
  );
}

export { SandboxManager } from "./manager.js";
export { LocalBackend } from "./backends/local.js";
export { DockerBackend } from "./backends/docker.js";
