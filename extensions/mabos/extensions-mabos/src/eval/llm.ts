/**
 * LLM judge factory — wraps an LlmCallFn into an {@link LlmJudge} that returns
 * a normalized 0..1 score plus rationale. Returns null when no API key is
 * available so the harness degrades gracefully (llm_judge cases score 0 with a
 * clear rationale rather than crashing).
 */

import type { LlmCallFn } from "../gdc/types.js";
import { httpRequest } from "../tools/common.js";
import type { LlmJudge } from "./types.js";

const JUDGE_SYSTEM = `You are a strict evaluation judge. Given a rubric, an input task, and a candidate output, score how well the output satisfies the rubric.
Respond ONLY with compact JSON: {"score": <number 0..1>, "rationale": "<one sentence>"}.
Do not include any prose outside the JSON.`;

/** Build a judge from an arbitrary LlmCallFn (used in tests and production). */
export function judgeFromLlmCall(call: LlmCallFn, model = "claude-haiku-4-5-20251001"): LlmJudge {
  return async ({ rubric, input, output }) => {
    const user = `Rubric:\n${rubric}\n\nInput task:\n${input}\n\nCandidate output:\n${output}`;
    const text = await call({ model, system: JUDGE_SYSTEM, user, maxTokens: 200, temperature: 0 });
    return parseVerdict(text);
  };
}

/** Construct a default Anthropic-backed judge, or null if no key is set. */
export function createDefaultJudge(model?: string): LlmJudge | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const call: LlmCallFn = async ({ model: m, system, user, maxTokens, temperature }) => {
    const resp = await httpRequest(
      "https://api.anthropic.com/v1/messages",
      "POST",
      {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      {
        model: m,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: "user", content: user }],
      },
      120_000,
    );
    if (resp.status !== 200) {
      throw new Error(
        `Anthropic API error (${resp.status}): ${typeof resp.data === "object" ? JSON.stringify(resp.data) : String(resp.data)}`,
      );
    }
    const parsed = resp.data as { content?: { text?: string }[] };
    return parsed.content?.[0]?.text ?? "";
  };

  return judgeFromLlmCall(call, model);
}

/** Parse a judge response; tolerant of surrounding prose or code fences. */
export function parseVerdict(text: string): { score: number; rationale: string } {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]) as { score?: unknown; rationale?: unknown };
      const score =
        typeof obj.score === "number" ? obj.score : Number.parseFloat(String(obj.score));
      if (Number.isFinite(score)) {
        return {
          score: Math.max(0, Math.min(1, score)),
          rationale: typeof obj.rationale === "string" ? obj.rationale : "",
        };
      }
    } catch {
      // fall through
    }
  }
  return { score: 0, rationale: `unparseable judge response: ${text.slice(0, 120)}` };
}
