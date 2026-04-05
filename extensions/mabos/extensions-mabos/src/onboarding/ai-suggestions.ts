import { httpRequest } from "../tools/common.js";

export interface SuggestionRequest {
  suggest_type: "vision" | "mission" | "values" | "bmc_block";
  workspace_context: {
    company_name: string;
    industry: string;
    stage: string;
    vision?: string;
    mission?: string;
    values?: string[];
    bmc_blocks?: Record<string, Array<{ title: string; description: string }>>;
  };
  bmc_block_key?: string;
}

export interface SuggestionResponse {
  suggestions: string[] | Array<{ title: string; description: string }>;
}

/**
 * Build system + user prompts based on the suggestion type.
 */
function buildSuggestionPrompt(req: SuggestionRequest): { system: string; user: string } {
  const ctx = req.workspace_context;

  switch (req.suggest_type) {
    case "vision": {
      return {
        system:
          "You are a business strategist. Generate 3 compelling vision statements for a company.",
        user: [
          `Company: ${ctx.company_name}, Industry: ${ctx.industry}, Stage: ${ctx.stage}.`,
          ctx.mission ? `Mission: ${ctx.mission}.` : "",
          "Generate 3 distinct vision statements. Each should be aspirational, concise (1-2 sentences), and specific to this business.",
          'Return as JSON array: ["vision1", "vision2", "vision3"]',
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }
    case "mission": {
      return {
        system: "You are a business strategist. Generate 3 mission statements.",
        user: [
          `Company: ${ctx.company_name}, Industry: ${ctx.industry}, Stage: ${ctx.stage}.`,
          ctx.vision ? `Vision: ${ctx.vision}.` : "",
          "Generate 3 distinct mission statements. Each should describe the company's core purpose and who it serves.",
          'Return as JSON array: ["mission1", "mission2", "mission3"]',
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }
    case "values": {
      return {
        system: "You are a business culture consultant. Suggest 6-8 core values.",
        user: [
          `Company: ${ctx.company_name}, Industry: ${ctx.industry}.`,
          ctx.mission ? `Mission: ${ctx.mission}.` : "",
          ctx.vision ? `Vision: ${ctx.vision}.` : "",
          "Suggest 6-8 core values that align with this company's identity.",
          'Return as JSON array: ["value1", "value2", ...]',
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }
    case "bmc_block": {
      const blockKey = req.bmc_block_key ?? "value_propositions";
      // Format existing BMC blocks as context
      const existingBlocks = ctx.bmc_blocks
        ? Object.entries(ctx.bmc_blocks)
            .map(
              ([k, items]) =>
                `${k}: ${items.map((i) => `${i.title} - ${i.description}`).join("; ")}`,
            )
            .join("\n")
        : "None yet";

      return {
        system: "You are a business model expert. Suggest items for a Business Model Canvas block.",
        user: [
          `Company: ${ctx.company_name}, Industry: ${ctx.industry}, Stage: ${ctx.stage}.`,
          ctx.vision ? `Vision: ${ctx.vision}.` : "",
          ctx.mission ? `Mission: ${ctx.mission}.` : "",
          `Current BMC data:\n${existingBlocks}`,
          `Suggest 3-5 items for the "${blockKey}" block.`,
          'Return as JSON array: [{"title": "...", "description": "..."}, ...]',
        ]
          .filter(Boolean)
          .join("\n"),
      };
    }
  }
}

/**
 * Parse the LLM response text, extracting a JSON array.
 * Handles raw JSON, fenced code blocks, and embedded arrays.
 */
function parseSuggestionResponse(
  text: string,
  suggestType: SuggestionRequest["suggest_type"],
): SuggestionResponse {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // Try to find a JSON array in the text
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");
  if (arrStart !== -1 && arrEnd > arrStart) {
    cleaned = cleaned.slice(arrStart, arrEnd + 1);
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) {
      return { suggestions: [] };
    }

    if (suggestType === "bmc_block") {
      // Expect array of {title, description}
      const items = parsed.map((item: unknown) => {
        if (typeof item === "object" && item !== null && "title" in item) {
          const obj = item as Record<string, unknown>;
          return {
            title: String(obj.title ?? ""),
            description: String(obj.description ?? ""),
          };
        }
        return { title: String(item), description: "" };
      });
      return { suggestions: items };
    }

    // vision / mission / values: expect string[]
    return { suggestions: parsed.map((s: unknown) => String(s)) };
  } catch {
    return { suggestions: [] };
  }
}

/**
 * Call the Anthropic API to generate onboarding suggestions.
 */
export async function generateSuggestion(request: SuggestionRequest): Promise<SuggestionResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const { system, user } = buildSuggestionPrompt(request);

  const body = {
    model: "claude-haiku-4-5",
    max_tokens: 2048,
    temperature: 0.7,
    system,
    messages: [{ role: "user", content: user }],
  };

  const result = await httpRequest(
    "https://api.anthropic.com/v1/messages",
    "POST",
    {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body,
    30_000,
    1,
  );

  if (result.status !== 200) {
    const errMsg =
      typeof result.data === "object" && result.data !== null
        ? JSON.stringify(result.data)
        : String(result.data);
    throw new Error(`Anthropic API error (${result.status}): ${errMsg}`);
  }

  const data = result.data as { content?: Array<{ text?: string }> };
  const text = data.content?.[0]?.text ?? "[]";

  return parseSuggestionResponse(text, request.suggest_type);
}
