/**
 * Shared channel provisioning — the single implementation used by both the
 * setup-wizard agent tool and the HTTP routes that back the web UI.
 *
 * Flow: validate against the catalog -> live credential test -> persist secrets
 * as `${ENV}` references in the gateway's durable dotenv -> write the channel
 * account into the real gateway config (which refreshes the runtime snapshot,
 * so the channel goes live without a restart) -> record non-secret MABOS
 * metadata for UI listing + business binding -> return a masked status.
 */

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  envSecretRefTemplate,
  setDurableSecretEnv,
  unsetDurableSecretEnv,
  updateGatewayConfig,
  whatsappLoginStart,
  whatsappLoginWait,
  type OpenClawConfig,
  type OpenClawPluginApi,
} from "openclaw/plugin-sdk";
import { getChannelDescriptor, type ChannelDescriptor } from "./channel-catalog.js";
import { httpRequest, resolveWorkspaceDir } from "../tools/common.js";

export type ChannelTestResult = { success: boolean; error?: string; bot_info?: unknown };

export type ProvisionChannelInput = {
  channelType: string;
  /** Credentials keyed by catalog field `name` (e.g. { bot_token: "..." }). */
  credentials: Record<string, string>;
  /** Bind inbound messages to this agent (typically a business router agent). */
  agentId?: string;
  /** MABOS business this channel belongs to (metadata only). */
  businessId?: string;
  name?: string;
  /** Run the live credential test before saving (default true). */
  test?: boolean;
};

export type ProvisionedChannel = {
  id: string;
  type: string;
  name: string;
  status: "active" | "inactive";
  agentId?: string;
  businessId?: string;
  createdAt: string;
  maskedCredentials: Record<string, string>;
};

export type ProvisionResult = {
  ok: boolean;
  channel?: ProvisionedChannel;
  test?: ChannelTestResult;
  error?: string;
};

/**
 * Live credential verification. Validates format first, then makes a real API
 * call where possible. Network failures degrade to "format validated only" so
 * setup is never blocked by a transient outage.
 */
export async function testChannelConnection(
  channelType: string,
  credentials: Record<string, unknown>,
): Promise<ChannelTestResult> {
  // Step 1: Validate credential format
  switch (channelType) {
    case "telegram":
      if (
        typeof credentials.bot_token !== "string" ||
        !credentials.bot_token.match(/^\d+:[A-Za-z0-9_-]+$/)
      ) {
        return { success: false, error: "Invalid Telegram bot token format" };
      }
      break;
    case "discord":
      if (!credentials.bot_token || !credentials.application_id) {
        return { success: false, error: "Discord bot token and application ID required" };
      }
      break;
    case "slack":
      if (
        typeof credentials.bot_token !== "string" ||
        !credentials.bot_token.startsWith("xoxb-")
      ) {
        return { success: false, error: "Invalid Slack bot token format (must start with xoxb-)" };
      }
      break;
    case "signal":
      if (!credentials.account) {
        return { success: false, error: "Signal account (E.164 phone number) required" };
      }
      break;
    case "whatsapp":
      if (!credentials.access_token && !credentials.session_path) {
        return { success: false, error: "WhatsApp access_token or session_path required" };
      }
      break;
    default:
      return { success: false, error: `Unsupported channel type: ${channelType}` };
  }

  // Step 2: Make a real API call to verify credentials
  try {
    let result: { status: number; data: unknown };
    const data = (r: { status: number; data: unknown }) => r.data as Record<string, unknown>;

    switch (channelType) {
      case "telegram":
        result = await httpRequest(
          `https://api.telegram.org/bot${String(credentials.bot_token)}/getMe`,
          "GET",
          {},
        );
        if (result.status === 0) {
          return { success: true, error: "Network unavailable; format validated only" };
        }
        if (data(result)?.ok === true) {
          return { success: true, bot_info: data(result).result };
        }
        return { success: false, error: String(data(result)?.description || "Telegram token rejected") };

      case "discord":
        result = await httpRequest("https://discord.com/api/v10/oauth2/applications/@me", "GET", {
          Authorization: `Bot ${String(credentials.bot_token)}`,
        });
        if (result.status === 0) {
          return { success: true, error: "Network unavailable; format validated only" };
        }
        if (data(result)?.id) {
          return { success: true, bot_info: { id: data(result).id, name: data(result).name } };
        }
        return { success: false, error: String(data(result)?.message || "Discord token rejected") };

      case "slack":
        result = await httpRequest("https://slack.com/api/auth.test", "GET", {
          Authorization: `Bearer ${String(credentials.bot_token)}`,
        });
        if (result.status === 0) {
          return { success: true, error: "Network unavailable; format validated only" };
        }
        if (data(result)?.ok === true) {
          return { success: true, bot_info: { team: data(result).team, user: data(result).user } };
        }
        return { success: false, error: String(data(result)?.error || "Slack token rejected") };

      case "signal": {
        const cliUrl = (credentials.cli_url as string) || "http://localhost:8080";
        result = await httpRequest(`${cliUrl}/v1/about`, "GET", {}, undefined, 3000);
        if (result.status === 0) {
          return { success: true, error: "Network unavailable; format validated only" };
        }
        if (result.status === 200) {
          return { success: true, bot_info: result.data };
        }
        return { success: false, error: "Signal CLI API not responding" };
      }

      case "whatsapp":
        if (!credentials.access_token || !credentials.phone_number_id) {
          return { success: true, error: "Session-based setup; cannot verify remotely" };
        }
        result = await httpRequest(
          `https://graph.facebook.com/v19.0/${String(credentials.phone_number_id)}`,
          "GET",
          { Authorization: `Bearer ${String(credentials.access_token)}` },
        );
        if (result.status === 0) {
          return { success: true, error: "Network unavailable; format validated only" };
        }
        if (result.status === 200) {
          return { success: true, bot_info: result.data };
        }
        return {
          success: false,
          error: String(
            (data(result)?.error as Record<string, unknown>)?.message || "WhatsApp token rejected",
          ),
        };

      default:
        return { success: true };
    }
  } catch {
    return { success: true, error: "Network unavailable; format validated only" };
  }
}

