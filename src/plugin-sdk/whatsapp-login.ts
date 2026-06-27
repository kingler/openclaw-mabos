/**
 * Lazy WhatsApp login boundary for plugins.
 *
 * `../web/login-qr` statically imports the WhatsApp/Baileys runtime, so it must
 * never be loaded eagerly by the plugin-sdk barrel (that would pull Baileys into
 * every plugin). These wrappers dynamically import it only when a login is
 * actually requested. login-qr is therefore only ever imported dynamically,
 * which keeps the dynamic-import guardrail satisfied.
 */

export type WhatsAppLoginStartResult = { qrDataUrl?: string; message: string };
export type WhatsAppLoginWaitResult = { connected: boolean; message: string };

export async function whatsappLoginStart(
  opts: { force?: boolean; timeoutMs?: number } = {},
): Promise<WhatsAppLoginStartResult> {
  const { startWebLoginWithQr } = await import("../web/login-qr.js");
  return startWebLoginWithQr({ force: opts.force, timeoutMs: opts.timeoutMs });
}

export async function whatsappLoginWait(
  opts: { timeoutMs?: number } = {},
): Promise<WhatsAppLoginWaitResult> {
  const { waitForWebLogin } = await import("../web/login-qr.js");
  return waitForWebLogin({ timeoutMs: opts.timeoutMs });
}
