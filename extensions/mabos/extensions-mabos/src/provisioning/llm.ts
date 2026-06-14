/**
 * LLM call router for the provisioning pipeline. Mirrors the model routing in
 * `src/gdc/index.ts` (Anthropic for Claude models, OpenAI for GPT/o-series) so
 * the provisioning module can drive the GDC orchestrator without importing the
 * module-private `callLlm` from the GDC entry point.
 */

import type { LlmCallFn } from "../gdc/types.js";
import { httpRequest } from "../tools/common.js";

async function callAnthropic(
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");
  const resp = await httpRequest(
    "https://api.anthropic.com/v1/messages",
    "POST",
    {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    {
      model,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: "user", content: user }],
    },
    120_000,
  );
  if (resp.status !== 200) {
    const errMsg = typeof resp.data === "object" ? JSON.stringify(resp.data) : String(resp.data);
    throw new Error(`Anthropic API error (${resp.status}): ${errMsg}`);
  }
  const parsed = resp.data as { content?: { text?: string }[] };
  return parsed.content?.[0]?.text ?? "";
}

async function callOpenAi(
  model: string,
  system: string,
  user: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const resp = await httpRequest(
    "https://api.openai.com/v1/chat/completions",
    "POST",
    { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    },
    120_000,
  );
  if (resp.status !== 200) {
    const errMsg = typeof resp.data === "object" ? JSON.stringify(resp.data) : String(resp.data);
    throw new Error(`OpenAI API error (${resp.status}): ${errMsg}`);
  }
  const parsed = resp.data as { choices?: { message?: { content?: string } }[] };
  return parsed.choices?.[0]?.message?.content ?? "";
}

/** Default LLM router used when the host does not inject one. */
export const defaultCallLlm: LlmCallFn = async ({
  model,
  system,
  user,
  maxTokens,
  temperature,
}) => {
  if (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3")) {
    return callOpenAi(model, system, user, maxTokens, temperature);
  }
  return callAnthropic(model, system, user, maxTokens, temperature);
};