/** Validate required fields + format regex against the catalog descriptor. */
export function validateCredentials(
  descriptor: ChannelDescriptor,
  credentials: Record<string, string>,
): string | null {
  for (const field of descriptor.fields) {
    const value = credentials[field.name];
    if (field.required && (value === undefined || value === "")) {
      return `Missing required field: ${field.label}`;
    }
    if (value && field.validationRegex && !new RegExp(field.validationRegex).test(value)) {
      return `Invalid format for ${field.label}`;
    }
  }
  return null;
}

function maskSecret(value: string): string {
  if (value.length <= 4) {
    return "****";
  }
  return `****${value.slice(-4)}`;
}

function envSecretId(channelType: string, accountId: string, fieldName: string): string {
  const raw = `MABOS_${channelType}_${accountId}_${fieldName}`;
  return raw.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
}

function channelsRecordDir(api: OpenClawPluginApi): string {
  return join(resolveWorkspaceDir(api), "channels");
}

/**
 * Provision a channel: validate, test, persist secrets + config, record
 * metadata, and return masked status. The gateway config write triggers a
 * runtime refresh so the channel is live without a restart.
 */
export async function provisionChannel(
  api: OpenClawPluginApi,
  input: ProvisionChannelInput,
): Promise<ProvisionResult> {
  const descriptor = getChannelDescriptor(input.channelType);
  if (!descriptor) {
    return { ok: false, error: `Unsupported channel type: ${input.channelType}` };
  }

  const validationError = validateCredentials(descriptor, input.credentials);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  let test: ChannelTestResult | undefined;
  if (input.test !== false) {
    test = await testChannelConnection(input.channelType, input.credentials);
    if (!test.success) {
      return { ok: false, test, error: test.error };
    }
  }

  const createdAt = new Date().toISOString();
  // Random suffix avoids id/secret collisions when two channels of the same
  // type/business are provisioned within the same millisecond.
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const accountId = `${input.channelType}_${input.businessId ?? "default"}_${suffix}`;

  // Build the per-account config entry, persisting secret fields as ${ENV} refs.
  // Also capture reconstruction data (env var ids + non-secret values) so a later
  // status check can re-run the live test without storing plaintext secrets.
  const accountConfig: Record<string, unknown> = {};
  const maskedCredentials: Record<string, string> = {};
  const envRefs: Record<string, string> = {};
  const publicCredentials: Record<string, string> = {};
  for (const field of descriptor.fields) {
    const value = input.credentials[field.name];
    if (value === undefined || value === "") {
      continue;
    }
    const persist = field.persist !== false;
    if (field.secret) {
      const envId = envSecretId(input.channelType, accountId, field.name);
      await setDurableSecretEnv(envId, value);
      envRefs[field.name] = envId;
      if (persist) {
        accountConfig[field.configKey] = envSecretRefTemplate(envId);
      }
      maskedCredentials[field.name] = maskSecret(value);
    } else {
      publicCredentials[field.name] = value;
      if (persist) {
        accountConfig[field.configKey] = value;
      }
      maskedCredentials[field.name] = value;
    }
  }
  if (input.agentId) {
    accountConfig.agentId = input.agentId;
  }

  // Write into the real gateway config under channels.<type>.accounts.<id>.
  await updateGatewayConfig((draft: OpenClawConfig) => {
    const cfg = draft as Record<string, unknown>;
    const channels = (cfg.channels ??= {}) as Record<string, unknown>;
    const channel = (channels[input.channelType] ??= {}) as Record<string, unknown>;
    const accounts = (channel.accounts ??= {}) as Record<string, unknown>;
    accounts[accountId] = accountConfig;
  });

  // Record non-secret MABOS metadata for UI listing + business binding.
  const record: ChannelRecord = {
    id: accountId,
    type: input.channelType,
    name: input.name ?? `${descriptor.label} (${accountId})`,
    status: "active",
    agentId: input.agentId,
    businessId: input.businessId,
    createdAt,
    maskedCredentials,
    envRefs,
    publicCredentials,
  };
  await writeChannelRecord(api, record);

  return { ok: true, channel: toApiChannel(record), test };
}

