/**
 * Plugin-facing config write helpers.
 *
 * Lets plugins persist changes into the real gateway config (the file the
 * runtime reads) without reaching into core internals. `updateGatewayConfig`
 * wraps the snapshot-read + write-back flow from `config/io`, which already
 * preserves `${ENV}` secret references and triggers a runtime config refresh
 * on write. `setDurableSecretEnv` stores a secret in the gateway's durable
 * dotenv (`~/.openclaw/.env`) so an `${ENV}` reference resolves both
 * immediately (live reload) and across restarts.
 */

import fs from "node:fs";
import path from "node:path";
import type { OpenClawConfig } from "../config/config.js";
import { readConfigFileSnapshotForWrite, writeConfigFile } from "../config/io.js";
import { isValidEnvSecretRefId } from "../config/types.secrets.js";
import { resolveConfigDir } from "../utils.js";

export type GatewayConfigMutator = (draft: OpenClawConfig) => OpenClawConfig | void;

/**
 * Read the on-disk gateway config, apply `mutator` to a clone, and write it
 * back. The write path restores `${ENV}` references for existing secrets and
 * refreshes the runtime snapshot, so changes go live without a restart.
 *
 * Returns the mutated config that was written.
 */
export async function updateGatewayConfig(mutator: GatewayConfigMutator): Promise<OpenClawConfig> {
  const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite();
  // `resolved` is post-include/post-${ENV} but pre-runtime-defaults — the
  // correct base for config edits (avoids persisting runtime defaults).
  const draft = structuredClone(snapshot.resolved) as OpenClawConfig;
  const next = (mutator(draft) ?? draft) as OpenClawConfig;
  await writeConfigFile(next, writeOptions);
  return next;
}

function escapeDotEnvValue(value: string): string {
  // dotenv supports double-quoted values with \n / \" escapes.
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  return `"${escaped}"`;
}

/**
 * Upsert `KEY=value` into the gateway's durable dotenv at
 * `<configDir>/.env` and set `process.env[id]` for the current process.
 *
 * `id` must be a valid env secret ref id (uppercase, see `types.secrets`).
 */
export async function setDurableSecretEnv(id: string, value: string): Promise<void> {
  if (!isValidEnvSecretRefId(id)) {
    throw new Error(`Invalid env secret id: ${id} (expected /^[A-Z][A-Z0-9_]{0,127}$/)`);
  }
  const dir = resolveConfigDir(process.env);
  const envPath = path.join(dir, ".env");
  const line = `${id}=${escapeDotEnvValue(value)}`;

  let lines: string[] = [];
  if (fs.existsSync(envPath)) {
    const raw = await fs.promises.readFile(envPath, "utf-8");
    lines = raw.split("\n");
  } else {
    await fs.promises.mkdir(dir, { recursive: true });
  }

  const keyPrefix = `${id}=`;
  const idx = lines.findIndex((l) => l.startsWith(keyPrefix));
  if (idx >= 0) {
    lines[idx] = line;
  } else {
    // Drop a single trailing empty line before appending, then re-terminate.
    if (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }
    lines.push(line);
  }
  await fs.promises.writeFile(envPath, `${lines.join("\n")}\n`, { mode: 0o600 });
  // chmod in case the file pre-existed with looser perms.
  await fs.promises.chmod(envPath, 0o600).catch(() => {});

  process.env[id] = value;
}

/** The `${ID}` env-template form recognized by the config secret resolver. */
export function envSecretRefTemplate(id: string): string {
  return `\${${id}}`;
}
