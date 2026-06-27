/**
 * Channel catalog — declarative descriptors that drive the web UI form and
 * backend validation/provisioning for connecting messenger channels.
 *
 * Each field maps a UI/credential key to the OpenClaw gateway config key it
 * persists to (`configKey`). Secret fields are stored as `${ENV}` references
 * (see channel-provisioning.ts), never inline plaintext.
 *
 * Phase 1 ships Telegram; the same shape extends to Discord/Slack/Signal/
 * WhatsApp and extension channels.
 */

export type ChannelFieldType = "string" | "password";

export type ChannelField = {
  /** Credential key used by the UI and testChannelConnection (e.g. "bot_token"). */
  name: string;
  label: string;
  type: ChannelFieldType;
  required: boolean;
  /** Stored as an `${ENV}` reference rather than inline plaintext. */
  secret: boolean;
  /** OpenClaw config key this field persists to (e.g. "botToken"). */
  configKey: string;
  /**
   * Whether the field is written to gateway config. Default true. Set false for
   * fields only needed for the live credential test (e.g. Discord application_id),
   * which the gateway config does not store.
   */
  persist?: boolean;
  placeholder?: string;
  help?: string;
  /** Serialized regex (source only) the UI/backend uses for format validation. */
  validationRegex?: string;
};

export type ChannelDescriptor = {
  /** Channel type id, matches OpenClaw config key under `channels` (e.g. "telegram"). */
  type: string;
  label: string;
  docsUrl?: string;
  capabilities?: string[];
  fields: ChannelField[];
};

const TELEGRAM: ChannelDescriptor = {
  type: "telegram",
  label: "Telegram",
  docsUrl: "https://docs.openclaw.ai/channels/telegram",
  capabilities: ["dm", "group", "media"],
  fields: [
    {
      name: "bot_token",
      label: "Bot Token",
      type: "password",
      required: true,
      secret: true,
      configKey: "botToken",
      placeholder: "123456789:ABCdefGhIJKlmNoPQRstuVWxyz", // pragma: allowlist secret
      help: "Create a bot with @BotFather and paste the token it gives you.",
      validationRegex: "^\\d+:[A-Za-z0-9_-]+$",
    },
  ],
};

const DISCORD: ChannelDescriptor = {
  type: "discord",
  label: "Discord",
  docsUrl: "https://docs.openclaw.ai/channels/discord",
  capabilities: ["dm", "group", "media"],
  fields: [
    {
      name: "bot_token",
      label: "Bot Token",
      type: "password",
      required: true,
      secret: true,
      configKey: "token",
      placeholder: "Bot token from the Discord Developer Portal",
      help: "Developer Portal > your app > Bot > Reset Token.",
    },
    {
      name: "application_id",
      label: "Application ID",
      type: "string",
      required: true,
      secret: false,
      configKey: "applicationId",
      persist: false, // used only to verify the token; not stored in gateway config
      placeholder: "1234567890123456789",
      validationRegex: "^\\d{17,20}$",
    },
  ],
};

const SLACK: ChannelDescriptor = {
  type: "slack",
  label: "Slack",
  docsUrl: "https://docs.openclaw.ai/channels/slack",
  capabilities: ["dm", "group"],
  fields: [
    {
      name: "bot_token",
      label: "Bot Token",
      type: "password",
      required: true,
      secret: true,
      configKey: "botToken",
      placeholder: "xoxb-...",
      validationRegex: "^xoxb-",
    },
    {
      name: "app_token",
      label: "App Token (Socket Mode)",
      type: "password",
      required: false,
      secret: true,
      configKey: "appToken",
      placeholder: "xapp-...",
      validationRegex: "^xapp-",
    },
    {
      name: "signing_secret",
      label: "Signing Secret",
      type: "password",
      required: false,
      secret: true,
      configKey: "signingSecret",
      help: "Required for HTTP mode (request signature verification).",
    },
  ],
};

const SIGNAL: ChannelDescriptor = {
  type: "signal",
  label: "Signal",
  docsUrl: "https://docs.openclaw.ai/channels/signal",
  capabilities: ["dm", "group"],
  fields: [
    {
      name: "account",
      label: "Account (E.164 phone number)",
      type: "string",
      required: true,
      secret: false,
      configKey: "account",
      placeholder: "+15551234567",
      validationRegex: "^\\+[1-9]\\d{6,14}$",
      help: "The phone number registered with signal-cli.",
    },
    {
      name: "cli_url",
      label: "signal-cli REST URL",
      type: "string",
      required: false,
      secret: false,
      configKey: "httpUrl",
      placeholder: "http://localhost:8080",
      help: "URL of the signal-cli HTTP daemon (used to verify connectivity).",
    },
  ],
};

export const CHANNEL_CATALOG: ChannelDescriptor[] = [TELEGRAM, DISCORD, SLACK, SIGNAL];

export function getChannelDescriptor(type: string): ChannelDescriptor | undefined {
  return CHANNEL_CATALOG.find((c) => c.type === type);
}

export function listChannelTypes(): string[] {
  return CHANNEL_CATALOG.map((c) => c.type);
}
