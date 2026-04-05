import type { OpenClawConfig } from "./types.js";

/**
 * Ensures the MABOS product plugin configuration is present in the config.
 * Returns the config unchanged if no MABOS plugin injection is needed.
 */
export function ensureMabosProductPluginConfig(
  config: Partial<OpenClawConfig>,
  _env?: Record<string, string | undefined>,
): Partial<OpenClawConfig> {
  return config;
}