/** Full on-disk record (includes data needed to reconstruct a status check). */
type ChannelRecord = ProvisionedChannel & {
  /** Secret field name -> durable env var id. */
  envRefs?: Record<string, string>;
  /** Non-secret field name -> value (e.g. discord application_id, signal account). */
  publicCredentials?: Record<string, string>;
};

/** Strip reconstruction internals before returning a channel over the API. */
function toApiChannel(record: ChannelRecord): ProvisionedChannel {
  const { envRefs: _e, publicCredentials: _p, ...api } = record;
  return api;
}

async function writeChannelRecord(api: OpenClawPluginApi, record: ChannelRecord): Promise<void> {
  const dir = channelsRecordDir(api);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${record.id}.json`), JSON.stringify(record, null, 2), "utf-8");
}

async function readChannelRecord(
  api: OpenClawPluginApi,
  accountId: string,
): Promise<ChannelRecord | null> {
  try {
    const raw = await readFile(join(channelsRecordDir(api), `${accountId}.json`), "utf-8");
    return JSON.parse(raw) as ChannelRecord;
  } catch {
    return null;
  }
}

/** Enable or disable a configured channel account (updates gateway config + record). */
export async function setChannelEnabled(
  api: OpenClawPluginApi,
  accountId: string,
  enabled: boolean,
): Promise<ProvisionResult> {
  const record = await readChannelRecord(api, accountId);
  if (!record) {
    return { ok: false, error: `Unknown channel: ${accountId}` };
  }
  await updateGatewayConfig((draft: OpenClawConfig) => {
    const cfg = draft as Record<string, unknown>;
    const channel = (cfg.channels as Record<string, unknown>)?.[record.type] as
      | Record<string, unknown>
      | undefined;
    const account = (channel?.accounts as Record<string, Record<string, unknown>>)?.[accountId];
    if (account) {
      account.enabled = enabled;
    }
  });
  record.status = enabled ? "active" : "inactive";
  await writeChannelRecord(api, record);
  return { ok: true, channel: toApiChannel(record) };
}

/** Remove a configured channel account from gateway config and MABOS records. */
export async function removeChannel(
  api: OpenClawPluginApi,
  accountId: string,
): Promise<ProvisionResult> {
  const record = await readChannelRecord(api, accountId);
  if (!record) {
    return { ok: false, error: `Unknown channel: ${accountId}` };
  }
  await updateGatewayConfig((draft: OpenClawConfig) => {
    const cfg = draft as Record<string, unknown>;
    const channel = (cfg.channels as Record<string, unknown>)?.[record.type] as
      | Record<string, unknown>
      | undefined;
    const accounts = channel?.accounts as Record<string, unknown> | undefined;
    if (accounts) {
      delete accounts[accountId];
    }
  });
  // Clean up the durable env secrets this channel created.
  for (const envId of Object.values(record.envRefs ?? {})) {
    await unsetDurableSecretEnv(envId);
  }
  await rm(join(channelsRecordDir(api), `${accountId}.json`), { force: true });
  return { ok: true };
}

/** Re-run the live credential test for a configured channel, reconstructing
 * credentials from the durable env secret + stored non-secret values. */
export async function getChannelStatus(
  api: OpenClawPluginApi,
  accountId: string,
): Promise<ChannelTestResult & { id: string }> {
  const record = await readChannelRecord(api, accountId);
  if (!record) {
    return { id: accountId, success: false, error: `Unknown channel: ${accountId}` };
  }
  const creds: Record<string, unknown> = { ...(record.publicCredentials ?? {}) };
  for (const [name, envId] of Object.entries(record.envRefs ?? {})) {
    const value = process.env[envId];
    if (value !== undefined) {
      creds[name] = value;
    }
  }
  const result = await testChannelConnection(record.type, creds);
  return { id: accountId, ...result };
}

// ── WhatsApp QR pairing (session-based, no credentials form) ────────────────

export type WhatsAppLoginStart = { qrDataUrl?: string; message: string };
export type WhatsAppLoginWait = {
  connected: boolean;
  message: string;
  channel?: ProvisionedChannel;
};

/** Begin a WhatsApp web link: returns a QR data URL to scan (or a status message). */
export async function startWhatsAppLogin(opts: {
  force?: boolean;
  timeoutMs?: number;
}): Promise<WhatsAppLoginStart> {
  return whatsappLoginStart({ force: opts.force, timeoutMs: opts.timeoutMs });
}

/**
 * Poll for the WhatsApp QR scan to complete. On success, enable WhatsApp in the
 * gateway config (bound to a business agent if provided) and record it so it
 * appears in the channel list.
 */
export async function waitWhatsAppLogin(
  api: OpenClawPluginApi,
  opts: { businessId?: string; agentId?: string; timeoutMs?: number },
): Promise<WhatsAppLoginWait> {
  const result = await whatsappLoginWait({ timeoutMs: opts.timeoutMs });
  if (!result.connected) {
    return { connected: false, message: result.message };
  }

  // Enable WhatsApp in the real gateway config (session is already persisted).
  await updateGatewayConfig((draft: OpenClawConfig) => {
    const cfg = draft as Record<string, unknown>;
    const channels = (cfg.channels ??= {}) as Record<string, unknown>;
    const whatsapp = (channels.whatsapp ??= {}) as Record<string, unknown>;
    whatsapp.enabled = true;
    if (opts.agentId) {
      whatsapp.agentId = opts.agentId;
    }
  });

  const accountId = `whatsapp_${opts.businessId ?? "default"}`;
  const record: ChannelRecord = {
    id: accountId,
    type: "whatsapp",
    name: "WhatsApp",
    status: "active",
    agentId: opts.agentId,
    businessId: opts.businessId,
    createdAt: new Date().toISOString(),
    maskedCredentials: {},
  };
  await writeChannelRecord(api, record);
  return { connected: true, message: result.message, channel: toApiChannel(record) };
}

/** List configured channels from MABOS metadata records (masked, no secrets). */
export async function listConfiguredChannels(
  api: OpenClawPluginApi,
): Promise<ProvisionedChannel[]> {
  const dir = channelsRecordDir(api);
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const out: ProvisionedChannel[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }
    try {
      const record = JSON.parse(await readFile(join(dir, file), "utf-8")) as ChannelRecord;
      out.push(toApiChannel(record));
    } catch {
      // Skip malformed records.
    }
  }
  return out;
}
