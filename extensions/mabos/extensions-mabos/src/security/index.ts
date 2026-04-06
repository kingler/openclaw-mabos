/**
 * Security module — proactive defense for agent-generated content:
 * injection scanning, tool approval guards, content sanitization, and SSRF prevention.
 *
 * Enabled by default — security should be opt-out, not opt-in.
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { registerSecurityHooks } from "./hooks.js";
import { InjectionScanner } from "./injection-scanner.js";
import { registerSecurityRoutes } from "./routes.js";
import { Sanitizer } from "./sanitizer.js";
import { ToolGuard } from "./tool-guard.js";
import type { SecurityConfig } from "./types.js";
import { UrlValidator } from "./url-validator.js";

interface MabosSecurityConfig {
  securityEnabled?: boolean;
  security?: SecurityConfig;
}

const DEFAULT_DANGEROUS_TOOLS = [
  "execute_command",
  "shopify_delete_*",
  "send_payment",
  "send_email",
  "twilio_send_sms",
  "cloudflare_delete_*",
  "godaddy_delete_*",
];

// In-memory scan log for the security dashboard
const scanLog: Array<{
  timestamp: string;
  source: string;
  threat: string;
  patterns: string[];
  blocked: boolean;
}> = [];

export function createSecurityModule(api: OpenClawPluginApi, config: MabosSecurityConfig): void {
  if (config.securityEnabled === false) return;

  const secConfig = config.security ?? {};
  const log = api.logger;

  const scanner = new InjectionScanner();
  const guard = new ToolGuard({
    dangerousTools: secConfig.toolGuard?.dangerousTools ?? DEFAULT_DANGEROUS_TOOLS,
    autoApproveForRoles: secConfig.toolGuard?.autoApproveForRoles ?? ["admin", "operator"],
  });
  const sanitizer = new Sanitizer();

  // Wrap scanner to record to scan log
  const originalScan = scanner.scan.bind(scanner);
  scanner.scan = (text: string) => {
    const result = originalScan(text);
    if (!result.clean) {
      scanLog.push({
        timestamp: new Date().toISOString(),
        source: "tool_input",
        threat: result.highestThreat,
        patterns: result.findings.map((f) => f.pattern),
        blocked: secConfig.injectionScanning?.blockOnDetection !== false,
      });
      // Keep log bounded
      if (scanLog.length > 1000) scanLog.splice(0, scanLog.length - 1000);
    }
    return result;
  };

  // Register hooks (injection scanning, tool guard, external content sanitization)
  registerSecurityHooks(api, { scanner, guard, sanitizer, config: secConfig });

  // Register HTTP routes (status, scan log, approvals)
  registerSecurityRoutes(api, scanner, guard, scanLog);

  log.info(
    "[security] Security module initialized (injection scanner + tool guard + URL validator + routes)",
  );
}

export { InjectionScanner } from "./injection-scanner.js";
export { ToolGuard } from "./tool-guard.js";
export { UrlValidator } from "./url-validator.js";
export { Sanitizer } from "./sanitizer.js";
