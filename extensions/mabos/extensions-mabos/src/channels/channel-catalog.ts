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

export const CHANNEL_CATALOG: ChannelDescriptor[] = [TELEGRAM];

export function getChannelDescriptor(type: string): ChannelDescriptor | undefined {
  return CHANNEL_CATALOG.find((c) => c.type === type);
}

export function listChannelTypes(): string[] {
  return CHANNEL_CATALOG.map((c) => c.type);
}
