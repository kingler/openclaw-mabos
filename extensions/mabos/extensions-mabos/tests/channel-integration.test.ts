import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the plugin-sdk config-write boundary so the test never touches the real
// gateway config or dotenv. We capture the mutated config + secret writes.
const sdkState = vi.hoisted(() => ({
  config: {} as Record<string, unknown>,
  secrets: [] as Array<{ id: string; value: string }>,
  waConnected: false,
}));

vi.mock("openclaw/plugin-sdk", () => ({
  updateGatewayConfig: async (mutator: (draft: Record<string, unknown>) => unknown) => {
    mutator(sdkState.config);
    return sdkState.config;
  },
  setDurableSecretEnv: async (id: string, value: string) => {
    sdkState.secrets.push({ id, value });
    process.env[id] = value; // mirror real behaviour so status reconstruction works
  },
  unsetDurableSecretEnv: async (id: string) => {
    sdkState.secrets = sdkState.secrets.filter((s) => s.id !== id);
    delete process.env[id];
  },
  envSecretRefTemplate: (id: string) => `\${${id}}`,
  whatsappLoginStart: async () => ({
    qrDataUrl: "data:image/png;base64,AAA",
    message: "scan",
  }),
  whatsappLoginWait: async () => ({
    connected: sdkState.waConnected,
    message: sdkState.waConnected ? "linked" : "waiting",
  }),
}));

// Make the live credential test deterministic (no real network) for status checks.
vi.mock("../src/tools/common.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    httpRequest: vi.fn(async () => ({
      status: 200,
      data: { ok: true, result: { id: 42, username: "bot" } },
    })),
  };
});

import { getChannelDescriptor } from "../src/channels/channel-catalog.js";
import {
  getChannelStatus,
  listConfiguredChannels,
  provisionChannel,
  removeChannel,
  setChannelEnabled,
  validateCredentials,
  waitWhatsAppLogin,
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

  it("marks whatsapp as a QR-pairing channel with no credential fields", () => {
    const d = getChannelDescriptor("whatsapp");
    expect(d?.pairingType).toBe("qr");
    expect(d?.fields).toHaveLength(0);
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

describe("channel mappings + lifecycle (Phase 2)", () => {
  let ws: string;

  beforeEach(async () => {
    ws = await mkdtemp(join(tmpdir(), "mabos-channels-"));
    sdkState.config = {};
    sdkState.secrets = [];
  });

  afterEach(async () => {
    await rm(ws, { recursive: true, force: true });
  });

  it("discord: persists token as env ref, keeps application_id out of config", async () => {
    const res = await provisionChannel(fakeApi(ws), {
      channelType: "discord",
      credentials: { bot_token: "discord-secret-token", application_id: "123456789012345678" }, // pragma: allowlist secret
      test: false,
    });
    expect(res.ok).toBe(true);
    const acct = (sdkState.config.channels as any).discord.accounts[res.channel!.id];
    expect(acct.token).toMatch(/^\$\{.*\}$/);
    expect(acct.applicationId).toBeUndefined();
    // application_id is captured for status reconstruction in the on-disk record.
    const rec = JSON.parse(
      await readFile(join(ws, "channels", `${res.channel!.id}.json`), "utf-8"),
    );
    expect(rec.publicCredentials.application_id).toBe("123456789012345678");
  });

  it("signal: maps cli_url->httpUrl with no secret stored", async () => {
    const res = await provisionChannel(fakeApi(ws), {
      channelType: "signal",
      credentials: { account: "+15551234567", cli_url: "http://localhost:8080" },
      test: false,
    });
    expect(res.ok).toBe(true);
    expect(sdkState.secrets).toHaveLength(0);
    const acct = (sdkState.config.channels as any).signal.accounts[res.channel!.id];
    expect(acct.account).toBe("+15551234567");
    expect(acct.httpUrl).toBe("http://localhost:8080");
  });

  it("enable/disable toggles account.enabled and record status", async () => {
    const { channel } = await provisionChannel(fakeApi(ws), {
      channelType: "telegram",
      credentials: { bot_token: TOKEN },
      test: false,
    });
    await setChannelEnabled(fakeApi(ws), channel!.id, false);
    expect((sdkState.config.channels as any).telegram.accounts[channel!.id].enabled).toBe(false);
    expect((await listConfiguredChannels(fakeApi(ws)))[0].status).toBe("inactive");

    await setChannelEnabled(fakeApi(ws), channel!.id, true);
    expect((sdkState.config.channels as any).telegram.accounts[channel!.id].enabled).toBe(true);
  });

  it("remove deletes the config account and the record", async () => {
    const { channel } = await provisionChannel(fakeApi(ws), {
      channelType: "telegram",
      credentials: { bot_token: TOKEN },
      test: false,
    });
    expect(sdkState.secrets).toHaveLength(1);
    const res = await removeChannel(fakeApi(ws), channel!.id);
    expect(res.ok).toBe(true);
    expect((sdkState.config.channels as any).telegram.accounts[channel!.id]).toBeUndefined();
    expect(await listConfiguredChannels(fakeApi(ws))).toHaveLength(0);
    // durable secret is cleaned up on remove
    expect(sdkState.secrets).toHaveLength(0);
  });

  it("status reconstructs credentials and runs the live test", async () => {
    const { channel } = await provisionChannel(fakeApi(ws), {
      channelType: "telegram",
      credentials: { bot_token: TOKEN },
      test: false,
    });
    const status = await getChannelStatus(fakeApi(ws), channel!.id);
    expect(status.id).toBe(channel!.id);
    expect(status.success).toBe(true); // httpRequest mocked to ok:true
  });

  it("whatsapp: waiting stays disconnected until the scan completes", async () => {
    sdkState.waConnected = false;
    const pending = await waitWhatsAppLogin(fakeApi(ws), { businessId: "acme" });
    expect(pending.connected).toBe(false);
    expect(await listConfiguredChannels(fakeApi(ws))).toHaveLength(0);
  });

  it("whatsapp: on connect, enables config and records the channel", async () => {
    sdkState.waConnected = true;
    const result = await waitWhatsAppLogin(fakeApi(ws), { businessId: "acme", agentId: "wa-agent" });
    expect(result.connected).toBe(true);
    expect((sdkState.config.channels as any).whatsapp.enabled).toBe(true);
    expect((sdkState.config.channels as any).whatsapp.agentId).toBe("wa-agent");
    const listed = await listConfiguredChannels(fakeApi(ws));
    expect(listed.some((c) => c.type === "whatsapp")).toBe(true);
    sdkState.waConnected = false;
  });
});
