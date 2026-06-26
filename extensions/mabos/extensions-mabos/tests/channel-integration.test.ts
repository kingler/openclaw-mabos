import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the plugin-sdk config-write boundary so the test never touches the real
// gateway config or dotenv. We capture the mutated config + secret writes.
const sdkState = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  secrets: [] as Array<{ id: string; value: string }>,
}));

vi.mock("openclaw/plugin-sdk", () => ({
  updateGatewayConfig: async (mutator: (draft: Record<string, unknown>) => unknown) => {
    mutator(sdkState.config);
    return sdkState.config;
  },
  setDurableSecretEnv: async (id: string, value: string) => {
    sdkState.secrets.push({ id, value });
  },
  envSecretRefTemplate: (id: string) => `\${${id}}`,
}));

import { getChannelDescriptor } from "../src/channels/channel-catalog.js";
import {
  listConfiguredChannels,
  provisionChannel,
  validateCredentials,
} from "../src/channels/channel-provisioning.js";

const TOKEN = "123456789:ABCdefGhIJKlmNoPQRstuVWxyz"; // pragma: allowlist secret

function fakeApi(workspaceDir: string) {
  return { config: { workspaceDir }, pluginConfig: {} } as never;
}

describe("channel-catalog", () => {
  it("exposes a telegram descriptor with a secret bot_token field", () => {
    const d = getChannelDescriptor("telegram");
    expect(d?.label).toBe("Telegram");
    const field = d?.fields.find((f) => f.name === "bot_token");
    expect(field?.secret).toBe(true);
    expect(field?.configKey).toBe("botToken");
  });

  it("validates required fields and format", () => {
    const d = getChannelDescriptor("telegram")!;
    expect(validateCredentials(d, {})).toMatch(/required/i);
    expect(validateCredentials(d, { bot_token: "not-a-token" })).toMatch(/invalid format/i);
    expect(validateCredentials(d, { bot_token: TOKEN })).toBeNull();
  });
});

describe("provisionChannel", () => {
  let ws: string;

  beforeEach(async () => {
    ws = await mkdtemp(join(tmpdir(), "mabos-channels-"));
    sdkState.config = {};
    sdkState.secrets = [];
  });

  afterEach(async () => {
    await rm(ws, { recursive: true, force: true });
  });

  it("writes a ${ENV} ref to gateway config, persists the secret, and masks output", async () => {
    const result = await provisionChannel(fakeApi(ws), {
      channelType: "telegram",
      credentials: { bot_token: TOKEN },
      agentId: "router-agent",
      businessId: "acme",
      test: false,
    });

    expect(result.ok).toBe(true);
    const accountId = result.channel!.id;

    // Config: account written under channels.telegram.accounts with an env ref.
    const accounts = (sdkState.config.channels as any).telegram.accounts as Record<string, any>;
    const account = accounts[accountId];
    expect(account.botToken).toMatch(/^\$\{MABOS_TELEGRAM_.*_BOT_TOKEN\}$/);
    expect(account.agentId).toBe("router-agent");

    // Secret persisted with the RAW token (never inlined into config).
    expect(sdkState.secrets).toHaveLength(1);
    expect(sdkState.secrets[0].value).toBe(TOKEN);
    expect(JSON.stringify(sdkState.config)).not.toContain(TOKEN);

    // Returned + recorded credentials are masked.
    expect(result.channel!.maskedCredentials.bot_token).toBe("****VWxyz");
    expect(result.channel!.maskedCredentials.bot_token).not.toContain(TOKEN);
  });

  it("records the channel so it is listed (masked, no secrets)", async () => {
    await provisionChannel(fakeApi(ws), {
      channelType: "telegram",
      credentials: { bot_token: TOKEN },
      businessId: "acme",
      test: false,
    });

    const files = await readdir(join(ws, "channels"));
    expect(files.some((f) => f.endsWith(".json"))).toBe(true);

    const listed = await listConfiguredChannels(fakeApi(ws));
    expect(listed).toHaveLength(1);
    expect(listed[0].businessId).toBe("acme");
    expect(JSON.stringify(listed[0])).not.toContain(TOKEN);
  });

  it("rejects an unsupported channel type", async () => {
    const result = await provisionChannel(fakeApi(ws), {
      channelType: "carrierpigeon",
      credentials: {},
      test: false,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unsupported/i);
  });

  it("rejects invalid credentials before writing config", async () => {
    const result = await provisionChannel(fakeApi(ws), {
      channelType: "telegram",
      credentials: { bot_token: "bad" },
      test: false,
    });
    expect(result.ok).toBe(false);
    expect(sdkState.secrets).toHaveLength(0);
    expect(sdkState.config).toEqual({});
  });
});
